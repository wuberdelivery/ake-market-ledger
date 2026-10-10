// Public endpoint for the AKE N-ATLaS ASR gateway.
// The Hugging Face credential stays on the VPS and is never bundled in the APK.
export const N_ATLAS_ASR_BASE_URL = 'https://wuber.com.ng/ake-ledger';

// Optional gateway credential. Static mobile credentials are not treated as
// secrets; the server also enforces request size, duration and rate limits.
export const N_ATLAS_CLIENT_TOKEN = '';
