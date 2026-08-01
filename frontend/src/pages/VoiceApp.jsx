import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Square, Loader2, Volume2, RotateCcw, ArrowLeft, Activity, AlertTriangle, Clock, Home, Keyboard } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api, LANGUAGES, URGENCY_META } from "@/lib/api";

const UI = {
    hi: { tap: "बोलने के लिए दबाएँ", listening: "सुन रहे हैं… फिर से दबाकर रोकें", thinking: "समझ रहे हैं…", again: "फिर से बोलें", play: "आवाज़ सुनें", you: "आपने कहा" },
    en: { tap: "Tap to speak", listening: "Listening… tap again to stop", thinking: "Understanding…", again: "Speak again", play: "Play voice", you: "You said" },
    ta: { tap: "பேச தட்டவும்", listening: "கேட்கிறோம்… நிறுத்த மீண்டும் தட்டவும்", thinking: "புரிந்துகொள்கிறோம்…", again: "மீண்டும் பேசுங்கள்", play: "குரலைக் கேளுங்கள்", you: "நீங்கள் சொன்னது" },
};

const ICONS = { emergency: AlertTriangle, soon: Clock, home: Home };

export default function VoiceApp() {
    const [lang, setLang] = useState("hi");
    const [status, setStatus] = useState("idle"); // idle | recording | processing | result
    const [result, setResult] = useState(null);
    const [showType, setShowType] = useState(false);
    const [typed, setTyped] = useState("");
    const mediaRef = useRef(null);
    const chunksRef = useRef([]);
    const audioRef = useRef(null);
    const t = UI[lang];

    useEffect(() => () => { if (audioRef.current) audioRef.current.pause(); }, []);

    const playAudio = (b64) => {
        if (!b64) return;
        const audio = new Audio(`data:audio/mp3;base64,${b64}`);
        audioRef.current = audio;
        audio.play().catch(() => { });
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mr = new MediaRecorder(stream);
            chunksRef.current = [];
            mr.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
            mr.onstop = () => {
                stream.getTracks().forEach((tr) => tr.stop());
                const blob = new Blob(chunksRef.current, { type: "audio/webm" });
                submitAudio(blob);
            };
            mediaRef.current = mr;
            mr.start();
            setStatus("recording");
        } catch (e) {
            toast.error("Microphone access denied. Use 'Type instead' below.");
            setShowType(true);
        }
    };

    const stopRecording = () => {
        if (mediaRef.current && mediaRef.current.state !== "inactive") mediaRef.current.stop();
        setStatus("processing");
    };

    const submitAudio = async (blob) => {
        const fd = new FormData();
        fd.append("audio", blob, "symptoms.webm");
        fd.append("language", lang);
        fd.append("caller", "Web patient");
        try {
            const { data } = await api.post("/triage/voice", fd, { headers: { "Content-Type": "multipart/form-data" } });
            setResult(data);
            setStatus("result");
            playAudio(data.audio_base64);
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Could not process your voice. Try again.");
            setStatus("idle");
        }
    };

    const submitText = async () => {
        if (!typed.trim()) return;
        setStatus("processing");
        setShowType(false);
        try {
            const { data } = await api.post("/triage/text", { text: typed, language: lang, caller: "Web patient (typed)" });
            setResult(data);
            setStatus("result");
            playAudio(data.audio_base64);
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Could not process. Try again.");
            setStatus("idle");
        }
    };

    const reset = () => { setResult(null); setStatus("idle"); setTyped(""); if (audioRef.current) audioRef.current.pause(); };

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

            {/* Language selector */}
            <div className="max-w-2xl mx-auto w-full px-5 mt-2">
                <div className="flex gap-2 justify-center" data-testid="lang-selector">
                    {LANGUAGES.map((l) => (
                        <button
                            key={l.code}
                            data-testid={`lang-${l.code}`}
                            onClick={() => setLang(l.code)}
                            className={`rounded-full px-6 py-3 text-lg font-semibold border transition-colors ${lang === l.code ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-foreground hover:border-primary/50"
                                }`}
                        >
                            {l.name}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center px-5 py-10 max-w-2xl mx-auto w-full">
                <AnimatePresence mode="wait">
                    {status !== "result" && (
                        <motion.div key="recorder" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="flex flex-col items-center">
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
                                    className={`relative w-44 h-44 rounded-full flex items-center justify-center shadow-xl transition-colors disabled:opacity-80 ${status === "recording" ? "bg-destructive" : "bg-primary hover:bg-primary/90"
                                        }`}
                                >
                                    {status === "processing" ? <Loader2 className="w-16 h-16 text-white animate-spin" />
                                        : status === "recording" ? <Square className="w-14 h-14 text-white" fill="white" />
                                            : <Mic className="w-16 h-16 text-primary-foreground" />}
                                </button>
                            </div>
                            <p className="mt-8 text-xl font-head font-bold text-center" aria-live="polite" data-testid="voice-status-text">
                                {status === "recording" ? t.listening : status === "processing" ? t.thinking : t.tap}
                            </p>

                            {status === "idle" && (
                                <button onClick={() => setShowType((s) => !s)} data-testid="toggle-type-btn"
                                    className="mt-6 flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors font-medium">
                                    <Keyboard className="w-4 h-4" /> Type instead
                                </button>
                            )}

                            {showType && status === "idle" && (
                                <div className="mt-4 w-full max-w-md">
                                    <Textarea data-testid="type-symptom-input" value={typed} onChange={(e) => setTyped(e.target.value)}
                                        placeholder="मुझे बुखार और सिर दर्द है…" rows={3} className="rounded-xl text-base bg-card" />
                                    <Button data-testid="submit-text-btn" onClick={submitText} className="mt-3 w-full rounded-full h-12 font-bold bg-primary hover:bg-primary/90">
                                        Get triage
                                    </Button>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {status === "result" && result && (
                        <ResultCard key="result" result={result} lang={lang} t={t} onReset={reset} onReplay={() => playAudio(result.audio_base64)} />
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

function ResultCard({ result, lang, t, onReset, onReplay }) {
    const meta = URGENCY_META[result.urgency] || URGENCY_META.soon;
    const Icon = ICONS[result.urgency] || Clock;
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
                    className="rounded-full h-14 px-8 text-base font-bold bg-white/95 text-foreground hover:bg-white transition-colors">
                    <Volume2 className="w-5 h-5 mr-2" /> {t.play}
                </Button>
            </div>

            <div className="bg-card border border-border rounded-2xl p-6 mt-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">{t.you}</p>
                <p className="mt-1 text-foreground italic" data-testid="transcript-text">"{result.transcript}"</p>
                <div className="h-px bg-border my-4" />
                <p className="text-sm leading-relaxed text-foreground/90" data-testid="advice-text">{result.spoken}</p>
            </div>

            <Button onClick={onReset} data-testid="ask-again-btn" variant="outline"
                className="mt-4 w-full rounded-full h-12 font-bold border-2 hover:-translate-y-0.5 transition-transform">
                <RotateCcw className="w-4 h-4 mr-2" /> {t.again}
            </Button>
        </motion.div>
    );
}
