# SwasthVaani — Build & Deploy Guide

> If you can follow this document from scratch and get a working demo, it's done right.

---

## Prerequisites

| Tool | Required Version | Check |
|---|---|---|
| Python | 3.10 or 3.11 | `python --version` |
| Node.js | 18.x or 20.x | `node --version` |
| Yarn | 1.22.x | `yarn --version` |
| Git | Any | `git --version` |
| MongoDB | 6.x (or use Atlas) | `mongod --version` |
| Ollama | 0.1.6+ (optional) | `ollama --version` |

---

## Required API Keys & Environment Configuration

| Key / Var | Where to Get / Values | Purpose |
|---|---|---|
| `GROQ_API_KEY` | console.groq.com | Low-latency Whisper ASR (`whisper-large-v3`) & Llama 3.3 reasoning |
| `ASR_PROVIDER` | `groq` \| `whisper_local` \| `openai` | Selects primary ASR engine (default: `groq` if `GROQ_API_KEY` present) |
| `TWILIO_ACCOUNT_SID` | twilio.com/console | Twilio account identifier for IVR phone integration |
| `TWILIO_AUTH_TOKEN` | twilio.com/console | Twilio auth token used to validate `X-Twilio-Signature` |
| `TWILIO_PHONE_NUMBER` | twilio.com/console | Purchased phone number pointing to webhook |
| `PUBLIC_WEBHOOK_URL` | e.g. `https://xxxx.ngrok-free.app` | Publicly accessible URL for Twilio webhooks |
| `EMERGENT_LLM_KEY` | emergentintegrations dashboard | Recommended (enables LLM + OpenAI TTS + Whisper API) |
| `OPENAI_API_KEY` | platform.openai.com | Alternative to EMERGENT_LLM_KEY |
| `MONGO_URL` | MongoDB Atlas / Local Mongo | Database connection string |

Without any LLM key, the system falls back to the rule-based classifier. Audio without a TTS key returns silence; the UI shows text guidance.

---

## Local Setup

### 1. Clone

```bash
git clone https://github.com/your-org/swasthvaani.git
cd swasthvaani
```

### 2. Backend

```bash
cd backend

# Create and activate virtual environment
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env   # or create .env from scratch
# Edit .env and fill in your keys (see SECURITY.md for variable list)
```

**Minimum `.env` for the rule-based fallback to work (no API keys needed):**
```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=swasthvaani
JWT_SECRET=change-this-to-a-random-32-char-string
CLINIC_EMAIL=clinic@swasthvaani.health
CLINIC_PASSWORD=clinic123
CORS_ORIGINS=http://localhost:3000
```

### 3. Start Backend

```bash
cd backend
uvicorn server:app --reload --host 0.0.0.0 --port 8001
```

API is now available at `http://localhost:8001`. Swagger docs at `http://localhost:8001/docs`.

### 4. Frontend

```bash
cd frontend

# Install dependencies
yarn install

# Configure environment
# Create frontend/.env with:
echo "REACT_APP_API_URL=http://localhost:8001" > .env

# Start dev server
yarn dev
```

Frontend is now available at `http://localhost:3000`.

### 5. Test Pipeline (no server needed)

```bash
cd backend
python test_triage.py                          # all stage tests
python test_triage.py --text "chest pain"      # safety gate test
python test_triage.py --stage red_flags        # red-flag gate only
```

---

## Optional: Local LLM with Ollama

```bash
# Install Ollama: https://ollama.com
ollama pull nemotron-mini   # or: ollama pull llama3.2
# Set in .env:
# OLLAMA_MODEL=nemotron-mini
# OLLAMA_HOST=http://localhost:11434
```

---

## Deployment

### Frontend → Vercel

```bash
cd frontend
yarn build   # creates /build folder

# Option A: Vercel CLI
npm i -g vercel
vercel --prod

# Option B: Vercel dashboard
# 1. Push to GitHub
# 2. Import repo at vercel.com/new
# 3. Set root directory = frontend
# 4. Set environment variable: REACT_APP_API_URL=https://your-backend.onrender.com
```

### Backend → Render

1. Push repo to GitHub
2. Go to render.com → New → Web Service
3. Connect your repo
4. Settings:
   - **Root Directory**: `backend`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn server:app --host 0.0.0.0 --port $PORT`
5. Add all environment variables from SECURITY.md → "Environment Variables" tab
6. Set `CORS_ORIGINS` to your Vercel URL (e.g., `https://swasthvaani.vercel.app`)

---

## Demo-Day Checklist

Run through this before presenting:

- [ ] Backend is live on Render — hit `https://your-backend.onrender.com/api/` and confirm `{"status":"ok"}`
- [ ] Frontend is live on Vercel — confirm `http://localhost:3000` or your Vercel URL loads
- [ ] API keys verified live (not just in `.env.example`) — submit a test voice/text query
- [ ] Dashboard pre-seeded: log in at `/dashboard` and confirm at least 3 sample cases visible
- [ ] Red-flag demo: say "chest pain" (or type it) — confirm `Emergency` result, `flagged=true` in dashboard
- [ ] Disclaimer text visible on every triage result screen
- [ ] Pre-recorded fallback video ready (2-min demo showing voice → triage → dashboard) — stored locally and on USB
- [ ] Offline fallback confirmed: if WiFi fails, rule-based classifier still works without API keys

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `ModuleNotFoundError: emergentintegrations` | `pip install emergentintegrations` |
| Mongo connection timeout | Use Atlas free tier instead of local MongoDB; update `MONGO_URL` |
| Whisper takes too long | Set `WHISPER_MODEL=tiny` in `.env` for faster (less accurate) transcription |
| CORS errors from frontend | Set `CORS_ORIGINS=http://localhost:3000` (or your Vercel URL) in backend `.env` |
| Ollama not responding | Run `ollama serve` and check `OLLAMA_HOST` in `.env` |
| Dashboard shows "401 Not authenticated" | Check `JWT_SECRET` matches between login and API calls |
