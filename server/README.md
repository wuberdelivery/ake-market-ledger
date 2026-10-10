# AKE Ledger N-ATLaS ASR Gateway

This service uses the official gated NCAIR/Awarri N-ATLaS ASR models:

- `NCAIR1/Yoruba-ASR`
- `NCAIR1/Hausa-ASR`
- `NCAIR1/Igbo-ASR`
- `NCAIR1/NigerianAccentedEnglish`

It does **not** send audio to the separate `NCAIR1/N-ATLaS` 8B text LLM. Audio is decoded in memory, limited to 31 seconds, transcribed, and discarded.

## VPS setup

1. Accept the model terms on Hugging Face.
2. Run `bash server/setup_vps.sh`.
3. Copy `server/.env.example` to `server/.env` and set a fine-grained Hugging Face read token.
4. Run `bash server/convert_yoruba_int8.sh` to convert the official cached model weights to a CPU-optimized INT8 runtime.
5. Start with `pm2 start server/ecosystem.config.cjs && pm2 save`.
6. Run `bash server/install_nginx.sh` and enter the VPS sudo password.
7. Check `https://wuber.com.ng/ake-ledger/health`.

## API

`POST /api/v1/transcribe?language=yo` as `multipart/form-data` with an `audio` file. Supported language codes are `yo`, `ha`, `ig`, and `en`.

The response identifies the exact official model used, for example:

```json
{
  "text": "mo ta apo iresi meji",
  "language": "yo",
  "model": "NCAIR1/Yoruba-ASR",
  "processing_ms": 4120
}
```

N-ATLaS is an initiative of the Federal Ministry of Communications, Innovation and Digital Economy and is powered by Awarri Technologies.
