# SwasthVaani — Agent & Contributor Conventions

This file is the single source of truth for any AI agent or human teammate touching this codebase during the hackathon build window.

---

## Where New Code Goes (exact paths per pipeline stage)

| Pipeline Stage | File | Function / Endpoint |
|---|---|---|
| ASR | `backend/server.py` | `triage_voice()` endpoint + Whisper blocks |
| Symptom Extraction | `backend/server.py` | `extract_symptoms(transcript)` |
| Red-Flag Safety Gate | `backend/server.py` | `check_red_flags(transcript)` — **DO NOT MOVE** |
| Triage Classification | `backend/server.py` | `run_triage()` — Ollama → GPT fallback → rule fallback |
| TTS | `backend/server.py` | `synth_speech(text, language)` |
| API endpoints | `backend/server.py` | `/api/triage/voice`, `/api/triage/text`, `/api/triage/requests`, `/api/triage/stats` |
| Frontend voice UI | `frontend/src/pages/VoiceApp.jsx` | Main patient interface |
| Frontend dashboard | `frontend/src/pages/Dashboard.jsx` | Clinic view |
| Frontend API calls | `frontend/src/lib/api.js` | All `axios` calls — add new ones here |
| UI primitives | `frontend/src/components/ui/` | Button, Badge, Input, Label, Textarea |

---

## MVP-First Rule

> **No refactoring. No premature abstraction. No new technology not already in the stack table in `ARCHITECTURE.md` without flagging it first.**

- If you want to add a technology (e.g., Redis, Celery, a different LLM), flag it in a comment and ask before adding it.
- If something is already working, don't touch it to make it "cleaner".
- Inline code is fine during a hackathon. Abstract only when you need to.

---

## Running Each Stage in Isolation (with mocked input)

All stages can be tested without starting the full server:

```bash
# Run all stage tests
cd backend
python test_triage.py

# Test only the red-flag safety gate
python test_triage.py --stage red_flags

# Test triage on a specific text string
python test_triage.py --text "I have chest pain" --lang en

# Test triage on a mocked JSON file
# (format: {"transcript": "...", "language": "en"})
python test_triage.py --input sample.json

# Start the API server (stages accessible via HTTP)
uvicorn server:app --reload --port 8001
```

### Mocked inputs for parallel development

If ASR isn't ready yet, mock the transcript input:
```json
// sample.json
{"transcript": "मुझे तीन दिन से बुखार है और सिरदर्द हो रहा है", "language": "hi"}
```

If TTS isn't ready yet, the `/api/triage/text` endpoint returns `audio_base64: ""` — the frontend handles this gracefully and shows text only.

---

## Commit Convention

Short, scoped messages. This is a hackathon.

```
feat(triage): add Hindi red-flag keywords
fix(asr): handle empty audio upload
docs(security): add rate-limit note
chore(deps): add anthropic to requirements
```

Format: `type(scope): short description`  
Types: `feat`, `fix`, `docs`, `chore`, `test`  
Scope: `asr`, `triage`, `tts`, `dashboard`, `auth`, `ivr`, `deps`, `security`

---

## Explicit NOT-TO-BUILD List

These are **Future Scope** items from the project proposal — do not build them during the hackathon:

| Item | Status |
|---|---|
| Twilio IVR call-in path | **Stretch only** — endpoints exist, don't spend time debugging Twilio webhooks |
| More than 3 languages (en/hi/ta) | Out of scope |
| Wearable device integration | Out of scope |
| Multi-user clinic accounts / RBAC | Out of scope — shared password is fine |
| Offline PWA / service worker | Out of scope |
| Fine-tuned medical NLP model | Out of scope — use keyword extraction + LLM |
| Real-time push notifications | Out of scope — polling is fine for the demo |
| HIPAA / production compliance | Out of scope — this is a hackathon prototype |

---

## Hardcoded Demo Credentials (hackathon only)

| Role | Email | Password |
|---|---|---|
| Clinic dashboard | `clinic@swasthvaani.health` | `clinic123` |

Change via `CLINIC_EMAIL` and `CLINIC_PASSWORD` env vars before any real deployment.
