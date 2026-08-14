import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { 
    Mic, Phone, Activity, ShieldCheck, Languages, ArrowRight, Stethoscope, 
    Radio, HeartPulse, Sparkles, UserCheck, Play, Search, AlertTriangle, Check, 
    ChevronRight, Zap, Volume2, ShieldAlert, Cpu, CheckCircle2, Clock, Globe2, PhoneCall
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const fade = (d = 0) => ({
    initial: { opacity: 0, y: 22 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.55, delay: d, ease: [0.22, 1, 0.36, 1] },
});

const SIMULATED_PIPELINE = [
    {
        stage: "Stage 1: Multi-Dialect Audio Capture",
        langBadge: "हिंदी · Hindi",
        transcript: "मुझे तीन दिन से तेज बुखार है और छाती में दर्द हो रहा है...",
        detail: "Real-time Indic audio streaming via WebRTC & Twilio telephony bridge",
        badge: "01 / Input",
        icon: Mic,
        color: "text-orange-500",
        bg: "bg-orange-500/10",
        border: "border-orange-500/30",
        tag: "Audio Ingest"
    },
    {
        stage: "Stage 2: Indic Whisper Speech-to-Text",
        langBadge: "Whisper Large v3 (Groq ⚡)",
        transcript: '"मुझे तीन दिन से तेज बुखार है और छाती में दर्द हो रहा है"',
        detail: "Sub-400ms low latency Indic dialect transcription into standardized text",
        badge: "02 / ASR",
        icon: Languages,
        color: "text-indigo-500",
        bg: "bg-indigo-500/10",
        border: "border-indigo-500/30",
        tag: "Speech-to-Text"
    },
    {
        stage: "Stage 3: Clinical NLP Keyword Extraction",
        langBadge: "Medical Keyword Pipeline",
        transcript: "Identified Symptoms: [तेज बुखार (High Fever), छाती में दर्द (Chest Pain)]",
        detail: "Extracting clinical markers & mapping to WHO primary healthcare taxonomy",
        badge: "03 / Extraction",
        icon: Search,
        color: "text-amber-500",
        bg: "bg-amber-500/10",
        border: "border-amber-500/30",
        tag: "Clinical NLP"
    },
    {
        stage: "Stage 4: Red-Flag Safety Gate & Triage",
        langBadge: "Deterministic Safety Gate 🚨",
        transcript: "Urgency: EMERGENCY (Chest pain + Fever) — Override Locked",
        detail: "Rule-based safety gate prevents LLM hallucination for critical emergencies",
        badge: "04 / Triage",
        icon: AlertTriangle,
        color: "text-rose-500",
        bg: "bg-rose-500/10",
        border: "border-rose-500/30",
        tag: "Safety Gate"
    },
    {
        stage: "Stage 5: Spoken Audio Synthesis (TTS)",
        langBadge: "Edge-TTS & Kokoro",
        transcript: '"तुरंत नजदीकी अस्पताल जाएं या 108 एम्बुलेंस को कॉल करें।"',
        detail: "Natural dialect voice feedback played out loud so zero reading is required",
        badge: "05 / Voice Out",
        icon: Volume2,
        color: "text-emerald-500",
        bg: "bg-emerald-500/10",
        border: "border-emerald-500/30",
        tag: "Voice Feedback"
    }
];

export default function Landing() {
    const [step, setStep] = useState(0);
    const [isAutoPlay, setIsAutoPlay] = useState(true);
    const [dialPressed, setDialPressed] = useState("1");
    const [simulatingDial, setSimulatingDial] = useState(false);

    useEffect(() => {
        if (!isAutoPlay) return;
        const interval = setInterval(() => {
            setStep((s) => (s + 1) % SIMULATED_PIPELINE.length);
        }, 3600);
        return () => clearInterval(interval);
    }, [isAutoPlay]);

    const cur = SIMULATED_PIPELINE[step];

    const handleDialPress = (digit) => {
        setDialPressed(digit);
        setSimulatingDial(true);
        setTimeout(() => setSimulatingDial(false), 1200);
    };

    const DIAL_LANGUAGES = {
        "1": { name: "Hindi (हिंदी)", sample: "नमस्ते, अपने लक्षण बताएं।" },
        "2": { name: "English", sample: "Hello, please describe your symptoms after the beep." },
        "3": { name: "Bengali (বাংলা)", sample: "নমস্কার, আপনার লক্ষণগুলি বলুন।" },
        "4": { name: "Tamil (தமிழ்)", sample: "வணக்கம், உங்கள் அறிகுறிகளை விவரிக்கவும்." }
    };

    return (
        <div className="min-h-screen grain-bg text-foreground relative overflow-hidden" data-testid="landing-page">
            {/* Top Glowing Ambient Accents */}
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none -z-10" />
            <div className="absolute top-32 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -z-10" />

            {/* Sticky Glass Header */}
            <header className="sticky top-0 z-50 glass-header border-b border-border/80 transition-all">
                <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-3 group">
                        <div className="w-11 h-11 rounded-2xl gradient-bg flex items-center justify-center glow-primary shadow-md transition-transform group-hover:scale-105">
                            <Activity className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex flex-col">
                            <span className="font-head font-black text-xl tracking-tight text-foreground">
                                SwasthVaani
                            </span>
                            <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                                Voice-First Healthcare for Rural India
                            </span>
                        </div>
                    </Link>

                    <div className="flex items-center gap-2 sm:gap-3">
                        <Link to="/my-requests" data-testid="nav-requests-link">
                            <Button variant="ghost" className="rounded-full font-bold text-xs sm:text-sm hover:bg-primary/10 hover:text-primary transition-colors">
                                My Requests
                            </Button>
                        </Link>
                        <Link to="/dashboard" data-testid="nav-clinic-link">
                            <Button variant="ghost" className="rounded-full font-bold text-xs sm:text-sm hidden sm:inline-flex hover:bg-primary/10 hover:text-primary transition-colors">
                                Clinic & NGO Portal
                            </Button>
                        </Link>
                        <Link to="/speak" data-testid="nav-speak-link">
                            <Button className="rounded-full font-bold px-5 sm:px-6 gradient-bg hover:opacity-95 shadow-lg glow-primary text-white transition-all transform hover:-translate-y-0.5 text-xs sm:text-sm">
                                <Sparkles className="w-4 h-4 mr-2" /> Launch Triage
                            </Button>
                        </Link>
                    </div>
                </div>
            </header>

            {/* Hero Section */}
            <section className="max-w-7xl mx-auto px-6 pt-12 sm:pt-16 pb-20 grid lg:grid-cols-12 gap-12 items-center">
                <div className="lg:col-span-7 space-y-6">
                    <motion.div {...fade(0)} className="inline-flex items-center gap-2.5 rounded-full glass-card border border-primary/25 text-foreground px-4 py-2 text-xs font-bold shadow-sm">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                        <Languages className="w-4 h-4 text-primary" />
                        <span className="text-muted-foreground">Supported Dialects:</span>
                        <span className="font-semibold text-primary">हिंदी · English · বাংলা · தமிழ்</span>
                    </motion.div>
                    
                    <motion.h1 {...fade(0.08)} className="font-head font-black tracking-tight text-4xl sm:text-6xl lg:text-[68px] leading-[1.06]">
                        Healthcare that <span className="gradient-text">listens</span>,<br />
                        not one that asks you to read.
                    </motion.h1>
                    
                    <motion.p {...fade(0.16)} className="text-base sm:text-xl text-muted-foreground max-w-2xl leading-relaxed font-normal">
                        SwasthVaani is a voice-first AI medical triage platform engineered for low-literacy and rural communities. Speak symptoms naturally in your native language — our clinical AI assesses urgency, checks red-flag safety rules, and speaks guidance back out loud.
                    </motion.p>
                    
                    <motion.div {...fade(0.24)} className="flex flex-wrap items-center gap-4 pt-2">
                        <Link to="/speak" data-testid="hero-speak-btn">
                            <Button size="lg" className="rounded-full h-14 sm:h-15 px-8 sm:px-10 text-base font-extrabold gradient-bg hover:opacity-95 glow-primary shadow-xl text-white transition-all transform hover:-translate-y-1">
                                <Mic className="w-5 h-5 mr-2.5 animate-pulse" /> Speak Symptoms Now
                            </Button>
                        </Link>
                        <a href="#ivr" data-testid="hero-ivr-btn">
                            <Button size="lg" variant="outline" className="rounded-full h-14 sm:h-15 px-7 text-base font-extrabold border-2 border-border/80 hover:bg-card hover:border-primary/40 hover:-translate-y-1 transition-all shadow-sm">
                                <Phone className="w-5 h-5 mr-2.5 text-secondary" /> Call via Phone (IVR)
                            </Button>
                        </a>
                    </motion.div>
                    
                    {/* Key Value Badges */}
                    <motion.div {...fade(0.32)} className="grid sm:grid-cols-3 gap-4 border-t border-border/80 pt-6 mt-6">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-600 flex items-center justify-center shrink-0">
                                <ShieldCheck className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-xs font-bold text-foreground">Deterministic Safety</p>
                                <p className="text-[11px] text-muted-foreground">Zero AI hallucination on emergencies</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
                                <Radio className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-xs font-bold text-foreground">Zero-Internet IVR</p>
                                <p className="text-[11px] text-muted-foreground">Works on ₹500 basic feature phones</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-secondary/15 text-secondary flex items-center justify-center shrink-0">
                                <UserCheck className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-xs font-bold text-foreground">ASHA Worker Mode</p>
                                <p className="text-[11px] text-muted-foreground">Assisted door-to-door community triage</p>
                            </div>
                        </div>
                    </motion.div>
                </div>

                {/* Right Interactive AI Pipeline Simulation Showcase */}
                <motion.div {...fade(0.2)} className="lg:col-span-5 relative">
                    <div className="absolute -inset-4 bg-gradient-to-r from-primary/15 via-accent/10 to-emerald-500/15 rounded-[2.5rem] rotate-2 blur-xl -z-10" />
                    
                    <div className="glass-card rounded-[2.5rem] p-6 sm:p-7 shadow-2xl border border-white/80 h-[495px] flex flex-col justify-between overflow-hidden">
                        {/* Simulation Header */}
                        <div className="flex items-center justify-between border-b border-border/60 pb-3">
                            <div className="flex items-center gap-2.5">
                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-xs font-extrabold uppercase tracking-wider text-foreground">
                                    Live Pipeline Simulator
                                </span>
                            </div>
                            <button
                                onClick={() => setIsAutoPlay(!isAutoPlay)}
                                className={`text-[10px] font-bold px-3 py-1 rounded-full border transition-all ${
                                    isAutoPlay ? "bg-primary/10 text-primary border-primary/20" : "bg-muted text-muted-foreground border-border"
                                }`}
                            >
                                {isAutoPlay ? "Auto-Advancing" : "Paused"}
                            </button>
                        </div>

                        {/* Interactive Stage Selector Tabs */}
                        <div className="grid grid-cols-5 gap-1.5">
                            {SIMULATED_PIPELINE.map((p, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => { setStep(idx); setIsAutoPlay(false); }}
                                    className={`py-2 px-1 rounded-xl text-center flex flex-col items-center gap-1 transition-all ${
                                        step === idx 
                                            ? "bg-primary text-white shadow-md font-bold" 
                                            : "bg-muted/60 text-muted-foreground hover:bg-muted text-xs"
                                    }`}
                                >
                                    <p.icon className="w-3.5 h-3.5" />
                                    <span className="text-[10px] font-bold">Step {idx + 1}</span>
                                </button>
                            ))}
                        </div>

                        {/* Current Stage Card (Static Fixed Height Container) */}
                        <div className="h-[250px] relative">
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={step}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.18 }}
                                    className={`rounded-2xl border ${cur.border} bg-card p-4 sm:p-5 h-full flex flex-col justify-between shadow-xs`}
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-extrabold uppercase tracking-wide text-primary">
                                            {cur.badge}
                                        </span>
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/80">
                                            {cur.langBadge}
                                        </span>
                                    </div>

                                    <div className="flex items-start gap-3">
                                        <div className={`w-10 h-10 rounded-2xl ${cur.bg} flex items-center justify-center shrink-0 shadow-2xs`}>
                                            <cur.icon className={`w-5 h-5 ${cur.color}`} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <h3 className="font-head font-bold text-sm text-foreground truncate">{cur.stage}</h3>
                                            <p className="text-[11px] text-muted-foreground line-clamp-1">{cur.detail}</p>
                                        </div>
                                    </div>

                                    <div className="h-[64px] p-2.5 rounded-xl bg-muted/40 border border-border/60 text-xs font-semibold text-foreground font-mono leading-relaxed flex items-center overflow-hidden">
                                        <p className="line-clamp-2">{cur.transcript}</p>
                                    </div>

                                    {/* Static Live audio wave */}
                                    <div className="flex items-center justify-between gap-1 h-6">
                                        <div className="flex items-center gap-1">
                                            {[...Array(14)].map((_, i) => (
                                                <motion.div
                                                    key={i}
                                                    className={`w-1 rounded-full ${step === 3 ? 'bg-destructive' : 'bg-primary'}`}
                                                    animate={{
                                                        height: [4, 16 + Math.sin(i * 1.2 + step) * 8, 4],
                                                    }}
                                                    transition={{
                                                        duration: 0.5 + (i % 4) * 0.1,
                                                        repeat: Infinity,
                                                        ease: "easeInOut",
                                                    }}
                                                />
                                            ))}
                                        </div>
                                        <span className="text-[10px] font-bold uppercase text-muted-foreground">
                                            Latency: ~380ms
                                        </span>
                                    </div>
                                </motion.div>
                            </AnimatePresence>
                        </div>

                        {/* Interactive CTA */}
                        <div>
                            <Link to="/speak" className="w-full block">
                                <Button className="w-full rounded-2xl h-11 font-bold gradient-bg text-white shadow-md hover:opacity-95 text-xs sm:text-sm">
                                    Try Interactive Voice Triage <ArrowRight className="w-4 h-4 ml-2" />
                                </Button>
                            </Link>
                        </div>
                    </div>
                </motion.div>
            </section>

            {/* Problem & Impact Statistics Bento */}
            <section className="bg-foreground text-background py-20 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#f97316_1px,transparent_1px)] [background-size:24px_24px]" />
                
                <div className="max-w-7xl mx-auto px-6 relative z-10">
                    <div className="text-center max-w-3xl mx-auto mb-16">
                        <Badge className="bg-amber-400/20 text-amber-300 border-amber-400/30 text-xs font-extrabold px-3 py-1 rounded-full mb-3">
                            The Literacy & Access Divide
                        </Badge>
                        <h2 className="font-head font-black text-3xl sm:text-5xl tracking-tight text-white">
                            Why traditional typed digital health fails rural India
                        </h2>
                        <p className="text-zinc-400 mt-4 text-base sm:text-lg">
                            Standard telemedicine apps assume text literacy, high-speed smartphones, and complex navigation. SwasthVaani flips the paradigm to pure conversational voice.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        {[
                            {
                                n: "400M+",
                                h: "Excluded by Text Apps",
                                t: "Citizens who cannot comfortably read or type symptoms into conventional healthcare portals.",
                                icon: Languages
                            },
                            {
                                n: "60%",
                                h: "Low Prescription Literacy",
                                t: "Of rural adults struggle to interpret printed clinic slips and medication dosages accurately.",
                                icon: ShieldAlert
                            },
                            {
                                n: "2 hrs+",
                                h: "Average PHC Travel Time",
                                t: "Time required for a rural villager to reach a primary health centre just for basic symptom guidance.",
                                icon: Clock
                            }
                        ].map((s, i) => (
                            <motion.div
                                key={i}
                                {...fade(i * 0.1)}
                                viewport={{ once: true }}
                                whileInView="animate"
                                initial="initial"
                                className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-8 space-y-4 hover:border-amber-400/40 transition-all shadow-xl"
                            >
                                <div className="w-12 h-12 rounded-2xl bg-amber-400/10 text-amber-400 flex items-center justify-center">
                                    <s.icon className="w-6 h-6" />
                                </div>
                                <p className="font-head font-black text-5xl text-amber-400 tracking-tight">{s.n}</p>
                                <h3 className="font-head font-bold text-lg text-white">{s.h}</h3>
                                <p className="text-zinc-400 text-sm leading-relaxed">{s.t}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* 4-Step Architectural Pillars Section */}
            <section className="max-w-7xl mx-auto px-6 py-24">
                <div className="text-center max-w-3xl mx-auto">
                    <Badge className="bg-primary/10 text-primary border-primary/20 font-bold px-4 py-1 rounded-full text-xs mb-4">
                        Zero Reading Required
                    </Badge>
                    <h2 className="font-head font-black text-3xl sm:text-5xl tracking-tight">
                        How a SwasthVaani session works
                    </h2>
                    <p className="text-muted-foreground mt-4 text-base sm:text-lg">
                        Four seamless steps — completely spoken, entirely in the patient's local tongue.
                    </p>
                </div>

                <div className="grid md:grid-cols-4 gap-6 mt-16">
                    {[
                        {
                            step: "01",
                            icon: Mic,
                            t: "Speak Out Loud",
                            d: "Describe symptoms freely in Hindi, English, Bengali, or Tamil without filling forms.",
                            accent: "from-orange-500/20 to-orange-500/5"
                        },
                        {
                            step: "02",
                            icon: Cpu,
                            t: "Indic Whisper STT",
                            d: "High-speed Groq Whisper v3 transcribes colloquial accents into clinical vocabulary in milliseconds.",
                            accent: "from-indigo-500/20 to-indigo-500/5"
                        },
                        {
                            step: "03",
                            icon: ShieldCheck,
                            t: "Red-Flag Safety Gate",
                            d: "Deterministic safety checks lock emergency cases (chest pain, stroke, trauma) to guarantee instant care.",
                            accent: "from-rose-500/20 to-rose-500/5"
                        },
                        {
                            step: "04",
                            icon: Volume2,
                            t: "Voice Back & Referral",
                            d: "Kokoro & Edge-TTS speak advice aloud, with instant referral matching to local registered clinics and NGOs.",
                            accent: "from-emerald-500/20 to-emerald-500/5"
                        },
                    ].map((s, i) => (
                        <motion.div
                            key={i}
                            {...fade(i * 0.1)}
                            viewport={{ once: true }}
                            whileInView="animate"
                            initial="initial"
                            className="glass-card rounded-3xl p-8 hover:-translate-y-2 transition-all border border-border/80 hover:border-primary/40 shadow-sm hover:shadow-xl relative overflow-hidden flex flex-col justify-between"
                        >
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="w-13 h-13 rounded-2xl bg-primary/15 text-primary flex items-center justify-center">
                                        <s.icon className="w-6 h-6" />
                                    </div>
                                    <span className="font-head font-black text-2xl text-muted-foreground/40">{s.step}</span>
                                </div>
                                <h3 className="font-head font-extrabold text-xl">{s.t}</h3>
                                <p className="text-muted-foreground text-sm leading-relaxed">{s.d}</p>
                            </div>
                            <div className="mt-6 pt-4 border-t border-border/50 flex items-center text-xs font-bold text-primary">
                                Verified Medical Protocol <ChevronRight className="w-3.5 h-3.5 ml-1" />
                            </div>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* Interactive IVR Phone Call Simulation Section */}
            <section id="ivr" className="max-w-7xl mx-auto px-6 pb-24">
                <div className="gradient-bg text-white rounded-[3rem] p-8 sm:p-14 lg:p-16 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none" />
                    
                    <div className="grid lg:grid-cols-12 gap-12 items-center relative z-10">
                        <div className="lg:col-span-7 space-y-6">
                            <div className="inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-1.5 text-xs font-extrabold shadow-inner">
                                <Phone className="w-4 h-4" /> Feature Phone Support (Twilio Voice IVR)
                            </div>
                            
                            <h2 className="font-head font-black text-3xl sm:text-5xl tracking-tight leading-tight">
                                No smartphone or internet? Works on any basic phone line.
                            </h2>
                            
                            <p className="text-white/90 text-base sm:text-lg leading-relaxed font-normal">
                                Clinics and NGOs can connect a Twilio phone number. Patients simply dial, select their language with a keypress (1-4), speak their symptoms, and listen to spoken advice — zero data connection required.
                            </p>
                            
                            <div className="bg-black/25 backdrop-blur-md rounded-2xl p-5 border border-white/20 space-y-1.5">
                                <p className="text-[11px] text-white/70 uppercase font-extrabold tracking-wider">
                                    Twilio TwiML Webhook Endpoint:
                                </p>
                                <p className="font-mono font-bold text-amber-300 text-sm sm:text-base break-all" data-testid="ivr-webhook-url">
                                    {process.env.REACT_APP_BACKEND_URL || "http://localhost:8001"}/api/ivr/voice
                                </p>
                            </div>
                        </div>

                        {/* Interactive Phone Keypad Simulator */}
                        <div className="lg:col-span-5 bg-zinc-950/80 backdrop-blur-xl rounded-3xl p-6 sm:p-7 border border-white/20 shadow-2xl text-white space-y-5">
                            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                                <div className="flex items-center gap-2">
                                    <PhoneCall className="w-4 h-4 text-emerald-400 animate-pulse" />
                                    <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">IVR Interactive Demo</span>
                                </div>
                                <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                                    Call Active
                                </span>
                            </div>

                            {/* Simulated Voice Output Screen */}
                            <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 space-y-2">
                                <p className="text-[10px] uppercase font-bold text-zinc-400">Audio Prompt Playing:</p>
                                <p className="text-sm font-semibold text-amber-300 font-mono">
                                    {simulatingDial 
                                        ? "Connecting language channel..." 
                                        : DIAL_LANGUAGES[dialPressed]?.sample || "Press 1 for Hindi, 2 for English..."}
                                </p>
                            </div>

                            {/* Keypad Buttons */}
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { key: "1", label: "Hindi (हिंदी)" },
                                    { key: "2", label: "English" },
                                    { key: "3", label: "Bengali (বাংলা)" },
                                    { key: "4", label: "Tamil (தமிழ்)" },
                                ].map((d) => (
                                    <button
                                        key={d.key}
                                        onClick={() => handleDialPress(d.key)}
                                        className={`p-3 rounded-xl border text-left transition-all ${
                                            dialPressed === d.key 
                                                ? "bg-primary text-white border-primary shadow-md font-bold" 
                                                : "bg-zinc-900/90 border-zinc-800 hover:border-zinc-700 text-zinc-200"
                                        }`}
                                    >
                                        <span className="text-base font-black mr-2 font-mono">[{d.key}]</span>
                                        <span className="text-xs font-semibold">{d.label}</span>
                                    </button>
                                ))}
                            </div>

                            <p className="text-[11px] text-zinc-400 text-center">
                                Tap 1-4 to test IVR multi-language routing logic.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Bottom CTA Banner */}
            <section className="max-w-7xl mx-auto px-6 pb-24 text-center">
                <div className="glass-card rounded-[3rem] p-10 sm:p-16 border border-primary/25 shadow-2xl relative overflow-hidden">
                    <div className="max-w-3xl mx-auto space-y-6">
                        <Badge className="bg-primary/10 text-primary border-primary/20 font-extrabold px-4 py-1 rounded-full text-xs">
                            Accessible Healthcare For Every Citizen
                        </Badge>
                        
                        <h2 className="font-head font-black text-3xl sm:text-5xl tracking-tight leading-tight">
                            Ready to experience voice-first medical triage?
                        </h2>
                        
                        <p className="text-muted-foreground text-base sm:text-lg max-w-xl mx-auto">
                            Start speaking your symptoms now or access the clinic management console to receive direct patient referrals.
                        </p>
                        
                        <div className="flex flex-wrap justify-center gap-4 pt-4">
                            <Link to="/speak">
                                <Button size="lg" className="rounded-full h-14 px-10 text-base font-extrabold gradient-bg hover:opacity-95 glow-primary text-white shadow-xl">
                                    <Mic className="w-5 h-5 mr-2" /> Launch Voice Assistant
                                </Button>
                            </Link>
                            <Link to="/dashboard">
                                <Button size="lg" variant="outline" className="rounded-full h-14 px-9 text-base font-extrabold border-2 hover:bg-card">
                                    Clinic & NGO Console <ArrowRight className="w-4 h-4 ml-2" />
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="border-t border-border/80 py-10 bg-card/60 text-xs font-medium text-muted-foreground">
                <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg gradient-bg flex items-center justify-center text-white">
                            <Activity className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-head font-extrabold text-foreground">SwasthVaani</span>
                        <span>— Voice-First AI Medical Triage for Rural India</span>
                    </div>
                    <div className="flex items-center gap-6">
                        <Link to="/speak" className="hover:text-primary transition-colors">Voice Triage</Link>
                        <Link to="/my-requests" className="hover:text-primary transition-colors">Patient Portal</Link>
                        <Link to="/dashboard" className="hover:text-primary transition-colors">Clinic Console</Link>
                    </div>
                </div>
            </footer>
        </div>
    );
}
