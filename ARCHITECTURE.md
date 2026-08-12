# SwasthVaani — Architecture

## System Summary

SwasthVaani is a voice-first AI health triage assistant designed for low-literacy rural patients in India. A patient speaks their symptoms into the app (or calls via IVR), the system transcribes the audio, extracts symptoms, classifies urgency as **Emergency / Doctor Visit / Home Care**, and speaks the result back in the patient's language. A clinic-facing dashboard logs every interaction in near real-time for healthcare workers.

---

## Entry Points (User Layer)

- **Web Voice Interface**: Browser application capturing microphone audio via `MediaRecorder` API or Web Speech API.
- **Twilio IVR Call-In**: Phone interface accepting incoming voice calls via Twilio webhooks, capturing speech/audio and returning TwiML spoken audio responses.
- *(Hardware/ESP32 kiosk: Not building for this hackathon window — dropped from active scope)*

---

## 5-Stage Pipeline

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Patient Input                                                           │
│  Path A: Web Mic (VoiceApp.jsx)                                         │
│  Path B: Phone Call (Twilio IVR / TwiML Webhook)                        │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Stage 1 — ASR (Automatic Speech Recognition)                           │
│  Primary  : Groq Whisper API (whisper-large-v3 — ultra-low latency)     │
│  Fallbacks: Local Whisper (model=small), Emergent OpenAI Whisper        │
│  Config   : ASR_PROVIDER=groq|whisper_local|openai                      │
│  Input    : audio blob (webm/wav/mp4)                                   │
│  Output   : { transcript: str, language: str, confidence: float }       │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Stage 2 — Symptom Extraction (NLP)                                     │
│  Primary : keyword-based extract_symptoms() in server.py                │
│  Input   : transcript (str)                                             │
│  Output  : { symptoms: [str], red_flags: [str] }                        │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Stage 2.5 — RED-FLAG SAFETY GATE (runs before LLM, always)            │
│  ⚠️  HARD INVARIANT: if check_red_flags(transcript) non-empty           │
│       → urgency = "emergency" immediately.                             │
│       LLM is NEVER called regardless of provider (Groq/Ollama/GPT).     │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Stage 3 — Triage Classification                                        │
│  Primary  : Groq API (Llama 3.3 70B Versatile — fast inference)         │
│  Fallbacks: Ollama (localhost), GPT-4o via Emergent, Rule-based         │
│  Input    : output of Stage 2                                            │
│  Output   : { urgency: "emergency"|"soon"|"home",                        │
│               confidence: float, summary: str, advice: str, spoken: str } │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Stage 4 — TTS (Text-to-Speech)                                         │
│  Primary : Kokoro ONNX (local, offline-capable)                         │
│  Fallback: Edge TTS (multi-lingual neural), OpenAI TTS API              │
│  Output  : audio stream (base64-encoded WAV/MP3) or TwiML spoken audio  │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Dashboard Log Entry                                                     │
│  { timestamp, caller, transcript, symptoms, urgency, source: "web"|"ivr"│
│    flagged: bool, red_flags: [str], disclaimer }                        │
│  Stored in: MongoDB (primary) / in-memory list (fallback)               │
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
| ASR | Groq Whisper (`whisper-large-v3`) | Ultra-low latency, hosted API, multilingual | Local Whisper (`small`) / Emergent Whisper |
| LLM Triage | Groq Llama 3.3 (`llama-3.3-70b-versatile`) | Fast inference, robust reasoning | Ollama Nemotron (local) / GPT-4o / Rule fallback |
| TTS | Kokoro ONNX (local) / Edge TTS | Offline capability, neural natural voices | OpenAI TTS API |
| Backend | Python + FastAPI | Fast to write, async, type-safe | — |
| Frontend | React (CRA + CRACO + Tailwind) | Modern UI with voice & clinic dashboard | — |
| DB | MongoDB + Motor (async) | Persistent store for clinic case logs | In-memory list fallback (auto) |
| Auth | JWT (pyjwt) | Stateless clinic dashboard authentication | — |
| IVR Entry Point | Twilio TwiML Webhooks | Direct phone call access without app/smartphone | Web Voice UI |
| Deploy | Vercel (frontend) + Render (backend) | Cloud hosting with public webhook support | — |
