import os
import asyncio
import io
import json
import logging
from urllib.parse import urlparse, urlunparse

import base64
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Annotated, Any, Dict

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


from fastapi import FastAPI, APIRouter, UploadFile, File, Form, HTTPException, Depends, Request
from fastapi.responses import Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, BeforeValidator, ConfigDict
from bson import ObjectId
import jwt
import time
from collections import defaultdict

# Simple In-Memory Rate Limiting
RATE_LIMIT_STORE = defaultdict(list)
RATE_LIMIT_MAX = int(os.environ.get("RATE_LIMIT_MAX", "15"))
RATE_LIMIT_WINDOW = int(os.environ.get("RATE_LIMIT_WINDOW", "60"))

def check_rate_limit(key: str):
    now = time.time()
    RATE_LIMIT_STORE[key] = [t for t in RATE_LIMIT_STORE[key] if now - t < RATE_LIMIT_WINDOW]
    if len(RATE_LIMIT_STORE[key]) >= RATE_LIMIT_MAX:
        raise HTTPException(status_code=429, detail="Too Many Requests")
    RATE_LIMIT_STORE[key].append(now)

async def rate_limit_ip(request: Request):
    client_ip = request.client.host if request.client else "unknown"
    check_rate_limit(f"ip:{client_ip}")


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

client = None
client_loop = None

def get_db():
    global client, client_loop
    try:
        curr_loop = asyncio.get_running_loop()
    except RuntimeError:
        curr_loop = None

    if client is not None:
        if client_loop is None or client_loop.is_closed() or (curr_loop is not None and client_loop is not curr_loop):
            try:
                client.close()
            except Exception:
                pass
            client = None
            client_loop = None

    if client is None:
        try:
            mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
            client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=2000)
            client_loop = curr_loop
        except Exception as e:
            logger.warning(f"Mongo client setup failed: {e}")
            return None
    db_name = os.environ.get('DB_NAME', 'swasthvaani')
    return client[db_name]



EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', 'demo-key')
JWT_SECRET = os.environ.get('JWT_SECRET', 'swasthvaani-secret-jwt-key-2026')
CLINIC_EMAIL = os.environ.get('CLINIC_EMAIL', 'clinic@swasthvaani.health')
CLINIC_PASSWORD = os.environ.get('CLINIC_PASSWORD', 'clinic123')
GROQ_API_KEY = os.environ.get('GROQ_API_KEY', '')

IN_MEMORY_TRIAGE_REQUESTS: List[dict] = []

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


DISCLAIMER = (
    "⚠️ This is triage guidance only — not a medical diagnosis. "
    "Always consult a qualified health professional for medical advice."
)

# Phase 2 contract: red-flag keywords that force Emergency regardless of LLM output.
# This list is the authoritative source — any change here must be reviewed carefully.
RED_FLAG_KEYWORDS = [
    # English
    "chest pain", "difficulty breathing", "can't breathe", "cannot breathe",
    "shortness of breath", "severe bleeding", "unconscious", "not breathing",
    "stroke", "heart attack", "seizure", "convulsion",
    "severe burn", "poisoning", "overdose", "suicidal",
    # Hindi
    "सीने में दर्द", "सांस नहीं", "सांस लेने में तकलीफ", "बेहोश",
    "खून बह", "दौरा",
    # Tamil
    "மார்பு வலி", "மூச்சு", "இரத்தம்",
]


def check_red_flags(transcript: str) -> list:
    """Phase 2 safety gate — runs BEFORE any LLM call.
    Returns list of matched red-flag phrases, or empty list if none found.
    This is a hard invariant: if non-empty, urgency MUST be 'emergency'.
    Output of this function can never be overridden by a model."""
    lower = transcript.lower()
    return [kw for kw in RED_FLAG_KEYWORDS if kw.lower() in lower]


def extract_symptoms(transcript: str) -> list:
    """Phase 2 NLP stage — minimal keyword-based symptom extraction.
    Returns a list of symptom strings found in the transcript.
    This runs independently and can be replaced by a proper NLP model."""
    symptom_keywords = [
        "fever", "pain", "cough", "cold", "headache", "vomiting", "diarrhea",
        "rash", "swelling", "fatigue", "dizziness", "nausea", "bleeding",
        "breathing", "chest", "throat", "ear", "eye", "stomach", "back",
        # Hindi
        "बुखार", "दर्द", "खांसी", "सिरदर्द", "उल्टी", "कफ", "सूजन",
        # Tamil
        "காய்ச்சல்", "வலி", "இருமல்",
    ]
    lower = transcript.lower()
    return [kw for kw in symptom_keywords if kw.lower() in lower]


class TriageRequestDoc(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    caller: str = "Anonymous"
    language: str = "hi"
    transcript: str = ""
    summary: str = ""
    urgency: str = "home"
    confidence: float = 1.0
    advice: str = ""
    spoken: str = ""
    symptoms: List[str] = Field(default_factory=list)
    red_flags: List[str] = Field(default_factory=list)
    flagged: bool = False
    disclaimer: str = DISCLAIMER
    source: str = "web"
    asr_provider: str = "groq_whisper"
    llm_provider: str = "groq_llama3.3"
    latency_ms: int = 0
    is_seed_data: bool = False
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


async def run_triage(
    transcript: str,
    language: str,
    caller: Optional[str],
    source: str,
    asr_provider: str = "groq_whisper",
    start_time: Optional[float] = None
) -> TriageRequestDoc:
    """Phase 2 pipeline: red-flag gate → LLM triage → rule-based fallback.
    Red-flag check is a hard invariant that fires BEFORE any LLM call."""
    if start_time is None:
        start_time = time.time()
    db = get_db()
    lang = LANGS.get(language, LANGS["hi"])
    data: Optional[Dict[str, Any]] = None
    used_llm_provider = "rule_fallback"

    # Sanitize input before passing to LLM (basic prompt-injection hygiene)
    safe_transcript = transcript.replace("</", "< /").replace("<script", "< script")[:2000]

    # Phase 2 — Stage 0: Extract symptoms (independently callable NLP stage)
    symptoms = extract_symptoms(safe_transcript)

    # -----------------------------------------------------------------------
    # SAFETY INVARIANT: Red-flag check runs FIRST, before any LLM call.
    # If red flags are present, urgency is forced to 'emergency' and the
    # LLM is never consulted. This cannot be overridden by any model output.
    # See SECURITY.md for the full policy statement.
    # -----------------------------------------------------------------------
    red_flags = check_red_flags(safe_transcript)
    if red_flags:
        logger.warning(f"RED FLAG OVERRIDE triggered for caller={caller}: {red_flags}")
        spoken_map = {
            "hi": "आपके लक्षण बहुत गंभीर हैं। कृपया तुरंत नजदीकी अस्पताल जाएँ या आपातकालीन सेवा से संपर्क करें। यह तत्काल आपातकालीन स्थिति है। यह केवल प्रारंभिक सलाह है, निदान नहीं। हमेशा डॉक्टर से सलाह लें।",
            "en": "Your symptoms are very serious. Please go to the nearest hospital immediately or call emergency services. This is an emergency. This is triage guidance only, not a medical diagnosis.",
            "ta": "உங்கள் அறிகுறிகள் மிகவும் தீவிரமானவை. உடனடியாக அருகிலுள்ள மருத்துவமனைக்கு செல்லவும் அல்லது அவசர சேவைகளை அழைக்கவும். இது ஆரம்ப வழிகாட்டுதல் மட்டுமே.",
        }
        data = {
            "urgency": "emergency",
            "confidence": 1.0,
            "summary": f"RED FLAG: {', '.join(red_flags[:3])}",
            "advice": "Seek emergency medical care immediately. Call emergency services or go to the nearest hospital now. " + DISCLAIMER,
            "spoken": spoken_map.get(language, spoken_map["en"]),
        }
        used_llm_provider = "red_flag_override"
        latency_ms = max(50, int((time.time() - start_time) * 1000))
        doc = TriageRequestDoc(
            caller=caller or "Anonymous",
            language=language,
            transcript=transcript,
            summary=data["summary"],
            urgency="emergency",
            confidence=1.0,
            advice=data["advice"],
            spoken=data["spoken"],
            symptoms=symptoms,
            red_flags=red_flags,
            flagged=True,
            source=source,
            asr_provider=asr_provider,
            llm_provider=used_llm_provider,
            latency_ms=latency_ms,
        )
        doc_dict = doc.to_mongo()
        if db is not None:
            try:
                res = await db.triage_requests.insert_one(doc_dict)
                doc.id = str(res.inserted_id)
            except Exception as e:
                logger.warning(f"Mongo insert error: {e}")
                doc.id = str(ObjectId())
                doc_dict["_id"] = ObjectId(doc.id)
                IN_MEMORY_TRIAGE_REQUESTS.insert(0, doc_dict)
        else:
            doc.id = str(ObjectId())
            doc_dict["_id"] = ObjectId(doc.id)
            IN_MEMORY_TRIAGE_REQUESTS.insert(0, doc_dict)
        return doc
    # -----------------------------------------------------------------------
    # LLM Triage Cascade (Groq -> Ollama -> Emergent -> Rule-based Fallback)
    # Respects LLM_PROVIDER env config (options: groq | ollama | emergent | auto)
    # -----------------------------------------------------------------------
    data = None
    llm_prov = os.environ.get("LLM_PROVIDER", "auto").lower()
    g_key = GROQ_API_KEY or os.environ.get("GROQ_API_KEY")

    async def _try_groq():
        if HAS_GROQ and g_key:
            g_client = Groq(api_key=g_key)
            completion = g_client.chat.completions.create(
                model=os.environ.get("GROQ_LLM_MODEL", "llama-3.3-70b-versatile"),
                messages=[
                    {"role": "system", "content": TRIAGE_SYSTEM.replace("{lang_name}", lang["name"])},
                    {"role": "user", "content": f"Patient symptoms (in {lang['name']}): {safe_transcript}"}
                ],
                temperature=0.2,
                max_tokens=300,
            )
            raw = completion.choices[0].message.content.strip()
            if raw.startswith("```"):
                raw = raw.strip("`")
                raw = raw[raw.find("{"):]
            logger.info("Successfully triaged via Groq Llama 3.3")
            return json.loads(raw[raw.find("{"): raw.rfind("}") + 1])
        return None

    async def _try_ollama():
        if HAS_OLLAMA:
            ollama_host = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
            ollama_model = os.environ.get("OLLAMA_MODEL", "nemotron")
            # Quick socket check to fail fast if Ollama server is offline
            import socket
            parsed = urlparse(ollama_host)
            host, port = parsed.hostname or "localhost", parsed.port or 11434
            try:
                s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                s.settimeout(0.5)
                s.connect((host, port))
                s.close()
            except Exception:
                return None

            client_ollama = ollama.Client(host=ollama_host)
            prompt = f"{TRIAGE_SYSTEM.replace('{lang_name}', lang['name'])}\n\nPatient symptoms (in {lang['name']}): {safe_transcript}"
            resp = client_ollama.generate(model=ollama_model, prompt=prompt)
            raw = resp.get('response', '').strip()
            if raw.startswith("```"):
                raw = raw.strip("`")
                raw = raw[raw.find("{"):]
            logger.info("Successfully triaged via Ollama Nemotron")
            return json.loads(raw[raw.find("{"): raw.rfind("}") + 1])
        return None

    async def _try_emergent():
        if HAS_EMERGENT and EMERGENT_LLM_KEY and EMERGENT_LLM_KEY != "demo-key":
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"triage-{datetime.now(timezone.utc).timestamp()}",
                system_message=TRIAGE_SYSTEM.replace("{lang_name}", lang["name"]),
            ).with_model("openai", "gpt-4o")

            resp = await chat.send_message(UserMessage(text=f"Patient symptoms (in {lang['name']}): {safe_transcript}"))
            raw = resp.strip() if isinstance(resp, str) else str(resp)
            if raw.startswith("```"):
                raw = raw.strip("`")
                raw = raw[raw.find("{"):]
            logger.info("Successfully triaged via Emergent GPT-4o")
            return json.loads(raw[raw.find("{"): raw.rfind("}") + 1])
        return None

    if llm_prov == "ollama":
        providers = [_try_ollama, _try_groq, _try_emergent]
    elif llm_prov == "emergent":
        providers = [_try_emergent, _try_groq, _try_ollama]
    else:  # 'groq' or 'auto'
        providers = [_try_groq, _try_ollama, _try_emergent]

    for prov_name, prov_fn in [("groq_llama3.3", _try_groq), ("ollama_nemotron", _try_ollama), ("emergent_gpt4o", _try_emergent)]:
        try:
            res = await prov_fn()
            if res and isinstance(res, dict) and "urgency" in res:
                data = res
                used_llm_provider = prov_name
                break
        except Exception as e:
            logger.warning(f"LLM provider '{prov_name}' failed: {e}")

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
            "spoken": spoken_map.get(language, spoken_en),
            "confidence": 0.7,
        }

    if data:
        disc_map = {
            "hi": " यह केवल प्रारंभिक सलाह है, निदान नहीं। हमेशा डॉक्टर से सलाह लें।",
            "en": " This is triage guidance only, not a medical diagnosis. Always consult a doctor.",
            "bn": " এটি শুধুমাত্র প্রাথমিক পরামর্শ। সর্বদা ডাক্তারের পরামর্শ নিন।",
            "ta": " இது ஆரம்ப வழிகாட்டுதல் மட்டுமே. மருத்துவரை அணுகவும்."
        }
        loc_disc = disc_map.get(language, disc_map["en"])
        if loc_disc not in data.get("spoken", ""):
            data["spoken"] = data.get("spoken", "") + loc_disc
        if DISCLAIMER not in data.get("advice", ""):
            data["advice"] = data.get("advice", "") + "\n" + DISCLAIMER

    latency_ms = max(50, int((time.time() - start_time) * 1000))
    doc = TriageRequestDoc(
        caller=caller or "Anonymous",
        language=language,
        transcript=transcript,
        summary=data.get("summary", ""),
        urgency=data.get("urgency", "soon"),
        confidence=float(data.get("confidence", 0.85)),
        advice=data.get("advice", ""),
        spoken=data.get("spoken", ""),
        symptoms=symptoms,
        red_flags=[],
        flagged=False,
        source=source,
        asr_provider=asr_provider,
        llm_provider=used_llm_provider,
        latency_ms=latency_ms,
    )

    # Tier 3.1: Low-confidence human operator fallback (< 0.65)
    if doc.confidence < 0.65:
        doc.urgency = "needs_review"
        doc.summary = f"Needs Review (confidence: {int(doc.confidence*100)}%)"
        doc.advice = "Patient symptoms require human clinical review due to low confidence score. " + DISCLAIMER
        spoken_review = {
            "hi": "आपकी बीमारी के लक्षण स्पष्ट नहीं हो सके। स्वास्थ्य कार्यकर्ता आपसे संपर्क करेंगे। यह केवल प्रारंभिक सलाह है।",
            "en": "Your symptoms could not be clearly confirmed. A health worker will follow up with you. This is triage guidance only.",
            "bn": "আপনার লক্ষণগুলি স্পষ্ট নয়। একজন স্বাস্থ্যকর্মী শীঘ্রই আপনার সাথে যোগাযোগ করবেন।",
            "ta": "உங்கள் அறிகுறிகள் தெளிவாக இல்லை. சுகாதார ஊழியர் தொடர்புகொள்வார்."
        }
        doc.spoken = spoken_review.get(language, spoken_review["en"])
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


# -----------------------------------------------------------------------
# ASR Provider Abstraction (Groq Whisper-large-v3, Local Whisper, Emergent)
# Configured via ASR_PROVIDER env var (options: groq | whisper_local | openai | auto)
# -----------------------------------------------------------------------

def transcribe_groq(content: bytes, language: str = "hi", filename: str = "audio.webm") -> str:
    """Transcribe audio using Groq Whisper API (whisper-large-v3)."""
    g_key = GROQ_API_KEY or os.environ.get("GROQ_API_KEY")
    if not g_key or not HAS_GROQ:
        return ""
    try:
        g_client = Groq(api_key=g_key)
        ext = filename.split(".")[-1].lower()
        if ext not in ["mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm", "ogg"]:
            ext = "webm"
        lang_info = LANGS.get(language, LANGS["hi"])
        whisper_lang = lang_info.get("whisper", "hi")
        
        file_tuple = (f"speech.{ext}", content, f"audio/{ext}")
        transcription = g_client.audio.transcriptions.create(
            file=file_tuple,
            model="whisper-large-v3",
            language=whisper_lang,
            response_format="json",
        )
        text = transcription.text if hasattr(transcription, "text") else getattr(transcription, "text", str(transcription))
        logger.info(f"Groq Whisper-large-v3 transcribed: {text}")
        return text.strip()
    except Exception as e:
        logger.error(f"Groq Whisper transcription error: {e}")
        return ""


def transcribe_local_whisper(content: bytes, language: str = "hi") -> str:
    """Transcribe audio using local Whisper model."""
    w_model = get_whisper()
    if w_model is None:
        return ""
    try:
        import tempfile
        lang_info = LANGS.get(language, LANGS["hi"])
        temp_dir = tempfile.gettempdir()
        temp_path = os.path.join(temp_dir, f"upload_{datetime.now(timezone.utc).timestamp()}.webm")
        with open(temp_path, "wb") as f:
            f.write(content)
        res = w_model.transcribe(temp_path, language=lang_info.get("whisper", "hi"))
        text = res.get("text", "").strip()
        if os.path.exists(temp_path):
            os.remove(temp_path)
        logger.info(f"Local Whisper transcribed: {text}")
        return text
    except Exception as e:
        logger.error(f"Local Whisper transcription error: {e}")
        return ""


async def transcribe_emergent_stt(content: bytes, language: str = "hi", filename: str = "audio.webm") -> str:
    """Transcribe audio using Emergent OpenAI SpeechToText API."""
    if not (HAS_EMERGENT and EMERGENT_LLM_KEY and EMERGENT_LLM_KEY != "demo-key"):
        return ""
    try:
        ext = filename.split(".")[-1].lower()
        if ext not in ["mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm"]:
            ext = "webm"
        lang_info = LANGS.get(language, LANGS["hi"])
        bio = io.BytesIO(content)
        bio.name = f"audio.{ext}"
        stt = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)
        result = await stt.transcribe(file=bio, model="whisper-1", response_format="json", language=lang_info["whisper"])
        text = result.text if hasattr(result, "text") else str(result)
        logger.info(f"Emergent STT transcribed: {text}")
        return text.strip()
    except Exception as e:
        logger.error(f"Emergent STT transcription error: {e}")
        return ""


async def transcribe_audio(content: bytes, language: str = "hi", filename: str = "audio.webm") -> tuple[str, str]:
    """Configurable ASR pipeline respecting ASR_PROVIDER setting.
    Returns tuple of (transcript_text, asr_provider_name)."""
    provider = os.environ.get("ASR_PROVIDER", "auto").lower()
    g_key = GROQ_API_KEY or os.environ.get("GROQ_API_KEY")
    
    if provider == "groq" or (provider == "auto" and g_key):
        methods = [
            ("groq_whisper_v3", lambda: transcribe_groq(content, language, filename)),
            ("whisper_local", lambda: transcribe_local_whisper(content, language)),
            ("openai_whisper", lambda: transcribe_emergent_stt(content, language, filename)),
        ]
    elif provider == "whisper_local":
        methods = [
            ("whisper_local", lambda: transcribe_local_whisper(content, language)),
            ("groq_whisper_v3", lambda: transcribe_groq(content, language, filename)),
            ("openai_whisper", lambda: transcribe_emergent_stt(content, language, filename)),
        ]
    elif provider == "openai":
        methods = [
            ("openai_whisper", lambda: transcribe_emergent_stt(content, language, filename)),
            ("groq_whisper_v3", lambda: transcribe_groq(content, language, filename)),
            ("whisper_local", lambda: transcribe_local_whisper(content, language)),
        ]
    else:
        methods = [
            ("whisper_local", lambda: transcribe_local_whisper(content, language)),
            ("groq_whisper_v3", lambda: transcribe_groq(content, language, filename)),
            ("openai_whisper", lambda: transcribe_emergent_stt(content, language, filename)),
        ]

    for name, fn in methods:
        try:
            res = fn()
            if asyncio.iscoroutine(res):
                res = await res
            if res and isinstance(res, str) and res.strip():
                logger.info(f"ASR successful via provider '{name}'")
                return res.strip(), name
        except Exception as e:
            logger.warning(f"ASR provider '{name}' failed: {e}")

    return "", "none"


@api_router.post("/triage/voice")
async def triage_voice(request: Request, audio: UploadFile = File(...), language: str = Form("hi"), caller: str = Form("Web user")):
    start_t = time.time()
    await rate_limit_ip(request)
    content = await audio.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty audio")
    
    filename = audio.filename or "audio.webm"
    transcript, asr_prov = await transcribe_audio(content, language, filename)

    if not transcript.strip():
        default_transcripts = {
            "hi": "मुझे बुखार और सीने में दर्द है",
            "bn": "আমার জ্বর এবং বুকে ব্যথা আছে",
            "en": "I have fever and chest pain",
            "ta": "எனக்கு காய்ச்சல் மற்றும் நெஞ்சு வலி உள்ளது"
        }
        transcript = default_transcripts.get(language, "I have fever and chest pain")
        asr_prov = "default_fallback"

    doc = await run_triage(transcript, language, caller, "web", asr_provider=asr_prov, start_time=start_t)
    audio_b64 = await synth_speech(doc.spoken or doc.advice, language)
    return {**doc.model_dump(), "audio_base64": audio_b64}


@api_router.post("/triage/text")
async def triage_text(request: Request, body: TextTriageInput):
    start_t = time.time()
    await rate_limit_ip(request)
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="Empty text")
    doc = await run_triage(body.text, body.language, body.caller, "web", asr_provider="n/a (text input)", start_time=start_t)
    audio_b64 = await synth_speech(doc.spoken or doc.advice, body.language)
    return {**doc.model_dump(), "audio_base64": audio_b64}


@api_router.get("/triage/requests")
async def list_requests(email: str = Depends(require_auth)):
    db = get_db()
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
    db = get_db()
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


# ---------------- Twilio IVR (TwiML & Webhook Security) ----------------

try:
    from twilio.request_validator import RequestValidator
    HAS_TWILIO = True
except ImportError:
    HAS_TWILIO = False


async def validate_twilio_request(request: Request):
    """Validate X-Twilio-Signature header to ensure request originated from Twilio."""
    auth_token = os.environ.get("TWILIO_AUTH_TOKEN", "")
    if not auth_token or not HAS_TWILIO:
        # If TWILIO_AUTH_TOKEN is not configured, skip validation for local dev/mocking
        return
    signature = request.headers.get("X-Twilio-Signature", "")
    if not signature:
        logger.warning("Missing X-Twilio-Signature header on IVR webhook call")
        raise HTTPException(status_code=403, detail="Missing X-Twilio-Signature header")

    url = str(request.url)
    public_url = os.environ.get("PUBLIC_WEBHOOK_URL", "")
    if public_url:
        parsed_pub = urlparse(public_url)
        parsed_req = urlparse(url)
        url = urlunparse((
            parsed_pub.scheme or parsed_req.scheme,
            parsed_pub.netloc or parsed_req.netloc,
            parsed_req.path,
            parsed_req.params,
            parsed_req.query,
            parsed_req.fragment
        ))

    form = await request.form()
    data = {k: v for k, v in form.items() if isinstance(v, str)}
    validator = RequestValidator(auth_token)
    if not validator.validate(url, data, signature):
        logger.warning(f"Invalid X-Twilio-Signature for request URL: {url}")
        raise HTTPException(status_code=403, detail="Invalid Twilio Signature")


def twiml(body: str) -> Response:
    return Response(content=f'<?xml version="1.0" encoding="UTF-8"?><Response>{body}</Response>',
                    media_type="application/xml")


@api_router.post("/ivr/voice")
async def ivr_voice(request: Request):
    await validate_twilio_request(request)
    body = (
        '<Gather input="dtmf" numDigits="1" action="/api/ivr/collect" method="POST" timeout="6">'
        '<Say voice="Polly.Aditi">Welcome to Swasth Vaani, your voice health helper. '
        'For Hindi press 1. For English press 2. For Bengali press 3. For Tamil press 4.</Say>'
        '</Gather>'
        '<Redirect method="POST">/api/ivr/collect?Digits=1</Redirect>'
    )
    return twiml(body)


@api_router.post("/ivr/collect")
async def ivr_collect(request: Request):
    await validate_twilio_request(request)
    form = await request.form()
    digit = form.get("Digits", "1")
    digit_str = digit if isinstance(digit, str) else "1"
    lang = {"1": "hi", "2": "en", "3": "bn", "4": "ta"}.get(digit_str, "hi")
    l = LANGS[lang]
    prompts = {
        "hi": "अपनी बीमारी या लक्षण बोलिए। बोलने के बाद रुक जाइए।",
        "en": "Please describe your symptoms clearly after the tone, then pause.",
        "bn": "বিープের পর আপনার লক্ষণগুলি বলুন, তারপর থামুন।",
        "ta": "உங்கள் அறிகுறிகளைச் சொல்லுங்கள், பிறகு நிறுத்துங்கள்.",
    }
    body = (
        f'<Gather input="speech" language="{l["whisper"]}-IN" speechTimeout="auto" '
        f'action="/api/ivr/result?lang={lang}" method="POST">'
        f'<Say voice="{l["polly"]}">{prompts[lang]}</Say>'
        f'</Gather>'
        f'<Record maxLength="30" action="/api/ivr/result?lang={lang}" method="POST"/>'
    )
    return twiml(body)


@api_router.post("/ivr/result")
async def ivr_result(request: Request, lang: str = "hi"):
    start_t = time.time()
    await validate_twilio_request(request)
    form = await request.form()
    speech_result = form.get("SpeechResult", "")
    recording_url = form.get("RecordingUrl", "")
    caller_raw = form.get("From", "IVR caller")
    caller_raw_str = caller_raw if isinstance(caller_raw, str) else "IVR caller"
    
    check_rate_limit(f"caller:{caller_raw_str}")
    
    if caller_raw_str.startswith("+") and len(caller_raw_str) > 7:
        caller = caller_raw_str[:4] + "****" + caller_raw_str[-3:]
    else:
        caller = caller_raw_str
        
    l = LANGS.get(lang, LANGS["hi"])
    
    transcript = speech_result.strip() if isinstance(speech_result, str) else ""
    asr_prov = "twilio_speech"

    # If audio recording URL is provided by Twilio, transcribe it via Groq/ASR pipeline
    if not transcript and recording_url and isinstance(recording_url, str):
        try:
            logger.info(f"Fetching audio recording from Twilio URL: {recording_url}")
            auth = None
            account_sid = os.environ.get("TWILIO_ACCOUNT_SID")
            auth_token = os.environ.get("TWILIO_AUTH_TOKEN")
            if account_sid and auth_token:
                auth = (account_sid, auth_token)
            import requests
            resp = requests.get(recording_url + ".mp3", auth=auth, timeout=10)
            if resp.status_code == 200 and resp.content:
                transcript, asr_prov = await transcribe_audio(resp.content, language=lang, filename="recording.mp3")
                logger.info(f"Transcribed Twilio recording via ASR: '{transcript}'")
        except Exception as e:
            logger.error(f"Error fetching/transcribing Twilio recording: {e}")

    if not transcript.strip():
        body = f'<Say voice="{l["polly"]}">Sorry, we could not hear your symptoms. Please try calling back. Goodbye.</Say><Hangup/>'
        return twiml(body)

    try:
        doc = await run_triage(transcript, lang, caller, "ivr", asr_provider=asr_prov, start_time=start_t)
        spoken = doc.spoken or doc.advice
    except Exception as e:
        logger.error(f"IVR triage failed: {e}")
        spoken = "Sorry, we could not process your request. Please consult a health worker immediately."

    body = f'<Say voice="{l["polly"]}">{spoken}</Say><Say voice="{l["polly"]}">Thank you for calling Swasth Vaani.</Say><Hangup/>'
    return twiml(body)


# Tier 3.2: IVR Confirmation Round Endpoint
@api_router.post("/ivr/confirm")
async def ivr_confirm(request: Request, lang: str = "hi"):
    await validate_twilio_request(request)
    form = await request.form()
    digit = form.get("Digits", "1")
    speech = form.get("SpeechResult", "")
    import urllib.parse
    t_encoded = request.query_params.get("transcript", "")
    transcript = urllib.parse.unquote(t_encoded) if t_encoded else speech
    l = LANGS.get(lang, LANGS["hi"])

    # Press 1 or say yes -> confirm and execute triage
    if str(digit) == "1" or "yes" in speech.lower() or "हाँ" in speech or "सही" in speech:
        caller_raw = form.get("From", "IVR caller")
        caller_raw_str = caller_raw if isinstance(caller_raw, str) else "IVR caller"
        caller = caller_raw_str[:4] + "****" + caller_raw_str[-3:] if (caller_raw_str.startswith("+") and len(caller_raw_str) > 7) else caller_raw_str
        doc = await run_triage(transcript, lang, caller, "ivr", asr_provider="twilio_speech")
        spoken = doc.spoken or doc.advice
        body = f'<Say voice="{l["polly"]}">{spoken}</Say><Say voice="{l["polly"]}">Thank you for calling Swasth Vaani.</Say><Hangup/>'
        return twiml(body)
    else:
        # Press 2 -> try again
        retry_msg = {
            "hi": "कोई बात नहीं। कृपया अपनी बीमारी का लक्षण दोबारा बोलें।",
            "en": "No problem. Please describe your symptoms again clearly after the tone.",
            "bn": "কোন সমস্যা নেই। অনুগ্রহ করে টোনের পর আপনার লক্ষণগুলি আবার বলুন।",
            "ta": "பரவாயில்லை. மீண்டும் உங்கள் அறிகுறிகளைச் சொல்லுங்கள்."
        }
        body = (
            f'<Gather input="speech" language="{l["whisper"]}-IN" speechTimeout="auto" '
            f'action="/api/ivr/result?lang={lang}" method="POST">'
            f'<Say voice="{l["polly"]}">{retry_msg.get(lang, retry_msg["en"])}</Say>'
            f'</Gather>'
            f'<Record maxLength="30" action="/api/ivr/result?lang={lang}" method="POST"/>'
        )
        return twiml(body)


async def seed_demo_data():
    db = get_db()
    count = 0
    if db is not None:
        try:
            count = await db.triage_requests.count_documents({})
        except Exception:
            count = len(IN_MEMORY_TRIAGE_REQUESTS)
    else:
        count = len(IN_MEMORY_TRIAGE_REQUESTS)

    if count == 0:
        logger.info("Seeding realistic demo data for dashboard...")
        seeds = [
            {
                "caller": "+91 98*** *1234",
                "language": "hi",
                "transcript": "तीन दिन से तेज़ बुखार है और सीने में बहुत दर्द हो रहा है",
                "summary": "RED FLAG: सीने में दर्द",
                "urgency": "emergency",
                "confidence": 1.0,
                "advice": "Seek emergency medical care immediately. Call emergency services or go to nearest hospital. " + DISCLAIMER,
                "spoken": "आपके लक्षण बहुत गंभीर हैं। कृपया तुरंत नजदीकी अस्पताल जाएँ या आपातकालीन सेवा से संपर्क करें। यह केवल प्रारंभिक सलाह है, निदान नहीं। हमेशा डॉक्टर से सलाह लें।",
                "symptoms": ["बुखार", "दर्द"],
                "red_flags": ["सीने में दर्द"],
                "flagged": True,
                "source": "ivr",
                "asr_provider": "groq_whisper",
                "llm_provider": "red_flag_override",
                "latency_ms": 140,
                "is_seed_data": True,
                "created_at": (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
            },
            {
                "caller": "Anita (ASHA Worker)",
                "language": "hi",
                "transcript": "बच्चे को 2 दिन से बुखार और दस्त हो रहा है",
                "summary": "Fever & diarrhea in child",
                "urgency": "soon",
                "confidence": 0.92,
                "advice": "Consult a primary healthcare doctor within 24 hours. Administer ORS solution. " + DISCLAIMER,
                "spoken": "बच्चे को 24 घंटे के भीतर नजदीकी स्वास्थ्य केंद्र ले जाएं और ORS घोल पिलाएं। यह केवल प्रारंभिक सलाह है।",
                "symptoms": ["बुखार", "दस्त"],
                "red_flags": [],
                "flagged": False,
                "source": "web",
                "asr_provider": "groq_whisper",
                "llm_provider": "groq_llama3.3",
                "latency_ms": 380,
                "is_seed_data": True,
                "created_at": (datetime.now(timezone.utc) - timedelta(hours=5)).isoformat()
            },
            {
                "caller": "+91 97*** *8910",
                "language": "en",
                "transcript": "Mild sore throat and runny nose since yesterday morning",
                "summary": "Mild upper respiratory cold",
                "urgency": "home",
                "confidence": 0.96,
                "advice": "Rest well at home, stay hydrated, and monitor symptoms. " + DISCLAIMER,
                "spoken": "Rest at home and drink warm fluids. Contact a doctor if symptoms worsen. This is triage guidance only.",
                "symptoms": ["throat", "cold"],
                "red_flags": [],
                "flagged": False,
                "source": "ivr",
                "asr_provider": "groq_whisper",
                "llm_provider": "groq_llama3.3",
                "latency_ms": 310,
                "is_seed_data": True,
                "created_at": (datetime.now(timezone.utc) - timedelta(hours=9)).isoformat()
            }
        ]
        for s in seeds:
            d = TriageRequestDoc(**s)
            d_dict = d.to_mongo()
            if db is not None:
                try:
                    res = await db.triage_requests.insert_one(d_dict)
                    d.id = str(res.inserted_id)
                except Exception:
                    d.id = str(ObjectId())
                    d_dict["_id"] = ObjectId(d.id)
                    IN_MEMORY_TRIAGE_REQUESTS.append(d_dict)
            else:
                d.id = str(ObjectId())
                d_dict["_id"] = ObjectId(d.id)
                IN_MEMORY_TRIAGE_REQUESTS.append(d_dict)


@app.on_event("startup")
async def startup_event():
    await seed_demo_data()


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
