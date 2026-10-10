"""AKE Market Ledger N-ATLaS ASR gateway.

Audio is processed in memory and is never persisted. The gateway lazily loads one
of the official NCAIR/Awarri N-ATLaS ASR models and keeps only one model resident
at a time so it can run on a modest CPU VPS.
"""

from __future__ import annotations

import asyncio
import gc
import io
import logging
import os
import secrets
import threading
import time
from collections import defaultdict, deque
from pathlib import Path
from typing import Any

import av
import numpy as np
import torch
from fastapi import FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.trustedhost import TrustedHostMiddleware

APP_VERSION = "1.1.0"
SERVER_DIR = Path(__file__).resolve().parent
FAST_MODEL_DIRS = {
    "yo": SERVER_DIR / "models" / "yoruba-asr-int8",
}
MAX_AUDIO_BYTES = int(os.getenv("MAX_AUDIO_BYTES", str(8 * 1024 * 1024)))
MAX_AUDIO_SECONDS = float(os.getenv("MAX_AUDIO_SECONDS", "31"))
RATE_LIMIT_PER_HOUR = int(os.getenv("RATE_LIMIT_PER_HOUR", "120"))
CLIENT_TOKEN = os.getenv("AKE_CLIENT_TOKEN", "").strip()
HF_TOKEN = os.getenv("HF_TOKEN", "").strip()

MODEL_IDS = {
    "yo": "NCAIR1/Yoruba-ASR",
    "ha": "NCAIR1/Hausa-ASR",
    "ig": "NCAIR1/Igbo-ASR",
    "en": "NCAIR1/NigerianAccentedEnglish",
}

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("ake-natlas-asr")

app = FastAPI(
    title="AKE Market Ledger N-ATLaS ASR Gateway",
    description=(
        "Speech-to-text gateway using the official NCAIR/Awarri N-ATLaS "
        "ASR models for Yoruba, Hausa, Igbo and Nigerian-accented English."
    ),
    version=APP_VERSION,
    docs_url="/docs",
    redoc_url=None,
)
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=[
        "wuber.com.ng",
        "www.wuber.com.ng",
        "127.0.0.1",
        "localhost",
        "testserver",
    ],
)


class SlidingWindowRateLimiter:
    """Small in-memory limiter suitable for this single-process demo service."""

    def __init__(self, limit: int, window_seconds: int = 3600) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = asyncio.Lock()

    async def check(self, key: str) -> None:
        now = time.monotonic()
        async with self._lock:
            hits = self._hits[key]
            cutoff = now - self.window_seconds
            while hits and hits[0] < cutoff:
                hits.popleft()
            if len(hits) >= self.limit:
                raise HTTPException(
                    status_code=429,
                    detail="Voice request limit reached. Please retry later.",
                )
            hits.append(now)


rate_limiter = SlidingWindowRateLimiter(RATE_LIMIT_PER_HOUR)


def _client_ip(request: Request) -> str:
    # Nginx overwrites X-Real-IP before proxying to this loopback-only service.
    return request.headers.get("x-real-ip") or request.client.host if request.client else "unknown"


def _authorize(authorization: str | None) -> None:
    if not CLIENT_TOKEN:
        return
    expected = f"Bearer {CLIENT_TOKEN}"
    if not authorization or not secrets.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="Invalid voice-service credential.")


def decode_audio(data: bytes) -> np.ndarray:
    """Decode common mobile audio formats to a mono 16 kHz float32 waveform."""

    try:
        with av.open(io.BytesIO(data), mode="r") as container:
            if not container.streams.audio:
                raise ValueError("No audio stream found")
            resampler = av.AudioResampler(format="s16", layout="mono", rate=16000)
            chunks: list[np.ndarray] = []
            max_samples = int(MAX_AUDIO_SECONDS * 16000)
            sample_count = 0

            for frame in container.decode(audio=0):
                for converted in resampler.resample(frame):
                    samples = converted.to_ndarray().reshape(-1)
                    sample_count += samples.size
                    if sample_count > max_samples:
                        raise HTTPException(
                            status_code=413,
                            detail=f"Recording must be at most {MAX_AUDIO_SECONDS:.0f} seconds.",
                        )
                    chunks.append(samples)

            for converted in resampler.resample(None):
                samples = converted.to_ndarray().reshape(-1)
                sample_count += samples.size
                if sample_count > max_samples:
                    raise HTTPException(
                        status_code=413,
                        detail=f"Recording must be at most {MAX_AUDIO_SECONDS:.0f} seconds.",
                    )
                chunks.append(samples)
    except HTTPException:
        raise
    except Exception as exc:
        logger.info("Audio decode rejected: %s", type(exc).__name__)
        raise HTTPException(
            status_code=422,
            detail="The recording could not be decoded. Please record again.",
        ) from exc

    if not chunks:
        raise HTTPException(status_code=422, detail="The recording contains no audio.")

    waveform = np.concatenate(chunks).astype(np.float32) / 32768.0
    if waveform.size < 1600:  # less than 100 ms
        raise HTTPException(status_code=422, detail="The recording is too short.")
    return waveform


class NatlasEngine:
    """Lazily loads one official N-ATLaS ASR model at a time."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._language: str | None = None
        self._pipe: Any | None = None
        self._runtime: str | None = None

    @property
    def loaded_language(self) -> str | None:
        return self._language

    @property
    def runtime(self) -> str | None:
        return self._runtime

    def _load(self, language: str) -> None:
        if self._pipe is not None and self._language == language:
            return

        model_id = MODEL_IDS[language]
        logger.info("Loading official N-ATLaS model %s", model_id)

        # Keep memory bounded when switching between languages.
        self._pipe = None
        self._language = None
        self._runtime = None
        gc.collect()

        # A CTranslate2 INT8 conversion contains the same official fine-tuned
        # weights, optimized for practical inference on this CPU-only VPS.
        fast_dir = FAST_MODEL_DIRS.get(language)
        if fast_dir and (fast_dir / "model.bin").is_file():
            from faster_whisper import WhisperModel

            self._pipe = WhisperModel(
                str(fast_dir),
                device="cpu",
                compute_type="int8",
                cpu_threads=max(1, int(os.getenv("OMP_NUM_THREADS", "6"))),
                num_workers=1,
            )
            self._language = language
            self._runtime = "ctranslate2-int8"
            logger.info("Model ready: %s (%s)", model_id, self._runtime)
            return

        if not HF_TOKEN:
            raise RuntimeError("HF_TOKEN is not configured on the server")

        from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor, pipeline

        processor = AutoProcessor.from_pretrained(
            model_id,
            token=HF_TOKEN,
            trust_remote_code=False,
        )
        model = AutoModelForSpeechSeq2Seq.from_pretrained(
            model_id,
            token=HF_TOKEN,
            trust_remote_code=False,
            torch_dtype=torch.float32,
            low_cpu_mem_usage=False,
        )
        model.eval()
        self._pipe = pipeline(
            task="automatic-speech-recognition",
            model=model,
            tokenizer=processor.tokenizer,
            feature_extractor=processor.feature_extractor,
            device=-1,
        )
        self._language = language
        self._runtime = "transformers-float32"
        logger.info("Model ready: %s (%s)", model_id, self._runtime)

    def transcribe(self, language: str, waveform: np.ndarray) -> dict[str, Any]:
        with self._lock:
            self._load(language)
            started = time.perf_counter()
            assert self._pipe is not None

            if self._runtime == "ctranslate2-int8":
                segments, _info = self._pipe.transcribe(
                    waveform,
                    language=language,
                    beam_size=1,
                    best_of=1,
                    temperature=0,
                    condition_on_previous_text=False,
                    without_timestamps=True,
                    word_timestamps=False,
                    vad_filter=False,
                )
                text = " ".join(segment.text.strip() for segment in segments).strip()
            else:
                output = self._pipe(
                    {"array": waveform, "sampling_rate": 16000},
                    return_timestamps=False,
                    generate_kwargs={"max_new_tokens": 64, "num_beams": 1},
                )
                text = str(output.get("text", "")).strip()

            elapsed_ms = round((time.perf_counter() - started) * 1000)

        return {
            "text": text,
            "transcript": text,
            "language": language,
            "model": MODEL_IDS[language],
            "runtime": self._runtime,
            "processing_ms": elapsed_ms,
        }


engine = NatlasEngine()


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "ake-ledger-natlas-asr",
        "version": APP_VERSION,
        "hf_configured": bool(HF_TOKEN),
        "loaded_language": engine.loaded_language,
        "runtime": engine.runtime,
        "official_models": MODEL_IDS,
        "audio_retention": "none",
    }


@app.get("/api/v1/models")
def models() -> dict[str, Any]:
    return {
        "provider": "N-ATLaS by NCAIR/Awarri Technologies",
        "models": MODEL_IDS,
    }


@app.post("/api/v1/transcribe")
async def transcribe(
    request: Request,
    language: str,
    audio: UploadFile = File(...),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    _authorize(authorization)
    await rate_limiter.check(_client_ip(request))

    language = language.lower().strip()
    if language not in MODEL_IDS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported language. Choose one of: {', '.join(MODEL_IDS)}.",
        )

    data = await audio.read(MAX_AUDIO_BYTES + 1)
    await audio.close()
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Recording is larger than 8 MB.")
    if not data:
        raise HTTPException(status_code=422, detail="The recording is empty.")

    waveform = await run_in_threadpool(decode_audio, data)
    try:
        result = await run_in_threadpool(engine.transcribe, language, waveform)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("N-ATLaS transcription failed")
        message = str(exc).lower()
        if "gated" in message or "401" in message or "403" in message:
            detail = "N-ATLaS model access is not authorized on the server."
        elif "hf_token" in message:
            detail = "N-ATLaS service is not configured yet."
        else:
            detail = "N-ATLaS could not process this recording. Please retry."
        raise HTTPException(status_code=503, detail=detail) from exc

    if not result["text"]:
        raise HTTPException(
            status_code=422,
            detail="No speech was recognized. Please speak closer to the phone.",
        )
    return result
