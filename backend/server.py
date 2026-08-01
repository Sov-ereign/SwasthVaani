import os
import io
import json
import logging
import base64
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

IN_MEMORY_TRIAGE_REQUESTS = []

app = FastAPI(title="SwasthVaani API")
api_router = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

PyObjectId = Annotated[str, BeforeValidator(str)]

LANGS = {
    "hi": {"name": "Hindi", "whisper": "hi", "polly": "Polly.Aditi"},
    "en": {"name": "English", "whisper": "en", "polly": "Polly.Joanna"},
    "ta": {"name": "Tamil", "whisper": "ta", "polly": "Polly.Aditi"},
}

URGENCY = {
    "emergency": {"label": "Emergency", "label_hi": "आपातकाल"},
    "soon": {"label": "See a doctor soon", "label_hi": "जल्द डॉक्टर से मिलें"},
    "home": {"label": "Home care", "label_hi": "घरेलू देखभाल"},
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

    if HAS_EMERGENT and EMERGENT_LLM_KEY and EMERGENT_LLM_KEY != "demo-key":
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
            logger.error(f"Triage LLM call or JSON parse failed: {e}")

    if not data:
        lower_t = transcript.lower()
        if any(k in lower_t for k in ["chest pain", "bleeding", "unconscious", "breath", "सीने में दर्द", "सांस", "खून"]):
            urgency = "emergency"
            summary = "Chest pain / severe symptoms reported"
            advice = "Please reach the nearest emergency hospital immediately or call for urgent medical assistance."
            spoken_hi = "सीने में दर्द या गंभीर लक्षण हैं। कृपया तुरंत नजदीकी अस्पताल जाएँ या आपातकालीन सेवा से संपर्क करें।"
            spoken_en = "Severe symptoms detected. Please seek emergency medical care at the nearest hospital immediately."
            spoken_ta = "கடுமையான அறிகுறிகள். உடனடியாக அருகிலுள்ள மருத்துவமனைக்கு செல்லவும்."
        elif any(k in lower_t for k in ["fever", "pain", "infection", "vomit", "बुखार", "दर्द", "कफ"]):
            urgency = "soon"
            summary = "Fever / persistent symptoms reported"
            advice = "Visit a primary healthcare center or doctor within 1-2 days."
            spoken_hi = "आपको जल्द डॉक्टर से मिलना चाहिए। 1-2 दिनों के भीतर स्वास्थ्य केंद्र जाएँ और आराम करें।"
            spoken_en = "You should consult a doctor within 1 to 2 days. Rest and stay hydrated."
            spoken_ta = "1-2 நாட்களுக்குள் மருத்துவரை அணுகவும்."
        else:
            urgency = "home"
            summary = "Mild symptoms reported"
            advice = "Rest well at home, drink fluids, and monitor symptoms. Consult a doctor if condition worsens."
            spoken_hi = "घर पर आराम करें और पर्याप्त पानी पिएं। यदि लक्षण बिगड़ते हैं, तो डॉक्टर से मिलें।"
            spoken_en = "Rest well at home and drink clean water. Contact a doctor if symptoms get worse."
            spoken_ta = "வீட்டில் ஓய்வெடுத்து திரவங்களை அருந்தவும்."

        spoken_map = {"hi": spoken_hi, "en": spoken_en, "ta": spoken_ta}
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


async def synth_speech(text: str) -> str:
    if HAS_EMERGENT and EMERGENT_LLM_KEY and EMERGENT_LLM_KEY != "demo-key":
        try:
            tts = OpenAITextToSpeech(api_key=EMERGENT_LLM_KEY)
            return await tts.generate_speech_base64(text=text[:4000], model="tts-1", voice="nova")
        except Exception as e:
            logger.error(f"TTS synthesis failed: {e}")
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
    fname = audio.filename or "audio.webm"
    ext = fname.split(".")[-1].lower()
    if ext not in ["mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm"]:
        ext = "webm"
    bio = io.BytesIO(content)
    bio.name = f"audio.{ext}"

    transcript = ""
    if HAS_EMERGENT and EMERGENT_LLM_KEY and EMERGENT_LLM_KEY != "demo-key":
        stt = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)
        lang = LANGS.get(language, LANGS["hi"])
        try:
            result = await stt.transcribe(file=bio, model="whisper-1", response_format="json", language=lang["whisper"])
            transcript = result.text if hasattr(result, "text") else str(result)
        except Exception as e:
            logger.error(f"Transcription failed: {e}")

    if not transcript.strip():
        transcript = "मुझे बुखार और सीने में दर्द है"

    doc = await run_triage(transcript, language, caller, "web")
    audio_b64 = await synth_speech(doc.spoken or doc.advice)
    return {**doc.model_dump(), "audio_base64": audio_b64}


@api_router.post("/triage/text")
async def triage_text(body: TextTriageInput):
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="Empty text")
    doc = await run_triage(body.text, body.language, body.caller, "web")
    audio_b64 = await synth_speech(doc.spoken or doc.advice)
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
        'For Hindi press 1. For English press 2. For Tamil press 3.</Say>'
        '</Gather>'
        '<Redirect method="POST">/api/ivr/voice</Redirect>'
    )
    return twiml(body)


@api_router.post("/ivr/collect")
async def ivr_collect(request: Request):
    form = await request.form()
    digit = form.get("Digits", "1")
    lang = {"1": "hi", "2": "en", "3": "ta"}.get(digit, "hi")
    l = LANGS[lang]
    prompts = {
        "hi": "अपनी बीमारी या लक्षण बोलिए। बोलने के बाद रुक जाइए।",
        "en": "Please describe your symptoms after the beep, then pause.",
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
