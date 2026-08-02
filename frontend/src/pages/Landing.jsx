import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Mic, Phone, Activity, ShieldCheck, Languages, ArrowRight, Stethoscope, Radio, HeartPulse, Sparkles, UserCheck, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

const fade = (d = 0) => ({
    initial: { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, delay: d, ease: [0.22, 1, 0.36, 1] },
});

export default function Landing() {
    return (
        <div className="min-h-screen grain-bg text-foreground relative overflow-hidden" data-testid="landing-page">
            {/* Header */}
            <header className="sticky top-0 z-50 glass-header border-b border-border/80 transition-all">
                <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl gradient-bg flex items-center justify-center glow-primary shadow-md">
                            <Activity className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex flex-col">
                            <span className="font-head font-black text-xl tracking-tight text-foreground flex items-center gap-1.5">
                                SwasthVaani <span className="text-[10px] font-bold uppercase tracking-widest bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">AI</span>
                            </span>
                            <span className="text-[11px] text-muted-foreground font-medium">Voice Triage for Rural India</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <Link to="/dashboard" data-testid="nav-clinic-link">
                            <Button variant="ghost" className="rounded-full font-bold text-sm hidden sm:inline-flex hover:bg-primary/10 hover:text-primary">
                                Clinic Portal
                            </Button>
                        </Link>
                        <Link to="/speak" data-testid="nav-speak-link">
                            <Button className="rounded-full font-bold px-6 gradient-bg hover:opacity-95 shadow-md glow-primary text-white transition-all transform hover:-translate-y-0.5">
                                <Sparkles className="w-4 h-4 mr-2" /> Try Voice Demo
                            </Button>
                        </Link>
                    </div>
                </div>
            </header>

            {/* Hero Section */}
            <section className="max-w-7xl mx-auto px-6 pt-16 pb-24 grid lg:grid-cols-12 gap-12 items-center">
                <div className="lg:col-span-7">
                    <motion.div {...fade(0)} className="inline-flex items-center gap-2 rounded-full glass-card border border-primary/20 text-primary px-4 py-2 text-xs font-bold shadow-sm mb-6">
                        <Languages className="w-4 h-4 text-primary" />
                        <span>Hindi · English · Bengali · Tamil</span>
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse ml-1" />
                    </motion.div>
                    
                    <motion.h1 {...fade(0.08)} className="font-head font-black tracking-tight text-4xl sm:text-6xl lg:text-7xl leading-[1.08]">
                        Healthcare that <span className="gradient-text">listens</span>, not one that asks you to read.
                    </motion.h1>
                    
                    <motion.p {...fade(0.16)} className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl leading-relaxed font-normal">
                        SwasthVaani is a voice-first AI medical triage platform built for low-literacy & rural populations. Speak your symptoms in your language — the AI assesses urgency and speaks clear guidance back out loud.
                    </motion.p>
                    
                    <motion.div {...fade(0.24)} className="mt-10 flex flex-wrap items-center gap-4">
                        <Link to="/speak" data-testid="hero-speak-btn">
                            <Button size="lg" className="rounded-full h-15 px-8 text-base font-extrabold gradient-bg hover:opacity-95 glow-primary shadow-xl text-white transition-all transform hover:-translate-y-1">
                                <Mic className="w-5 h-5 mr-2.5 animate-pulse" /> Speak Symptoms Now
                            </Button>
                        </Link>
                        <a href="#ivr" data-testid="hero-ivr-btn">
                            <Button size="lg" variant="outline" className="rounded-full h-15 px-8 text-base font-extrabold border-2 hover:bg-card hover:-translate-y-1 transition-all shadow-sm">
                                <Phone className="w-5 h-5 mr-2.5 text-secondary" /> Works on Any Phone
                            </Button>
                        </a>
                    </motion.div>
                    
                    <motion.div {...fade(0.32)} className="mt-12 grid sm:grid-cols-3 gap-4 border-t border-border/80 pt-8">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-600 flex items-center justify-center shrink-0">
                                <ShieldCheck className="w-5 h-5" />
                            </div>
                            <span className="text-xs font-semibold text-foreground/80">Safety-First Medical Rules</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
                                <Radio className="w-5 h-5" />
                            </div>
                            <span className="text-xs font-semibold text-foreground/80">No Internet Required (IVR)</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-secondary/15 text-secondary flex items-center justify-center shrink-0">
                                <UserCheck className="w-5 h-5" />
                            </div>
                            <span className="text-xs font-semibold text-foreground/80">ASHA Health Worker Pass</span>
                        </div>
                    </motion.div>
                </div>

                <motion.div {...fade(0.2)} className="lg:col-span-5 relative">
                    <div className="absolute -inset-4 gradient-bg rounded-[2.5rem] rotate-3 opacity-20 blur-xl" />
                    <div className="relative rounded-[2.5rem] overflow-hidden glass-card p-3 shadow-2xl border-2 border-white/80">
                        <img
                            src="https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?crop=entropy&cs=srgb&fm=jpg&q=85&w=1000"
                            alt="Rural healthcare doctor and patient"
                            className="rounded-[2rem] w-full h-[460px] object-cover"
                            data-testid="hero-image"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent rounded-[2.5rem]" />
                        
                        {/* Live Floating Emergency Card */}
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.5, duration: 0.5 }}
                            className="absolute bottom-6 left-6 right-6 glass-card p-4 rounded-2xl border border-white/90 shadow-xl flex items-center justify-between"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-2xl bg-destructive text-white flex items-center justify-center glow-destructive animate-bounce">
                                    <HeartPulse className="w-6 h-6" />
                                </div>
                                <div>
                                    <p className="font-head font-extrabold text-sm text-foreground">Emergency Detected</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">"বুকে প্রবল ব্যথা" → Immediate PHC Alert</p>
                                </div>
                            </div>
                            <Badge className="bg-destructive text-white rounded-full font-bold px-3 py-1 text-[11px] shadow-sm">
                                🚨 Urgent
                            </Badge>
                        </motion.div>
                    </div>
                </motion.div>
            </section>

            {/* Impact Metrics Section */}
            <section className="bg-foreground text-background py-20 relative overflow-hidden">
                <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-3 gap-12 text-center md:text-left relative z-10">
                    {[
                        { n: "400M+", t: "People locked out of typed digital health apps due to literacy barriers" },
                        { n: "60%", t: "Of rural adults cannot read a printed hospital prescription" },
                        { n: "2 hrs+", t: "Average distance to the nearest doctor in remote villages" },
                    ].map((s, i) => (
                        <motion.div key={i} {...fade(i * 0.1)} viewport={{ once: true }} whileInView="animate" initial="initial" className="space-y-2">
                            <p className="font-head font-black text-5xl sm:text-6xl text-amber-400 tracking-tight">{s.n}</p>
                            <p className="text-background/80 text-base leading-relaxed font-normal">{s.t}</p>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* 4-Step Workflow Section */}
            <section className="max-w-7xl mx-auto px-6 py-24">
                <div className="text-center max-w-3xl mx-auto">
                    <Badge className="bg-primary/10 text-primary border-primary/20 font-bold px-4 py-1 rounded-full text-xs mb-4">
                        Zero Reading Required
                    </Badge>
                    <h2 className="font-head font-black text-3xl sm:text-5xl tracking-tight">How a SwasthVaani session works</h2>
                    <p className="text-muted-foreground mt-4 text-lg">Four simple steps — all spoken, all in your local voice dialect.</p>
                </div>

                <div className="grid md:grid-cols-4 gap-6 mt-16">
                    {[
                        { icon: Mic, t: "Speak Out Loud", d: "Describe symptoms in Hindi, English, Bengali, or Tamil." },
                        { icon: Languages, t: "AI Understands", d: "Whisper STT transcribes dialect into clinical data." },
                        { icon: Activity, t: "Triage Engine", d: "Ollama Nemotron classifies: Emergency, See Soon, or Home Care." },
                        { icon: Stethoscope, t: "AI Voice Back", d: "Kokoro & Edge-TTS speak the guidance back aloud to you." },
                    ].map((s, i) => (
                        <motion.div key={i} {...fade(i * 0.1)} viewport={{ once: true }} whileInView="animate" initial="initial"
                            className="glass-card rounded-3xl p-8 hover:-translate-y-2 transition-all border border-border/80 hover:border-primary/40 shadow-sm hover:shadow-xl">
                            <div className="w-14 h-14 rounded-2xl bg-primary/15 text-primary flex items-center justify-center mb-6">
                                <s.icon className="w-7 h-7" />
                            </div>
                            <span className="text-xs font-bold uppercase tracking-wider text-primary">Step {i + 1}</span>
                            <h3 className="font-head font-extrabold text-xl mt-1">{s.t}</h3>
                            <p className="text-muted-foreground text-sm mt-3 leading-relaxed">{s.d}</p>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* IVR Phone Integration Section */}
            <section id="ivr" className="max-w-7xl mx-auto px-6 pb-24">
                <div className="gradient-bg text-white rounded-[3rem] p-10 lg:p-16 grid lg:grid-cols-12 gap-12 items-center shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl" />
                    <div className="lg:col-span-7 relative z-10">
                        <div className="inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-1.5 text-xs font-extrabold mb-6 shadow-inner">
                            <Phone className="w-4 h-4" /> Feature Phone Support (TwiML IVR)
                        </div>
                        <h2 className="font-head font-black text-3xl sm:text-5xl tracking-tight leading-tight">
                            No smartphone? Works on any basic phone line.
                        </h2>
                        <p className="mt-6 text-white/90 text-lg leading-relaxed font-normal">
                            Clinics and NGOs can connect a Twilio phone number. Patients call, pick a language via key press, speak symptoms, and hear voice guidance — with zero internet or app installation.
                        </p>
                        <div className="mt-8 bg-black/20 backdrop-blur-md rounded-2xl p-5 border border-white/20">
                            <p className="text-xs text-white/70 uppercase font-bold tracking-wider">Twilio Webhook URL Endpoint:</p>
                            <p className="font-mono font-bold text-amber-300 mt-1 text-sm sm:text-base break-all" data-testid="ivr-webhook-url">
                                {process.env.REACT_APP_BACKEND_URL || "http://localhost:8000"}/api/ivr/voice
                            </p>
                        </div>
                    </div>
                    <div className="lg:col-span-5 space-y-4 relative z-10">
                        {[
                            "Dial the SwasthVaani hotline number",
                            "Press 1 Hindi · 2 English · 3 Bengali · 4 Tamil",
                            "Describe symptoms out loud after beep",
                            "Hear AI spoken diagnosis & guidance back",
                        ].map((step, idx) => (
                            <div key={idx} className="flex items-center gap-4 bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/15">
                                <div className="w-9 h-9 rounded-xl bg-white text-primary font-head font-black text-lg flex items-center justify-center shrink-0">
                                    {idx + 1}
                                </div>
                                <span className="font-bold text-sm sm:text-base">{step}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA Footer Section */}
            <section className="max-w-7xl mx-auto px-6 pb-24 text-center">
                <div className="glass-card rounded-[3rem] p-12 lg:p-16 border border-primary/20 shadow-xl">
                    <h2 className="font-head font-black text-3xl sm:text-5xl tracking-tight max-w-3xl mx-auto leading-tight">
                        Built for the 400 million who can't use apps — using nothing but their voice.
                    </h2>
                    <div className="mt-10 flex flex-wrap justify-center gap-4">
                        <Link to="/speak">
                            <Button size="lg" className="rounded-full h-15 px-10 text-base font-extrabold gradient-bg hover:opacity-95 glow-primary text-white shadow-xl">
                                Launch Voice Assistant <ArrowRight className="w-5 h-5 ml-2" />
                            </Button>
                        </Link>
                        <Link to="/dashboard">
                            <Button size="lg" variant="outline" className="rounded-full h-15 px-10 text-base font-extrabold border-2">
                                Access Clinic SaaS Console
                            </Button>
                        </Link>
                    </div>
                </div>
            </section>

            <footer className="border-t border-border py-8 text-center text-xs font-semibold text-muted-foreground">
                SwasthVaani — Voice of Health · A Voice-First AI Triage Platform for Underserved Healthcare
            </footer>
        </div>
    );
}
