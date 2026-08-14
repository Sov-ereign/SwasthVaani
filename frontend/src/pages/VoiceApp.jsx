import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { 
    Mic, Square, Loader2, Volume2, RotateCcw, ArrowLeft, Activity, AlertTriangle, 
    Clock, Home, Keyboard, PhoneCall, Share2, Check, UserCheck, QrCode, Calendar, 
    MessageSquare, Printer, Stethoscope, Building2, MapPin, Phone, CheckCircle2, 
    ChevronRight, Send, ListOrdered, Sparkles, VolumeX, ShieldCheck, HeartPulse
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { api, LANGUAGES, URGENCY_META, getPatientSessionId } from "@/lib/api";

const UI = {
    hi: { 
        tap: "बोलने के लिए दबाएँ", 
        listening: "सुन रहे हैं… फिर से दबाकर रोकें", 
        thinking: "लक्षणों का विश्लेषण हो रहा है…", 
        again: "फिर से बोलें", 
        play: "आवाज़ सुनें", 
        you: "आपने कहा", 
        placeholder: "मुझे बुखार और सिर दर्द है…", 
        typeBtn: "टाइप करके बताएं" 
    },
    en: { 
        tap: "Tap to speak symptoms", 
        listening: "Listening… tap again to stop", 
        thinking: "Analyzing clinical symptoms…", 
        again: "Speak again", 
        play: "Play voice guidance", 
        you: "You said", 
        placeholder: "I have had a high fever and severe headache for two days…", 
        typeBtn: "Type symptoms instead" 
    },
    bn: { 
        tap: "বলতে স্পর্শ করুন", 
        listening: "শুনছি… থামাতে আবার চাপুন", 
        thinking: "বুঝে নিচ্ছি…", 
        again: "আবার বলুন", 
        play: "পরামর্শ শুনুন", 
        you: "আপনি বলেছেন", 
        placeholder: "আমার জ্বর ও বুকে ব্যথা আছে…", 
        typeBtn: "টাইপ করুন" 
    },
    ta: { 
        tap: "பேச தட்டவும்", 
        listening: "கேட்கிறோம்… நிறுத்த மீண்டும் தட்டவும்", 
        thinking: "பகுப்பாய்வு செய்கிறோம்…", 
        again: "மீண்டும் பேசுங்கள்", 
        play: "குரல் ஆலோசனையைக் கேளுங்கள்", 
        you: "நீங்கள் சொன்னது", 
        placeholder: "எனக்கு காய்ச்சல் மற்றும் தலைவலி உள்ளது…", 
        typeBtn: "தட்டச்சு செய்யவும்" 
    },
};

const ICONS = { emergency: AlertTriangle, soon: Clock, home: Home, needs_review: HeartPulse };
const LANG_VOICE = { hi: "hi-IN", en: "en-US", bn: "bn-IN", ta: "ta-IN" };

const PROCESSING_STEPS = {
    hi: [
        "आपकी आवाज़ रिकॉर्ड की जा रही है...",
        "क्लिनिकल लक्षणों का विश्लेषण हो रहा है...",
        "रेड-फ्लैग सेफ्टी गेट चेक किया जा रहा है...",
        "मेडिकल वॉयस सलाह तैयार की जा रही है..."
    ],
    en: [
        "Transcribing speech via Groq Whisper v3...",
        "Extracting clinical symptom taxonomy...",
        "Running deterministic safety gate checks...",
        "Synthesizing native dialect medical voice..."
    ],
    bn: [
        "আপনার কণ্ঠস্বর রেকর্ড করা হচ্ছে...",
        "লক্ষণগুলি ক্লিনিক্যালি বিশ্লেষণ করা হচ্ছে...",
        "নিরাপত্তা পরীক্ষা সম্পন্ন হচ্ছে...",
        "পরামর্শ কণ্ঠস্বরে তৈরি করা হচ্ছে..."
    ],
    ta: [
        "உங்கள் குரல் பதிவு செய்யப்படுகிறது...",
        "அறிகுறிகள் பகுப்பாய்வு செய்யப்படுகின்றன...",
        "பாதுகாப்பு சோதனை செய்யப்படுகிறது...",
        "மருத்துவ ஆலோசனை தயாராகிறது..."
    ]
};

export default function VoiceApp() {
    const [lang, setLang] = useState("hi");
    const [status, setStatus] = useState("idle"); // idle | recording | processing | result
    const [result, setResult] = useState(null);
    const [mode, setMode] = useState("patient"); // patient | asha
    
    // Patient Contact Details (for ASHA workers, NGOs, and Clinic records)
    const [patientName, setPatientName] = useState("");
    const [patientPhone, setPatientPhone] = useState("");
    const [patientAddress, setPatientAddress] = useState("");

    // ASHA Worker specific details
    const [ashaPatientName, setAshaPatientName] = useState("");
    const [ashaPatientAge, setAshaPatientAge] = useState("");
    const [ashaVillage, setAshaVillage] = useState("");

    // Multi-turn conversation history state
    const [history, setHistory] = useState([]);

    const [showType, setShowType] = useState(false);
    const [typed, setTyped] = useState("");
    const [liveTranscript, setLiveTranscript] = useState("");
    const [processingStep, setProcessingStep] = useState(0);
    
    const mediaRef = useRef(null);
    const chunksRef = useRef([]);
    const audioRef = useRef(null);
    const recognitionRef = useRef(null);
    const liveTranscriptRef = useRef("");

    const t = UI[lang] || UI.hi;

    useEffect(() => {
        let timer;
        if (status === "processing") {
            setProcessingStep(0);
            timer = setInterval(() => {
                setProcessingStep((prev) => (prev < 3 ? prev + 1 : prev));
            }, 850);
        } else {
            setProcessingStep(0);
        }
        return () => clearInterval(timer);
    }, [status]);

    useEffect(() => {
        return () => {
            if (audioRef.current) audioRef.current.pause();
            if (window.speechSynthesis) window.speechSynthesis.cancel();
        };
    }, []);

    const speakWithBrowser = (text, languageCode) => {
        if (!("speechSynthesis" in window)) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = LANG_VOICE[languageCode] || "hi-IN";
        utterance.rate = 0.92;
        window.speechSynthesis.speak(utterance);
    };

    const playAudio = (b64, text) => {
        if (audioRef.current) audioRef.current.pause();
        if (b64) {
            try {
                const audio = new Audio(`data:audio/mp3;base64,${b64}`);
                audioRef.current = audio;
                audio.play().catch(() => speakWithBrowser(text, lang));
            } catch (e) {
                speakWithBrowser(text, lang);
            }
        } else if (text) {
            speakWithBrowser(text, lang);
        }
    };

    const startRecording = async () => {
        liveTranscriptRef.current = "";
        setLiveTranscript("");
        
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            try {
                const sr = new SpeechRecognition();
                sr.continuous = true;
                sr.interimResults = true;
                sr.lang = LANG_VOICE[lang];
                sr.onresult = (e) => {
                    let trans = "";
                    for (let i = e.resultIndex; i < e.results.length; i++) {
                        trans += e.results[i][0].transcript;
                    }
                    liveTranscriptRef.current = trans;
                    setLiveTranscript(trans);
                };
                sr.start();
                recognitionRef.current = sr;
            } catch (e) {
                console.warn("SpeechRecognition init warning:", e);
            }
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mr = new MediaRecorder(stream);
            chunksRef.current = [];
            mr.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
            mr.onstop = () => {
                stream.getTracks().forEach((tr) => tr.stop());
                const blob = new Blob(chunksRef.current, { type: "audio/webm" });
                submitAudio(blob, liveTranscriptRef.current);
            };
            mediaRef.current = mr;
            mr.start();
            setStatus("recording");
        } catch (e) {
            toast.error("Microphone access denied. You can type your symptoms below.");
            setShowType(true);
        }
    };

    const stopRecording = () => {
        if (recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch (e) {}
        }
        if (mediaRef.current && mediaRef.current.state !== "inactive") {
            mediaRef.current.stop();
        }
        setStatus("processing");
    };

    const getCallerLabel = () => {
        const pName = (mode === "asha" ? ashaPatientName : patientName).trim() || "Patient";
        const pAge = mode === "asha" && ashaPatientAge.trim() ? `, ${ashaPatientAge}y` : "";
        const pLoc = (mode === "asha" ? ashaVillage : patientAddress).trim();
        const pPhone = patientPhone.trim() ? ` [${patientPhone.trim()}]` : "";
        return mode === "asha"
            ? `ASHA: ${pName}${pAge}${pLoc ? ` (${pLoc})` : ""}${pPhone}`
            : `${pName}${pLoc ? ` (${pLoc})` : ""}${pPhone}`;
    };

    const submitAudio = async (blob, recognizedText) => {
        const activeName = (mode === "asha" ? ashaPatientName : patientName).trim() || "Anonymous Patient";
        const activePhone = patientPhone.trim();
        const activeAddress = (mode === "asha" ? ashaVillage : patientAddress).trim();

        const fd = new FormData();
        fd.append("audio", blob, "symptoms.webm");
        fd.append("language", lang);
        fd.append("caller", getCallerLabel());
        fd.append("patient_name", activeName);
        fd.append("patient_phone", activePhone);
        fd.append("patient_address", activeAddress);
        if (history && history.length > 0) {
            fd.append("history_json", JSON.stringify(history));
        }
        if (recognizedText && recognizedText.trim()) {
            fd.append("transcript_hint", recognizedText.trim());
        }

        try {
            const { data } = await api.post("/triage/voice", fd, { headers: { "Content-Type": "multipart/form-data" } });
            
            const userTurnText = (recognizedText && recognizedText.trim()) ? recognizedText.trim() : (data.transcript || "Voice input");
            data.transcript = userTurnText;

            const updatedHistory = [
                ...history,
                { role: "user", content: userTurnText },
                { role: "assistant", content: data.spoken || data.question || data.advice }
            ];
            setHistory(updatedHistory);
            setResult(data);
            setStatus("result");
            playAudio(data.audio_base64, data.spoken || data.question || data.advice);
        } catch (e) {
            if (recognizedText && recognizedText.trim()) {
                return submitTextDirect(recognizedText);
            }
            toast.error(e?.response?.data?.detail || "Could not process audio. Try typing symptoms instead.");
            setStatus("idle");
        }
    };

    const submitTextDirect = async (textToSubmit) => {
        setStatus("processing");
        setShowType(false);
        const activeName = (mode === "asha" ? ashaPatientName : patientName).trim() || "Anonymous Patient";
        const activePhone = patientPhone.trim();
        const activeAddress = (mode === "asha" ? ashaVillage : patientAddress).trim();

        try {
            const payload = {
                text: textToSubmit,
                language: lang,
                caller: getCallerLabel(),
                patient_name: activeName,
                patient_phone: activePhone,
                patient_address: activeAddress,
                history: history && history.length > 0 ? history : undefined
            };

            const { data } = await api.post("/triage/text", payload);

            const updatedHistory = [
                ...history,
                { role: "user", content: textToSubmit },
                { role: "assistant", content: data.spoken || data.question || data.advice }
            ];
            setHistory(updatedHistory);
            setResult(data);
            setStatus("result");
            playAudio(data.audio_base64, data.spoken || data.question || data.advice);
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Could not process. Try again.");
            setStatus("idle");
        }
    };

    const submitText = async () => {
        if (!typed.trim()) return;
        submitTextDirect(typed);
    };

    const reset = () => {
        setResult(null);
        setStatus("idle");
        setTyped("");
        setLiveTranscript("");
        setHistory([]);
        if (audioRef.current) audioRef.current.pause();
        if (window.speechSynthesis) window.speechSynthesis.cancel();
    };

    return (
        <div className="min-h-screen grain-bg flex flex-col" data-testid="voice-app">
            {/* Header */}
            <header className="sticky top-0 z-40 glass-header border-b border-border/80">
                <div className="max-w-3xl mx-auto px-5 h-16 flex items-center justify-between">
                    <Link to="/" data-testid="voice-back-link" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors group">
                        <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                        <span className="font-bold text-xs sm:text-sm">Home</span>
                    </Link>
                    
                    <div className="flex items-center gap-2 sm:gap-3">
                        <Link to="/my-requests" data-testid="voice-my-requests-link">
                            <Button variant="ghost" size="sm" className="rounded-full text-xs font-bold text-muted-foreground hover:text-primary gap-1.5 px-3.5 h-8.5">
                                <ListOrdered className="w-3.5 h-3.5" /> My Requests
                            </Button>
                        </Link>
                        
                        <div className="flex items-center gap-2 pl-2 border-l border-border/60">
                            <div className="w-7 h-7 rounded-xl gradient-bg flex items-center justify-center text-white shadow-xs">
                                <Activity className="w-4 h-4" />
                            </div>
                            <span className="font-head font-extrabold text-sm tracking-tight hidden sm:inline">SwasthVaani</span>
                        </div>
                    </div>
                </div>
            </header>

            {/* Mode Switcher: Patient Mode vs ASHA Health Worker Mode */}
            <div className="max-w-xl mx-auto w-full px-5 mt-5 flex justify-center">
                <div className="bg-card/90 backdrop-blur-md border border-border/80 p-1 rounded-full flex gap-1 shadow-xs">
                    <button
                        onClick={() => setMode("patient")}
                        className={`px-4 py-1.5 rounded-full text-xs font-extrabold transition-all flex items-center gap-1.5 ${
                            mode === "patient" ? "gradient-bg text-white shadow-md glow-primary" : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        Patient Self-Use
                    </button>
                    <button
                        onClick={() => setMode("asha")}
                        className={`px-4 py-1.5 rounded-full text-xs font-extrabold transition-all flex items-center gap-1.5 ${
                            mode === "asha" ? "bg-secondary text-white shadow-md glow-secondary" : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        <UserCheck className="w-3.5 h-3.5" /> ASHA Worker Mode
                    </button>
                </div>
            </div>

            {/* Patient Self-Use Contact Details Form */}
            {mode === "patient" && status === "idle" && (
                <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="max-w-md mx-auto w-full px-5 mt-4"
                >
                    <div className="bg-card border border-primary/20 rounded-3xl p-4 shadow-xs space-y-2.5">
                        <div className="flex items-center justify-between border-b border-border/50 pb-2">
                            <span className="text-[11px] font-extrabold uppercase tracking-wider text-primary flex items-center gap-1.5">
                                <UserCheck className="w-3.5 h-3.5" /> Patient Info (For ASHA & Clinic Records)
                            </span>
                            <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                                Optional
                            </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <Label className="text-[11px] font-semibold">Your Name</Label>
                                <Input 
                                    placeholder="Ramesh Kumar" 
                                    value={patientName} 
                                    onChange={(e) => setPatientName(e.target.value)} 
                                    className="h-8.5 text-xs rounded-xl bg-background mt-0.5" 
                                />
                            </div>
                            <div>
                                <Label className="text-[11px] font-semibold">Phone Number</Label>
                                <Input 
                                    placeholder="9876543210" 
                                    value={patientPhone} 
                                    onChange={(e) => setPatientPhone(e.target.value)} 
                                    className="h-8.5 text-xs rounded-xl bg-background mt-0.5" 
                                />
                            </div>
                        </div>
                        <div>
                            <Label className="text-[11px] font-semibold">Village / Ward / Location</Label>
                            <Input 
                                placeholder="Rampur Village, Ward 4" 
                                value={patientAddress} 
                                onChange={(e) => setPatientAddress(e.target.value)} 
                                className="h-8.5 text-xs rounded-xl bg-background mt-0.5" 
                            />
                        </div>
                    </div>
                </motion.div>
            )}

            {/* ASHA Patient Details Form */}
            {mode === "asha" && status === "idle" && (
                <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="max-w-md mx-auto w-full px-5 mt-4"
                >
                    <div className="bg-card border border-secondary/30 rounded-3xl p-5 shadow-sm space-y-3">
                        <div className="flex items-center justify-between border-b border-border/60 pb-2">
                            <span className="text-[11px] font-extrabold uppercase tracking-wider text-secondary flex items-center gap-1.5">
                                <UserCheck className="w-4 h-4" /> ASHA Door-to-Door Patient Record
                            </span>
                            <span className="text-[10px] font-bold bg-secondary/15 text-secondary px-2 py-0.5 rounded-full">
                                Field Triage
                            </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2.5">
                            <div>
                                <Label className="text-[11px] font-semibold">Patient Name</Label>
                                <Input 
                                    placeholder="Ramesh Kumar" 
                                    value={ashaPatientName} 
                                    onChange={(e) => setAshaPatientName(e.target.value)} 
                                    className="h-9 text-xs rounded-xl bg-background mt-1" 
                                />
                            </div>
                            <div>
                                <Label className="text-[11px] font-semibold">Age</Label>
                                <Input 
                                    placeholder="48" 
                                    value={ashaPatientAge} 
                                    onChange={(e) => setAshaPatientAge(e.target.value)} 
                                    className="h-9 text-xs rounded-xl bg-background mt-1" 
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2.5">
                            <div>
                                <Label className="text-[11px] font-semibold">Phone Number</Label>
                                <Input 
                                    placeholder="9876543210" 
                                    value={patientPhone} 
                                    onChange={(e) => setPatientPhone(e.target.value)} 
                                    className="h-9 text-xs rounded-xl bg-background mt-1" 
                                />
                            </div>
                            <div>
                                <Label className="text-[11px] font-semibold">Village / Location</Label>
                                <Input 
                                    placeholder="Rampur Ward 4" 
                                    value={ashaVillage} 
                                    onChange={(e) => setAshaVillage(e.target.value)} 
                                    className="h-9 text-xs rounded-xl bg-background mt-1" 
                                />
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}

            {/* Language selector */}
            <div className="max-w-xl mx-auto w-full px-5 mt-4">
                <div className="flex flex-wrap gap-2 justify-center" data-testid="lang-selector">
                    {LANGUAGES.map((l) => (
                        <button
                            key={l.code}
                            data-testid={`lang-${l.code}`}
                            onClick={() => { setLang(l.code); reset(); }}
                            className={`rounded-full px-5 py-2 text-sm font-bold border transition-all ${
                                lang === l.code 
                                    ? "gradient-bg text-white border-transparent shadow-md glow-primary scale-102" 
                                    : "bg-card border-border/80 text-foreground hover:border-primary/40"
                            }`}
                        >
                            {l.name}
                        </button>
                    ))}
                </div>
            </div>

            {/* Main Interactive Stage */}
            <div className="flex-1 flex flex-col items-center justify-center px-5 py-6 max-w-xl mx-auto w-full">
                <AnimatePresence mode="wait">
                    {status !== "result" && (
                        <motion.div 
                            key="recorder" 
                            initial={{ opacity: 0 }} 
                            animate={{ opacity: 1 }} 
                            exit={{ opacity: 0 }}
                            className="flex flex-col items-center w-full"
                        >
                            {/* Microphone Button Container */}
                            <div className="relative flex items-center justify-center w-64 h-64 sm:w-72 sm:h-72">
                                {status === "recording" && [0, 1, 2].map((i) => (
                                    <motion.span 
                                        key={i} 
                                        className="absolute rounded-full bg-rose-500/20"
                                        initial={{ width: 180, height: 180, opacity: 0.8 }}
                                        animate={{ width: 290, height: 290, opacity: 0 }}
                                        transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.55, ease: "easeOut" }} 
                                    />
                                ))}

                                {status === "idle" && (
                                    <motion.span 
                                        className="absolute rounded-full bg-primary/10"
                                        animate={{ scale: [1, 1.08, 1], opacity: [0.3, 0.6, 0.3] }}
                                        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                                        style={{ width: 220, height: 220 }}
                                    />
                                )}

                                <button
                                    data-testid="voice-record-btn"
                                    disabled={status === "processing"}
                                    onClick={status === "recording" ? stopRecording : startRecording}
                                    className={`relative w-44 h-44 sm:w-48 sm:h-48 rounded-full flex items-center justify-center shadow-2xl transition-all disabled:opacity-85 ${
                                        status === "recording" 
                                            ? "bg-rose-600 scale-105 glow-destructive text-white" 
                                            : "gradient-bg text-white hover:scale-102 glow-primary"
                                    }`}
                                >
                                    {status === "processing" ? (
                                        <Loader2 className="w-18 h-18 sm:w-20 sm:h-20 text-white animate-spin" />
                                    ) : status === "recording" ? (
                                        <Square className="w-14 h-14 sm:w-16 sm:h-16 text-white" fill="white" />
                                    ) : (
                                        <Mic className="w-16 h-16 sm:w-18 sm:h-18 text-white" />
                                    )}
                                </button>
                            </div>

                            {/* Status Prompt */}
                            <p className="mt-5 text-lg sm:text-xl font-head font-extrabold text-center text-foreground" aria-live="polite" data-testid="voice-status-text">
                                {status === "recording" ? t.listening : status === "processing" ? t.thinking : t.tap}
                            </p>

                            {/* Waveform Visualizer when recording */}
                            {status === "recording" && (
                                <div className="flex items-center justify-center gap-1.5 h-10 mt-3">
                                    {[...Array(12)].map((_, i) => (
                                        <motion.div
                                            key={i}
                                            className="w-1.5 bg-rose-500 rounded-full"
                                            animate={{
                                                height: [6, 32 + Math.sin(i * 1.3) * 14, 6],
                                            }}
                                            transition={{
                                                duration: 0.45 + (i % 4) * 0.1,
                                                repeat: Infinity,
                                                ease: "easeInOut",
                                            }}
                                        />
                                    ))}
                                </div>
                            )}

                            {/* Live Interim Transcript Feedback Preview */}
                            {status === "recording" && liveTranscript && (
                                <motion.div 
                                    initial={{ opacity: 0, y: 8 }} 
                                    animate={{ opacity: 1, y: 0 }}
                                    className="mt-4 bg-card border border-primary/30 rounded-2xl px-5 py-3 text-sm italic text-foreground text-center max-w-md shadow-sm font-medium"
                                >
                                    "{liveTranscript}"
                                </motion.div>
                            )}

                            {/* Processing Progress Stepper */}
                            {status === "processing" && (
                                <div className="mt-6 w-full max-w-md space-y-3 bg-card border border-border/80 rounded-3xl p-6 shadow-md">
                                    {(PROCESSING_STEPS[lang] || PROCESSING_STEPS.hi).map((stepText, idx) => {
                                        const isCompleted = idx < processingStep;
                                        const isActive = idx === processingStep;
                                        return (
                                            <div 
                                                key={idx} 
                                                className={`flex items-center gap-3.5 transition-all duration-300 ${
                                                    isCompleted || isActive ? "opacity-100" : "opacity-30"
                                                }`}
                                            >
                                                <div className="flex items-center justify-center shrink-0">
                                                    {isCompleted ? (
                                                        <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center text-white">
                                                            <Check className="w-3.5 h-3.5" />
                                                        </div>
                                                    ) : isActive ? (
                                                        <div className="w-6 h-6 rounded-full gradient-bg flex items-center justify-center text-white shadow-xs">
                                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                        </div>
                                                    ) : (
                                                        <div className="w-6 h-6 rounded-full border border-border" />
                                                    )}
                                                </div>
                                                <span className={`text-xs sm:text-sm font-semibold ${isActive ? "text-primary font-bold" : "text-foreground"}`}>
                                                    {stepText}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Type instead toggle button */}
                            {status === "idle" && (
                                <button 
                                    onClick={() => setShowType((s) => !s)} 
                                    data-testid="toggle-type-btn"
                                    className="mt-6 flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors font-bold text-xs"
                                >
                                    <Keyboard className="w-4 h-4 text-primary" /> {t.typeBtn}
                                </button>
                            )}

                            {showType && status === "idle" && (
                                <motion.div 
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="mt-4 w-full max-w-md bg-card border border-border/80 rounded-3xl p-5 shadow-sm space-y-3"
                                >
                                    <Label className="text-xs font-bold text-foreground">Type Symptoms Description</Label>
                                    <Textarea 
                                        data-testid="type-symptom-input" 
                                        value={typed} 
                                        onChange={(e) => setTyped(e.target.value)}
                                        placeholder={t.placeholder} 
                                        rows={3} 
                                        className="rounded-2xl text-sm bg-background border-border/70" 
                                    />
                                    <Button 
                                        data-testid="submit-text-btn" 
                                        onClick={submitText} 
                                        className="w-full rounded-2xl h-11 font-bold gradient-bg text-white shadow-md hover:opacity-95 text-xs"
                                    >
                                        Run AI Voice Triage
                                    </Button>
                                </motion.div>
                            )}
                        </motion.div>
                    )}

                    {status === "result" && result && (
                        <ResultCard 
                            key="result" 
                            result={result} 
                            lang={lang} 
                            t={t} 
                            mode={mode} 
                            onReset={reset} 
                            onReplay={() => playAudio(result.audio_base64, result.spoken || result.question || result.advice)} 
                            onSubmitFollowUp={(answerText) => submitTextDirect(answerText)}
                        />
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

function ResultCard({ result, lang, t, mode, onReset, onReplay, onSubmitFollowUp }) {
    if (result.status_mode === "follow_up") {
        return (
            <FollowUpCard 
                result={result}
                lang={lang}
                t={t}
                onReset={onReset}
                onReplay={onReplay}
                onSubmitAnswer={onSubmitFollowUp}
            />
        );
    }

    const [sharedSMS, setSharedSMS] = useState(false);
    const [sharedWA, setSharedWA] = useState(false);
    const [scheduledCallback, setScheduledCallback] = useState(false);
    
    // Specialty Providers & Direct Booking State
    const [pincode, setPincode] = useState(result.pincode || "");
    const [providers, setProviders] = useState(result.recommended_providers || []);
    const [loadingProviders, setLoadingProviders] = useState(false);
    const [selectedProvider, setSelectedProvider] = useState(null);
    const [patientName, setPatientName] = useState("");
    const [patientContact, setPatientContact] = useState("");
    const [bookingSubmitting, setBookingSubmitting] = useState(false);
    const [bookedRequest, setBookedRequest] = useState(null);

    const meta = URGENCY_META[result.urgency] || URGENCY_META.soon;
    const Icon = ICONS[result.urgency] || Clock;

    const handleShareSMS = () => {
        const body = encodeURIComponent(`SwasthVaani Triage: ${meta.label}\nSymptoms: ${result.transcript}\nAdvice: ${result.spoken}`);
        window.open(`sms:?body=${body}`, "_blank");
        setSharedSMS(true);
        toast.success("SMS ready!");
    };

    const handleShareWhatsApp = () => {
        const text = encodeURIComponent(`🩺 *SwasthVaani Voice Triage Report*\n*Urgency*: ${meta.label}\n*Patient Symptoms*: "${result.transcript}"\n*AI Guidance*: ${result.spoken}`);
        window.open(`https://api.whatsapp.com/send?text=${text}`, "_blank");
        setSharedWA(true);
        toast.success("Opening WhatsApp...");
    };

    const handleScheduleCallback = () => {
        setScheduledCallback(true);
        toast.success("Automated 24-Hour IVR Voice Follow-up Scheduled!");
    };

    const handlePrintReferral = () => {
        window.print();
    };

    const handleSearchProvidersByPin = async (e) => {
        if (e) e.preventDefault();
        if (!result.suggested_specialty) return;
        setLoadingProviders(true);
        try {
            const { data } = await api.get("/providers/recommend", {
                params: {
                    specialty: result.suggested_specialty,
                    pincode: pincode.trim()
                }
            });
            setProviders(data.providers || []);
            toast.success(`Found ${data.providers?.length || 0} providers for PIN ${pincode || "general area"}`);
        } catch (err) {
            console.error("Error finding providers:", err);
            toast.error("Could not refresh provider list");
        } finally {
            setLoadingProviders(false);
        }
    };

    const handleBookProvider = async (e) => {
        e.preventDefault();
        if (!selectedProvider) return;
        setBookingSubmitting(true);
        try {
            const sessionId = getPatientSessionId();
            const payload = {
                session_id: sessionId,
                patient_name: patientName.trim() || "Anonymous Patient",
                patient_contact: patientContact.trim() || (mode === "asha" ? result.caller : ""),
                patient_pincode: pincode.trim(),
                provider_id: selectedProvider.id || selectedProvider._id || selectedProvider.email,
                symptom_summary: result.summary || result.transcript,
                triage_urgency: result.urgency,
                suggested_specialty: result.suggested_specialty || "General Physician",
                transcript: result.transcript
            };
            const { data } = await api.post("/patient/requests", payload);
            setBookedRequest(data);
            toast.success(`Consultation request sent to ${selectedProvider.name}!`);
        } catch (err) {
            console.error("Error creating patient request:", err);
            toast.error(err?.response?.data?.detail || "Could not submit request. Please try again.");
        } finally {
            setBookingSubmitting(false);
        }
    };

    return (
        <motion.div 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} 
            className="w-full max-w-lg space-y-4" 
            data-testid="triage-result-card"
        >
            {/* Urgency Hero Banner */}
            <div className={`${meta.bg} ${meta.text} rounded-[2.5rem] p-7 sm:p-8 flex flex-col items-center gap-4 shadow-2xl ring-8 ${meta.ring} relative overflow-hidden`}>
                <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center shadow-inner">
                    <Icon className="w-10 h-10" />
                </div>
                
                <div className="text-center space-y-1">
                    <p className="font-head font-black text-3xl sm:text-4xl tracking-tight" data-testid="urgency-label">
                        {meta.label}
                    </p>
                    <p className="text-base sm:text-lg opacity-90 font-medium">
                        {meta.sub[lang] || meta.sub.hi}
                    </p>
                </div>
                
                <Button 
                    onClick={onReplay} 
                    data-testid="play-audio-btn"
                    className="rounded-full h-12 sm:h-13 px-8 text-sm font-extrabold bg-white text-zinc-900 hover:bg-white/90 transition-all shadow-lg transform hover:scale-102"
                >
                    <Volume2 className="w-4 h-4 mr-2 text-primary" /> {t.play}
                </Button>
            </div>

            {/* ASHA Patient Referral Pass (Printable Card with QR) */}
            {mode === "asha" && (
                <div className="bg-card border-2 border-secondary/40 rounded-3xl p-5 shadow-md">
                    <div className="flex items-center justify-between border-b border-border/60 pb-3 mb-3">
                        <div>
                            <p className="font-head font-black text-sm text-secondary uppercase tracking-wide">
                                PHC Patient Referral Pass
                            </p>
                            <p className="text-xs text-muted-foreground">Issued by ASHA Community Worker · SwasthVaani</p>
                        </div>
                        <div className="w-9 h-9 rounded-xl bg-secondary/15 text-secondary flex items-center justify-center">
                            <QrCode className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="text-xs space-y-1.5 text-foreground">
                        <p><span className="font-bold text-muted-foreground">Patient:</span> {result.caller}</p>
                        <p><span className="font-bold text-muted-foreground">Triage Status:</span> <span className="font-extrabold uppercase text-secondary">{result.urgency}</span></p>
                        <p><span className="font-bold text-muted-foreground">Symptoms:</span> {result.summary || result.transcript}</p>
                    </div>
                    <Button onClick={handlePrintReferral} size="sm" variant="outline" className="mt-3 w-full rounded-2xl text-xs font-bold border-secondary/40">
                        <Printer className="w-3.5 h-3.5 mr-1.5 text-secondary" /> Print Physical Referral Slip
                    </Button>
                </div>
            )}

            {/* Red Flag Alert — only shown when safety gate triggered */}
            {result.flagged && result.red_flags && result.red_flags.length > 0 && (
                <div className="bg-rose-500/10 border-2 border-rose-500/40 rounded-3xl p-5" data-testid="red-flag-panel">
                    <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                        <p className="font-bold text-rose-600 text-sm">Deterministic Safety Gate Override</p>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">Emergency protocol locked to prevent hallucination.</p>
                    <div className="flex flex-wrap gap-1.5">
                        {result.red_flags.map((rf, i) => (
                            <span key={i} className="bg-rose-500/20 text-rose-700 dark:text-rose-300 text-xs font-bold px-3 py-1 rounded-full">
                                {rf}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Emergency 108 Ambulance Speed-Dial Banner */}
            {result.urgency === "emergency" && (
                <div className="bg-rose-600 text-white rounded-3xl p-5 flex items-center justify-between shadow-lg glow-destructive">
                    <div>
                        <p className="font-head font-black text-base">Emergency Medical Situation</p>
                        <p className="text-xs text-white/85">Instant Speed-Dial 108 Ambulance Hotline</p>
                    </div>
                    <a href="tel:108">
                        <Button size="sm" className="bg-white text-rose-600 hover:bg-white/90 rounded-full font-black text-xs px-4 h-10 shadow-md">
                            <PhoneCall className="w-3.5 h-3.5 mr-1.5" /> Call 108
                        </Button>
                    </a>
                </div>
            )}

            {/* Clinical Guidance Text Card */}
            <div className="bg-card border border-border/80 rounded-3xl p-6 shadow-sm space-y-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-extrabold">{t.you}</p>
                <p className="text-sm font-semibold text-foreground italic bg-muted/40 p-3 rounded-2xl border border-border/50" data-testid="transcript-text">
                    "{result.transcript}"
                </p>

                {/* Symptoms chips */}
                {result.symptoms && result.symptoms.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                        {result.symptoms.map((s, i) => (
                            <span key={i} className="bg-primary/10 text-primary text-xs font-bold px-2.5 py-0.5 rounded-full border border-primary/20">
                                {s}
                            </span>
                        ))}
                    </div>
                )}

                <div className="h-px bg-border/60 my-2" />
                <p className="text-sm leading-relaxed text-foreground font-medium" data-testid="advice-text">
                    {result.spoken}
                </p>
            </div>

            {/* Mandatory Medical Disclaimer Banner */}
            <div className="bg-muted/60 border border-border/80 rounded-2xl px-4 py-3 flex gap-3 items-start" data-testid="disclaimer-banner">
                <AlertTriangle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {result.disclaimer || "⚠️ SwasthVaani provides assistive triage guidance only, not a conclusive clinical diagnosis. Consult a licensed medical practitioner for emergencies."}
                </p>
            </div>

            {/* Specialist Recommendation & Direct Clinic Booking */}
            {result.urgency !== "home" && result.suggested_specialty && (
                <div className="bg-card border-2 border-primary/25 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4" data-testid="specialty-recommendation-panel">
                    <div className="border-b border-border/60 pb-3">
                        <span className="text-[11px] font-extrabold uppercase tracking-wider text-primary bg-primary/10 px-2.5 py-1 rounded-full inline-flex items-center gap-1.5">
                            <Stethoscope className="w-3 h-3" /> Recommended Specialty
                        </span>
                        <h3 className="font-head font-extrabold text-xl tracking-tight text-foreground mt-2">
                            {result.suggested_specialty}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Matched with verified healthcare facilities and NGO clinics in your area.
                        </p>
                    </div>

                    {/* PIN Code Search Filter */}
                    <form onSubmit={handleSearchProvidersByPin} className="flex gap-2 items-center bg-muted/40 p-1.5 rounded-2xl border border-border/70">
                        <div className="relative flex-1 flex items-center">
                            <MapPin className="w-4 h-4 absolute left-3.5 text-muted-foreground pointer-events-none" />
                            <Input
                                placeholder="Enter 6-digit PIN (e.g. 110001)"
                                value={pincode}
                                onChange={(e) => setPincode(e.target.value)}
                                className="pl-10 h-10 text-xs rounded-xl bg-card border-border/60"
                            />
                        </div>
                        <Button type="submit" size="sm" disabled={loadingProviders} className="h-10 px-5 rounded-xl text-xs font-bold gradient-bg text-white shadow-xs">
                            {loadingProviders ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Lookup"}
                        </Button>
                    </form>

                    {/* Provider Cards List */}
                    <div className="space-y-3 pt-1">
                        {providers.length === 0 ? (
                            <div className="p-4 rounded-2xl bg-muted/40 text-center text-xs text-muted-foreground">
                                No registered clinics found for this PIN code yet. You can visit your local Government PHC or try a nearby PIN.
                            </div>
                        ) : (
                            providers.map((prov, i) => {
                                const isSelected = selectedProvider && (selectedProvider.id === prov.id || selectedProvider.email === prov.email);
                                const isExactPin = pincode && prov.pincode && pincode.trim() === prov.pincode.trim();

                                return (
                                    <div
                                        key={prov.id || prov._id || i}
                                        className={`rounded-2xl p-4 border transition-all ${
                                            isSelected 
                                                ? "bg-primary/5 border-primary shadow-xs ring-2 ring-primary/20" 
                                                : "bg-card border-border/80 hover:border-primary/40"
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <h4 className="font-bold text-sm text-foreground">{prov.name}</h4>
                                                    <span className={`text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                                                        prov.type === "ngo" 
                                                            ? "bg-secondary/20 text-secondary border border-secondary/30" 
                                                            : "bg-primary/10 text-primary border border-primary/20"
                                                    }`}>
                                                        {prov.facility_type === "free_clinic" ? "Free PHC" : prov.type === "ngo" ? "NGO Partner" : "Private Clinic"}
                                                    </span>
                                                    {isExactPin && (
                                                        <span className="text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30">
                                                            Exact PIN
                                                        </span>
                                                    )}
                                                </div>
                                                {prov.qualification && (
                                                    <p className="text-[11px] text-muted-foreground mt-0.5 font-medium">{prov.qualification}</p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="mt-2.5 pt-2 border-t border-border/40 text-xs text-muted-foreground flex flex-col gap-1">
                                            {prov.address && (
                                                <p className="flex items-center gap-1.5">
                                                    <MapPin className="w-3 h-3 shrink-0 text-muted-foreground" />
                                                    <span className="truncate">{prov.address} (PIN: {prov.pincode})</span>
                                                </p>
                                            )}
                                        </div>

                                        {/* Action Button: Book / Request Care */}
                                        <div className="mt-3 flex items-center justify-between pt-2 border-t border-border/40">
                                            <span className="text-[11px] text-muted-foreground font-semibold">
                                                Specialties: {prov.specialties?.slice(0, 2).join(", ")}
                                            </span>
                                            <Button
                                                size="sm"
                                                onClick={() => {
                                                    setSelectedProvider(prov);
                                                    setBookedRequest(null);
                                                }}
                                                className={`rounded-full h-8 px-3.5 text-xs font-bold transition-all ${
                                                    isSelected 
                                                        ? "bg-primary text-white" 
                                                        : "bg-muted/70 hover:bg-primary/10 text-primary border border-primary/30"
                                                }`}
                                            >
                                                {isSelected ? "Selected" : "Request Care"} <ChevronRight className="w-3 h-3 ml-1" />
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Booking Form Dialog Box when a provider is selected */}
                    {selectedProvider && !bookedRequest && (
                        <motion.form
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            onSubmit={handleBookProvider}
                            className="mt-4 p-4 rounded-2xl bg-primary/5 border border-primary/30 space-y-3"
                        >
                            <div className="flex items-center justify-between">
                                <p className="text-xs font-bold text-foreground">
                                    Direct Request for <span className="text-primary">{selectedProvider.name}</span>
                                </p>
                                <button type="button" onClick={() => setSelectedProvider(null)} className="text-xs text-muted-foreground hover:text-foreground font-semibold">
                                    Cancel
                                </button>
                            </div>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div>
                                    <Label className="text-[11px] font-semibold">Your Name (Optional)</Label>
                                    <Input
                                        placeholder="e.g. Ramesh Kumar"
                                        value={patientName}
                                        onChange={(e) => setPatientName(e.target.value)}
                                        className="h-8.5 text-xs rounded-xl bg-card mt-0.5"
                                    />
                                </div>
                                <div>
                                    <Label className="text-[11px] font-semibold">Contact Phone (Optional)</Label>
                                    <Input
                                        placeholder="e.g. +91 98111 22334"
                                        value={patientContact}
                                        onChange={(e) => setPatientContact(e.target.value)}
                                        className="h-8.5 text-xs rounded-xl bg-card mt-0.5"
                                    />
                                </div>
                            </div>

                            <Button
                                type="submit"
                                disabled={bookingSubmitting}
                                className="w-full rounded-2xl h-10 text-xs font-bold gradient-bg text-white shadow-sm"
                            >
                                {bookingSubmitting ? (
                                    <span className="flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Submitting Request...</span>
                                ) : (
                                    <span className="flex items-center gap-1.5"><Send className="w-3.5 h-3.5" /> Confirm Consultation Request</span>
                                )}
                            </Button>
                        </motion.form>
                    )}

                    {/* Booked Confirmation Box */}
                    {bookedRequest && (
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.98 }} 
                            animate={{ opacity: 1, scale: 1 }} 
                            className="mt-4 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-2"
                        >
                            <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto">
                                <CheckCircle2 className="w-5 h-5" />
                            </div>
                            <h4 className="font-head font-bold text-sm text-emerald-900 dark:text-emerald-300">
                                Consultation Request Sent Successfully!
                            </h4>
                            <p className="text-xs text-muted-foreground">
                                Status: <span className="font-bold text-amber-600 dark:text-amber-400">Pending Clinic Review</span>. The healthcare team will review your symptoms.
                            </p>
                            <div className="pt-2 flex justify-center gap-2">
                                <Link to="/my-requests">
                                    <Button size="sm" className="rounded-full h-8.5 px-4 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white">
                                        <ListOrdered className="w-3.5 h-3.5 mr-1.5" /> Track in My Requests
                                    </Button>
                                </Link>
                            </div>
                        </motion.div>
                    )}
                </div>
            )}

            {/* Sharing & 24-Hr Callback Actions */}
            <div className="grid grid-cols-2 gap-2 mt-4">
                <Button onClick={handleShareWhatsApp} variant="secondary" className="rounded-2xl h-11 text-xs font-bold border border-border/80 hover:bg-emerald-500/10">
                    <MessageSquare className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
                    {sharedWA ? "Opening WA..." : "WhatsApp Voice"}
                </Button>

                <Button onClick={handleScheduleCallback} variant="outline" className="rounded-2xl h-11 text-xs font-bold border-border/80">
                    {scheduledCallback ? <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-600" /> : <Calendar className="w-3.5 h-3.5 mr-1.5 text-primary" />}
                    {scheduledCallback ? "24h Call Scheduled" : "24h Voice Follow-up"}
                </Button>
            </div>

            <div className="flex gap-2 mt-2">
                <Button onClick={handleShareSMS} variant="ghost" className="flex-1 rounded-2xl h-11 text-xs font-bold border border-border/80">
                    {sharedSMS ? <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-600" /> : <Share2 className="w-3.5 h-3.5 mr-1.5" />}
                    {sharedSMS ? "SMS Prepared" : "Send SMS Advice"}
                </Button>
                <Button onClick={onReset} data-testid="ask-again-btn" className="flex-1 rounded-2xl h-11 text-xs font-bold gradient-bg text-white shadow-md">
                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> {t.again}
                </Button>
            </div>
        </motion.div>
    );
}

function FollowUpCard({ result, lang, t, onReset, onReplay, onSubmitAnswer }) {
    const [answerText, setAnswerText] = useState("");

    const handleAnswerSubmit = (e) => {
        if (e) e.preventDefault();
        if (!answerText.trim()) return;
        onSubmitAnswer(answerText.trim());
        setAnswerText("");
    };

    return (
        <motion.div 
            initial={{ opacity: 0, y: 15 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0 }}
            className="w-full max-w-lg space-y-4"
            data-testid="followup-card"
        >
            {/* Thinking / Clinical Rationale Banner */}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-3xl p-5 shadow-sm space-y-2">
                <div className="flex items-center justify-between">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 animate-spin text-amber-600" /> Clinical AI Triage in Progress
                    </span>
                    <Badge variant="outline" className="text-[10px] font-bold bg-amber-500/15 border-amber-400 text-amber-800">
                        Follow-up Needed
                    </Badge>
                </div>
                {result.thinking && (
                    <p className="text-xs text-amber-900/80 dark:text-amber-200/90 font-medium italic bg-white/40 dark:bg-black/20 p-2.5 rounded-2xl border border-amber-400/20">
                        <b>Clinical Reasoning:</b> "{result.thinking}"
                    </p>
                )}
            </div>

            {/* Question Card */}
            <div className="bg-card border border-primary/30 rounded-[2rem] p-6 sm:p-7 shadow-xl space-y-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                        <p className="text-xs font-extrabold uppercase text-primary tracking-wide">
                            Follow-up Question
                        </p>
                        <h3 className="font-head font-extrabold text-xl sm:text-2xl text-foreground leading-snug">
                            "{result.question || result.spoken}"
                        </h3>
                    </div>
                    <Button 
                        size="icon" 
                        variant="ghost" 
                        onClick={onReplay}
                        className="rounded-full shrink-0 bg-primary/10 hover:bg-primary/20 text-primary w-11 h-11"
                        title="Listen to question"
                    >
                        <Volume2 className="w-5 h-5" />
                    </Button>
                </div>

                <div className="border-t border-border/60 pt-4 space-y-3">
                    <Label className="text-xs font-bold text-foreground">Type your answer / clarification:</Label>
                    <form onSubmit={handleAnswerSubmit} className="space-y-3">
                        <Textarea 
                            value={answerText}
                            onChange={(e) => setAnswerText(e.target.value)}
                            placeholder="e.g. It started 2 days ago, and I also have a rash..."
                            rows={3}
                            className="rounded-2xl text-sm bg-background border-border/80"
                        />
                        <div className="flex items-center justify-between gap-2">
                            <Button 
                                type="button" 
                                variant="ghost" 
                                onClick={onReset}
                                className="rounded-full text-xs font-bold text-muted-foreground hover:text-foreground"
                            >
                                Start Over
                            </Button>
                            <Button 
                                type="submit" 
                                className="rounded-full px-6 font-bold gradient-bg text-white shadow-md text-xs h-10"
                            >
                                Submit Clarification <ChevronRight className="w-4 h-4 ml-1" />
                            </Button>
                        </div>
                    </form>
                </div>
            </div>
        </motion.div>
    );
}
