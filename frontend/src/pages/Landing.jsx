import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Mic, Phone, Activity, ShieldCheck, Languages, ArrowRight, Stethoscope, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";

const fade = (d = 0) => ({
    initial: { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, delay: d, ease: [0.22, 1, 0.36, 1] },
});

export default function Landing() {
    return (
        <div className="min-h-screen grain-bg" data-testid="landing-page">
            {/* Nav */}
            <header className="sticky top-0 z-40 bg-background/85 backdrop-blur-md border-b border-border">
                <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
                            <Activity className="w-5 h-5 text-primary-foreground" />
                        </div>
                        <span className="font-head font-extrabold text-lg tracking-tight">SwasthVaani</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Link to="/dashboard" data-testid="nav-clinic-link">
                            <Button variant="ghost" className="rounded-full font-semibold hidden sm:inline-flex">Clinic login</Button>
                        </Link>
                        <Link to="/speak" data-testid="nav-speak-link">
                            <Button className="rounded-full font-semibold bg-primary hover:bg-primary/90 transition-colors">
                                Try the voice demo
                            </Button>
                        </Link>
                    </div>
                </div>
            </header>

            {/* Hero */}
            <section className="max-w-6xl mx-auto px-5 pt-16 pb-20 grid lg:grid-cols-2 gap-14 items-center">
                <div>
                    <motion.div {...fade(0)} className="inline-flex items-center gap-2 rounded-full bg-secondary/15 text-secondary px-4 py-1.5 text-sm font-semibold mb-6">
                        <Languages className="w-4 h-4" /> Hindi · English · Tamil
                    </motion.div>
                    <motion.h1 {...fade(0.05)} className="font-head font-extrabold tracking-tight text-4xl sm:text-5xl lg:text-6xl leading-[1.05]">
                        Healthcare that <span className="text-primary">listens</span>, not one that asks you to read.
                    </motion.h1>
                    <motion.p {...fade(0.12)} className="mt-6 text-lg text-muted-foreground max-w-xl leading-relaxed">
                        SwasthVaani is a voice-first AI triage assistant for rural India. Speak your
                        symptoms in your language — it understands, decides how urgent it is, and speaks
                        the guidance back. No typing. No reading. Just your voice.
                    </motion.p>
                    <motion.div {...fade(0.2)} className="mt-8 flex flex-wrap gap-3">
                        <Link to="/speak" data-testid="hero-speak-btn">
                            <Button size="lg" className="rounded-full h-14 px-8 text-base font-bold bg-primary hover:bg-primary/90 transition-colors">
                                <Mic className="w-5 h-5 mr-2" /> Speak your symptoms
                            </Button>
                        </Link>
                        <a href="#ivr" data-testid="hero-ivr-btn">
                            <Button size="lg" variant="outline" className="rounded-full h-14 px-8 text-base font-bold border-2 hover:-translate-y-0.5 transition-transform">
                                <Phone className="w-5 h-5 mr-2" /> Works on any phone
                            </Button>
                        </a>
                    </motion.div>
                    <motion.div {...fade(0.28)} className="mt-10 flex items-center gap-6 text-sm text-muted-foreground">
                        <span className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-secondary" /> Safety-first triage</span>
                        <span className="flex items-center gap-2"><Radio className="w-4 h-4 text-secondary" /> No internet needed via IVR</span>
                    </motion.div>
                </div>

                <motion.div {...fade(0.15)} className="relative">
                    <div className="absolute -inset-4 bg-primary/10 rounded-[2rem] rotate-3" />
                    <img
                        src="https://images.unsplash.com/photo-1779006277040-67543ea167b1?crop=entropy&cs=srgb&fm=jpg&q=85&w=1000"
                        alt="Rural health worker caring for a patient"
                        className="relative rounded-[2rem] w-full h-[440px] object-cover shadow-xl"
                        data-testid="hero-image"
                    />
                    <div className="absolute -bottom-5 -left-5 bg-card border border-border rounded-2xl shadow-lg p-4 flex items-center gap-3">
                        <div className="w-11 h-11 rounded-full bg-destructive flex items-center justify-center">
                            <Activity className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <p className="font-head font-bold text-sm leading-none">Emergency detected</p>
                            <p className="text-xs text-muted-foreground mt-1">"सीने में दर्द है" → escalate now</p>
                        </div>
                    </div>
                </motion.div>
            </section>

            {/* Problem stats */}
            <section className="bg-foreground text-background py-16">
                <div className="max-w-6xl mx-auto px-5 grid sm:grid-cols-3 gap-10">
                    {[
                        { n: "400M+", t: "people locked out of digital health tools that assume you can read and type" },
                        { n: "60%", t: "of rural adults cannot read a printed prescription" },
                        { n: "2 hrs", t: "average distance to the nearest doctor in many villages" },
                    ].map((s, i) => (
                        <motion.div key={i} {...fade(i * 0.08)} viewport={{ once: true }} whileInView="animate" initial="initial">
                            <p className="font-head font-extrabold text-5xl text-accent">{s.n}</p>
                            <p className="mt-3 text-background/70 leading-relaxed">{s.t}</p>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* How it works */}
            <section className="max-w-6xl mx-auto px-5 py-20">
                <h2 className="font-head font-extrabold text-3xl sm:text-4xl tracking-tight">How a triage call works</h2>
                <p className="text-muted-foreground mt-3 text-lg max-w-2xl">Four steps, all in the patient's own language, all by voice.</p>
                <div className="grid md:grid-cols-4 gap-5 mt-12">
                    {[
                        { icon: Mic, t: "Speak", d: "Patient describes symptoms out loud in Hindi, English or Tamil." },
                        { icon: Languages, t: "Understand", d: "Whisper transcribes speech; AI extracts the key symptoms." },
                        { icon: Activity, t: "Triage", d: "Engine classifies urgency: Emergency, See soon, or Home care." },
                        { icon: Stethoscope, t: "Guide", d: "The assistant speaks clear next steps back to the patient." },
                    ].map((s, i) => (
                        <motion.div key={i} {...fade(i * 0.08)} viewport={{ once: true }} whileInView="animate" initial="initial"
                            className="bg-card border border-border rounded-2xl p-6 hover:-translate-y-1 transition-transform">
                            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                                <s.icon className="w-6 h-6 text-primary" />
                            </div>
                            <p className="font-head font-bold text-lg">{i + 1}. {s.t}</p>
                            <p className="text-muted-foreground text-sm mt-2 leading-relaxed">{s.d}</p>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* IVR */}
            <section id="ivr" className="max-w-6xl mx-auto px-5 pb-20">
                <div className="bg-secondary text-secondary-foreground rounded-[2rem] p-10 lg:p-14 grid lg:grid-cols-2 gap-10 items-center">
                    <div>
                        <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-semibold mb-5">
                            <Phone className="w-4 h-4" /> No smartphone? No problem.
                        </div>
                        <h2 className="font-head font-extrabold text-3xl sm:text-4xl tracking-tight">Also runs as a phone line (IVR)</h2>
                        <p className="mt-4 text-secondary-foreground/85 text-lg leading-relaxed">
                            Clinics and NGOs can connect a Twilio phone number. Patients simply call, pick a
                            language, speak their symptoms, and hear the triage guidance — on any basic phone,
                            with zero internet or data.
                        </p>
                        <div className="mt-6 bg-white/10 rounded-xl p-4 font-mono text-sm">
                            <p className="opacity-70">Point your Twilio number's voice webhook to:</p>
                            <p className="font-bold mt-1 break-all" data-testid="ivr-webhook-url">
                                {process.env.REACT_APP_BACKEND_URL}/api/ivr/voice
                            </p>
                        </div>
                    </div>
                    <div className="space-y-3">
                        {[
                            "Call the SwasthVaani number",
                            "Press 1 Hindi · 2 English · 3 Tamil",
                            "Speak your symptoms after the tone",
                            "Hear urgency + next steps spoken back",
                        ].map((s, i) => (
                            <div key={i} className="flex items-center gap-4 bg-white/10 rounded-xl px-5 py-4">
                                <span className="w-8 h-8 rounded-full bg-white text-secondary font-head font-extrabold flex items-center justify-center shrink-0">{i + 1}</span>
                                <span className="font-medium">{s}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section className="max-w-6xl mx-auto px-5 pb-24 text-center">
                <h2 className="font-head font-extrabold text-3xl sm:text-5xl tracking-tight max-w-3xl mx-auto leading-tight">
                    Built for the 400 million who can't use apps — using nothing but their voice.
                </h2>
                <Link to="/speak">
                    <Button size="lg" className="mt-8 rounded-full h-14 px-10 text-base font-bold bg-primary hover:bg-primary/90 transition-colors">
                        Try the live demo <ArrowRight className="w-5 h-5 ml-2" />
                    </Button>
                </Link>
            </section>

            <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
                SwasthVaani — voice of health · A voice-first AI triage assistant
            </footer>
        </div>
    );
}
