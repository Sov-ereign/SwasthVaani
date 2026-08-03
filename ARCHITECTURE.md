# SwasthVaani — Architecture

## System Summary

SwasthVaani is a voice-first AI health triage assistant designed for low-literacy rural patients in India. A patient speaks their symptoms into the app (or calls via IVR), the system transcribes the audio, extracts symptoms, classifies urgency as **Emergency / Doctor Visit / Home Care**, and speaks the result back in the patient's language. A clinic-facing dashboard logs every interaction in near real-time for healthcare workers.

---

## 5-Stage Pipeline

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Patient Input (mic / IVR phone call)                                   │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Stage 1 — ASR (Automatic Speech Recognition)                           │
│  Primary : OpenAI Whisper (local, model=small)                          │
│  Fallback : OpenAI Whisper API (via emergentintegrations)               │
│  Input  : audio blob (webm/wav/mp4)                                     │
│  Output : { transcript: str, language: str, confidence: float }         │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Stage 2 — Symptom Extraction (NLP)                                     │
│  Primary : keyword-based extract_symptoms() in server.py                │
│  Future  : replace with NLP model or LLM extraction prompt              │
│  Input  : transcript (str)                                              │
│  Output : { symptoms: [str], duration: str|null,                        │
│             severity_keywords: [str], red_flags: [str] }                │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Stage 2.5 — RED-FLAG SAFETY GATE (runs before LLM, always)            │
│  ⚠️  HARD INVARIANT: if red_flags non-empty → urgency = "emergency"     │
│       LLM is never called. This cannot be overridden by any model.      │
│  Function: check_red_flags(transcript) → list                           │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Stage 3 — Triage Classification                                        │
│  Primary : Ollama (Nemotron model, localhost)                           │
│  Fallback : GPT-4o via emergentintegrations                             │
│  Fallback2: Rule-based keyword classifier                               │
│  Input  : output of Stage 2                                             │
│  Output : { urgency: "emergency"|"soon"|"home",                         │
│             confidence: float, reasoning: str }                         │
│  Rule   : red_flags non-empty → urgency forced to "emergency",          │
│           bypassing/overriding the ML/LLM result. Logged separately.   │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Stage 4 — TTS (Text-to-Speech)                                         │
│  Primary : Kokoro ONNX (local, offline-capable)                         │
│  Fallback : OpenAI TTS API (via emergentintegrations)                   │
│  Input  : { urgency, guidance_text, language }                          │
│  Output : audio stream (base64-encoded WAV)                             │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Dashboard Log Entry                                                     │
│  { timestamp, transcript, symptoms, urgency, flagged: bool,             │
│    red_flags: [str], disclaimer }                                        │
│  Stored in: MongoDB (primary) / in-memory list (offline fallback)       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Stage I/O Contracts (Phase 2 canonical schemas)

| Stage | Input | Output |
|---|---|---|
| **ASR** | `audio blob` | `{ transcript: str, language: str, confidence: float }` |
| **Symptom Extraction** | `transcript: str` | `{ symptoms: [str], duration: str\|null, severity_keywords: [str], red_flags: [str] }` |
| **Triage Classification** | output of Symptom Extraction | `{ urgency: "Emergency"\|"DoctorVisit"\|"HomeCare", confidence: float, reasoning: str }` — **if red_flags non-empty → urgency forced to "Emergency", bypassing LLM** |
| **TTS** | `{ urgency, guidance_text, language }` | `audio stream` |
| **Dashboard log entry** | — | `{ timestamp, transcript, symptoms, urgency, flagged: bool, red_flags: [str] }` |

---

## Folder / Module Structure

```
SwasthVaani/
├── backend/
│   ├── server.py           # FastAPI app — all 5 pipeline stages + API endpoints
│   ├── test_triage.py      # Isolated stage tests (run without starting the server)
│   ├── requirements.txt    # Python dependencies
│   └── .env                # Secrets (gitignored — never commit)
│
├── frontend/
│   ├── src/
│   │   ├── App.js          # Routing: / → Landing, /speak → VoiceApp, /dashboard → Dashboard
│   │   ├── pages/
│   │   │   ├── Landing.jsx     # Hero / language selector
│   │   │   ├── VoiceApp.jsx    # Mic input, triage result display, TTS playback
│   │   │   └── Dashboard.jsx   # Clinic view — case list, stats, flagged emergencies
│   │   ├── components/ui/      # shadcn-style primitives (Button, Badge, Input, etc.)
│   │   └── lib/
│   │       ├── api.js          # Axios API calls to backend
│   │       └── utils.js        # cn() and helpers
│   ├── public/index.html
│   ├── tailwind.config.js
│   └── .env                # REACT_APP_API_URL (gitignored)
│
├── ARCHITECTURE.md     # This file
├── AGENTS.md           # Contributor / AI-agent conventions
├── SECURITY.md         # Safety invariants and security policy
├── BUILD.md            # Setup, run, and deploy instructions
└── .gitignore
```

---

## Tech Choice Rationale

| Component | Choice | Why | Fallback if broken |
|---|---|---|---|
| ASR | OpenAI Whisper (local) | Free, offline, strong multilingual | Whisper API via emergentintegrations |
| LLM Triage | Ollama Nemotron (local) | Free, no latency, private | GPT-4o via emergentintegrations |
| TTS | Kokoro ONNX (local) | Free, offline, fast | OpenAI TTS API |
| Backend | Python + FastAPI | Fast to write, async, type-safe | — |
| Frontend | React (CRA + CRACO + Tailwind) | Already scaffolded in boilerplate | — |
| DB | MongoDB + Motor (async) | Already in boilerplate | In-memory list fallback (auto) |
| Auth | JWT (pyjwt) | Stateless, no infra needed | — |
| IVR (stretch) | Twilio TwiML endpoints | Standard, cheapest | Skip — pre-recorded demo clip |
| Deploy | Vercel (frontend) + Render (backend) | Free tier, fast CI | Netlify / Railway |
