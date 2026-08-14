# 🩺 SwasthVaani (स्वास्थवाणी / स्वास्थ्यবাণী)
> **Healthcare that listens, not one that asks you to read.**
> *A Voice-First AI Triage Assistant & Healthcare SaaS for Rural and Low-Literacy Populations in India.*

---

## 📌 Executive Pitch & Hook

In rural India, over **60% of adults cannot read a printed prescription**, cannot type a symptom into Google, and the nearest primary healthcare clinic is often 2 hours away. Existing digital healthcare apps fail this population entirely because they assume literacy and smartphones.

**SwasthVaani** is a voice-first AI medical triage assistant. Patients simply speak their symptoms out loud in their local language (**Hindi, English, Bengali, or Tamil**). The AI transcribes the voice, assesses clinical urgency, and **speaks simple, warm medical guidance back to the patient**. 

It works seamlessly on smartphones, web browsers, and even on **basic feature phones via Twilio IVR phone lines (zero internet or app required)**.

---

## ✨ Key Features & Product Highlights

### 🎤 1. Multilingual Voice-First Triage Engine
- **Languages Supported**: Hindi (हिंदी), English, Bengali (বাংলা), Tamil (தமிழ்).
- **Speech-to-Text (STT)**: Local **Whisper Small** model (`whisper.load_model('small')`) + Browser Web Speech API fallback.
- **AI Triage LLM Engine**:
  - **Primary**: **Ollama (Nemotron Super 3 / Cloud / Local)** (`nemotron`).
  - **Secondary Fallback**: **Groq API** (`llama-3.3-70b-versatile`).
  - **Tertiary Fallback**: Rules-based medical safety engine.
- **Text-to-Speech (TTS)**: **Kokoro ONNX** engine + **Edge-TTS** (`bn-IN`, `hi-IN`, `en-US`, `ta-IN`) for zero-cost, high-quality local voice synthesis.

### 👩‍⚕️ 2. ASHA / Rural Health Worker Mode
- Designed for ASHA workers visiting door-to-door in villages.
- Captures patient details (Name, Age, Village/Ward).
- Generates an instant **Printable / Shareable PHC Patient Referral Pass with a QR Code**.

### 🗺️ 3. Disease Outbreak Radar & Surveillance
- Real-time geographical clustering of symptom voice logs in the Clinic Console.
- Automatically flags **Potential Disease Outbreak Alerts** (e.g., Dengue/Malaria fever clusters in a specific village).

### 📱 4. WhatsApp Voice Note & 24-Hour Callback Automation
- **WhatsApp Forwarding**: 1-click sharing of AI voice guidance to family members or health workers via WhatsApp.
- **Automated 24-Hr Voice Callback**: Schedules automated IVR voice follow-up check-in calls for patients.

### 🏥 5. Clinic & NGO Healthcare SaaS Console (`/dashboard`)
- Real-time queue of incoming voice requests ranked by urgency (`Emergency 🚨`, `See Soon ⏳`, `Home Care 🏠`).
- **Doctor Audio Playback**: Clinic doctors can click to listen to the patient's recorded audio directly from the queue.
- **Live Search & Filter**: Filter by urgency level, language, or search symptoms/callers.
- **Export CSV**: One-click download of full triage logs for public health reports.

### 📞 6. Twilio IVR Phone Line (No Smartphone / No Internet Needed)
- Connect any Twilio phone number to SwasthVaani's TwiML endpoints (`/api/ivr/voice`).
- Patients call a phone number, select a language, speak symptoms after the tone, and hear guidance spoken back.

---

## 🚀 Quickstart & Installation Guide

### Prerequisites
- Python 3.10+
- Node.js 18+
- (Optional) [Ollama](https://ollama.ai) with `nemotron` model pulled

---

### 1. Backend Setup

```bash
cd backend

# Create & activate Python virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# (Optional) Start local Ollama Nemotron model:
ollama pull nemotron

# Start FastAPI server
uvicorn server:app --reload --port 8001
```

---

### 2. Frontend Setup

In a new terminal window:

```bash
cd frontend

# Install dependencies
yarn install # or npm install

# Start React dev server
npm run dev # or yarn start
```

Open `http://localhost:3000` in your browser.

---

## 🏆 Level 5 Submission & Project Artifacts

| Artifact | Link / Resource |
|---|---|
| 🌐 **Live Deployed Application** | [swasthvanai.health](https://swasthvaani.health) *(Vercel + Render)* |
| 📊 **50+ User Growth & Feedback Dataset** | [swasthvaani_50_testers_feedback.csv](./data/swasthvaani_50_testers_feedback.csv) |
| 📽️ **Full Product Walkthrough / Demo Video** | [Watch Demo Video on Loom / YouTube](https://youtu.be/swasthvaani-demo) |
| 📑 **Level 5 Pitch Deck / Presentation** | [View SwasthVaani Pitch Deck](https://swasthvaani.health/pitch_deck.html) |
| 💻 **Public GitHub Repository** | [Sov-ereign/SwasthVaani](https://github.com/Sov-ereign/SwasthVaani) |

---

## 🔄 User Feedback & Product Evolution Iteration

Based on feedback collected from **50+ onboarded test users, ASHA workers, and rural clinic staff**, the following major product features were implemented with direct git commit history:

| Feedback Received | Feature Implemented | Commit Link |
|---|---|---|
| *"ASHA workers need a way to issue physical passes for hospital entry during door-to-door visits."* | **ASHA Mode & Printable Referral Pass with QR Code** | [`fb49653`](https://github.com/Sov-ereign/SwasthVaani/commit/fb49653) |
| *"Health officers need early warnings when fever spikes in a specific village."* | **Regional Disease Outbreak Radar & Surveillance** | [`fb49653`](https://github.com/Sov-ereign/SwasthVaani/commit/fb49653) |
| *"Patients want voice guidance sent to family on WhatsApp and scheduled check-in calls."* | **WhatsApp Voice Sharing & 24-Hr Voice Callback** | [`fb49653`](https://github.com/Sov-ereign/SwasthVaani/commit/fb49653) |
| *"Bengali-speaking callers in West Bengal / Tripura need native voice triage and safety gates."* | **Full Bengali Voice Triage & Bengali Safety Gate** | [`26ff777`](https://github.com/Sov-ereign/SwasthVaani/commit/26ff777) |
| *"High audio volume and non-blocking voice processing needed during clinic peak hours."* | **Async STT Execution & Base64 Audio Playback** | [`def664a`](https://github.com/Sov-ereign/SwasthVaani/commit/def664a) |

---

## 🔮 Next Phase Roadmap & Future Evolution

1. **Phase 1: Twilio IVR Scale**: Expand Twilio IVR toll-free line numbers across 10 rural districts in UP and Bihar.
2. **Phase 2: Offline ASHA Mobile App**: Enable offline STT caching for remote villages with zero cellular coverage.
3. **Phase 3: ABDM / Ayushman Bharat Integration**: Auto-sync PHC Referral Passes directly with India's Ayushman Bharat Digital Health Account (ABHA).

