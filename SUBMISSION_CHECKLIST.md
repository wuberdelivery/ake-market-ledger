# NAIC 2026 Submission Checklist — AKE Market Ledger

Deadline: **12 October 2026, 11:59 PM WAT**

## Mandatory components

- [ ] **Working artefact** — signed APK/AAB tested on a physical Android device
- [ ] **Repository** — repair branch merged into `main`, clean build instructions
- [ ] **Genuine N-ATLaS evidence** — live health response and transcript showing `NCAIR1/<language>-ASR`
- [ ] **50 real-user interactions** — fully documented in `VALIDATION_LOG.md`; no simulated placeholders
- [x] **Technical documentation** — architecture, installation, privacy and endpoint contract
- [ ] **3–5 minute demonstration video** — use `DEMO_SCRIPT.md`
- [ ] **Team profile** — names, affiliations and roles
- [ ] **Track document** — valid ID for an individual or CAC certificate for an enterprise; academic teams need the institutional endorsement specified by NAIC

## Release gate

Do not submit until all items below are true:

- [ ] `npm run typecheck` passes
- [ ] `npm test -- --runInBand` passes
- [ ] `npm run lint` has no errors
- [ ] `./gradlew assembleRelease bundleRelease` passes
- [ ] Fresh-install onboarding completes
- [ ] Microphone permission prompt appears and recording starts
- [ ] `https://wuber.com.ng/ake-ledger/health` reports `status: ok` and `hf_configured: true`
- [ ] A real voice clip returns the expected official model identifier
- [ ] User can confirm a voice sale and see it in the ledger
- [ ] Airplane-mode manual sale still works
- [ ] Voice failure shows Retry and Enter manually, not a dead-end screen
- [ ] No provider token or release keystore is committed
- [ ] APK/AAB SHA-256 hashes are saved with the release

## Known external prerequisite

The operator must accept the gated Hugging Face terms for every enabled NCAIR ASR model and configure a fine-grained read token in `server/.env` on the VPS. The token must never be placed in this repository or the APK.
