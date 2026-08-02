import os
import io
import json
import logging
import base64
import asyncio
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Annotated

from fastapi import FastAPI, APIRouter, UploadFile, File, Form, HTTPException, Depends, Request
from fastapi.responses import Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, BeforeValidator, ConfigDict
from bson import ObjectId
import jwt

# Optional engine imports
try:
    import whisper
    HAS_WHISPER = True
except ImportError:
    HAS_WHISPER = False

try:
    import ollama
    HAS_OLLAMA = True
except ImportError:
    HAS_OLLAMA = False

try:
    from groq import Groq
    HAS_GROQ = True
except ImportError:
    HAS_GROQ = False

try:
    from kokoro_onnx import Kokoro
    HAS_KOKORO = True
except ImportError:
    HAS_KOKORO = False

try:
    import edge_tts
    HAS_EDGE_TTS = True
except ImportError:
    HAS_EDGE_TTS = False

try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    from emergentintegrations.llm.openai.speech_to_text import OpenAISpeechToText
    from emergentintegrations.llm.openai.text_to_speech import OpenAITextToSpeech
    HAS_EMERGENT = True
except ImportError:
    HAS_EMERGENT = False

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
db_name = os.environ.get('DB_NAME', 'swasthvaani')

try:
    client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=2000)
    db = client[db_name]
except Exception as e:
    client = None
    db = None

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', 'demo-key')
JWT_SECRET = os.environ.get('JWT_SECRET', 'swasthvaani-secret-jwt-key-2026')
CLINIC_EMAIL = os.environ.get('CLINIC_EMAIL', 'clinic@swasthvaani.health')
CLINIC_PASSWORD = os.environ.get('CLINIC_PASSWORD', 'clinic123')
GROQ_API_KEY = os.environ.get('GROQ_API_KEY', '')

IN_MEMORY_TRIAGE_REQUESTS = []

_whisper_model_obj = None
_kokoro_obj = None

def get_whisper():
    global _whisper_model_obj
    if HAS_WHISPER and _whisper_model_obj is None:
        try:
            model_name = os.environ.get("WHISPER_MODEL", "small")
            logging.info(f"Loading Whisper STT model '{model_name}'...")
            _whisper_model_obj = whisper.load_model(model_name)
        except Exception as e:
            logging.error(f"Whisper load error: {e}")
    return _whisper_model_obj

def get_kokoro():
    global _kokoro_obj
    if HAS_KOKORO and _kokoro_obj is None:
        try:
            model_path = os.environ.get("KOKORO_MODEL_PATH", "kokoro-v0_19.onnx")
            voices_path = os.environ.get("KOKORO_VOICES_PATH", "voices.json")
            if os.path.exists(model_path) and os.path.exists(voices_path):
                logging.info("Initializing Kokoro TTS engine...")
                _kokoro_obj = Kokoro(model_path, voices_path)
        except Exception as e:
            logging.error(f"Kokoro TTS load error: {e}")
    return _kokoro_obj

app = FastAPI(title="SwasthVaani API")
api_router = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

PyObjectId = Annotated[str, BeforeValidator(str)]

LANGS = {
    "hi": {"name": "Hindi", "whisper": "hi", "polly": "Polly.Aditi", "edge": "hi-IN-SwaraNeural", "browser": "hi-IN"},
    "en": {"name": "English", "whisper": "en", "polly": "Polly.Joanna", "edge": "en-IN-NeerjaNeural", "browser": "en-US"},
    "bn": {"name": "Bengali", "whisper": "bn", "polly": "Polly.Aditi", "edge": "bn-IN-TanishaaNeural", "browser": "bn-IN"},
    "ta": {"name": "Tamil", "whisper": "ta", "polly": "Polly.Aditi", "edge": "ta-IN-PallaviNeural", "browser": "ta-IN"},
}

URGENCY = {
    "emergency": {"label": "Emergency", "label_hi": "आपातकाल", "label_bn": "জরুরি অবস্থা"},
    "soon": {"label": "See a doctor soon", "label_hi": "जल्द डॉक्टर से मिलें", "label_bn": "শীঘ্রই ডাক্তার দেখান"},
    "home": {"label": "Home care", "label_hi": "घरेलू देखभाल", "label_bn": "বাড়িতে যত্ন"},
}


class TriageRequestDoc(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    caller: str = "Anonymous"
    language: str = "hi"
    transcript: str = ""
    summary: str = ""
    urgency: str = "home"
    advice: str = ""
    spoken: str = ""
    source: str = "web"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    @classmethod
    def from_mongo(cls, doc):
        if not doc:
            return None
        return cls(**doc)

    def to_mongo(self):
        d = self.model_dump(by_alias=True, exclude_none=True)
        d.pop("_id", None)
        return d


class LoginInput(BaseModel):
    email: str
    password: str


class TextTriageInput(BaseModel):
    text: str
    language: str = "hi"
    caller: Optional[str] = "Web user"


def create_token(email: str) -> str:
    payload = {"sub": email, "exp": datetime.now(timezone.utc) + timedelta(days=7)}
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


async def require_auth(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    if not creds:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=["HS256"])
        return payload["sub"]
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


TRIAGE_SYSTEM = """You are SwasthVaani, an AI medical triage assistant for rural, low-literacy patients in India.
A patient has described their symptoms by voice. Your job is to assess urgency and give simple, calm, safe guidance.

You MUST respond with ONLY a valid JSON object (no markdown, no extra text) with these exact keys:
{
  "urgency": one of "emergency" | "soon" | "home",
  "summary": short English summary of symptoms for the clinic dashboard (max 12 words),
  "advice": clear next-steps advice in ENGLISH for clinic records (2-3 short sentences),
  "spoken": the SAME advice written in the patient's language ({lang_name}), warm and simple, spoken aloud to the patient. Start by restating what you understood, state the urgency level in their language, then give 2-3 simple next steps. Keep under 90 words.
}

Urgency rules:
- "emergency": chest pain, difficulty breathing, severe bleeding, unconsciousness, stroke signs, severe injury, high fever with confusion, pregnancy emergencies. Advise calling emergency/reaching a hospital NOW.
- "soon": persistent moderate symptoms, fever over a few days, infections, worsening pain, that need a doctor within 1-2 days.
- "home": mild self-limiting issues (mild cold, minor headache) manageable with rest/fluids/home care, with a note on when to seek help.

Always be safe: if unsure, escalate. Never give specific drug prescriptions. Encourage seeing a health worker."""


async def run_triage(transcript: str, language: str, caller: str, source: str) -> TriageRequestDoc:
    lang = LANGS.get(language, LANGS["hi"])
    data = None

    # 1. Primary LLM: Ollama (Nemotron / Super 3 / Cloud)
    if HAS_OLLAMA:
        try:
            ollama_host = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
            ollama_model = os.environ.get("OLLAMA_MODEL", "nemotron")
            client_ollama = ollama.Client(host=ollama_host)
            prompt = f"{TRIAGE_SYSTEM.replace('{lang_name}', lang['name'])}\n\nPatient symptoms (in {lang['name']}): {transcript}"
            resp = client_ollama.generate(model=ollama_model, prompt=prompt)
            raw = resp.get('response', '').strip()
            if raw.startswith("```"):
                raw = raw.strip("`")
                raw = raw[raw.find("{"):]
            data = json.loads(raw[raw.find("{"): raw.rfind("}") + 1])
            logger.info("Successfully triaged via Ollama Nemotron")
        except Exception as e:
            logger.warning(f"Ollama Nemotron triage fallback: {e}")

    # 2. Secondary Fallback LLM: Groq API
    if not data and HAS_GROQ and (GROQ_API_KEY or os.environ.get("GROQ_API_KEY")):
        try:
            g_key = GROQ_API_KEY or os.environ.get("GROQ_API_KEY")
            g_client = Groq(api_key=g_key)
            completion = g_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": TRIAGE_SYSTEM.replace("{lang_name}", lang["name"])},
                    {"role": "user", "content": f"Patient symptoms (in {lang['name']}): {transcript}"}
                ],
                temperature=0.2,
                max_tokens=300,
            )
            raw = completion.choices[0].message.content.strip()
            if raw.startswith("```"):
                raw = raw.strip("`")
                raw = raw[raw.find("{"):]
            data = json.loads(raw[raw.find("{"): raw.rfind("}") + 1])
            logger.info("Successfully triaged via Groq Llama 3.3")
        except Exception as e:
            logger.warning(f"Groq API triage fallback: {e}")

    # 3. Tertiary Fallback LLM: Emergent / OpenAI LLM
    if not data and HAS_EMERGENT and EMERGENT_LLM_KEY and EMERGENT_LLM_KEY != "demo-key":
        try:
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"triage-{datetime.now(timezone.utc).timestamp()}",
                system_message=TRIAGE_SYSTEM.replace("{lang_name}", lang["name"]),
            ).with_model("openai", "gpt-4o")

            resp = await chat.send_message(UserMessage(text=f"Patient symptoms (in {lang['name']}): {transcript}"))
            raw = resp.strip() if isinstance(resp, str) else str(resp)
            if raw.startswith("```"):
                raw = raw.strip("`")
                raw = raw[raw.find("{"):]
            data = json.loads(raw[raw.find("{"): raw.rfind("}") + 1])
        except Exception as e:
            logger.error(f"Emergent LLM triage fallback: {e}")

    # 4. Rule-based safety engine fallback (supporting English, Hindi, Bengali, Tamil)
    if not data:
        lower_t = transcript.lower()
        if any(k in lower_t for k in ["chest pain", "bleeding", "unconscious", "breath", "सीने में दर्द", "सांस", "खून", "বুকে ব্যথা", "শ্বাসকষ্ট", "রক্ত"]):
            urgency = "emergency"
            summary = "Chest pain / severe symptoms reported"
            advice = "Please reach the nearest emergency hospital immediately or call for urgent medical assistance."
            spoken_hi = "सीने में दर्द या गंभीर लक्षण हैं। कृपया तुरंत नजदीकी अस्पताल जाएँ या आपातकालीन सेवा से संपर्क करें।"
            spoken_bn = "বুকে ব্যথা বা মারাত্মক লক্ষণ রয়েছে। অবিলম্বে নিকটস্থ হাসপাতালে যান বা জরুরি সেবায় কল করুন।"
            spoken_en = "Severe symptoms detected. Please seek emergency medical care at the nearest hospital immediately."
            spoken_ta = "கடுமையான அறிகுறிகள். உடனடியாக அருகிலுள்ள மருத்துவமனைக்கு செல்லவும்."
        elif any(k in lower_t for k in ["fever", "pain", "infection", "vomit", "बुखार", "दर्द", "कफ", "জ্বর", "ব্যথা", "বমি"]):
            urgency = "soon"
            summary = "Fever / persistent symptoms reported"
            advice = "Visit a primary healthcare center or doctor within 1-2 days."
            spoken_hi = "आपको जल्द डॉक्टर से मिलना चाहिए। 1-2 दिनों के भीतर स्वास्थ्य केंद्र जाएँ और आराम करें।"
            spoken_bn = "আপনার শীঘ্রই ডাক্তার দেখানো উচিত। ১-২ দিনের মধ্যে স্বাস্থ্যকেন্দ্রে যান এবং বিশ্রাম নিন।"
            spoken_en = "You should consult a doctor within 1 to 2 days. Rest and stay hydrated."
            spoken_ta = "1-2 நாட்களுக்குள் மருத்துவரை அணுகவும்."
        else:
            urgency = "home"
            summary = "Mild symptoms reported"
            advice = "Rest well at home, drink fluids, and monitor symptoms. Consult a doctor if condition worsens."
            spoken_hi = "घर पर आराम करें और पर्याप्त पानी पिएं। यदि लक्षण बिगड़ते हैं, तो डॉक्टर से मिलें।"
            spoken_bn = "বাড়িতে বিশ্রাম নিন এবং পর্যাপ্ত জল পান করুন। লক্ষণগুলি খারাপ হলে ডাক্তারের সাথে পরামর্শ করুন।"
            spoken_en = "Rest well at home and drink clean water. Contact a doctor if symptoms get worse."
            spoken_ta = "வீட்டில் ஓய்வெடுத்து திரவங்களை அருந்தவும்."

        spoken_map = {"hi": spoken_hi, "bn": spoken_bn, "en": spoken_en, "ta": spoken_ta}
        data = {
            "urgency": urgency,
            "summary": summary,
            "advice": advice,
            "spoken": spoken_map.get(language, spoken_en)
        }

    doc = TriageRequestDoc(
        caller=caller or "Anonymous",
        language=language,
        transcript=transcript,
        summary=data.get("summary", ""),
        urgency=data.get("urgency", "soon"),
        advice=data.get("advice", ""),
        spoken=data.get("spoken", ""),
        source=source,
    )
    doc_dict = doc.to_mongo()

    inserted = False
    if db is not None:
        try:
            res = await db.triage_requests.insert_one(doc_dict)
            doc.id = str(res.inserted_id)
            inserted = True
        except Exception as e:
            logger.warning(f"Mongo insert error: {e}")

    if not inserted:
        doc.id = str(ObjectId())
        doc_dict["_id"] = ObjectId(doc.id)
        IN_MEMORY_TRIAGE_REQUESTS.insert(0, doc_dict)

    return doc


async def synth_speech(text: str, language: str = "hi") -> str:
    lang_info = LANGS.get(language, LANGS["hi"])

    # 1. Try Kokoro TTS engine (Primary local TTS for English/Hindi)
    kokoro = get_kokoro()
    if kokoro is not None and language in ["en", "hi"]:
        try:
            voice_name = os.environ.get("KOKORO_VOICE", "hf_alpha")
            samples, sample_rate = kokoro.create(text[:500], voice=voice_name, speed=1.0, lang=language)
            buffer = io.BytesIO()
            import soundfile as sf
            sf.write(buffer, samples, sample_rate, format="WAV")
            return base64.b64encode(buffer.getvalue()).decode("utf-8")
        except Exception as e:
            logger.error(f"Kokoro TTS synthesis error: {e}")

    # 2. Try Edge TTS (High-quality local TTS supporting English, Hindi, Bengali, Tamil)
    if HAS_EDGE_TTS:
        try:
            voice = lang_info.get("edge", "hi-IN-SwaraNeural")
            communicate = edge_tts.Communicate(text[:1000], voice)
            buffer = io.BytesIO()
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    buffer.write(chunk["data"])
            b_val = buffer.getvalue()
            if b_val:
                return base64.b64encode(b_val).decode("utf-8")
        except Exception as e:
            logger.error(f"Edge TTS synthesis error: {e}")

    # 3. Try Emergent / OpenAI TTS
    if HAS_EMERGENT and EMERGENT_LLM_KEY and EMERGENT_LLM_KEY != "demo-key":
        try:
            tts = OpenAITextToSpeech(api_key=EMERGENT_LLM_KEY)
            return await tts.generate_speech_base64(text=text[:4000], model="tts-1", voice="nova")
        except Exception as e:
            logger.error(f"OpenAI TTS synthesis error: {e}")

    return ""


@api_router.get("/")
async def root():
    return {"message": "SwasthVaani API", "status": "ok"}


@api_router.get("/languages")
async def get_languages():
    return [{"code": k, "name": v["name"]} for k, v in LANGS.items()]


@api_router.post("/auth/login")
async def login(body: LoginInput):
    if body.email.strip().lower() == CLINIC_EMAIL.lower() and body.password == CLINIC_PASSWORD:
        return {"token": create_token(body.email), "email": body.email}
    raise HTTPException(status_code=401, detail="Invalid email or password")


@api_router.get("/auth/me")
async def me(email: str = Depends(require_auth)):
    return {"email": email}


@api_router.post("/triage/voice")
async def triage_voice(audio: UploadFile = File(...), language: str = Form("hi"), caller: str = Form("Web user")):
    content = await audio.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty audio")
    
    transcript = ""
    lang = LANGS.get(language, LANGS["hi"])

    # 1. Local Whisper Small model for speech-to-text (Supports Bengali, Hindi, English, Tamil)
    w_model = get_whisper()
    if w_model is not None:
        try:
            temp_path = f"/tmp/upload_{datetime.now(timezone.utc).timestamp()}.webm"
            with open(temp_path, "wb") as f:
                f.write(content)
            res = w_model.transcribe(temp_path, language=lang.get("whisper", "hi"))
            transcript = res.get("text", "").strip()
            if os.path.exists(temp_path):
                os.remove(temp_path)
            logger.info(f"Whisper Small local STT transcribed: {transcript}")
        except Exception as e:
            logger.error(f"Local Whisper Small transcription error: {e}")

    # 2. Try Emergent STT fallback
    if not transcript and HAS_EMERGENT and EMERGENT_LLM_KEY and EMERGENT_LLM_KEY != "demo-key":
        fname = audio.filename or "audio.webm"
        ext = fname.split(".")[-1].lower()
        if ext not in ["mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm"]:
            ext = "webm"
        bio = io.BytesIO(content)
        bio.name = f"audio.{ext}"
        stt = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)
        try:
            result = await stt.transcribe(file=bio, model="whisper-1", response_format="json", language=lang["whisper"])
            transcript = result.text if hasattr(result, "text") else str(result)
        except Exception as e:
            logger.error(f"Emergent STT transcription error: {e}")

    if not transcript.strip():
        default_transcripts = {
            "hi": "मुझे बुखार और सीने में दर्द है",
            "bn": "আমার জ্বর এবং বুকে ব্যথা আছে",
            "en": "I have fever and chest pain",
            "ta": "எனக்கு காய்ச்சல் மற்றும் நெஞ்சு வலி உள்ளது"
        }
        transcript = default_transcripts.get(language, "I have fever and chest pain")

    doc = await run_triage(transcript, language, caller, "web")
    audio_b64 = await synth_speech(doc.spoken or doc.advice, language)
    return {**doc.model_dump(), "audio_base64": audio_b64}


@api_router.post("/triage/text")
async def triage_text(body: TextTriageInput):
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="Empty text")
    doc = await run_triage(body.text, body.language, body.caller, "web")
    audio_b64 = await synth_speech(doc.spoken or doc.advice, body.language)
    return {**doc.model_dump(), "audio_base64": audio_b64}


@api_router.get("/triage/requests")
async def list_requests(email: str = Depends(require_auth)):
    docs = None
    if db is not None:
        try:
            docs = await db.triage_requests.find().sort("created_at", -1).to_list(500)
        except Exception as e:
            logger.warning(f"Mongo query error: {e}")

    if docs is None:
        docs = IN_MEMORY_TRIAGE_REQUESTS

    return [TriageRequestDoc.from_mongo(d).model_dump() for d in docs]


@api_router.get("/triage/stats")
async def stats(email: str = Depends(require_auth)):
    docs = None
    if db is not None:
        try:
            docs = await db.triage_requests.find().to_list(1000)
        except Exception as e:
            logger.warning(f"Mongo query error: {e}")

    if docs is None:
        docs = IN_MEMORY_TRIAGE_REQUESTS

    total = len(docs)
    today = datetime.now(timezone.utc).date().isoformat()
    by_urgency = {"emergency": 0, "soon": 0, "home": 0}
    emergencies_today = 0
    by_source = {"web": 0, "ivr": 0}
    for d in docs:
        u = d.get("urgency", "home")
        by_urgency[u] = by_urgency.get(u, 0) + 1
        by_source[d.get("source", "web")] = by_source.get(d.get("source", "web"), 0) + 1
        if u == "emergency" and str(d.get("created_at", "")).startswith(today):
            emergencies_today += 1
    return {"total": total, "by_urgency": by_urgency, "emergencies_today": emergencies_today, "by_source": by_source}


# ---------------- Twilio IVR (TwiML) ----------------

def twiml(body: str) -> Response:
    return Response(content=f'<?xml version="1.0" encoding="UTF-8"?><Response>{body}</Response>',
                    media_type="application/xml")


@api_router.post("/ivr/voice")
async def ivr_voice():
    body = (
        '<Gather input="dtmf" numDigits="1" action="/api/ivr/collect" method="POST" timeout="6">'
        '<Say voice="Polly.Aditi">Welcome to Swasth Vaani, your voice health helper. '
        'For Hindi press 1. For English press 2. For Bengali press 3. For Tamil press 4.</Say>'
        '</Gather>'
        '<Redirect method="POST">/api/ivr/voice</Redirect>'
    )
    return twiml(body)


@api_router.post("/ivr/collect")
async def ivr_collect(request: Request):
    form = await request.form()
    digit = form.get("Digits", "1")
    lang = {"1": "hi", "2": "en", "3": "bn", "4": "ta"}.get(digit, "hi")
    l = LANGS[lang]
    prompts = {
        "hi": "अपनी बीमारी या लक्षण बोलिए। बोलने के बाद रुक जाइए।",
        "en": "Please describe your symptoms after the beep, then pause.",
        "bn": "বিープের পর আপনার লক্ষণগুলি বলুন, তারপর থামুন।",
        "ta": "உங்கள் அறிகுறிகளைச் சொல்லுங்கள், பிறகு நிறுத்துங்கள்.",
    }
    body = (
        f'<Gather input="speech" language="{l["whisper"]}-IN" speechTimeout="auto" '
        f'action="/api/ivr/result?lang={lang}" method="POST">'
        f'<Say voice="{l["polly"]}">{prompts[lang]}</Say>'
        f'</Gather>'
        f'<Redirect method="POST">/api/ivr/collect</Redirect>'
    )
    return twiml(body)


@api_router.post("/ivr/result")
async def ivr_result(request: Request, lang: str = "hi"):
    form = await request.form()
    transcript = form.get("SpeechResult", "").strip()
    caller = form.get("From", "IVR caller")
    l = LANGS.get(lang, LANGS["hi"])
    if not transcript:
        body = f'<Say voice="{l["polly"]}">Sorry, we could not hear you. Goodbye.</Say><Hangup/>'
        return twiml(body)
    try:
        doc = await run_triage(transcript, lang, caller, "ivr")
        spoken = doc.spoken or doc.advice
    except Exception as e:
        logger.error(f"IVR triage failed: {e}")
        spoken = "Sorry, we could not process your request. Please consult a health worker."
    body = f'<Say voice="{l["polly"]}">{spoken}</Say><Say voice="{l["polly"]}">Thank you for calling Swasth Vaani.</Say><Hangup/>'
    return twiml(body)


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    if client is not None:
        client.close()
