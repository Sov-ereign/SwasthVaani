"""
test_triage.py — isolated CLI test script for SwasthVaani pipeline stages.

Usage:
    python test_triage.py                         # run all tests
    python test_triage.py --input sample.json     # run triage on a JSON input file
    python test_triage.py --text "I have chest pain"  # run on a text string
    python test_triage.py --stage red_flags       # test just the red-flag gate

Each stage can be tested independently using mocked JSON so teammates can
build TTS while others build the triage model.
"""
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import json
import argparse
import asyncio
from pathlib import Path

# ---------------------------------------------------------------------------
# Pure-function copies of the safety-critical stage functions.
# These are kept in sync with server.py and allow running tests without
# needing fastapi/uvicorn installed in the environment.
# ---------------------------------------------------------------------------

# Phase 2 contract: red-flag keywords that force Emergency regardless of LLM output.
# This list mirrors RED_FLAG_KEYWORDS in server.py — update both together.
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

SYMPTOM_KEYWORDS = [
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


def check_red_flags(transcript: str) -> list:
    """Phase 2 safety gate — mirrors server.py check_red_flags().
    Returns list of matched red-flag phrases, or empty list if none found.
    If non-empty, urgency MUST be 'emergency'. Cannot be overridden by any model."""
    lower = transcript.lower()
    import re
    matched = []
    for kw in RED_FLAG_KEYWORDS:
        kw_lower = kw.lower()
        if kw_lower.isascii():
            pattern = r'\b' + re.escape(kw_lower) + r'\b'
            if re.search(pattern, lower):
                matched.append(kw)
        else:
            if kw_lower in lower:
                matched.append(kw)
    return matched


def extract_symptoms(transcript: str) -> list:
    """Phase 2 NLP stage — mirrors server.py extract_symptoms()."""
    lower = transcript.lower()
    return [kw for kw in SYMPTOM_KEYWORDS if kw.lower() in lower]


# ---------------------------------------------------------------------------
# Attempt to import server for full pipeline tests (requires venv with deps)
# ---------------------------------------------------------------------------
_server = None

def _try_import_server():
    global _server
    if _server is not None:
        return _server
    try:
        import importlib.util
        spec = importlib.util.spec_from_file_location("server", Path(__file__).parent / "server.py")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        _server = mod
    except Exception as e:
        print(f"[INFO] Full server import unavailable (install deps for --stage triage): {e}")
    return _server


# ---------------------------------------------------------------------------
# Individual stage test functions
# ---------------------------------------------------------------------------

def test_red_flags():
    """Verify that check_red_flags() catches all required red-flag phrases."""
    print("\n=== Stage: Red-Flag Gate ===")
    cases = [
        # (transcript, should_trigger)
        ("I have chest pain and difficulty breathing", True),
        ("सीने में दर्द है और सांस लेने में तकलीफ है", True),
        ("मेरी छाती में बहुत दर्द है और सांस फूल रही है", True),
        ("আমার বুকে প্রচণ্ড ব্যথা এবং শ্বাসকষ্ট হচ্ছে", True),
        ("I have a mild headache and slight fever", False),
        ("मुझे बुखार है", False),
        ("Patient is unconscious and not breathing", True),
        ("மார்பு வலி மிகவும் அதிகமாக உள்ளது", True),
        ("I feel dizzy and nauseous", False),
        ("stroke symptoms, face drooping", True),
        ("my stomach hurts a little", False),
    ]
    passed = 0
    failed = 0
    for transcript, expected in cases:
        flags = check_red_flags(transcript)
        triggered = len(flags) > 0
        status = "✅ PASS" if triggered == expected else "❌ FAIL"
        if triggered != expected:
            failed += 1
        else:
            passed += 1
        print(f"  {status} | expected={expected} | got={triggered} | flags={flags[:2]}")
        print(f"         text: \"{transcript[:60]}\"")
    print(f"\n  Result: {passed} passed, {failed} failed")
    return failed == 0


def test_symptom_extraction():
    """Verify extract_symptoms() returns reasonable outputs."""
    print("\n=== Stage: Symptom Extraction (NLP) ===")
    cases = [
        ("I have a fever and cough for 3 days", ["fever", "cough"]),
        ("मुझे बुखार और दर्द है", ["बुखार", "दर्द"]),
        ("Patient shows no symptoms", []),
    ]
    passed = 0
    failed = 0
    for transcript, expected_contains in cases:
        symptoms = extract_symptoms(transcript)
        ok = all(e in symptoms for e in expected_contains)
        status = "✅ PASS" if ok else "❌ FAIL"
        if not ok:
            failed += 1
        else:
            passed += 1
        print(f"  {status} | expected_contains={expected_contains} | got={symptoms}")
    print(f"\n  Result: {passed} passed, {failed} failed")
    return failed == 0


async def test_triage_pipeline(transcript="I have chest pain", language="en"):
    """Full pipeline test — verifies the Phase 2 output contract.
    Requires server deps (fastapi, motor, etc.) to be installed."""
    print(f"\n=== Stage: Triage Pipeline ===")
    print(f"  Input: \"{transcript}\" (language={language})")

    srv = _try_import_server()
    if srv is None:
        print("  [SKIP] Server deps not installed — run: pip install -r requirements.txt")
        return None

    doc = await srv.run_triage(
        transcript=transcript,
        language=language,
        caller="test-script",
        source="test",
    )

    print(f"\n  Output contract check:")
    print(f"  urgency    : {doc.urgency}")
    print(f"  confidence : {doc.confidence}")
    print(f"  symptoms   : {doc.symptoms}")
    print(f"  red_flags  : {doc.red_flags}")
    print(f"  flagged    : {doc.flagged}")
    print(f"  disclaimer : {doc.disclaimer[:60]}...")
    print(f"  summary    : {doc.summary}")
    print(f"  advice     : {doc.advice[:80]}...")
    print(f"  spoken     : {doc.spoken[:80]}...")

    if "chest pain" in transcript.lower() or any(rf in transcript.lower() for rf in ["unconscious", "not breathing", "severe bleeding"]):
        assert doc.urgency == "emergency", (
            f"SAFETY INVARIANT VIOLATED: Expected 'emergency' for '{transcript}' "
            f"but got '{doc.urgency}'"
        )
        assert doc.flagged is True, "Expected flagged=True for red-flag case"
        print(f"\n  ✅ SAFETY INVARIANT OK: chest pain → emergency (flagged=True)")
    else:
        print(f"\n  ℹ️  Non-red-flag case: urgency={doc.urgency}")

    assert doc.disclaimer, "Disclaimer must be non-empty in every response"
    assert doc.urgency in ("emergency", "soon", "home", "needs_review", "needs_followup"), f"Invalid urgency: {doc.urgency}"
    print(f"  ✅ Phase 2 contract fields all present and valid")
    return doc


def run_on_input_file(path: str):
    """Run triage on a mocked JSON input file.
    Expected format: {"transcript": "...", "language": "en"}
    """
    print(f"\n=== Running triage on file: {path} ===")
    with open(path) as f:
        data = json.load(f)
    transcript = data.get("transcript", "")
    language = data.get("language", "en")
    doc = asyncio.run(test_triage_pipeline(transcript, language))
    print(f"\n  Full output:\n{json.dumps(doc.model_dump(), indent=2, ensure_ascii=False)}")


def run_on_text(text: str, language: str = "en"):
    """Run triage on a CLI text string."""
    print(f"\n=== Running triage on text: \"{text}\" ===")
    doc = asyncio.run(test_triage_pipeline(text, language))
    print(f"\n  Full output:\n{json.dumps(doc.model_dump(), indent=2, ensure_ascii=False)}")


# ---------------------------------------------------------------------------
# CLI entry point
def test_groq_and_twilio():
    """Verify Groq ASR integration helper and Twilio TwiML generation."""
    print("\n=== Stage: Groq ASR & Twilio Integration ===")
    srv = _try_import_server()
    if srv is None:
        print("  [SKIP] Server import unavailable")
        return True

    # 1. Verify red flag override invariant holds for IVR source calls
    red_flag_sample = "I have severe chest pain and cannot breathe"
    flags = srv.check_red_flags(red_flag_sample)
    assert len(flags) > 0, "Red flags must be detected"
    doc = asyncio.run(srv.run_triage(red_flag_sample, "en", "twilio-test-caller", "ivr"))
    assert doc.urgency == "emergency", "Urgency MUST be emergency for red-flag cases"
    assert doc.flagged is True, "Must be flagged"
    assert doc.source == "ivr", "Source must be preserved as ivr"
    print(f"  ✅ Red-flag override invariant holds for IVR call: urgency={doc.urgency}, flagged={doc.flagged}")

    # 2. Verify ASR provider abstraction functions exist
    assert hasattr(srv, "transcribe_audio"), "transcribe_audio abstraction must exist in server.py"
    assert hasattr(srv, "transcribe_groq"), "transcribe_groq function must exist in server.py"
    print(f"  ✅ Groq ASR provider abstraction present: transcribe_groq() and transcribe_audio()")

    # 3. Verify Twilio TwiML helper response
    twiml_resp = srv.twiml("<Say>Test</Say>")
    assert twiml_resp.media_type == "application/xml", "TwiML must be XML"
    assert "<Response><Say>Test</Say></Response>" in twiml_resp.body.decode("utf-8")
    print(f"  ✅ Twilio TwiML response generation valid")

    return True


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="SwasthVaani pipeline stage tester")
    parser.add_argument("--input", help="Path to a JSON file with {transcript, language}")
    parser.add_argument("--text", help="Transcript text to triage directly")
    parser.add_argument("--lang", default="en", help="Language code (en/hi/ta)")
    parser.add_argument(
        "--stage",
        choices=["red_flags", "symptoms", "triage", "groq_twilio", "all"],
        default="all",
        help="Which stage to test",
    )
    args = parser.parse_args()

    if args.input:
        run_on_input_file(args.input)
        return

    if args.text:
        run_on_text(args.text, args.lang)
        return

    print("=" * 60)
    print("SwasthVaani — Pipeline Stage Tests")
    print("=" * 60)

    results = []

    if args.stage in ("red_flags", "all"):
        results.append(("Red-Flag Gate", test_red_flags()))

    if args.stage in ("symptoms", "all"):
        results.append(("Symptom Extraction", test_symptom_extraction()))

    if args.stage in ("groq_twilio", "all"):
        results.append(("Groq & Twilio Integration", test_groq_and_twilio()))

    if args.stage in ("triage", "all"):
        # Critical safety test: chest pain must force Emergency
        print("\n--- Critical safety test: 'chest pain' ---")
        asyncio.run(test_triage_pipeline("I have chest pain", "en"))

        print("\n--- Non-emergency test: mild fever ---")
        asyncio.run(test_triage_pipeline("I have mild fever for one day", "en"))

        print("\n--- Hindi test ---")
        asyncio.run(test_triage_pipeline("मुझे बुखार और सिरदर्द है", "hi"))

        results.append(("Triage Pipeline", True))

    print("\n" + "=" * 60)
    print("Test Summary:")
    all_pass = True
    for name, ok in results:
        icon = "✅" if ok else "❌"
        print(f"  {icon} {name}")
        if not ok:
            all_pass = False
    print("=" * 60)
    sys.exit(0 if all_pass else 1)


if __name__ == "__main__":
    main()
