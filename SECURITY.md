# SwasthVaani — Security Policy

> This is a health-advice product. The policies in this file carry real weight — they are not boilerplate. Violations are not style issues; they are liability issues.

---

## 1. Red-Flag Safety Override — Hard Invariant

**The single most important invariant in this codebase:**

> **If `check_red_flags(transcript)` returns a non-empty list, `urgency` MUST be set to `"emergency"` immediately. The LLM is NOT called. This check runs first in `run_triage()` and its output cannot be downgraded, overridden, or short-circuited by any model, any configuration flag, or any caller.**

This is implemented in `backend/server.py` as follows:
1. `check_red_flags(transcript)` scans for hard-coded critical phrases (chest pain, difficulty breathing, severe bleeding, unconsciousness, stroke, seizure, etc.) in all supported languages.
2. If the result is non-empty, `run_triage()` returns an `emergency` classification **before any LLM API call is made**.
3. The red-flag trigger is logged at `WARNING` level with `RED FLAG OVERRIDE triggered` so it can be audited separately from normal LLM triage decisions.
4. The override sets `flagged=True` and `confidence=1.0` in the response, making it distinguishable from LLM-classified emergencies.

**To change the red-flag keyword list:** edit `RED_FLAG_KEYWORDS` in `server.py`. Any change to this list must be peer-reviewed — it is the safety-critical source of truth.

---

## 2. Mandatory Disclaimer in Every Response

Every triage response (text and spoken) MUST include this disclaimer:

> ⚠️ **This is triage guidance only — not a medical diagnosis. Always consult a qualified health professional for medical advice.**

This is not optional copy — it is a liability requirement from the project proposal. It is implemented as the `DISCLAIMER` constant in `server.py` and included in every `TriageRequestDoc` response. Frontend components must display it on every result screen.

---

## 3. Data Minimization — No Persistent Audio or Raw Transcripts Beyond Session

- Raw audio blobs are processed in memory and never written to permanent storage.
- Transcripts stored in MongoDB are limited to what's needed for the dashboard (transcript text, urgency, symptoms, red_flags, timestamp, caller ID). No biometric data.
- If MongoDB is unavailable, the in-memory fallback stores data only for the lifetime of the server process.
- Future consent-based storage: if a user explicitly consents to persistent transcript storage (e.g., for follow-up), this must be gated behind an explicit opt-in UI and stored with user ID and timestamp.

---

## 4. Required Environment Variables

All secrets live in environment variables only. **Never hard-code values. Never commit `.env` files.**

| Variable | Purpose | Where to get it |
|---|---|---|
| `MONGO_URL` | MongoDB connection string | MongoDB Atlas free tier |
| `DB_NAME` | Database name | Set to `swasthvaani` |
| `EMERGENT_LLM_KEY` | OpenAI-compatible API key (LLM + STT + TTS) | emergentintegrations dashboard |
| `OPENAI_API_KEY` | OpenAI API key (alternative) | platform.openai.com |
| `ANTHROPIC_API_KEY` | Claude API key (alternative LLM) | console.anthropic.com |
| `JWT_SECRET` | JWT signing secret for dashboard auth | Generate: `openssl rand -hex 32` |
| `CLINIC_EMAIL` | Dashboard login email | Set to your clinic email |
| `CLINIC_PASSWORD` | Dashboard login password | Set a strong password |
| `OLLAMA_HOST` | Ollama server URL | Default: `http://localhost:11434` |
| `OLLAMA_MODEL` | Ollama model name | Default: `nemotron` |
| `WHISPER_MODEL` | Local Whisper model size | `small` (fastest), `medium` (more accurate) |
| `KOKORO_MODEL_PATH` | Path to Kokoro ONNX model file | Download from Kokoro releases |
| `KOKORO_VOICES_PATH` | Path to Kokoro voices JSON | Same as above |
| `KOKORO_VOICE` | Kokoro voice name | Default: `hf_alpha` |
| `CORS_ORIGINS` | Allowed CORS origins | Set to your frontend URL in production |
| `GROQ_API_KEY` | Groq API key (optional fast LLM) | console.groq.com |

**The `.env` file is gitignored at the repo root.** Never add values to `.env.example` or commit secrets.

---

## 5. Rate Limiting

The public triage endpoints (`/api/triage/voice`, `/api/triage/text`) make calls to paid APIs (LLM, TTS). A demo link left open without rate limiting can burn API budget in minutes.

**Minimum rate-limiting measures for the hackathon demo:**
- Limit the demo URL to trusted networks or add a simple API key header check on the public endpoints.
- Set a per-IP request limit at the reverse proxy / Render level (Render supports this via environment config).
- For the IVR endpoints, Twilio's own call throttling provides some protection.

**Production implementation (post-hackathon):** use `slowapi` or a Redis-backed rate limiter on the FastAPI app.

---

## 6. Dashboard Authentication

The clinic dashboard (`/dashboard` in the frontend, `/api/triage/requests` and `/api/triage/stats` in the backend) **requires authentication**. The `require_auth` dependency on those endpoints enforces a valid JWT.

- Login: `POST /api/auth/login` with `{email, password}`
- JWT tokens expire after 7 days
- Hardcoded credentials (`CLINIC_EMAIL`, `CLINIC_PASSWORD`) are acceptable for the hackathon but must be replaced with a proper user store before any real deployment.
- **The dashboard must never be unauthenticated — even for a demo.** An open dashboard exposing patient case data is a privacy violation.

---

## 7. Input Sanitization (Prompt Injection)

Transcribed speech is user-controlled text that goes directly into an LLM prompt. Basic hygiene is applied in `run_triage()` before the transcript reaches any LLM:

```python
safe_transcript = transcript.replace("</", "< /").replace("<script", "< script")[:2000]
```

This is not a complete defense against adversarial prompt injection, but it prevents the most obvious attacks (HTML injection, length abuse). For a production system, use a dedicated input validation layer.

---

## 8. Twilio Webhook Security (`X-Twilio-Signature`)

Incoming calls to `/api/ivr/*` endpoints must be validated against Twilio signature header to prevent spoofing or unauthorized POST requests to public webhooks.

1. **Header Check**: `X-Twilio-Signature` header is validated against `TWILIO_AUTH_TOKEN` and the target request URL (`PUBLIC_WEBHOOK_URL` + path).
2. **Signature Failure Handling**: Requests failing signature validation return `403 Forbidden` immediately.
3. **Environment Requirement**: `TWILIO_AUTH_TOKEN` must be configured in environment variables.

---

## 9. Groq API Key & Provider Safety

- `GROQ_API_KEY` must strictly be loaded from environment variables and never logged or exposed to the client.
- **Red-Flag Override Integrity**: When Groq is selected for ASR (`whisper-large-v3`) or LLM Triage (`llama-3.3-70b-versatile`), the local pre-execution safety gate `check_red_flags()` MUST run before sending the prompt to Groq API.
- **Failover**: If Groq API returns a rate-limit (HTTP 429) or error, the system automatically falls back to local Whisper / Ollama / Emergent / Rule-based engine without dropping safety invariants.

---

## 10. Caller PII Handling (IVR)

For privacy and data minimization, raw caller phone numbers (the Twilio `From` parameter) are **masked** before they are logged in the dashboard database.
- Example: `+1234567890` is stored and displayed as `+123****890`.
- The masked caller ID provides enough context for the clinic to group repeat calls while protecting the patient's full contact number from casual exposure on the dashboard.
- This is explicitly implemented in the `/api/ivr/result` route.
