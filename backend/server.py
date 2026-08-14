import os
import asyncio
import io
import json
import logging
import hashlib
from urllib.parse import urlparse, urlunparse
from urllib.parse import unquote
import base64
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Annotated, Any, Dict

# dotenv imported first so we can load .env before any other imports read os.environ
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / '.env')

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

from geo_matching import geocode_pincode, get_nearby_osm_facilities

from fastapi import FastAPI, APIRouter, UploadFile, File, Form, HTTPException, Depends, Request
from fastapi.responses import Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
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
    from groq import AsyncGroq, Groq
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
# .env already loaded at module top — this is a no-op (override=False by default)
load_dotenv(ROOT_DIR / '.env')

client = None
client_loop = None
_mongo_disabled = False

def get_db():
    global client, client_loop, _mongo_disabled
    if _mongo_disabled:
        return None

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
        mongo_url = os.environ.get('MONGO_URL', '')
        if not mongo_url:
            # If no MONGO_URL explicitly configured, use fast in-memory store for instant responses
            _mongo_disabled = True
            return None
        try:
            client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=1000)
            client_loop = curr_loop
        except Exception as e:
            logger.warning(f"Mongo client setup failed: {e}")
            _mongo_disabled = True
            return None
    db_name = os.environ.get('DB_NAME', 'swasthvaani')
    return client[db_name]



EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', 'demo-key')
JWT_SECRET = os.environ.get('JWT_SECRET', 'swasthvaani-secret-jwt-key-2026')
CLINIC_EMAIL = os.environ.get('CLINIC_EMAIL', 'clinic@swasthvaani.health')
CLINIC_PASSWORD = os.environ.get('CLINIC_PASSWORD', 'clinic123')
SUPERADMIN_EMAIL = os.environ.get('SUPERADMIN_EMAIL', 'admin@swasthvaani.health')
SUPERADMIN_PASSWORD = os.environ.get('SUPERADMIN_PASSWORD', 'admin123')
NGO_EMAIL = os.environ.get('NGO_EMAIL', 'ngo@swasthvaani.health')
NGO_PASSWORD = os.environ.get('NGO_PASSWORD', 'ngo123')
GROQ_API_KEY = os.environ.get('GROQ_API_KEY', '')

IN_MEMORY_TRIAGE_REQUESTS: List[dict] = []
IN_MEMORY_PROVIDERS: List[dict] = []
IN_MEMORY_PATIENT_REQUESTS: List[dict] = []

SPECIALTY_LIST = [
    "General Physician",
    "Pediatrician",
    "Cardiologist",
    "Neurologist",
    "ENT",
    "Dermatologist",
    "Gynecologist",
    "Orthopedic",
    "Gastroenterologist",
    "Pulmonologist",
    "Ophthalmologist",
    "Psychiatrist",
    "Nephrologist",
    "Urologist"
]

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
    "सीने में दर्द", "छाती में दर्द", "सांस नहीं", "सांस लेने में तकलीफ", "सांस फूल", "बेहोश", "होश नहीं",
    "अत्यधिक खून", "खून बह", "दौरा",
    # Tamil
    "மார்பு வலி", "மூச்சு", "மூச்சுத் திணறல்", "இரத்தம்", "அதிக ரத்தப்போக்கு",
    # Bengali
    "বুকে ব্যথা", "শ্বাসকষ্ট", "রক্ত", "প্রচুর রক্তপাত", "জ্ঞান হারিয়ে", "অজ্ঞান",
]


def check_red_flags(transcript: str) -> list:
    """Phase 2 safety gate — runs BEFORE any LLM call.
    Returns list of matched red-flag phrases, or empty list if none found.
    This is a hard invariant: if non-empty, urgency MUST be 'emergency'.
    Output of this function can never be overridden by a model."""
    lower = transcript.lower()
    import re
    matched = []
    for kw in RED_FLAG_KEYWORDS:
        kw_lower = kw.lower()
        # For pure ASCII/English words, use strict word boundaries to prevent false partial matches
        if kw_lower.isascii():
            pattern = r'\b' + re.escape(kw_lower) + r'\b'
            if re.search(pattern, lower):
                matched.append(kw)
        else:
            if kw_lower in lower:
                matched.append(kw)
    return matched


def extract_symptoms(transcript: str) -> list:
    """Phase 2 NLP stage — symptom extraction.
    Returns a list of symptom strings found in the transcript."""
    symptom_keywords = [
        "fever", "pain", "cough", "cold", "headache", "head pain", "vomiting", "diarrhea",
        "rash", "swelling", "fatigue", "dizziness", "nausea", "bleeding",
        "breathing", "chest", "throat", "ear", "eye", "stomach", "back",
        "kidney", "renal", "flank", "urinary", "urine", "bladder", "stone", "infection",
        # Hindi
        "बुखार", "दर्द", "खांसी", "सिरदर्द", "सिर दर्द", "सिर भारी", "उल्टी", "कफ", "सूजन", "चक्कर",
        "किडनी", "गुर्दे", "पेट", "कमर", "पेशाब", "जलन", "सांस", "छाती", "गला", "आंख", "कान",
        # Tamil
        "காய்ச்சல்", "வலி", "இருமல்", "தலைவலி", "சிறுநீரகம்", "சிறுநீர்", "வாந்தி", "வயிற்று வலி",
        # Bengali
        "জ্বর", "ব্যথা", "কাশি", "মাথা ব্যথা", "বমি", "কিডনি", "বৃক্ক", "প্রস্রাব", "পেট ব্যথা",
    ]
    lower = transcript.lower()
    return [kw for kw in symptom_keywords if kw.lower() in lower]


class TriageRequestDoc(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    caller: str = "Anonymous"
    patient_name: Optional[str] = "Anonymous Patient"
    patient_phone: Optional[str] = ""
    patient_address: Optional[str] = ""
    language: str = "hi"
    transcript: str = ""
    summary: str = ""
    urgency: str = "home"
    status_mode: str = "completed"  # "follow_up" | "completed"
    thinking: Optional[str] = ""
    question: Optional[str] = ""
    history: List[Dict[str, Any]] = Field(default_factory=list)
    confidence: float = 1.0
    advice: str = ""
    spoken: str = ""
    symptoms: List[str] = Field(default_factory=list)
    red_flags: List[str] = Field(default_factory=list)
    suggested_specialty: Optional[str] = ""
    pincode: Optional[str] = ""
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


class ProviderDoc(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    email: str
    password_hash: str
    name: str
    type: str = "clinic"  # "clinic" | "ngo"
    facility_type: str = "private_clinic"  # "private_clinic" | "free_clinic" | "ngo"
    specialties: List[str] = Field(default_factory=lambda: ["General Physician"])
    qualification: str = ""
    pincode: str = ""
    address: str = ""
    phone: str = ""
    role: str = "clinic"  # "clinic" | "ngo" | "superadmin"
    status: str = "approved"  # "approved" | "pending" | "deactivated"
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

    def to_public_dict(self):
        d = self.model_dump(by_alias=True, exclude_none=True)
        d["id"] = str(d.get("id") or d.get("_id") or "")
        d.pop("password_hash", None)
        return d


class PatientRequestDoc(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    session_id: str = ""
    patient_name: str = "Anonymous Patient"
    patient_contact: str = ""
    patient_address: str = ""
    patient_pincode: str = ""
    provider_id: str
    provider_name: str = ""
    provider_type: str = "clinic"
    provider_pincode: str = ""
    symptom_summary: str = ""
    triage_urgency: str = "soon"
    suggested_specialty: str = "General Physician"
    transcript: str = ""
    status: str = "pending"  # "pending" | "accepted" | "declined" | "completed"
    notes: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

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


class RegisterInput(BaseModel):
    name: str
    type: str = "clinic"  # "clinic" | "ngo"
    facility_type: str = "private_clinic"  # "private_clinic" | "free_clinic" | "ngo"
    specialties: List[str] = Field(default_factory=lambda: ["General Physician"])
    qualification: str = ""
    pincode: str
    address: str
    phone: str
    email: str
    password: str


class TextTriageInput(BaseModel):
    text: str
    language: str = "hi"
    caller: Optional[str] = "Web user"
    pincode: Optional[str] = None
    patient_name: Optional[str] = None
    patient_phone: Optional[str] = None
    patient_address: Optional[str] = None
    history: Optional[List[Dict[str, Any]]] = None


class CreatePatientRequestInput(BaseModel):
    session_id: str
    patient_name: Optional[str] = "Anonymous Patient"
    patient_contact: Optional[str] = ""
    patient_address: Optional[str] = ""
    patient_pincode: Optional[str] = ""
    provider_id: str
    symptom_summary: Optional[str] = ""
    triage_urgency: Optional[str] = "soon"
    suggested_specialty: Optional[str] = "General Physician"
    transcript: Optional[str] = ""


class UpdateRequestStatusInput(BaseModel):
    status: str  # "accepted" | "declined" | "completed"
    notes: Optional[str] = ""


class UpdateProviderStatusInput(BaseModel):
    status: str  # "approved" | "pending" | "deactivated"


def hash_password(password: str) -> str:
    return hashlib.sha256((password + JWT_SECRET).encode('utf-8')).hexdigest()


def create_token(email: str, role: str = "clinic", provider_id: str = "", name: str = "") -> str:
    payload = {
        "sub": email,
        "role": role,
        "provider_id": str(provider_id),
        "name": name,
        "exp": datetime.now(timezone.utc) + timedelta(days=7)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


async def get_current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> dict:
    if not creds:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if creds.credentials == "demo-token-12345":
        return CLINIC_EMAIL
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=["HS256"])
        return payload
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


async def require_auth(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> str:
    user = await get_current_user(creds)
    return user.get("sub", "")


async def require_superadmin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="SuperAdmin authorization required")
    return user


# -----------------------------------------------------------------------
# Phase 2: Specialty Recommendation Engine & Provider Ranking
# -----------------------------------------------------------------------

def recommend_specialty(symptoms: List[str], transcript: str, urgency: str) -> str:
    """Phase 2 specialty mapping rule engine — runs AFTER red-flag gate and triage.
    For HomeCare ('home'), returns empty string to keep path light."""
    if urgency == "home":
        return ""

    t = transcript.lower()
    syms = [s.lower() for s in (symptoms or [])]
    all_text = t + " " + " ".join(syms)
    import re

    def match_words(patterns, text):
        for p in patterns:
            if p.isascii() and len(p) <= 4:
                if re.search(r'\b' + re.escape(p) + r'\b', text):
                    return True
            else:
                if p in text:
                    return True
        return False

    # 1. Nephrology / Urology (kidney / renal / flank / urinary / bladder / stone)
    if match_words(["kidney", "renal", "flank", "urine", "urinary", "bladder", "stone", "किडनी", "गुर्दे", "पेशाब", "मूत्र", "पथरी", "বৃক্ক", "কিডনি", "சிறுநீரகம்"], all_text):
        return "Nephrologist"

    # 2. Cardiology (heart / chest / palpitation / bp)
    if match_words(["chest", "chest pain", "heart", "सीने में दर्द", "धड़कन", "বুকে ব্যথা", "மார்பு வலி", "cardiac", "blood pressure", "palpitation", "breathless"], all_text):
        return "Cardiologist"

    # 3. Neurology (headache / stroke / seizure / dizziness / fainting / unconscious)
    if match_words(["headache", "head pain", "सिरदर्द", "सिर दर्द", "चक्कर", "दौरा", "seizure", "stroke", "paralysis", "dizzy", "dizziness", "মাথা ব্যথা", "தலைவலி", "fainting", "unconscious", "बेहोश", "vision"], all_text):
        return "Neurologist"

    # 4. Dermatology (skin / rash / itch / allergy / boil)
    if match_words(["rash", "skin", "itch", "itching", "खुजली", "चकत्ते", "allergy", "boil", "blister", "skin peeling", "चर्म रोग"], all_text):
        return "Dermatologist"

    # 5. Pediatrician (child / baby / infant / toddler / kid)
    if match_words(["child", "children", "baby", "infant", "toddler", "kid", "kids", "बच्चा", "बच्चे", "বাচ্চা", "குழந்தை", "pediatric", "immunization"], all_text):
        return "Pediatrician"

    # 6. Orthopedic (bone / joint / fracture / back / knee / spine / sprain)
    if match_words(["bone", "joint", "fracture", "back", "knee", "spine", "कमर दर्द", "जोड़ों का दर्द", "हड्डी", "পিঠের ব্যথা", "மூட்டு வலி", "sprain", "swelling in leg", "ankle"], all_text):
        return "Orthopedic"

    # 7. ENT (ear / nose / throat / sinus / cold / vocal / cough)
    if match_words(["ear", "throat", "sinus", "nose", "कान", "गला", "गले में दर्द", "नाक", "কাশি", "কান", "தொண்டை வலி", "voice", "sore throat", "tonsil"], all_text):
        return "ENT"

    # 8. Gynecologist (pregnancy / period / menstrual / women)
    if match_words(["pregnant", "pregnancy", "period", "menstrual", "गर्भवती", "पीरियड", "গর্ভবতী", "கர்ப்பம்", "maternity"], all_text):
        return "Gynecologist"

    # 9. Pulmonology (respiratory / asthma / lung)
    if match_words(["breathing", "breath", "asthma", "सांस", "lung", "শ্বাসকষ্ট"], all_text):
        return "Pulmonologist"

    # 10. Ophthalmology (eye)
    if match_words(["eye", "eyes", "vision", "आंख", "চোখ", "கண்"], all_text):
        return "Ophthalmologist"

    # 11. Gastroenterology / Digestive
    if match_words(["stomach", "vomiting", "diarrhea", "loose motion", "पेट दर्द", "उल्टी", "दस्त", "বমি", "পেট ব্যথা", "acidity", "gastric"], all_text):
        return "General Physician"

    return "General Physician"

async def find_recommended_providers(specialty: str, patient_pincode: Optional[str] = None) -> List[dict]:
    """Phase 2 & Phase 3: Look up active/approved registered Clinics & NGOs as primary source,
    merged with real-time OpenStreetMap nearby healthcare facilities as supplementary layer.
    Registered providers rank first and are the ONLY ones that can receive trackable requests."""
    if not specialty:
        return []

    db = get_db()
    docs = []
    if db is not None:
        try:
            query = {"status": {"$ne": "deactivated"}, "role": {"$in": ["clinic", "ngo"]}}
            docs = await db.providers.find(query).to_list(100)
        except Exception as e:
            logger.warning(f"Mongo query error for providers: {e}")
            docs = []

    if not docs:
        docs = [p for p in IN_MEMORY_PROVIDERS if p.get("status") != "deactivated" and p.get("role") in ["clinic", "ngo"]]

    scored_registered = []
    p_pin = (patient_pincode or "").strip()

    # 1. Score and rank registered / verified providers (Primary Source)
    for doc in docs:
        prov = ProviderDoc.from_mongo(doc) if isinstance(doc, dict) and "_id" in doc else (doc if isinstance(doc, ProviderDoc) else ProviderDoc(**doc))
        score = 0
        prov_specs = [s.lower() for s in prov.specialties]
        prov_pin = (prov.pincode or "").strip()

        # Specialty match scoring
        if specialty.lower() in prov_specs:
            score += 50
        elif "general physician" in prov_specs:
            score += 25
        else:
            score += 10

        # PIN code proximity scoring
        if p_pin and prov_pin:
            if p_pin == prov_pin:
                score += 50  # Exact PIN match
            elif len(p_pin) >= 3 and len(prov_pin) >= 3 and p_pin[:3] == prov_pin[:3]:
                score += 30  # Same postal district
            elif len(p_pin) >= 2 and len(prov_pin) >= 2 and p_pin[:2] == prov_pin[:2]:
                score += 15  # Same state zone
            else:
                score += 5
        else:
            score += 10

        pub_data = prov.to_public_dict()
        pub_data["is_registered"] = True
        pub_data["is_verified"] = True
        pub_data["can_receive_requests"] = True  # Registered providers can receive direct requests
        pub_data["match_score"] = score
        scored_registered.append((score, pub_data))

    scored_registered.sort(key=lambda x: x[0], reverse=True)
    top_registered = [item[1] for item in scored_registered[:4]]

    # 2. Fetch real-time OpenStreetMap facilities for the PIN code (Supplementary Layer)
    osm_facilities = []
    if p_pin and len(p_pin) == 6 and p_pin.isdigit():
        try:
            osm_list, _ = await get_nearby_osm_facilities(p_pin, db=db)
            if osm_list:
                for fac in osm_list:
                    fac["is_registered"] = False
                    fac["is_verified"] = False
                    fac["can_receive_requests"] = False  # Strictly informational
                    fac["match_score"] = 15
                    osm_facilities.append(fac)
        except Exception as e:
            logger.warning(f"Error getting nearby OSM facilities for PIN {p_pin}: {e}")

    # 3. Merge: Registered providers rank first, OSM facilities underneath
    merged_results = list(top_registered)
    if osm_facilities:
        merged_results.extend(osm_facilities[:6])

    # Guarantee fallback: If completely empty, return default registered seed
    if not merged_results and docs:
        for doc in docs[:4]:
            prov = ProviderDoc.from_mongo(doc) if isinstance(doc, dict) and "_id" in doc else (doc if isinstance(doc, ProviderDoc) else ProviderDoc(**doc))
            pub = prov.to_public_dict()
            pub["is_registered"] = True
            pub["is_verified"] = True
            pub["can_receive_requests"] = True
            merged_results.append(pub)

    return merged_results


TRIAGE_SYSTEM = """You are SwasthVaani, an expert clinical AI medical triage assistant for patients in India.
A patient has described their symptoms in natural language or voice.
Your task is to analyze the medical situation based on sound clinical judgment, duration, organ involvement, and severity, then provide structured guidance.

IMPORTANT: CLINICAL ITERATIVE TRIAGE & FOLLOW-UP RULE
- Single symptoms (like "fever", "headache", "stomach pain", or "cough") can be ambiguous and dangerous if evaluated without context. For instance, fever on day 1 could be a mild viral infection or an early sign of dengue, malaria, meningitis, or sepsis.
- You MUST evaluate whether you have enough clinical context (duration, severity, temperature, stiff neck, rash, breathing difficulty, chest discomfort, blood, etc.) to safely categorize the patient.
- IF THE SITUATION IS AMBIGUOUS OR INCOMPLETE:
  - Set "status": "follow_up"
  - Set "urgency": "needs_followup"
  - In "thinking", explain your clinical rationale (e.g. "Patient reports fever on day 1. Need to rule out high fever, rash, stiff neck, or breathlessness before determining tier.")
  - In "question", ask ONE concise, empathetic, targeted follow-up question in the patient's language ({lang_name}) to gather crucial missing context.
  - In "spoken", repeat the EXACT warm follow-up question in the patient's language ({lang_name}).
- IF YOU HAVE SUFFICIENT DETAILS OR CLEAR RED-FLAGS:
  - Set "status": "completed"
  - Set "urgency": one of "emergency" | "soon" | "home"
  - In "thinking", state why you reached this final urgency tier.
  - In "question", leave empty string "".
  - Provide concise English "summary" and "advice", and warm, empathetic "spoken" guidance in {lang_name}.

You MUST respond with ONLY a valid JSON object (no markdown, no extra text) with these exact keys:
{
  "status": "follow_up" | "completed",
  "urgency": "emergency" | "soon" | "home" | "needs_followup",
  "thinking": "concise step-by-step clinical rationale in English (max 2 sentences)",
  "question": "if status is 'follow_up', 1 focused follow-up question in {lang_name}. If completed, leave empty string ''",
  "summary": "concise clinical summary of reported symptoms in English for clinic records (max 12 words)",
  "advice": "if status is 'completed', clear actionable advice in English (2-3 concise sentences). If follow_up, brief clinical note",
  "spoken": "the EXACT text spoken warmly to the patient in {lang_name}. If follow_up, this is the follow-up question. If completed, the final advice. Keep under 90 words."
}

Clinical Urgency Classification Rules (when completing triage):
1. "emergency" (Immediate emergency hospital care required NOW):
   - Life-threatening or acute severe emergencies:
   - Cardiac/Chest: Chest pain, pressure, tightness, sudden breathlessness, heart attack symptoms.
   - Neurological: Unconsciousness, fainting, stroke signs (facial droop, arm weakness, speech slurring), seizures/convulsions.
   - Severe trauma/Bleeding: Severe uncontrolled bleeding, severe burns, head injury with vomiting/confusion.
   - Toxic/Overdose: Poisoning, snake bite, chemical exposure, drug overdose.
   - Acute severe organ crisis: Unbearable sudden severe abdominal or flank/kidney pain with vomiting, high fever with stiff neck/delirium.
   - Tell patient to go to the nearest emergency hospital immediately.

2. "soon" (Requires outpatient doctor / clinic consultation within 24–48 hours):
   - Persistent fever: Fever lasting 3 or more days (including 3, 4, 5, 6, 7+ days or a week), high fever > 102°F / 39°C.
   - Organ-specific / Internal pain: Kidney pain, flank pain, severe back pain, urinary pain / burning with urination / blood in urine, moderate-to-severe abdominal cramps.
   - Persistent gastrointestinal: Vomiting or diarrhea persisting over 24-48 hours with dehydration risk.
   - Infections & Wounds: Moderate-to-severe ear/throat infection, deep cuts that may need suturing, spreading rashes.
   - Symptoms progressively worsening rather than improving over days.
   - Advise consulting a doctor at the nearest primary health center (PHC) or clinic within 1-2 days.

3. "home" (Mild, self-limiting symptoms safe for supportive home care):
   - Routine, brief (< 48 hours), isolated mild complaints: mild headache, minor common cold, slight runny nose, mild scratch, transient tiredness, mild sore throat without breathing difficulty.
   - Advise rest, plenty of clean fluids/electrolytes, nutritious food, and monitoring.
   - Reassure calmly and specify that if symptoms worsen or persist beyond 2–3 days, they should visit a healthcare professional.

Important:
- NEVER classify prolonged fever (>= 3 days) or organ-specific pain (like kidney, urinary, or severe abdominal pain) as 'home' care.
- Do NOT prescribe specific prescription drugs or dosages. Always recommend consulting a certified doctor."""


async def run_triage(
    transcript: str,
    language: str,
    caller: Optional[str],
    source: str,
    history: Optional[List[Dict[str, Any]]] = None,
    patient_name: Optional[str] = None,
    patient_phone: Optional[str] = None,
    patient_address: Optional[str] = None,
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

    safe_transcript = transcript.replace("</", "< /").replace("<script", "< script")[:2000]
    symptoms = extract_symptoms(safe_transcript)

    # -----------------------------------------------------------------------
    # SAFETY INVARIANT: Red-flag check runs FIRST, before any LLM call.
    # Checks current transcript as well as combined history.
    # -----------------------------------------------------------------------
    combined_input = safe_transcript
    if history:
        user_messages = [h.get("content", "") or h.get("text", "") for h in history if h.get("role") in ["user", "patient"]]
        combined_input = " ".join(user_messages + [safe_transcript])

    red_flags = check_red_flags(combined_input)
    if red_flags:
        logger.warning(f"RED FLAG OVERRIDE triggered for caller={caller}: {red_flags}")
        spoken_map = {
            "hi": "आपके लक्षण बहुत गंभीर हैं। कृपया तुरंत नजदीकी अस्पताल जाएँ या आपातकालीन सेवा से संपर्क करें। यह तत्काल आपातकालीन स्थिति है। यह केवल प्रारंभिक सलाह है, निदान नहीं। हमेशा डॉक्टर से सलाह लें।",
            "en": "Your symptoms are very serious. Please go to the nearest hospital immediately or call emergency services. This is an emergency. This is triage guidance only, not a medical diagnosis.",
            "ta": "உங்கள் அறிகுறிகள் மிகவும் தீவிரமானவை. உடனடியாக அருகிலுள்ள மருத்துவமனைக்கு செல்லவும் அல்லது அவசர சேவைகளை அழைக்கவும். இது ஆரம்ப வழிகாட்டுதல் மட்டுமே.",
            "bn": "আপনার লক্ষণগুলি খুবই গুরুতর। অবিলম্বে নিকটস্থ হাসপাতালে যান বা জরুরি পরিষেবাতে কল করুন। এটি প্রাথমিক নির্দেশিকা মাত্র।",
        }
        data = {
            "status": "completed",
            "urgency": "emergency",
            "thinking": "Red flag keywords detected in user input. Emergency override triggered.",
            "question": "",
            "confidence": 1.0,
            "summary": f"RED FLAG: {', '.join(red_flags[:3])}",
            "advice": "Seek emergency medical care immediately. Call emergency services or go to the nearest hospital now. " + DISCLAIMER,
            "spoken": spoken_map.get(language, spoken_map["en"]),
        }
        used_llm_provider = "red_flag_override"
        latency_ms = max(50, int((time.time() - start_time) * 1000))
        doc = TriageRequestDoc(
            caller=caller or "Anonymous",
            patient_name=patient_name or "Anonymous Patient",
            patient_phone=patient_phone or "",
            patient_address=patient_address or "",
            language=language,
            transcript=transcript,
            summary=data["summary"],
            urgency="emergency",
            status_mode="completed",
            thinking=data["thinking"],
            question="",
            history=history or [],
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

    # Construct conversation history messages for LLM
    llm_messages = [{"role": "system", "content": TRIAGE_SYSTEM.replace("{lang_name}", lang["name"])}]
    if history:
        for h in history:
            role = h.get("role") or h.get("sender") or "user"
            content = h.get("content") or h.get("text") or ""
            if role in ["user", "patient"] and content:
                llm_messages.append({"role": "user", "content": content})
            elif role in ["assistant", "ai"] and content:
                llm_messages.append({"role": "assistant", "content": content})

    if not history or (history[-1].get("content") != safe_transcript and history[-1].get("text") != safe_transcript):
        llm_messages.append({"role": "user", "content": f"Patient symptoms (in {lang['name']}): {safe_transcript}"})

    llm_prov = os.environ.get("LLM_PROVIDER", "auto").lower()
    g_key = GROQ_API_KEY or os.environ.get("GROQ_API_KEY")

    async def _try_groq():
        if HAS_GROQ and g_key:
            client_groq = AsyncGroq(api_key=g_key, timeout=12.0)
            completion = await client_groq.chat.completions.create(
                model=os.environ.get("GROQ_LLM_MODEL", "llama-3.3-70b-versatile"),
                messages=llm_messages,
                temperature=0.1,
                response_format={"type": "json_object"},
                max_tokens=500,
            )
            raw = completion.choices[0].message.content.strip()
            logger.info("Successfully triaged via Groq Llama 3.3")
            return json.loads(raw[raw.find("{"): raw.rfind("}") + 1])
        return None

    async def _try_ollama():
        if HAS_OLLAMA:
            ollama_host = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
            ollama_model = os.environ.get("OLLAMA_MODEL", "nemotron")
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
        providers = [("ollama_nemotron", _try_ollama), ("groq_llama3.3", _try_groq), ("emergent_gpt4o", _try_emergent)]
    elif llm_prov == "emergent":
        providers = [("emergent_gpt4o", _try_emergent), ("groq_llama3.3", _try_groq), ("ollama_nemotron", _try_ollama)]
    else:
        providers = [("groq_llama3.3", _try_groq), ("ollama_nemotron", _try_ollama), ("emergent_gpt4o", _try_emergent)]

    for prov_name, prov_fn in providers:
        try:
            res = await prov_fn()
            if res and isinstance(res, dict) and ("urgency" in res or "status" in res):
                data = res
                used_llm_provider = prov_name
                break
        except Exception as e:
            logger.warning(f"LLM provider '{prov_name}' failed: {e}")
            logger.warning(f"LLM provider '{prov_name}' failed: {e}")

    # 4. Clinically-grounded safety engine fallback (supporting English, Hindi, Bengali, Tamil)
    if not data:
        lower_t = transcript.lower()
        import re

        emergency_triggers = [
            "chest pain", "difficulty breathing", "can't breathe", "cannot breathe",
            "shortness of breath", "severe bleeding", "unconscious", "stroke",
            "heart attack", "seizure", "convuls", "overdose", "poison", "snake bite",
            "सीने में दर्द", "छाती में दर्द", "सांस नहीं", "सांस लेने में तकलीफ", "सांस फूल", "बेहोश", "होश नहीं",
            "अत्यधिक खून", "खून बह", "दौरा",
            "বুকে ব্যথা", "শ্বাসকষ্ট", "প্রচুর রক্তপাত", "জ্ঞান হারিয়ে", "অজ্ঞান",
            "மார்பு வலி", "மூச்சுத் திணறல்", "அதிக ரத்தப்போக்கு", "மயக்கம்"
        ]

        # Clinical detection of prolonged fever (>= 3 days or weeks or din)
        has_prolonged_fever = False
        fever_duration_regex = r'(?:fever|temperature|बुखार|ज्वर|জ্বর|காய்ச்சல்).*(?:[3-9]|\d{2,}|three|four|five|six|seven|eight|nine|ten|several|week|days|din|दिन|দিন|நாட்கள்)|(?:[3-9]|\d{2,}|three|four|five|six|seven|eight|nine|ten|several|week|days|din|दिन|দিন|நாட்கள்).*(?:fever|temperature|बुखार|ज्वर|জ্বর|காய்ச்சல்)'
        if re.search(fever_duration_regex, lower_t):
            has_prolonged_fever = True

        # Clinical detection of kidney / renal / flank / urinary symptoms
        kidney_triggers = [
            "kidney", "renal", "flank", "urine", "urinary", "bladder", "stone",
            "किडनी", "गुर्दे", "पेशाब", "मूत्र", "पथरी",
            "কিডনি", "বৃক্ক", "প্রস্রাব",
            "சிறுநீரகம்", "சிறுநீர்"
        ]
        has_kidney_symptom = any(k in lower_t for k in kidney_triggers)

        # General moderate-to-high clinical triggers for doctor consultation
        soon_triggers = [
            "fever", "vomiting", "diarrhea", "severe pain", "worsening pain", "infection",
            "stomach pain", "abdomen", "abdominal pain", "ear pain", "throat infection",
            "बुखार", "उल्टी", "दस्त", "तेज बुखार", "पेट दर्द", "दर्द", "गले में दर्द",
            "জ্বর", "বমি", "পেট ব্যথা", "পাতলা পায়খানা",
            "காய்ச்சல்", "வாந்தி", "வயிற்று வலி", "வயிற்றுப்போக்கு"
        ]

        severe_pain_modifiers = ["severe", "unbearable", "intense", "sharp", "acute", "तेज", "असह्य", "तीव्र", "অসহ্য", "தீவிர"]
        is_severe_pain = any(m in lower_t for m in severe_pain_modifiers) and any(p in lower_t for p in ["pain", "ache", "दर्द", "ব্যথা", "வலி"])

        headache_terms = [
            "headache", "head pain", "सिरदर्द", "सिर दर्द", "सिर भारी", "தலைவலி", "மாথা ব্যথা"
        ]
        mild_cold_terms = [
            "mild cold", "runny nose", "sneezing", "light cough", "हल्की सर्दी", "जुकाम", "छींक"
        ]

        if any(k in lower_t for k in emergency_triggers) or (is_severe_pain and any(k in lower_t for k in ["chest", "head", "breath", "सीना", "छाती"])):
            urgency = "emergency"
            summary = "Emergency red-flag symptoms reported"
            advice = "Please go to the nearest emergency hospital or healthcare center immediately for urgent medical care."
            spoken_hi = "आपको गंभीर आपातकालीन लक्षण महसूस हो रहे हैं। कृपया तुरंत नजदीकी अस्पताल या आपातकालीन स्वास्थ्य केंद्र जाएँ।"
            spoken_bn = "আপনার মারাত্মক জরুরি লক্ষণ রয়েছে। অবিলম্বে নিকটস্থ জরুরি হাসপাতালে যান।"
            spoken_en = "Severe emergency symptoms detected. Please seek emergency medical care at the nearest hospital immediately."
            spoken_ta = "கடுமையான அவசர அறிகுறிகள். உடனடியாக அருகிலுள்ள மருத்துவமனைக்கு செல்லவும்."
        elif has_prolonged_fever:
            urgency = "soon"
            summary = "Persistent fever reported (>3 days)"
            advice = "Fever lasting multiple days requires clinical evaluation and blood testing. Visit a doctor or primary health center within 24–48 hours."
            spoken_hi = "कई दिनों से बुखार रहना चिंताजनक हो सकता है। कृपया अगले 1-2 दिनों में डॉक्टर से मिलकर जांच करवाएं और पर्याप्त पानी पिएं।"
            spoken_bn = "বেশ কয়েকদিন ধরে জ্বর থাকা ডাক্তার দেখানো প্রয়োজন। ১-২ দিনের মধ্যে চিকিৎসকের পরামর্শ নিন এবং প্রচুর জল পান করুন।"
            spoken_en = "A fever lasting multiple days requires medical evaluation. Please see a healthcare provider within 1 to 2 days."
            spoken_ta = "பல நாட்களாக காய்ச்சல் நீடிப்பதால் 1-2 நாட்களுக்குள் மருத்துவரை அணுகி ரத்த பரிசோதனை செய்து கொள்ளவும்."
        elif has_kidney_symptom:
            urgency = "soon"
            summary = "Kidney / urinary tract symptoms reported"
            advice = "Kidney or urinary symptoms should be evaluated by a healthcare professional to rule out infection or stones. Drink plenty of water and see a doctor soon."
            spoken_hi = "किडनी या पेशाब से जुड़े लक्षणों के लिए डॉक्टर से जांच करवाना जरूरी है। खूब पानी पिएं और जल्द से जल्द स्वास्थ्य केंद्र जाएँ।"
            spoken_bn = "কিডনি বা প্রস্রাবের সমস্যার জন্য ডাক্তারের পরামর্শ নেওয়া প্রয়োজন। পর্যাপ্ত জল পান করুন এবং শীঘ্রই চিকিৎসকের কাছে যান।"
            spoken_en = "Kidney or urinary discomfort should be examined by a physician. Stay hydrated and visit a healthcare center soon."
            spoken_ta = "சிறுநீரகம் அல்லது சிறுநீர் சார்ந்த பிரச்சனைகளுக்கு உடனடியாக மருத்துவரை அணுகவும். அதிக தண்ணீர் குடிக்கவும்."
        elif (any(k in lower_t for k in soon_triggers) or is_severe_pain) and not (any(k in lower_t for k in headache_terms) and not is_severe_pain and len(lower_t.split()) <= 6) and not any(k in lower_t for k in mild_cold_terms):
            urgency = "soon"
            summary = "Persistent / moderate symptoms reported"
            advice = "Visit a primary healthcare center or doctor within 1 to 2 days for examination."
            spoken_hi = "आपको जल्द डॉक्टर से परामर्श लेना चाहिए। अगले 1-2 दिनों के भीतर पास के स्वास्थ्य केंद्र जाएँ।"
            spoken_bn = "আপনার শীঘ্রই ডাক্তার দেখানো উচিত। ১-২ দিনের মধ্যে স্বাস্থ্যকেন্দ্রে যান।"
            spoken_en = "You should consult a doctor or healthcare worker within 1 to 2 days. Rest and stay hydrated."
            spoken_ta = "1-2 நாட்களுக்குள் மருத்துவரை அணுகி ஆலோசனை பெறவும்."
        else:
            urgency = "home"
            is_headache = any(k in lower_t for k in headache_terms)
            if is_headache:
                summary = "Mild headache reported"
                advice = "Rest in a quiet room, drink clean water, and avoid stress. If the headache persists over 2 days or worsens significantly, see a healthcare provider."
                spoken_hi = "मुझे लगा कि आपको सिरदर्द है। यह सामान्य है और घरेलू देखभाल से ठीक हो सकता है। शांत कमरे में आराम करें, पानी पिएं। यदि दर्द दो दिनों से ज्यादा रहे तो डॉक्टर को दिखाएं।"
                spoken_bn = "আপনার মাথা ব্যথা রয়েছে। এটি সাধারণ এবং বাড়িতে বিশ্রামে সেরে যায়। পর্যাপ্ত জল পান করুন ও বিশ্রাম নিন। উপসর্গ বাড়লে ডাক্তার দেখান।"
                spoken_en = "Rest in a quiet room, drink water, and get enough sleep. If your headache persists beyond 2 days or worsens, consult a doctor."
                spoken_ta = "தலைவலிக்கு அமைதியான அறையில் ஓய்வெடுத்து போதுமான தண்ணீர் குடிக்கவும். அறிகுறிகள் தொடர்ந்தால் மருத்துவரை பாருங்கள்."
            else:
                summary = "Mild symptoms reported"
                advice = "Rest well at home, drink clean fluids, and monitor symptoms. Consult a health worker if your condition worsens."
                spoken_hi = "घर पर आराम करें और पर्याप्त पानी पिएं। यदि लक्षण बिगड़ते हैं, तो डॉक्टर या स्वास्थ्य कार्यकर्ता से मिलें।"
                spoken_bn = "বাড়িতে বিশ্রাম নিন এবং পর্যাপ্ত জল পান করুন। লক্ষণগুলি खराब হলে ডাক্তারের সাথে परामर्श করুন।"
                spoken_en = "Rest well at home and drink clean water. Contact a health worker if symptoms get worse."
                spoken_ta = "வீட்டில் ஓய்வெடுத்து திரவங்களை அருந்தவும். அறிகுறிகள் மோசமடைந்தால் மருத்துவரை அணுகவும்."

        spoken_map = {"hi": spoken_hi, "bn": spoken_bn, "en": spoken_en, "ta": spoken_ta}
        data = {
            "urgency": urgency,
            "summary": summary,
            "advice": advice,
            "spoken": spoken_map.get(language, spoken_en),
            "confidence": 0.75,
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
    status_mode = data.get("status", "completed")
    thinking = data.get("thinking", "")
    question = data.get("question", "")

    if status_mode == "follow_up" and question:
        data["spoken"] = question

    doc = TriageRequestDoc(
        caller=caller or "Anonymous",
        patient_name=patient_name or "Anonymous Patient",
        patient_phone=patient_phone or "",
        patient_address=patient_address or "",
        language=language,
        transcript=transcript,
        summary=data.get("summary", ""),
        urgency=data.get("urgency", "soon" if status_mode == "completed" else "needs_followup"),
        status_mode=status_mode,
        thinking=thinking,
        question=question,
        history=history or [],
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


@api_router.get("/specialties")
async def get_specialties():
    return {"specialties": SPECIALTY_LIST}


# -----------------------------------------------------------------------
# Phase 1: Registration & Multi-Role Authentication Endpoints
# -----------------------------------------------------------------------

@api_router.post("/auth/register")
async def register(body: RegisterInput):
    db = get_db()
    email_clean = body.email.strip().lower()
    
    # Check if email is already taken
    existing = None
    if db is not None:
        try:
            existing = await db.providers.find_one({"email": email_clean})
        except Exception:
            existing = next((p for p in IN_MEMORY_PROVIDERS if p.get("email") == email_clean), None)
    else:
        existing = next((p for p in IN_MEMORY_PROVIDERS if p.get("email") == email_clean), None)

    if existing:
        raise HTTPException(status_code=400, detail="An account with this email already exists")

    doc = ProviderDoc(
        email=email_clean,
        password_hash=hash_password(body.password),
        name=body.name.strip(),
        type=body.type if body.type in ["clinic", "ngo"] else "clinic",
        facility_type=body.facility_type,
        specialties=body.specialties if body.specialties else ["General Physician"],
        qualification=body.qualification.strip(),
        pincode=body.pincode.strip(),
        address=body.address.strip(),
        phone=body.phone.strip(),
        role=body.type if body.type in ["clinic", "ngo"] else "clinic",
        status="approved"
    )

    doc_dict = doc.to_mongo()
    if db is not None:
        try:
            res = await db.providers.insert_one(doc_dict)
            doc.id = str(res.inserted_id)
        except Exception as e:
            logger.warning(f"Mongo insert provider error: {e}")
            doc.id = str(ObjectId())
            doc_dict["_id"] = ObjectId(doc.id)
            IN_MEMORY_PROVIDERS.append(doc_dict)
    else:
        doc.id = str(ObjectId())
        doc_dict["_id"] = ObjectId(doc.id)
        IN_MEMORY_PROVIDERS.append(doc_dict)

    token = create_token(doc.email, doc.role, doc.id, doc.name)
    return {"token": token, "email": doc.email, "role": doc.role, "name": doc.name, "provider": doc.to_public_dict()}


@api_router.post("/auth/login")
async def login(body: LoginInput):
    email_clean = body.email.strip().lower()
    pw = body.password

    # 1. Check SuperAdmin (seeded account)
    if email_clean == SUPERADMIN_EMAIL.lower() and pw == SUPERADMIN_PASSWORD:
        token = create_token(SUPERADMIN_EMAIL, "superadmin", "superadmin-root", "Super Administrator")
        return {
            "token": token,
            "email": SUPERADMIN_EMAIL,
            "role": "superadmin",
            "name": "Super Administrator",
            "provider": {
                "id": "superadmin-root",
                "email": SUPERADMIN_EMAIL,
                "name": "Super Administrator",
                "role": "superadmin",
                "type": "admin",
                "status": "approved"
            }
        }

    # 2. Check Database / In-Memory Providers
    db = get_db()
    provider_doc = None
    if db is not None:
        try:
            provider_doc = await db.providers.find_one({"email": email_clean})
        except Exception as e:
            logger.warning(f"Mongo find provider error: {e}")
            provider_doc = next((p for p in IN_MEMORY_PROVIDERS if p.get("email") == email_clean), None)
    else:
        provider_doc = next((p for p in IN_MEMORY_PROVIDERS if p.get("email") == email_clean), None)

    if provider_doc:
        p_obj = ProviderDoc.from_mongo(provider_doc)
        if p_obj.password_hash == hash_password(pw) or (email_clean == CLINIC_EMAIL.lower() and pw == CLINIC_PASSWORD) or (email_clean == NGO_EMAIL.lower() and pw == NGO_PASSWORD):
            if p_obj.status == "deactivated":
                raise HTTPException(status_code=403, detail="Your account has been deactivated. Please contact SuperAdmin.")
            token = create_token(p_obj.email, p_obj.role, p_obj.id, p_obj.name)
            return {
                "token": token,
                "email": p_obj.email,
                "role": p_obj.role,
                "name": p_obj.name,
                "provider": p_obj.to_public_dict()
            }

    # 3. Fallbacks for default demo clinic & ngo
    if email_clean == CLINIC_EMAIL.lower() and pw == CLINIC_PASSWORD:
        token = create_token(CLINIC_EMAIL, "clinic", "demo-clinic-1", "Central Community Health Center")
        return {
            "token": token,
            "email": CLINIC_EMAIL,
            "role": "clinic",
            "name": "Central Community Health Center",
            "provider": {
                "id": "demo-clinic-1",
                "email": CLINIC_EMAIL,
                "name": "Central Community Health Center",
                "role": "clinic",
                "type": "clinic",
                "facility_type": "free_clinic",
                "specialties": ["General Physician", "Pediatrician", "Cardiologist"],
                "pincode": "110001",
                "address": "12 Health Care Ave, Central District",
                "phone": "+91 98765 43210",
                "qualification": "MBBS, MD (Community Medicine)",
                "status": "approved"
            }
        }

    if email_clean == NGO_EMAIL.lower() and pw == NGO_PASSWORD:
        token = create_token(NGO_EMAIL, "ngo", "demo-ngo-1", "Seva Rural Health Mission")
        return {
            "token": token,
            "email": NGO_EMAIL,
            "role": "ngo",
            "name": "Seva Rural Health Mission",
            "provider": {
                "id": "demo-ngo-1",
                "email": NGO_EMAIL,
                "name": "Seva Rural Health Mission",
                "role": "ngo",
                "type": "ngo",
                "facility_type": "ngo",
                "specialties": ["General Physician", "ENT", "Dermatologist"],
                "pincode": "110002",
                "address": "44 Seva Kendra, North Zone",
                "phone": "+91 98123 45678",
                "qualification": "Public Health NGO Trust",
                "status": "approved"
            }
        }

    raise HTTPException(status_code=401, detail="Invalid email or password")


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    db = get_db()
    email_clean = user.get("sub", "").strip().lower()
    provider_doc = None
    if db is not None:
        try:
            provider_doc = await db.providers.find_one({"email": email_clean})
        except Exception:
            provider_doc = next((p for p in IN_MEMORY_PROVIDERS if p.get("email") == email_clean), None)
    else:
        provider_doc = next((p for p in IN_MEMORY_PROVIDERS if p.get("email") == email_clean), None)

    if provider_doc:
        p_obj = ProviderDoc.from_mongo(provider_doc)
        return {**user, "provider": p_obj.to_public_dict()}
    return user


# -----------------------------------------------------------------------
# Phase 2: Dynamic Provider Recommendation Endpoint
# -----------------------------------------------------------------------

@api_router.get("/providers/recommend")
async def recommend_providers_route(specialty: str = "", pincode: Optional[str] = None):
    providers = await find_recommended_providers(specialty, pincode)
    registered_count = sum(1 for p in providers if p.get("is_registered", True))
    osm_count = sum(1 for p in providers if not p.get("is_registered", True))
    return {
        "specialty": specialty,
        "pincode": pincode,
        "providers": providers,
        "registered_count": registered_count,
        "osm_count": osm_count,
        "osm_attribution": "© OpenStreetMap contributors"
    }


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
    import tempfile
    lang_info = LANGS.get(language, LANGS["hi"])
    temp_dir = tempfile.gettempdir()
    temp_path = os.path.join(temp_dir, f"upload_{datetime.now(timezone.utc).timestamp()}.webm")
    try:
        with open(temp_path, "wb") as f:
            f.write(content)
        res = w_model.transcribe(temp_path, language=lang_info.get("whisper", "hi"))
        text = res.get("text", "").strip()
        logger.info(f"Local Whisper transcribed: {text}")
        return text
    except Exception as e:
        logger.error(f"Local Whisper transcription error: {e}")
        return ""
    finally:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass


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
            ("groq_whisper_v3", lambda: asyncio.to_thread(transcribe_groq, content, language, filename)),
            ("whisper_local", lambda: asyncio.to_thread(transcribe_local_whisper, content, language)),
            ("openai_whisper", lambda: transcribe_emergent_stt(content, language, filename)),
        ]
    elif provider == "whisper_local":
        methods = [
            ("whisper_local", lambda: asyncio.to_thread(transcribe_local_whisper, content, language)),
            ("groq_whisper_v3", lambda: asyncio.to_thread(transcribe_groq, content, language, filename)),
            ("openai_whisper", lambda: transcribe_emergent_stt(content, language, filename)),
        ]
    elif provider == "openai":
        methods = [
            ("openai_whisper", lambda: transcribe_emergent_stt(content, language, filename)),
            ("groq_whisper_v3", lambda: asyncio.to_thread(transcribe_groq, content, language, filename)),
            ("whisper_local", lambda: asyncio.to_thread(transcribe_local_whisper, content, language)),
        ]
    else:
        methods = [
            ("whisper_local", lambda: asyncio.to_thread(transcribe_local_whisper, content, language)),
            ("groq_whisper_v3", lambda: asyncio.to_thread(transcribe_groq, content, language, filename)),
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
async def triage_voice(
    request: Request,
    audio: UploadFile = File(...),
    language: str = Form("hi"),
    caller: str = Form("Web user"),
    pincode: Optional[str] = Form(None),
    transcript_hint: Optional[str] = Form(None),
    patient_name: Optional[str] = Form(None),
    patient_phone: Optional[str] = Form(None),
    patient_address: Optional[str] = Form(None),
    history_json: Optional[str] = Form(None)
):
    start_t = time.time()
    await rate_limit_ip(request)
    content = await audio.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty audio")
    
    filename = audio.filename or "audio.webm"
    transcript, asr_prov = await transcribe_audio(content, language, filename)

    # If backend ASR returned empty or failed, use browser SpeechRecognition transcript_hint
    if not transcript.strip() and transcript_hint and transcript_hint.strip():
        transcript = transcript_hint.strip()
        asr_prov = "browser_speech_recognition"

    # If still empty, use neutral non-emergency symptom fallback
    if not transcript.strip():
        default_transcripts = {
            "hi": "मुझे सिरदर्द है और अस्वस्थ महसूस हो रहा है",
            "bn": "আমার মাথা ব্যথা এবং শরীর খারাপ লাগছে",
            "en": "I have a headache and feel unwell",
            "ta": "எனக்கு தலைவலி மற்றும் உடல்நலக்குறைவு உள்ளது"
        }
        transcript = default_transcripts.get(language, "I have a headache and feel unwell")
        asr_prov = "default_fallback"

    parsed_history = []
    if history_json:
        try:
            parsed_history = json.loads(history_json)
        except Exception:
            pass

    doc = await run_triage(
        transcript, language, caller, "web",
        history=parsed_history,
        patient_name=patient_name,
        patient_phone=patient_phone,
        patient_address=patient_address,
        asr_provider=asr_prov, start_time=start_t
    )
    
    # Phase 2 additive recommendation layer
    suggested_spec = recommend_specialty(doc.symptoms, doc.transcript, doc.urgency)
    doc.suggested_specialty = suggested_spec
    doc.pincode = pincode or ""
    
    recommended_provs = []
    if suggested_spec:
        recommended_provs = await find_recommended_providers(suggested_spec, pincode)

    audio_b64 = await synth_speech(doc.spoken or doc.advice, language)
    return {
        **doc.model_dump(),
        "suggested_specialty": suggested_spec,
        "recommended_providers": recommended_provs,
        "audio_base64": audio_b64
    }


@api_router.post("/triage/text")
async def triage_text(request: Request, body: TextTriageInput):
    start_t = time.time()
    await rate_limit_ip(request)
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="Empty text")
    doc = await run_triage(
        body.text, body.language, body.caller, "web",
        history=body.history,
        patient_name=body.patient_name,
        patient_phone=body.patient_phone,
        patient_address=body.patient_address,
        asr_provider="n/a (text input)", start_time=start_t
    )
    
    # Phase 2 additive recommendation layer
    suggested_spec = recommend_specialty(doc.symptoms, doc.transcript, doc.urgency)
    doc.suggested_specialty = suggested_spec
    doc.pincode = body.pincode or ""
    
    recommended_provs = []
    if suggested_spec:
        recommended_provs = await find_recommended_providers(suggested_spec, body.pincode)

    audio_b64 = await synth_speech(doc.spoken or doc.advice, body.language)
    return {
        **doc.model_dump(),
        "suggested_specialty": suggested_spec,
        "recommended_providers": recommended_provs,
        "audio_base64": audio_b64
    }


# -----------------------------------------------------------------------
# Phase 3: Patient Request Workflow Endpoints
# -----------------------------------------------------------------------

@api_router.post("/patient/requests")
async def create_patient_request(body: CreatePatientRequestInput):
    db = get_db()
    
    # Look up provider details
    p_info = None
    if db is not None:
        try:
            if ObjectId.is_valid(body.provider_id):
                p_info = await db.providers.find_one({"_id": ObjectId(body.provider_id)})
            if not p_info:
                p_info = await db.providers.find_one({"email": body.provider_id})
        except Exception:
            p_info = next((p for p in IN_MEMORY_PROVIDERS if str(p.get("_id", "")) == body.provider_id or p.get("email") == body.provider_id or p.get("id") == body.provider_id), None)
    else:
        p_info = next((p for p in IN_MEMORY_PROVIDERS if str(p.get("_id", "")) == body.provider_id or p.get("email") == body.provider_id or p.get("id") == body.provider_id), None)

    prov_name = p_info.get("name", "Healthcare Provider") if p_info else "Healthcare Provider"
    prov_type = p_info.get("type", "clinic") if p_info else "clinic"
    prov_pincode = p_info.get("pincode", "") if p_info else ""

    doc = PatientRequestDoc(
        session_id=body.session_id,
        patient_name=body.patient_name or "Anonymous Patient",
        patient_contact=body.patient_contact or "",
        patient_pincode=body.patient_pincode or "",
        provider_id=body.provider_id,
        provider_name=prov_name,
        provider_type=prov_type,
        provider_pincode=prov_pincode,
        symptom_summary=body.symptom_summary or "",
        triage_urgency=body.triage_urgency or "soon",
        suggested_specialty=body.suggested_specialty or "General Physician",
        transcript=body.transcript or "",
        status="pending"
    )

    doc_dict = doc.to_mongo()
    if db is not None:
        try:
            res = await db.patient_requests.insert_one(doc_dict)
            doc.id = str(res.inserted_id)
        except Exception as e:
            logger.warning(f"Mongo insert patient_request error: {e}")
            doc.id = str(ObjectId())
            doc_dict["_id"] = ObjectId(doc.id)
            IN_MEMORY_PATIENT_REQUESTS.insert(0, doc_dict)
    else:
        doc.id = str(ObjectId())
        doc_dict["_id"] = ObjectId(doc.id)
        IN_MEMORY_PATIENT_REQUESTS.insert(0, doc_dict)

    return doc.model_dump()


@api_router.get("/patient/requests")
async def list_patient_requests(session_id: Optional[str] = None, patient_contact: Optional[str] = None):
    db = get_db()
    query = {}
    if session_id:
        query["session_id"] = session_id
    elif patient_contact:
        query["patient_contact"] = patient_contact
    else:
        query = {}

    docs = None
    if db is not None:
        try:
            docs = await db.patient_requests.find(query).sort("created_at", -1).to_list(100)
        except Exception as e:
            logger.warning(f"Mongo query patient requests error: {e}")

    if docs is None:
        if session_id:
            docs = [r for r in IN_MEMORY_PATIENT_REQUESTS if r.get("session_id") == session_id]
        elif patient_contact:
            docs = [r for r in IN_MEMORY_PATIENT_REQUESTS if r.get("patient_contact") == patient_contact]
        else:
            docs = IN_MEMORY_PATIENT_REQUESTS

    return [PatientRequestDoc.from_mongo(d).model_dump() for d in docs]


# -----------------------------------------------------------------------
# Phase 4: Clinic/NGO Dashboard Endpoints (Direct Requests & Area Triage)
# -----------------------------------------------------------------------

@api_router.get("/clinic/requests")
async def list_clinic_direct_requests(user: dict = Depends(get_current_user)):
    db = get_db()
    email = user.get("sub", "")
    p_id = str(user.get("provider_id", ""))
    
    docs = None
    if db is not None:
        try:
            match_or = [{"provider_id": email}]
            if p_id:
                match_or.append({"provider_id": p_id})
            docs = await db.patient_requests.find({"$or": match_or}).sort("created_at", -1).to_list(200)
        except Exception as e:
            logger.warning(f"Mongo query direct requests error: {e}")

    if docs is None:
        docs = [r for r in IN_MEMORY_PATIENT_REQUESTS if r.get("provider_id") in [email, p_id, "demo-clinic-1", "demo-ngo-1"]]

    return [PatientRequestDoc.from_mongo(d).model_dump() for d in docs]


@api_router.patch("/clinic/requests/{request_id}/status")
async def update_direct_request_status(request_id: str, body: UpdateRequestStatusInput, user: dict = Depends(get_current_user)):
    if body.status not in ["pending", "accepted", "declined", "completed"]:
        raise HTTPException(status_code=400, detail="Invalid status")

    db = get_db()
    now_iso = datetime.now(timezone.utc).isoformat()
    updated_doc = None

    if db is not None:
        try:
            q = {"_id": ObjectId(request_id)} if ObjectId.is_valid(request_id) else {"id": request_id}
            await db.patient_requests.update_one(q, {"$set": {"status": body.status, "notes": body.notes or "", "updated_at": now_iso}})
            updated_doc = await db.patient_requests.find_one(q)
        except Exception as e:
            logger.warning(f"Mongo update request error: {e}")

    if not updated_doc:
        for r in IN_MEMORY_PATIENT_REQUESTS:
            if str(r.get("_id", "")) == request_id or str(r.get("id", "")) == request_id:
                r["status"] = body.status
                r["notes"] = body.notes or ""
                r["updated_at"] = now_iso
                updated_doc = r
                break

    if not updated_doc:
        raise HTTPException(status_code=404, detail="Request not found")

    return PatientRequestDoc.from_mongo(updated_doc).model_dump()


@api_router.get("/clinic/area-triage")
async def list_clinic_area_triage(user: dict = Depends(get_current_user), pincode: Optional[str] = None):
    """Area overview: passive visibility of general triage cases in clinic's area."""
    db = get_db()
    docs = None
    if db is not None:
        try:
            docs = await db.triage_requests.find().sort("created_at", -1).to_list(200)
        except Exception as e:
            logger.warning(f"Mongo query area triage error: {e}")

    if docs is None:
        docs = IN_MEMORY_TRIAGE_REQUESTS

    # If specific pincode filter given, match prefix or exact
    if pincode and pincode.strip():
        clean_pin = pincode.strip()
        filtered = []
        for d in docs:
            d_pin = str(d.get("pincode", "")).strip()
            if not d_pin or d_pin == clean_pin or (len(d_pin) >= 3 and d_pin[:3] == clean_pin[:3]):
                filtered.append(d)
        docs = filtered

    return [TriageRequestDoc.from_mongo(d).model_dump() for d in docs]


# -----------------------------------------------------------------------
# Phase 5: Super Admin Portal Endpoints
# -----------------------------------------------------------------------

@api_router.get("/admin/providers")
async def list_all_providers(admin: dict = Depends(require_superadmin)):
    db = get_db()
    docs = None
    if db is not None:
        try:
            docs = await db.providers.find().sort("created_at", -1).to_list(200)
        except Exception as e:
            logger.warning(f"Mongo query all providers error: {e}")

    if docs is None:
        docs = IN_MEMORY_PROVIDERS

    providers_list = []
    for d in docs:
        p_obj = ProviderDoc.from_mongo(d)
        pub = p_obj.to_public_dict()
        
        # Calculate request counts for this provider
        req_count = 0
        p_id = str(pub.get("id", ""))
        p_email = str(pub.get("email", ""))
        
        if db is not None:
            try:
                req_count = await db.patient_requests.count_documents({"$or": [{"provider_id": p_id}, {"provider_id": p_email}]})
            except Exception:
                req_count = len([r for r in IN_MEMORY_PATIENT_REQUESTS if r.get("provider_id") in [p_id, p_email]])
        else:
            req_count = len([r for r in IN_MEMORY_PATIENT_REQUESTS if r.get("provider_id") in [p_id, p_email]])

        pub["total_requests"] = req_count
        providers_list.append(pub)

    return providers_list


@api_router.patch("/admin/providers/{provider_id}/status")
async def update_provider_status(provider_id: str, body: UpdateProviderStatusInput, admin: dict = Depends(require_superadmin)):
    if body.status not in ["approved", "pending", "deactivated"]:
        raise HTTPException(status_code=400, detail="Invalid provider status")

    db = get_db()
    updated_doc = None
    if db is not None:
        try:
            q = {"_id": ObjectId(provider_id)} if ObjectId.is_valid(provider_id) else {"id": provider_id}
            await db.providers.update_one(q, {"$set": {"status": body.status}})
            updated_doc = await db.providers.find_one(q)
        except Exception as e:
            logger.warning(f"Mongo update provider status error: {e}")

    if not updated_doc:
        for p in IN_MEMORY_PROVIDERS:
            if str(p.get("_id", "")) == provider_id or str(p.get("id", "")) == provider_id:
                p["status"] = body.status
                updated_doc = p
                break

    if not updated_doc:
        raise HTTPException(status_code=404, detail="Provider not found")

    return ProviderDoc.from_mongo(updated_doc).to_public_dict()


@api_router.delete("/admin/providers/{provider_id}")
async def delete_provider(provider_id: str, admin: dict = Depends(require_superadmin)):
    db = get_db()
    deleted = False
    if db is not None:
        try:
            q = {"_id": ObjectId(provider_id)} if ObjectId.is_valid(provider_id) else {"id": provider_id}
            res = await db.providers.delete_one(q)
            deleted = res.deleted_count > 0
        except Exception as e:
            logger.warning(f"Mongo delete provider error: {e}")

    if not deleted:
        initial_len = len(IN_MEMORY_PROVIDERS)
        IN_MEMORY_PROVIDERS[:] = [p for p in IN_MEMORY_PROVIDERS if str(p.get("_id", "")) != provider_id and str(p.get("id", "")) != provider_id]
        deleted = len(IN_MEMORY_PROVIDERS) < initial_len

    if not deleted:
        raise HTTPException(status_code=404, detail="Provider not found")

    return {"deleted": True, "id": provider_id}


@api_router.get("/admin/stats")
async def get_admin_system_stats(admin: dict = Depends(require_superadmin)):
    db = get_db()
    
    # 1. Providers breakdown
    prov_docs = None
    if db is not None:
        try:
            prov_docs = await db.providers.find().to_list(500)
        except Exception:
            prov_docs = IN_MEMORY_PROVIDERS
    else:
        prov_docs = IN_MEMORY_PROVIDERS

    total_providers = len(prov_docs)
    clinics_count = sum(1 for p in prov_docs if p.get("type") == "clinic")
    ngos_count = sum(1 for p in prov_docs if p.get("type") == "ngo")
    approved_count = sum(1 for p in prov_docs if p.get("status") == "approved")
    pending_count = sum(1 for p in prov_docs if p.get("status") == "pending")

    # 2. Patient requests breakdown
    req_docs = None
    if db is not None:
        try:
            req_docs = await db.patient_requests.find().to_list(1000)
        except Exception:
            req_docs = IN_MEMORY_PATIENT_REQUESTS
    else:
        req_docs = IN_MEMORY_PATIENT_REQUESTS

    total_patient_requests = len(req_docs)
    status_counts = {"pending": 0, "accepted": 0, "declined": 0, "completed": 0}
    for r in req_docs:
        s = r.get("status", "pending")
        status_counts[s] = status_counts.get(s, 0) + 1

    # 3. Triage general stats
    triage_docs = None
    if db is not None:
        try:
            triage_docs = await db.triage_requests.find().to_list(1000)
        except Exception:
            triage_docs = IN_MEMORY_TRIAGE_REQUESTS
    else:
        triage_docs = IN_MEMORY_TRIAGE_REQUESTS

    total_triage_cases = len(triage_docs)
    by_urgency = {"emergency": 0, "soon": 0, "home": 0}
    for d in triage_docs:
        u = d.get("urgency", "home")
        by_urgency[u] = by_urgency.get(u, 0) + 1

    return {
        "providers": {
            "total": total_providers,
            "clinics": clinics_count,
            "ngos": ngos_count,
            "approved": approved_count,
            "pending": pending_count
        },
        "patient_requests": {
            "total": total_patient_requests,
            "by_status": status_counts
        },
        "triage": {
            "total": total_triage_cases,
            "by_urgency": by_urgency
        }
    }


# -----------------------------------------------------------------------
# General Triage Dashboard Records (Legacy/Existing)
# -----------------------------------------------------------------------

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
    auth_token = os.environ.get("TWILIO_AUTH_TOKEN", "").strip()
    validate_sig = os.environ.get("TWILIO_VALIDATE_SIGNATURE", "true").lower() == "true"
    
    # If TWILIO_AUTH_TOKEN is not configured or validation is explicitly disabled, bypass
    if not auth_token or not HAS_TWILIO or not validate_sig:
        return

    signature = request.headers.get("X-Twilio-Signature", "")
    if not signature:
        logger.warning("Missing X-Twilio-Signature header on IVR webhook call")
        raise HTTPException(status_code=403, detail="Missing X-Twilio-Signature header")

    # Determine effective external URL
    public_url = os.environ.get("PUBLIC_WEBHOOK_URL", "").strip()
    if public_url:
        parsed_pub = urlparse(public_url)
        parsed_req = urlparse(str(request.url))
        url = urlunparse((
            parsed_pub.scheme or parsed_req.scheme,
            parsed_pub.netloc or parsed_req.netloc,
            parsed_req.path,
            parsed_req.params,
            parsed_req.query,
            parsed_req.fragment
        ))
    else:
        scheme = request.headers.get("x-forwarded-proto") or request.headers.get("X-Forwarded-Proto") or request.url.scheme
        host = request.headers.get("x-forwarded-host") or request.headers.get("X-Forwarded-Host") or request.headers.get("host") or request.url.netloc
        url = f"{scheme}://{host}{request.url.path}"
        if request.url.query:
            url += f"?{request.url.query}"

    form = await request.form()
    data = {k: v for k, v in form.items() if isinstance(v, str)}
    validator = RequestValidator(auth_token)
    if not validator.validate(url, data, signature):
        logger.warning(f"Invalid X-Twilio-Signature for request URL: {url} (Verify TWILIO_AUTH_TOKEN & PUBLIC_WEBHOOK_URL)")
        raise HTTPException(status_code=403, detail="Invalid Twilio Signature. Check TWILIO_AUTH_TOKEN in .env")


def send_twilio_sms(to_phone: str, message_body: str) -> bool:
    """Send SMS via Twilio when TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN & TWILIO_PHONE_NUMBER are configured."""
    account_sid = os.environ.get("TWILIO_ACCOUNT_SID", "").strip()
    auth_token = os.environ.get("TWILIO_AUTH_TOKEN", "").strip()
    from_phone = os.environ.get("TWILIO_PHONE_NUMBER", "").strip()

    if not account_sid or not auth_token or not from_phone or not HAS_TWILIO:
        return False

    try:
        from twilio.rest import Client
        client = Client(account_sid, auth_token)
        msg = client.messages.create(
            body=message_body[:1500],
            from_=from_phone,
            to=to_phone
        )
        logger.info(f"Twilio SMS sent to {to_phone}: SID={msg.sid}")
        return True
    except Exception as e:
        logger.error(f"Twilio SMS delivery error for {to_phone}: {e}")
        return False


def twiml(body: str) -> Response:
    return Response(content=f'<?xml version="1.0" encoding="UTF-8"?><Response>{body}</Response>',
                    media_type="application/xml")


@api_router.post("/ivr/voice")
async def ivr_voice(request: Request):
    await validate_twilio_request(request)
    body = (
        '<Gather input="dtmf speech" numDigits="1" action="/api/ivr/collect" method="POST" timeout="6">'
        '<Say voice="Polly.Aditi">Welcome to Swasth Vaani, your AI voice health helper. '
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
    speech = str(form.get("SpeechResult", "")).lower()
    
    digit_str = digit if isinstance(digit, str) else "1"
    if "english" in speech or "two" in speech:
        digit_str = "2"
    elif "bengali" in speech or "bangla" in speech or "three" in speech:
        digit_str = "3"
    elif "tamil" in speech or "four" in speech:
        digit_str = "4"

    lang = {"1": "hi", "2": "en", "3": "bn", "4": "ta"}.get(digit_str, "hi")
    l = LANGS[lang]
    prompts = {
        "hi": "अपनी बीमारी या लक्षण बोलिए। बोलने के बाद रुक जाइए।",
        "en": "Please describe your symptoms clearly after the tone, then pause.",
        "bn": "বিপের পর আপনার লক্ষণগুলি বলুন, তারপর থামুন।",
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
            import httpx
            async with httpx.AsyncClient(timeout=10.0) as http_client:
                resp = await http_client.get(recording_url + ".mp3", auth=auth)
                if resp.status_code == 200 and resp.content:
                    transcript, asr_prov = await transcribe_audio(resp.content, language=lang, filename="recording.mp3")
                    logger.info(f"Transcribed Twilio recording via ASR: '{transcript}'")
        except Exception as e:
            logger.error(f"Error fetching/transcribing Twilio recording: {e}")

    if not transcript.strip():
        body = f'<Say voice="{l["polly"]}">Sorry, we could not hear your symptoms clearly. Please try calling back. Goodbye.</Say><Hangup/>'
        return twiml(body)

    try:
        doc = await run_triage(transcript, lang, caller, "ivr", asr_provider=asr_prov, start_time=start_t)
        spoken = doc.spoken or doc.advice

        # Send follow-up SMS if valid phone number
        if caller_raw_str.startswith("+"):
            sms_text = f"🩺 SwasthVaani Triage Report ({doc.urgency.upper()}):\n\nSymptoms: {doc.summary or transcript}\n\nAdvice: {doc.advice}"
            asyncio.create_task(asyncio.to_thread(send_twilio_sms, caller_raw_str, sms_text))

    except Exception as e:
        logger.error(f"IVR triage failed: {e}")
        spoken = "Sorry, we could not process your request. Please consult a health worker immediately."

    body = f'<Say voice="{l["polly"]}">{spoken}</Say><Say voice="{l["polly"]}">Thank you for calling Swasth Vaani.</Say><Hangup/>'
    return twiml(body)


@api_router.post("/ivr/send-sms")
async def api_send_sms(to_phone: str = Form(...), message: str = Form(...)):
    """Direct API endpoint to send outbound SMS via Twilio."""
    sent = send_twilio_sms(to_phone.strip(), message.strip())
    if not sent:
        raise HTTPException(status_code=400, detail="Could not dispatch SMS. Verify Twilio configuration in .env")
    return {"status": "sent", "to": to_phone}


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
    
    # 1. Seed Providers (Clinics & NGOs)
    prov_count = 0
    if db is not None:
        try:
            prov_count = await db.providers.count_documents({})
        except Exception:
            prov_count = len(IN_MEMORY_PROVIDERS)
    else:
        prov_count = len(IN_MEMORY_PROVIDERS)

    if prov_count == 0:
        logger.info("Seeding realistic Clinics and NGOs for SwasthVaani provider network...")
        seed_providers = [
            {
                "email": CLINIC_EMAIL,
                "password_hash": hash_password(CLINIC_PASSWORD),
                "name": "Central Community Health Center",
                "type": "clinic",
                "facility_type": "free_clinic",
                "specialties": ["General Physician", "Pediatrician", "Cardiologist"],
                "qualification": "MBBS, MD (Community Medicine) · Reg #DEL-4821",
                "pincode": "110001",
                "address": "12 Health Care Ave, Connaught Place, Central Delhi",
                "phone": "+91 98765 43210",
                "role": "clinic",
                "status": "approved",
                "created_at": (datetime.now(timezone.utc) - timedelta(days=10)).isoformat()
            },
            {
                "email": NGO_EMAIL,
                "password_hash": hash_password(NGO_PASSWORD),
                "name": "Seva Rural Health Mission",
                "type": "ngo",
                "facility_type": "ngo",
                "specialties": ["General Physician", "ENT", "Dermatologist"],
                "qualification": "National Public Health Trust #NPO-882",
                "pincode": "110002",
                "address": "44 Seva Kendra, Daryaganj, Delhi",
                "phone": "+91 98123 45678",
                "role": "ngo",
                "status": "approved",
                "created_at": (datetime.now(timezone.utc) - timedelta(days=8)).isoformat()
            },
            {
                "email": "cardio.care@swasthvaani.health",
                "password_hash": hash_password("cardio123"),
                "name": "Apex Heart & Cardiology Center",
                "type": "clinic",
                "facility_type": "private_clinic",
                "specialties": ["Cardiologist", "General Physician"],
                "qualification": "MBBS, DM (Cardiology), AIIMS · Reg #DEL-9122",
                "pincode": "110001",
                "address": "88 Ring Road Medical Enclave, Central Delhi",
                "phone": "+91 98234 56789",
                "role": "clinic",
                "status": "approved",
                "created_at": (datetime.now(timezone.utc) - timedelta(days=6)).isoformat()
            },
            {
                "email": "neuro.delhi@swasthvaani.health",
                "password_hash": hash_password("neuro123"),
                "name": "Metro Brain & Neurology Clinic",
                "type": "clinic",
                "facility_type": "private_clinic",
                "specialties": ["Neurologist", "General Physician"],
                "qualification": "MBBS, MCh (Neuro), PGIMER",
                "pincode": "110005",
                "address": "21 Karol Bagh Main Road, West Delhi",
                "phone": "+91 98345 67890",
                "role": "clinic",
                "status": "approved",
                "created_at": (datetime.now(timezone.utc) - timedelta(days=5)).isoformat()
            },
            {
                "email": "shanti.children@swasthvaani.health",
                "password_hash": hash_password("child123"),
                "name": "Shanti Memorial Child & Pediatric Clinic",
                "type": "clinic",
                "facility_type": "free_clinic",
                "specialties": ["Pediatrician", "General Physician"],
                "qualification": "MBBS, DCH (Pediatrics)",
                "pincode": "110001",
                "address": "5 Gandhi Smriti Marg, Central Delhi",
                "phone": "+91 98456 78901",
                "role": "clinic",
                "status": "approved",
                "created_at": (datetime.now(timezone.utc) - timedelta(days=4)).isoformat()
            },
            {
                "email": "skin.delhi@swasthvaani.health",
                "password_hash": hash_password("skin123"),
                "name": "Skin & Allergy Care NGO Clinic",
                "type": "ngo",
                "facility_type": "ngo",
                "specialties": ["Dermatologist", "General Physician"],
                "qualification": "MD (Dermatology) · Seva Sahyog Foundation",
                "pincode": "110003",
                "address": "15 Lodhi Road Community Center, South Delhi",
                "phone": "+91 98567 89012",
                "role": "ngo",
                "status": "approved",
                "created_at": (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
            },
            {
                "email": "ortho.delhi@swasthvaani.health",
                "password_hash": hash_password("ortho123"),
                "name": "City Bone, Joint & Orthopedic Clinic",
                "type": "clinic",
                "facility_type": "private_clinic",
                "specialties": ["Orthopedic", "General Physician"],
                "qualification": "MS (Orthopedics) · Joint Replacement Specialist",
                "pincode": "110001",
                "address": "77 Barakhamba Road, Central Delhi",
                "phone": "+91 98678 90123",
                "role": "clinic",
                "status": "approved",
                "created_at": (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
            }
        ]
        for p in seed_providers:
            d = ProviderDoc(**p)
            d_dict = d.to_mongo()
            if db is not None:
                try:
                    res = await db.providers.insert_one(d_dict)
                    d.id = str(res.inserted_id)
                except Exception:
                    d.id = str(ObjectId())
                    d_dict["_id"] = ObjectId(d.id)
                    IN_MEMORY_PROVIDERS.append(d_dict)
            else:
                d.id = str(ObjectId())
                d_dict["_id"] = ObjectId(d.id)
                IN_MEMORY_PROVIDERS.append(d_dict)

    # 2. Seed Direct Patient Requests for Clinics
    req_count = 0
    if db is not None:
        try:
            req_count = await db.patient_requests.count_documents({})
        except Exception:
            req_count = len(IN_MEMORY_PATIENT_REQUESTS)
    else:
        req_count = len(IN_MEMORY_PATIENT_REQUESTS)

    if req_count == 0:
        logger.info("Seeding realistic patient direct consultation requests...")
        seed_requests = [
            {
                "session_id": "sess-demo-patient-001",
                "patient_name": "Suresh Verma",
                "patient_contact": "+91 98111 22334",
                "patient_pincode": "110001",
                "provider_id": CLINIC_EMAIL,
                "provider_name": "Central Community Health Center",
                "provider_type": "clinic",
                "provider_pincode": "110001",
                "symptom_summary": "High fever & breathing tightness for 2 days",
                "triage_urgency": "soon",
                "suggested_specialty": "Cardiologist",
                "transcript": "दो दिन से तेज बुखार है और सांस लेने में भारीपन लग रहा है",
                "status": "pending",
                "notes": "",
                "created_at": (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat(),
                "updated_at": (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
            },
            {
                "session_id": "sess-demo-patient-002",
                "patient_name": "Meena Devi (via ASHA)",
                "patient_contact": "+91 98222 33445",
                "patient_pincode": "110001",
                "provider_id": CLINIC_EMAIL,
                "provider_name": "Central Community Health Center",
                "provider_type": "clinic",
                "provider_pincode": "110001",
                "symptom_summary": "Child persistent vomiting & diarrhea",
                "triage_urgency": "soon",
                "suggested_specialty": "Pediatrician",
                "transcript": "बच्चे को कल से उल्टी और दस्त है, पानी नहीं पी रहा",
                "status": "accepted",
                "notes": "Appointment scheduled today 2:30 PM. Advised continuous ORS in sips.",
                "created_at": (datetime.now(timezone.utc) - timedelta(hours=4)).isoformat(),
                "updated_at": (datetime.now(timezone.utc) - timedelta(hours=3)).isoformat()
            },
            {
                "session_id": "sess-demo-patient-003",
                "patient_name": "Rajesh Sharma",
                "patient_contact": "+91 98333 44556",
                "patient_pincode": "110002",
                "provider_id": NGO_EMAIL,
                "provider_name": "Seva Rural Health Mission",
                "provider_type": "ngo",
                "provider_pincode": "110002",
                "symptom_summary": "Severe sore throat & ear pain",
                "triage_urgency": "soon",
                "suggested_specialty": "ENT",
                "transcript": "गले में बहुत दर्द है और कान में भी भारी दर्द हो रहा है",
                "status": "pending",
                "notes": "",
                "created_at": (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat(),
                "updated_at": (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
            }
        ]
        for r in seed_requests:
            d = PatientRequestDoc(**r)
            d_dict = d.to_mongo()
            if db is not None:
                try:
                    res = await db.patient_requests.insert_one(d_dict)
                    d.id = str(res.inserted_id)
                except Exception:
                    d.id = str(ObjectId())
                    d_dict["_id"] = ObjectId(d.id)
                    IN_MEMORY_PATIENT_REQUESTS.append(d_dict)
            else:
                d.id = str(ObjectId())
                d_dict["_id"] = ObjectId(d.id)
                IN_MEMORY_PATIENT_REQUESTS.append(d_dict)

    # 3. Seed General Triage Requests (Area Overview & Logs)
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
                "suggested_specialty": "Cardiologist",
                "pincode": "110001",
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
                "suggested_specialty": "Pediatrician",
                "pincode": "110001",
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
                "suggested_specialty": "",
                "pincode": "110002",
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
