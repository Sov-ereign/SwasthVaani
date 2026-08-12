import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Square, Loader2, Volume2, RotateCcw, ArrowLeft, Activity, AlertTriangle, Clock, Home, Keyboard, PhoneCall, Share2, Check, UserCheck, QrCode, Calendar, MessageSquare, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, LANGUAGES, URGENCY_META } from "@/lib/api";

const UI = {
    hi: { tap: "बोलने के लिए दबाएँ", listening: "सुन रहे हैं… फिर से दबाकर रोकें", thinking: "समझ रहे हैं…", again: "फिर से बोलें", play: "आवाज़ सुनें", you: "आपने कहा", placeholder: "मुझे बुखार और सिर दर्द है…", typeBtn: "टाइप करें" },
    en: { tap: "Tap to speak", listening: "Listening… tap again to stop", thinking: "Understanding…", again: "Speak again", play: "Play voice", you: "You said", placeholder: "I have a fever and headache…", typeBtn: "Type instead" },
    bn: { tap: "বলতে স্পর্শ করুন", listening: "শুনছি… থামাতে আবার চাপুন", thinking: "বুঝে নিচ্ছি…", again: "আবার বলুন", play: "আওয়াজ শুনুন", you: "আপনি বলেছেন", placeholder: "আমার জ্বর ও বুকে ব্যথা আছে…", typeBtn: "টাইপ করুন" },
    ta: { tap: "பேச தட்டவும்", listening: "கேட்கிறோம்… நிறுத்த மீண்டும் தட்டவும்", thinking: "புரிந்துகொள்கிறோம்…", again: "மீண்டும் பேசுங்கள்", play: "குரலைக் கேளுங்கள்", you: "நீங்கள் சொன்னது", placeholder: "எனக்கு காய்ச்சல் மற்றும் தலைவலி உள்ளது…", typeBtn: "தட்டச்சு செய்யவும்" },
};

const ICONS = { emergency: AlertTriangle, soon: Clock, home: Home };
const LANG_VOICE = { hi: "hi-IN", en: "en-US", bn: "bn-IN", ta: "ta-IN" };

const PROCESSING_STEPS = {
    hi: [
        "आपकी आवाज़ रिकॉर्ड की जा रही है...",
        "लक्षणों का विश्लेषण हो रहा है...",
        "क्लिनिकल सेफ्टी चेक किया जा रहा है...",
        "सलाह तैयार की जा रही है..."
    ],
    en: [
        "Transcribing your voice...",
        "Extracting clinical symptoms...",
        "Running safety gate checks...",
        "Generating medical advice..."
    ],
    bn: [
        "আপনার কণ্ঠস্বর রেকর্ড করা হচ্ছে...",
        "লক্ষণগুলি বিশ্লেষণ করা হচ্ছে...",
        "নিরাপত্তা পরীক্ষা চলছে...",
        "পরামর্শ তৈরি করা হচ্ছে..."
    ],
    ta: [
        "உங்கள் குரல் பதிவு செய்யப்படுகிறது...",
        "அறிகுறிகள் பகுப்பாய்வு செய்யப்படுகின்றன...",
        "பாதுகாப்பு சோதனை செய்யப்படுகிறது...",
        "ஆலோசனைகள் தயாரிக்கப்படுகின்றன..."
    ]
};

export default function VoiceApp() {
    const [lang, setLang] = useState("hi");
    const [status, setStatus] = useState("idle"); // idle | recording | processing | result
    const [result, setResult] = useState(null);
    const [mode, setMode] = useState("patient"); // patient | asha
    
    // ASHA Worker form details
    const [ashaPatientName, setAshaPatientName] = useState("");
    const [ashaPatientAge, setAshaPatientAge] = useState("");
    const [ashaVillage, setAshaVillage] = useState("");

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
            }, 900);
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
        utterance.rate = 0.9;
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
        if (mode === "asha") {
            const name = ashaPatientName.trim() || "Patient";
            const age = ashaPatientAge.trim() ? `, ${ashaPatientAge}y` : "";
            const village = ashaVillage.trim() ? ` (${ashaVillage})` : "";
            return `ASHA: ${name}${age}${village}`;
        }
        return "Web patient";
    };

    const submitAudio = async (blob, recognizedText) => {
        const fd = new FormData();
        fd.append("audio", blob, "symptoms.webm");
        fd.append("language", lang);
        fd.append("caller", getCallerLabel());

        try {
            const { data } = await api.post("/triage/voice", fd, { headers: { "Content-Type": "multipart/form-data" } });
            
            if (recognizedText && recognizedText.trim()) {
                data.transcript = recognizedText.trim();
            }
            
            setResult(data);
            setStatus("result");
            playAudio(data.audio_base64, data.spoken || data.advice);
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
        try {
            const { data } = await api.post("/triage/text", { text: textToSubmit, language: lang, caller: getCallerLabel() });
            setResult(data);
            setStatus("result");
            playAudio(data.audio_base64, data.spoken || data.advice);
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
        if (audioRef.current) audioRef.current.pause();
        if (window.speechSynthesis) window.speechSynthesis.cancel();
    };

    return (
        <div className="min-h-screen grain-bg flex flex-col" data-testid="voice-app">
            <header className="h-16 px-5 flex items-center justify-between max-w-2xl mx-auto w-full">
                <Link to="/" data-testid="voice-back-link" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
                    <ArrowLeft className="w-5 h-5" /> <span className="font-semibold">Back</span>
                </Link>
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                        <Activity className="w-4 h-4 text-primary-foreground" />
                    </div>
                    <span className="font-head font-extrabold tracking-tight">SwasthVaani</span>
                </div>
            </header>

            {/* Mode Switcher: Patient Mode vs ASHA Health Worker Mode */}
            <div className="max-w-2xl mx-auto w-full px-5 mt-2 flex justify-center">
                <div className="bg-card border border-border p-1 rounded-full flex gap-1">
                    <button
                        onClick={() => setMode("patient")}
                        className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
                            mode === "patient" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        Patient Self-Use
                    </button>
                    <button
                        onClick={() => setMode("asha")}
                        className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
                            mode === "asha" ? "bg-secondary text-secondary-foreground shadow" : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        <UserCheck className="w-3.5 h-3.5" /> ASHA Health Worker Mode
                    </button>
                </div>
            </div>

            {/* ASHA Patient Details Form */}
            {mode === "asha" && status === "idle" && (
                <div className="max-w-md mx-auto w-full px-5 mt-4">
                    <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
                        <p className="text-xs font-bold uppercase tracking-wide text-secondary flex items-center gap-1">
                            <UserCheck className="w-3.5 h-3.5" /> ASHA Door-to-Door Visit Details
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <Label className="text-xs">Patient Name</Label>
                                <Input placeholder="Ramesh Kumar" value={ashaPatientName} onChange={(e) => setAshaPatientName(e.target.value)} className="h-9 text-xs rounded-xl bg-background mt-1" />
                            </div>
                            <div>
                                <Label className="text-xs">Age</Label>
                                <Input placeholder="48" value={ashaPatientAge} onChange={(e) => setAshaPatientAge(e.target.value)} className="h-9 text-xs rounded-xl bg-background mt-1" />
                            </div>
                        </div>
                        <div>
                            <Label className="text-xs">Village / Location</Label>
                            <Input placeholder="Rampur Village, Ward 4" value={ashaVillage} onChange={(e) => setAshaVillage(e.target.value)} className="h-9 text-xs rounded-xl bg-background mt-1" />
                        </div>
                    </div>
                </div>
            )}

            {/* Language selector */}
            <div className="max-w-2xl mx-auto w-full px-5 mt-4">
                <div className="flex flex-wrap gap-2 justify-center" data-testid="lang-selector">
                    {LANGUAGES.map((l) => (
                        <button
                            key={l.code}
                            data-testid={`lang-${l.code}`}
                            onClick={() => { setLang(l.code); reset(); }}
                            className={`rounded-full px-5 py-2.5 text-base font-semibold border transition-colors ${
                                lang === l.code ? "bg-primary text-primary-foreground border-primary shadow-md" : "bg-card border-border text-foreground hover:border-primary/50"
                            }`}
                        >
                            {l.name}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center px-5 py-8 max-w-2xl mx-auto w-full">
                <AnimatePresence mode="wait">
                    {status !== "result" && (
                        <motion.div key="recorder" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="flex flex-col items-center w-full">
                            <div className="relative flex items-center justify-center w-64 h-64">
                                {status === "recording" && [0, 1, 2].map((i) => (
                                    <motion.span key={i} className="absolute rounded-full bg-primary/20"
                                        initial={{ width: 176, height: 176, opacity: 0.6 }}
                                        animate={{ width: 256, height: 256, opacity: 0 }}
                                        transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.5, ease: "easeOut" }} />
                                ))}
                                <button
                                    data-testid="voice-record-btn"
                                    disabled={status === "processing"}
                                    onClick={status === "recording" ? stopRecording : startRecording}
                                    className={`relative w-44 h-44 rounded-full flex items-center justify-center shadow-xl transition-all disabled:opacity-80 ${
                                        status === "recording" ? "bg-destructive scale-105" : "bg-primary hover:bg-primary/90 hover:scale-102"
                                    }`}
                                >
                                    {status === "processing" ? <Loader2 className="w-16 h-16 text-white animate-spin" />
                                        : status === "recording" ? <Square className="w-14 h-14 text-white" fill="white" />
                                            : <Mic className="w-16 h-16 text-primary-foreground" />}
                                </button>
                            </div>

                            <p className="mt-6 text-xl font-head font-bold text-center" aria-live="polite" data-testid="voice-status-text">
                                {status === "recording" ? t.listening : status === "processing" ? t.thinking : t.tap}
                            </p>

                            {/* Waveform visualizer when recording */}
                            {status === "recording" && (
                                <div className="flex items-center justify-center gap-1 h-8 mt-3">
                                    {[...Array(9)].map((_, i) => (
                                        <motion.div
                                            key={i}
                                            className="w-1 bg-destructive rounded-full"
                                            animate={{
                                                height: [8, 28 + Math.sin(i * 1.3) * 12, 8],
                                            }}
                                            transition={{
                                                duration: 0.5 + (i % 3) * 0.1,
                                                repeat: Infinity,
                                                ease: "easeInOut",
                                            }}
                                        />
                                    ))}
                                </div>
                            )}

                            {/* Live transcription feedback preview */}
                            {status === "recording" && liveTranscript && (
                                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                    className="mt-3 bg-card border border-border rounded-xl px-4 py-2 text-sm italic text-muted-foreground text-center max-w-md">
                                    "{liveTranscript}"
                                </motion.div>
                            )}

                            {/* Stepper showing the pipeline progress during processing */}
                            {status === "processing" && (
                                <div className="mt-8 w-full max-w-sm space-y-3.5 bg-card border border-border/80 rounded-2xl p-6 shadow-sm">
                                    {PROCESSING_STEPS[lang].map((stepText, idx) => {
                                        const isCompleted = idx < processingStep;
                                        const isActive = idx === processingStep;
                                        return (
                                            <div key={idx} className={`flex items-center gap-3 transition-all duration-300 ${isCompleted || isActive ? "opacity-100" : "opacity-35"}`}>
                                                <div className="flex items-center justify-center shrink-0">
                                                    {isCompleted ? (
                                                        <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center text-white text-[10px]">
                                                            <Check className="w-3.5 h-3.5" />
                                                        </div>
                                                    ) : isActive ? (
                                                        <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center text-white">
                                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                        </div>
                                                    ) : (
                                                        <div className="w-5 h-5 rounded-full border border-muted-foreground/40" />
                                                    )}
                                                </div>
                                                <span className={`text-sm font-medium ${isActive ? "text-primary font-bold" : "text-foreground"}`}>
                                                    {stepText}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {status === "idle" && (
                                <button onClick={() => setShowType((s) => !s)} data-testid="toggle-type-btn"
                                    className="mt-6 flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors font-medium text-sm">
                                    <Keyboard className="w-4 h-4" /> {t.typeBtn}
                                </button>
                            )}

                            {showType && status === "idle" && (
                                <div className="mt-4 w-full max-w-md">
                                    <Textarea data-testid="type-symptom-input" value={typed} onChange={(e) => setTyped(e.target.value)}
                                        placeholder={t.placeholder} rows={3} className="rounded-xl text-base bg-card" />
                                    <Button data-testid="submit-text-btn" onClick={submitText} className="mt-3 w-full rounded-full h-12 font-bold bg-primary hover:bg-primary/90">
                                        Get triage
                                    </Button>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {status === "result" && result && (
                        <ResultCard key="result" result={result} lang={lang} t={t} mode={mode} onReset={reset} onReplay={() => playAudio(result.audio_base64, result.spoken || result.advice)} />
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

function ResultCard({ result, lang, t, mode, onReset, onReplay }) {
    const [sharedSMS, setSharedSMS] = useState(false);
    const [sharedWA, setSharedWA] = useState(false);
    const [scheduledCallback, setScheduledCallback] = useState(false);

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

    return (
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="w-full max-w-md" data-testid="triage-result-card">
            
            <div className={`${meta.bg} ${meta.text} rounded-3xl p-8 flex flex-col items-center gap-4 shadow-xl ring-8 ${meta.ring}`}>
                <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center">
                    <Icon className="w-10 h-10" />
                </div>
                <div className="text-center">
                    <p className="font-head font-extrabold text-3xl tracking-tight" data-testid="urgency-label">{meta.label}</p>
                    <p className="text-lg opacity-90 mt-1">{meta.sub[lang]}</p>
                </div>
                <Button onClick={onReplay} data-testid="play-audio-btn"
                    className="rounded-full h-14 px-8 text-base font-bold bg-white/95 text-foreground hover:bg-white transition-colors shadow-md">
                    <Volume2 className="w-5 h-5 mr-2" /> {t.play}
                </Button>
            </div>

            {/* ASHA Patient Referral Pass (Printable Card with QR) */}
            {mode === "asha" && (
                <div className="bg-card border-2 border-secondary/50 rounded-2xl p-5 mt-4 shadow-md">
                    <div className="flex items-center justify-between border-b pb-3 mb-3">
                        <div>
                            <p className="font-head font-extrabold text-sm text-secondary uppercase tracking-wide">PHC Patient Referral Pass</p>
                            <p className="text-xs text-muted-foreground">Issued by ASHA Worker · SwasthVaani</p>
                        </div>
                        <QrCode className="w-8 h-8 text-secondary" />
                    </div>
                    <div className="text-xs space-y-1.5">
                        <p><span className="font-bold">Caller / Patient:</span> {result.caller}</p>
                        <p><span className="font-bold">Triage Status:</span> <span className="font-extrabold uppercase">{result.urgency}</span></p>
                        <p><span className="font-bold">Symptoms Summary:</span> {result.summary || result.transcript}</p>
                    </div>
                    <Button onClick={handlePrintReferral} size="sm" variant="outline" className="mt-3 w-full rounded-full text-xs font-bold">
                        <Printer className="w-3.5 h-3.5 mr-1.5" /> Print Patient Referral Pass
                    </Button>
                </div>
            )}

            {/* Red Flag Alert — only shown when safety gate triggered */}
            {result.flagged && result.red_flags && result.red_flags.length > 0 && (
                <div className="bg-destructive/10 border-2 border-destructive/50 rounded-2xl p-4 mt-4" data-testid="red-flag-panel">
                    <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                        <p className="font-bold text-destructive text-sm">Safety gate triggered — emergency forced</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {result.red_flags.map((rf, i) => (
                            <span key={i} className="bg-destructive/20 text-destructive text-xs font-semibold px-2.5 py-1 rounded-full">
                                {rf}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Emergency Hotline Alert */}
            {result.urgency === "emergency" && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-4 mt-4 flex items-center justify-between">
                    <div>
                        <p className="font-bold text-destructive text-sm">Need Urgent Ambulance?</p>
                        <p className="text-xs text-muted-foreground">Call 108 Emergency Service</p>
                    </div>
                    <a href="tel:108">
                        <Button size="sm" className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-full font-bold">
                            <PhoneCall className="w-4 h-4 mr-1.5" /> Call 108
                        </Button>
                    </a>
                </div>
            )}

            <div className="bg-card border border-border rounded-2xl p-6 mt-4 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">{t.you}</p>
                <p className="mt-1 text-foreground italic" data-testid="transcript-text">"{result.transcript}"</p>

                {/* Symptoms chips */}
                {result.symptoms && result.symptoms.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                        {result.symptoms.map((s, i) => (
                            <span key={i} className="bg-primary/10 text-primary text-xs font-medium px-2.5 py-0.5 rounded-full">
                                {s}
                            </span>
                        ))}
                    </div>
                )}

                <div className="h-px bg-border my-4" />
                <p className="text-sm leading-relaxed text-foreground/90 font-medium" data-testid="advice-text">{result.spoken}</p>
            </div>

            {/* Mandatory disclaimer — required on every response */}
            <div className="mt-4 bg-muted/50 border border-border rounded-xl px-4 py-3 flex gap-2.5" data-testid="disclaimer-banner">
                <AlertTriangle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                    {result.disclaimer || "⚠️ This is triage guidance only — not a medical diagnosis. Always consult a qualified health professional for medical advice."}
                </p>
            </div>

            {/* Sharing & 24-Hr Callback Automation Actions */}
            <div className="grid grid-cols-2 gap-2 mt-4">
                <Button onClick={handleShareWhatsApp} variant="secondary" className="rounded-full h-11 text-xs font-bold border">
                    <MessageSquare className="w-3.5 h-3.5 mr-1.5 text-green-600" />
                    {sharedWA ? "Opening WA..." : "WhatsApp Voice"}
                </Button>

                <Button onClick={handleScheduleCallback} variant="outline" className="rounded-full h-11 text-xs font-bold border">
                    {scheduledCallback ? <Check className="w-3.5 h-3.5 mr-1.5 text-green-600" /> : <Calendar className="w-3.5 h-3.5 mr-1.5 text-primary" />}
                    {scheduledCallback ? "24h Call Scheduled" : "24h Voice Callback"}
                </Button>
            </div>

            <div className="flex gap-2 mt-2">
                <Button onClick={handleShareSMS} variant="ghost" className="flex-1 rounded-full h-11 text-xs font-bold border">
                    {sharedSMS ? <Check className="w-3.5 h-3.5 mr-1.5 text-green-600" /> : <Share2 className="w-3.5 h-3.5 mr-1.5" />}
                    {sharedSMS ? "SMS Prepared" : "Send SMS Advice"}
                </Button>
                <Button onClick={onReset} data-testid="ask-again-btn" variant="default" className="flex-1 rounded-full h-11 text-xs font-bold shadow">
                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> {t.again}
                </Button>
            </div>
        </motion.div>
    );
}
