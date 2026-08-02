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
uvicorn server:app --reload --port 8000
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
