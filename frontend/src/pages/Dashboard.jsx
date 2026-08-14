import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
    Activity, LogOut, AlertTriangle, Clock, Home, Phone, Globe, Users,
    RefreshCw, ArrowLeft, Stethoscope, Download, Search, Volume2, ShieldAlert,
    MapPin, Radio, Check, X, PhoneCall, Building2, UserCheck, ShieldCheck,
    CheckCircle2, XCircle, CheckCheck, Trash2, Edit3, Filter, Plus, ChevronRight,
    Send, Info, Sparkles, HeartPulse, HeartHandshake, Eye, Lock
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { api, URGENCY_META, SPECIALTY_LIST } from "@/lib/api";

const ICONS = { emergency: AlertTriangle, soon: Clock, home: Home, needs_review: HeartPulse };
const LANG_VOICE = { hi: "hi-IN", en: "en-US", bn: "bn-IN", ta: "ta-IN" };

const REQUEST_STATUS_META = {
    pending: {
        label: "Pending Review",
        icon: Clock,
        badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    },
    accepted: {
        label: "Accepted & Scheduled",
        icon: CheckCircle2,
        badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    },
    declined: {
        label: "Declined",
        icon: XCircle,
        badge: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
    },
    completed: {
        label: "Completed",
        icon: CheckCheck,
        badge: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
    },
};

export default function Dashboard() {
    const [token, setToken] = useState(localStorage.getItem("sv_token"));
    const [user, setUser] = useState(null);
    const [loadingUser, setLoadingUser] = useState(!!token);

    const loadProfile = async () => {
        if (!localStorage.getItem("sv_token")) {
            setLoadingUser(false);
            return;
        }
        try {
            const { data } = await api.get("/auth/me");
            setUser(data);
        } catch (e) {
            console.error("Auth me error:", e);
            localStorage.removeItem("sv_token");
            setToken(null);
            setUser(null);
        } finally {
            setLoadingUser(false);
        }
    };

    useEffect(() => {
        loadProfile();
    }, [token]);

    const handleLoginSuccess = (data) => {
        localStorage.setItem("sv_token", data.token);
        setToken(data.token);
        setUser(data);
    };

    const handleLogout = () => {
        localStorage.removeItem("sv_token");
        setToken(null);
        setUser(null);
        toast.info("Logged out successfully");
    };

    if (!token || !user) {
        return <AuthPortal onSuccess={handleLoginSuccess} />;
    }

    if (user.role === "superadmin") {
        return <SuperAdminDashboard user={user} onLogout={handleLogout} />;
    }

    return <ClinicDashboard user={user} onLogout={handleLogout} />;
}

// -----------------------------------------------------------------------
// Authentication & Registration Portal
// -----------------------------------------------------------------------

function AuthPortal({ onSuccess }) {
    const [tab, setTab] = useState("signin"); // signin | register
    const [email, setEmail] = useState("clinic@swasthvaani.health");
    const [password, setPassword] = useState("clinic123");
    const [loading, setLoading] = useState(false);

    // Registration state
    const [regName, setRegName] = useState("");
    const [regType, setRegType] = useState("clinic"); // clinic | ngo
    const [regFacilityType, setRegFacilityType] = useState("private_clinic");
    const [regSpecialties, setRegSpecialties] = useState(["General Physician"]);
    const [regQualification, setRegQualification] = useState("");
    const [regPincode, setRegPincode] = useState("110001");
    const [regAddress, setRegAddress] = useState("");
    const [regPhone, setRegPhone] = useState("");
    const [regEmail, setRegEmail] = useState("");
    const [regPassword, setRegPassword] = useState("");

    const handleSignIn = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const { data } = await api.post("/auth/login", { email, password });
            toast.success(`Welcome back, ${data.name || data.email}!`);
            onSuccess(data);
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Invalid login credentials");
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        if (!regName.trim() || !regEmail.trim() || !regPassword.trim() || !regPincode.trim()) {
            return toast.error("Please fill all required fields");
        }
        setLoading(true);
        try {
            const payload = {
                name: regName.trim(),
                type: regType,
                facility_type: regType === "ngo" ? "ngo" : regFacilityType,
                specialties: regSpecialties,
                qualification: regQualification.trim(),
                pincode: regPincode.trim(),
                address: regAddress.trim(),
                phone: regPhone.trim(),
                email: regEmail.trim(),
                password: regPassword.trim()
            };
            const { data } = await api.post("/auth/register", payload);
            toast.success("Facility registered successfully!");
            onSuccess(data);
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Registration failed. Please check inputs.");
        } finally {
            setLoading(false);
        }
    };

    const toggleSpecialty = (spec) => {
        if (regSpecialties.includes(spec)) {
            if (regSpecialties.length === 1) return toast.info("Select at least one department");
            setRegSpecialties(regSpecialties.filter(s => s !== spec));
        } else {
            setRegSpecialties([...regSpecialties, spec]);
        }
    };

    const setQuickDemo = (demoType) => {
        if (demoType === "clinic") {
            setEmail("clinic@swasthvaani.health");
            setPassword("clinic123");
        } else if (demoType === "ngo") {
            setEmail("ngo@swasthvaani.health");
            setPassword("ngo123");
        } else if (demoType === "admin") {
            setEmail("admin@swasthvaani.health");
            setPassword("admin123");
        }
    };

    return (
        <div className="min-h-screen grain-bg flex" data-testid="clinic-login">
            {/* Left Hero Graphic Banner */}
            <div className="hidden lg:flex w-5/12 relative flex-col justify-between p-12 bg-zinc-950 text-white overflow-hidden">
                <div className="absolute inset-0 opacity-25 bg-[radial-gradient(#f97316_1px,transparent_1px)] [background-size:20px_20px]" />
                <div className="absolute top-1/3 -left-20 w-80 h-80 bg-primary/20 rounded-full blur-3xl" />
                <div className="absolute bottom-10 right-0 w-80 h-80 bg-emerald-500/15 rounded-full blur-3xl" />

                <div className="relative z-10">
                    <Link to="/" className="flex items-center gap-3 group">
                        <div className="w-11 h-11 rounded-2xl gradient-bg flex items-center justify-center shadow-lg glow-primary">
                            <Activity className="w-6 h-6 text-white" />
                        </div>
                        <span className="font-head font-black text-2xl tracking-tight">SwasthVaani</span>
                    </Link>
                </div>

                <div className="relative z-10 max-w-md space-y-4">
                    <Badge className="bg-primary/20 text-primary-foreground border-primary/30 text-xs font-bold px-3 py-1">
                        Healthcare Provider Network
                    </Badge>
                    <h2 className="font-head font-black text-4xl tracking-tight leading-tight text-white">
                        Direct Patient Referrals & Outbreak Surveillance
                    </h2>
                    <p className="text-zinc-400 text-sm leading-relaxed">
                        Clinics and NGOs receive prioritized consultation bookings from voice triage, while monitoring community disease trends in their PIN code.
                    </p>
                    
                    <div className="grid grid-cols-2 gap-3 pt-2">
                        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-3.5 space-y-1">
                            <Stethoscope className="w-4 h-4 text-primary" />
                            <p className="text-xs font-bold text-white">Instant Patient Referrals</p>
                            <p className="text-[11px] text-zinc-400">Direct booking from AI voice triage</p>
                        </div>
                        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-3.5 space-y-1">
                            <ShieldCheck className="w-4 h-4 text-emerald-400" />
                            <p className="text-xs font-bold text-white">Area Health Radar</p>
                            <p className="text-[11px] text-zinc-400">Passive symptom trend analytics</p>
                        </div>
                    </div>
                </div>

                <div className="relative z-10 text-xs text-zinc-500 flex items-center justify-between border-t border-zinc-800 pt-4">
                    <span>SwasthVaani National Health Grid</span>
                    <span>Role-Based Access Control</span>
                </div>
            </div>

            {/* Right Form Area */}
            <div className="flex-1 flex flex-col justify-center items-center px-6 py-12 max-h-screen overflow-y-auto">
                <div className="w-full max-w-md">
                    <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6 text-xs font-bold">
                        <ArrowLeft className="w-4 h-4" /> <span>Back to Home</span>
                    </Link>

                    <div className="mb-6">
                        <h1 className="font-head font-black text-2xl sm:text-3xl tracking-tight">
                            {tab === "signin" ? "Provider Portal Login" : "Register Facility / NGO"}
                        </h1>
                        <p className="text-muted-foreground mt-1 text-xs sm:text-sm">
                            {tab === "signin" ? "Sign in to manage patient requests and area triage logs." : "Register your Clinic or NGO for patient referrals."}
                        </p>
                    </div>

                    {/* Mode Toggle Pills */}
                    <div className="flex bg-muted/80 p-1 rounded-2xl mb-6 border border-border/70">
                        <button
                            type="button"
                            onClick={() => setTab("signin")}
                            className={`flex-1 py-2 text-xs font-extrabold rounded-xl transition-all ${
                                tab === "signin" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            Sign In
                        </button>
                        <button
                            type="button"
                            onClick={() => setTab("register")}
                            className={`flex-1 py-2 text-xs font-extrabold rounded-xl transition-all ${
                                tab === "register" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            Register Facility
                        </button>
                    </div>

                    {tab === "signin" ? (
                        <form onSubmit={handleSignIn} className="space-y-4">
                            <div>
                                <Label htmlFor="email" className="font-bold text-xs">Login Email</Label>
                                <Input
                                    id="email"
                                    data-testid="login-email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="mt-1 rounded-2xl h-11 bg-card text-sm"
                                    placeholder="doctor@clinic.health"
                                    required
                                />
                            </div>

                            <div>
                                <Label htmlFor="password" className="font-bold text-xs">Password</Label>
                                <Input
                                    id="password"
                                    data-testid="login-password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="mt-1 rounded-2xl h-11 bg-card text-sm"
                                    required
                                />
                            </div>

                            <Button 
                                type="submit" 
                                disabled={loading} 
                                data-testid="login-submit" 
                                className="w-full rounded-2xl h-12 font-extrabold gradient-bg text-white shadow-md hover:opacity-95 mt-2"
                            >
                                {loading ? "Signing in…" : "Sign In to Provider Console"}
                            </Button>

                            {/* Demo Quick-Fill Buttons */}
                            <div className="mt-8 pt-6 border-t border-border/60">
                                <p className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider mb-3">
                                    One-Click Demo Accounts
                                </p>
                                <div className="grid grid-cols-3 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setQuickDemo("clinic")}
                                        className="p-2.5 rounded-2xl border border-border/80 bg-card hover:border-primary/50 text-[11px] font-bold text-left transition-all shadow-2xs"
                                    >
                                        🏥 Clinic Demo
                                        <span className="block font-normal text-[10px] text-muted-foreground truncate">clinic@swasthvaani</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setQuickDemo("ngo")}
                                        className="p-2.5 rounded-2xl border border-border/80 bg-card hover:border-primary/50 text-[11px] font-bold text-left transition-all shadow-2xs"
                                    >
                                        🤝 NGO Demo
                                        <span className="block font-normal text-[10px] text-muted-foreground truncate">ngo@swasthvaani</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setQuickDemo("admin")}
                                        className="p-2.5 rounded-2xl border border-border/80 bg-card hover:border-primary/50 text-[11px] font-bold text-left transition-all shadow-2xs"
                                    >
                                        ⚡ SuperAdmin
                                        <span className="block font-normal text-[10px] text-muted-foreground truncate">admin@swasthvaani</span>
                                    </button>
                                </div>
                            </div>
                        </form>
                    ) : (
                        <form onSubmit={handleRegister} className="space-y-3.5 text-xs">
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <Label className="text-[11px] font-semibold">Account Type</Label>
                                    <select
                                        value={regType}
                                        onChange={(e) => setRegType(e.target.value)}
                                        className="w-full mt-1 h-9 rounded-xl bg-card border border-border px-2 text-xs font-semibold"
                                    >
                                        <option value="clinic">Clinic / Hospital</option>
                                        <option value="ngo">NGO Health Mission</option>
                                    </select>
                                </div>
                                {regType === "clinic" ? (
                                    <div>
                                        <Label className="text-[11px] font-semibold">Facility Model</Label>
                                        <select
                                            value={regFacilityType}
                                            onChange={(e) => setRegFacilityType(e.target.value)}
                                            className="w-full mt-1 h-9 rounded-xl bg-card border border-border px-2 text-xs font-semibold"
                                        >
                                            <option value="private_clinic">Private Clinic</option>
                                            <option value="free_clinic">Free PHC / Charitable</option>
                                        </select>
                                    </div>
                                ) : (
                                    <div>
                                        <Label className="text-[11px] font-semibold">Trust Model</Label>
                                        <Input disabled value="Non-Profit NGO" className="h-9 text-xs bg-muted/60 mt-1" />
                                    </div>
                                )}
                            </div>

                            <div>
                                <Label className="text-[11px] font-semibold">Facility / Organization Name *</Label>
                                <Input
                                    value={regName}
                                    onChange={(e) => setRegName(e.target.value)}
                                    placeholder="e.g. Apex Health Clinic / Seva Trust"
                                    className="mt-1 h-9 text-xs rounded-xl bg-card"
                                    required
                                />
                            </div>

                            <div>
                                <Label className="text-[11px] font-semibold">Medical Qualifications / Reg #</Label>
                                <Input
                                    value={regQualification}
                                    onChange={(e) => setRegQualification(e.target.value)}
                                    placeholder="e.g. MBBS, MD, Reg #DEL-4821"
                                    className="mt-1 h-9 text-xs rounded-xl bg-card"
                                />
                            </div>

                            {/* Specialties Checklist */}
                            <div>
                                <Label className="text-[11px] font-semibold block mb-1.5">Specialties & Departments (Select all that apply)</Label>
                                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 bg-card rounded-xl border border-border/70">
                                    {SPECIALTY_LIST.map((spec) => {
                                        const selected = regSpecialties.includes(spec);
                                        return (
                                            <button
                                                type="button"
                                                key={spec}
                                                onClick={() => toggleSpecialty(spec)}
                                                className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all ${
                                                    selected
                                                        ? "gradient-bg text-white border-transparent"
                                                        : "bg-background border-border text-muted-foreground hover:text-foreground"
                                                }`}
                                            >
                                                {selected ? `✓ ${spec}` : spec}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <Label className="text-[11px] font-semibold">6-Digit PIN Code *</Label>
                                    <Input
                                        value={regPincode}
                                        onChange={(e) => setRegPincode(e.target.value)}
                                        placeholder="110001"
                                        className="mt-1 h-9 text-xs rounded-xl bg-card"
                                        required
                                    />
                                </div>
                                <div>
                                    <Label className="text-[11px] font-semibold">Contact Phone</Label>
                                    <Input
                                        value={regPhone}
                                        onChange={(e) => setRegPhone(e.target.value)}
                                        placeholder="+91 98765 43210"
                                        className="mt-1 h-9 text-xs rounded-xl bg-card"
                                    />
                                </div>
                            </div>

                            <div>
                                <Label className="text-[11px] font-semibold">Street / Area Address</Label>
                                <Input
                                    value={regAddress}
                                    onChange={(e) => setRegAddress(e.target.value)}
                                    placeholder="12 Health Care Ave, Central District"
                                    className="mt-1 h-9 text-xs rounded-xl bg-card"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <Label className="text-[11px] font-semibold">Login Email *</Label>
                                    <Input
                                        type="email"
                                        value={regEmail}
                                        onChange={(e) => setRegEmail(e.target.value)}
                                        placeholder="contact@facility.health"
                                        className="mt-1 h-9 text-xs rounded-xl bg-card"
                                        required
                                    />
                                </div>
                                <div>
                                    <Label className="text-[11px] font-semibold">Password *</Label>
                                    <Input
                                        type="password"
                                        value={regPassword}
                                        onChange={(e) => setRegPassword(e.target.value)}
                                        className="mt-1 h-9 text-xs rounded-xl bg-card"
                                        required
                                    />
                                </div>
                            </div>

                            <Button 
                                type="submit" 
                                disabled={loading} 
                                className="w-full rounded-2xl h-11 font-bold gradient-bg text-white hover:opacity-95 text-xs mt-2"
                            >
                                {loading ? "Creating Account…" : "Complete Facility Registration"}
                            </Button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}

// -----------------------------------------------------------------------
// Clinic & NGO Dashboard View (Direct Requests + Area Triage)
// -----------------------------------------------------------------------

function ClinicDashboard({ user, onLogout }) {
    const [activeTab, setActiveTab] = useState("direct_requests"); // direct_requests | area_triage
    const [directRequests, setDirectRequests] = useState([]);
    const [areaTriage, setAreaTriage] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    // Direct request action modal state
    const [actingRequest, setActingRequest] = useState(null);
    const [actionNote, setActionNote] = useState("");
    const [updatingStatus, setUpdatingStatus] = useState(false);

    // Area filter state
    const [areaUrgencyFilter, setAreaUrgencyFilter] = useState("all");
    const [areaSearch, setAreaSearch] = useState("");
    const [selectedAreaItem, setSelectedAreaItem] = useState(null);

    const providerInfo = user.provider || {};
    const provPin = providerInfo.pincode || "";

    const loadData = async () => {
        setLoading(true);
        try {
            const [reqRes, areaRes, statRes] = await Promise.all([
                api.get("/clinic/requests"),
                api.get("/clinic/area-triage", { params: { pincode: provPin } }),
                api.get("/triage/stats")
            ]);
            setDirectRequests(reqRes.data || []);
            setAreaTriage(areaRes.data || []);
            setStats(statRes.data);
        } catch (e) {
            console.error("Dashboard load error:", e);
            if (e?.response?.status === 401) {
                toast.error("Session expired");
                onLogout();
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
        const iv = setInterval(loadData, 20000);
        return () => clearInterval(iv);
    }, []);

    const handleUpdateStatus = async (requestId, status, notes = "") => {
        setUpdatingStatus(true);
        try {
            const { data } = await api.patch(`/clinic/requests/${requestId}/status`, {
                status,
                notes
            });
            toast.success(`Request marked as ${status.toUpperCase()}`);
            setDirectRequests(directRequests.map(r => (r.id === requestId || r._id === requestId ? data : r)));
            setActingRequest(null);
            setActionNote("");
        } catch (e) {
            toast.error("Could not update request status");
        } finally {
            setUpdatingStatus(false);
        }
    };

    const speakBrowserText = (text, languageCode) => {
        if (!("speechSynthesis" in window)) return toast.info(text);
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = LANG_VOICE[languageCode] || "hi-IN";
        utterance.rate = 0.95;
        window.speechSynthesis.speak(utterance);
        toast.info("Playing spoken advice audio...");
    };

    const playDoctorAudio = (item) => {
        if (!item) return;
        const text = typeof item === "string" ? item : (item.spoken || item.advice || item.transcript);
        const languageCode = typeof item === "string" ? "hi" : (item.language || "hi");
        if (typeof item === "object" && item.audio_base64) {
            try {
                const audio = new Audio(`data:audio/mp3;base64,${item.audio_base64}`);
                audio.play().then(() => toast.info("Playing recorded audio guidance...")).catch(() => speakBrowserText(text, languageCode));
                return;
            } catch (e) {
                // Fallback to SpeechSynthesis
            }
        }
        speakBrowserText(text, languageCode);
    };

    const pendingDirectCount = directRequests.filter(r => r.status === "pending").length;

    const filteredAreaTriage = areaTriage.filter(r => {
        const matchesUrgency = areaUrgencyFilter === "all" || r.urgency === areaUrgencyFilter;
        const matchesSearch = !areaSearch.trim() ||
            (r.caller && r.caller.toLowerCase().includes(areaSearch.toLowerCase())) ||
            (r.transcript && r.transcript.toLowerCase().includes(areaSearch.toLowerCase())) ||
            (r.summary && r.summary.toLowerCase().includes(areaSearch.toLowerCase()));
        return matchesUrgency && matchesSearch;
    });

    return (
        <div className="min-h-screen grain-bg" data-testid="clinic-dashboard">
            {/* Header */}
            <header className="sticky top-0 z-30 glass-header border-b border-border/80">
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl gradient-bg flex items-center justify-center shadow-xs text-white">
                            <Activity className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="font-head font-extrabold tracking-tight text-foreground">{providerInfo.name || "Clinic Console"}</span>
                                <Badge className="text-[10px] uppercase font-bold py-0.5 px-2 bg-primary/10 text-primary border-primary/20">
                                    {user.role === "ngo" ? "NGO Mission" : "Healthcare Clinic"}
                                </Badge>
                            </div>
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                                {provPin && <span>PIN: <b>{provPin}</b> · </span>}
                                {providerInfo.qualification || "Registered Partner"}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={loadData} className="rounded-full text-xs font-semibold">
                            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
                        </Button>
                        <Button variant="outline" size="sm" onClick={onLogout} className="rounded-full text-xs font-semibold border-border/80">
                            <LogOut className="w-3.5 h-3.5 mr-1.5" /> Logout
                        </Button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 py-8">
                {/* Top View Selector Tabs */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border/60 mb-6">
                    <div>
                        <h1 className="font-head font-black text-2xl sm:text-3xl tracking-tight">Clinical Care Dashboard</h1>
                        <p className="text-sm text-muted-foreground mt-0.5">Manage patient referrals or review community health triage in your area.</p>
                    </div>

                    {/* View Switcher Tabs */}
                    <div className="flex bg-muted/80 p-1 rounded-2xl border border-border/60 self-start sm:self-auto shadow-2xs">
                        <button
                            onClick={() => setActiveTab("direct_requests")}
                            data-testid="tab-direct-requests"
                            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition-all ${
                                activeTab === "direct_requests"
                                    ? "bg-card text-foreground shadow-xs border border-border/80"
                                    : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            <Stethoscope className="w-3.5 h-3.5 text-primary" />
                            Direct Patient Referrals
                            {pendingDirectCount > 0 && (
                                <span className="w-5 h-5 rounded-full bg-rose-600 text-white text-[10px] font-black flex items-center justify-center animate-pulse">
                                    {pendingDirectCount}
                                </span>
                            )}
                        </button>

                        <button
                            onClick={() => setActiveTab("area_triage")}
                            data-testid="tab-area-triage"
                            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition-all ${
                                activeTab === "area_triage"
                                    ? "bg-card text-foreground shadow-xs border border-border/80"
                                    : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            <MapPin className="w-3.5 h-3.5 text-secondary" />
                            Area Surveillance Radar
                        </button>
                    </div>
                </div>

                {/* TAB 1: DIRECT PATIENT REFERRALS VIEW */}
                {activeTab === "direct_requests" && (
                    <div className="space-y-6" data-testid="direct-requests-panel">
                        {/* Summary Metrics */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <StatCard
                                testid="stat-direct-total"
                                icon={Users}
                                label="Total Referrals"
                                value={directRequests.length}
                                tone="bg-primary/10 text-primary"
                            />
                            <StatCard
                                testid="stat-direct-pending"
                                icon={Clock}
                                label="Pending Review"
                                value={directRequests.filter(r => r.status === "pending").length}
                                tone="bg-amber-500/15 text-amber-600"
                            />
                            <StatCard
                                testid="stat-direct-accepted"
                                icon={CheckCircle2}
                                label="Accepted / Scheduled"
                                value={directRequests.filter(r => r.status === "accepted").length}
                                tone="bg-emerald-500/15 text-emerald-600"
                            />
                            <StatCard
                                testid="stat-direct-completed"
                                icon={CheckCheck}
                                label="Completed"
                                value={directRequests.filter(r => r.status === "completed").length}
                                tone="bg-blue-500/15 text-blue-600"
                            />
                        </div>

                        {/* Requests Feed */}
                        <div className="bg-card border border-border/80 rounded-3xl p-6 shadow-sm">
                            <div className="flex items-center justify-between mb-4 border-b border-border/50 pb-3">
                                <div>
                                    <h3 className="font-head font-bold text-lg text-foreground">Direct Consultation Requests</h3>
                                    <p className="text-xs text-muted-foreground">Patients who explicitly selected your clinic/NGO after AI voice triage.</p>
                                </div>
                                <Badge variant="outline" className="font-bold text-xs">{directRequests.length} Total</Badge>
                            </div>

                            {directRequests.length === 0 ? (
                                <div className="py-16 text-center text-muted-foreground flex flex-col items-center">
                                    <Stethoscope className="w-10 h-10 text-muted-foreground/40 mb-3" />
                                    <p className="font-bold text-base text-foreground">No direct patient requests received yet</p>
                                    <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                                        When patients complete voice triage and pick your facility, their symptoms and contact details will appear here.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {directRequests.map((req, idx) => {
                                        const statusMeta = REQUEST_STATUS_META[req.status] || REQUEST_STATUS_META.pending;
                                        const StatusIcon = statusMeta.icon;
                                        const urgencyMeta = URGENCY_META[req.triage_urgency] || URGENCY_META.soon;

                                        return (
                                            <div
                                                key={req.id || req._id || idx}
                                                className="bg-card border border-border/80 rounded-2xl p-5 hover:border-primary/40 transition-all shadow-xs"
                                                data-testid={`clinic-request-item-${req.id || idx}`}
                                            >
                                                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3 border-b border-border/40">
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <h4 className="font-bold text-base text-foreground">{req.patient_name || "Patient"}</h4>
                                                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${statusMeta.badge}`}>
                                                                <StatusIcon className="w-3 h-3" /> {statusMeta.label}
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                                                            <span>Phone: <b>{req.patient_contact || "Anonymous Web Session"}</b></span>
                                                            {req.patient_pincode && <span>· PIN: <b>{req.patient_pincode}</b></span>}
                                                            <span>· Requested: {new Date(req.created_at).toLocaleString()}</span>
                                                        </p>
                                                    </div>

                                                    <div className="flex items-center gap-1.5 self-start">
                                                        <Badge className={`${urgencyMeta.badge} font-bold text-xs rounded-full border-0`}>
                                                            {urgencyMeta.label}
                                                        </Badge>
                                                    </div>
                                                </div>

                                                {/* Clinical Summary & Transcript */}
                                                <div className="py-3 text-xs space-y-2">
                                                    <div>
                                                        <span className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wide">Symptoms & Triage Summary:</span>
                                                        <p className="text-foreground font-semibold mt-0.5">{req.symptom_summary || "Symptom check"}</p>
                                                    </div>
                                                    {req.transcript && (
                                                        <p className="italic text-muted-foreground bg-muted/40 p-2.5 rounded-xl border border-border/40">
                                                            "{req.transcript}"
                                                        </p>
                                                    )}
                                                    {req.notes && (
                                                        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-2.5 text-emerald-800 dark:text-emerald-300">
                                                            <span className="font-bold">Clinic Note:</span> {req.notes}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Actions Toolbar */}
                                                <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-border/40">
                                                    <div className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
                                                        <Stethoscope className="w-3.5 h-3.5 text-primary" />
                                                        Specialty: <b>{req.suggested_specialty || "General Physician"}</b>
                                                    </div>

                                                    <div className="flex items-center gap-2">
                                                        {req.status === "pending" && (
                                                            <>
                                                                <Button
                                                                    size="sm"
                                                                    onClick={() => setActingRequest(req)}
                                                                    className="rounded-full h-8 px-4 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                                                                >
                                                                    <Check className="w-3.5 h-3.5 mr-1" /> Accept & Schedule
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={() => handleUpdateStatus(req.id || req._id, "declined")}
                                                                    className="rounded-full h-8 px-3 text-xs font-bold text-rose-600 hover:bg-rose-50 border-rose-200"
                                                                >
                                                                    <X className="w-3.5 h-3.5 mr-1" /> Decline
                                                                </Button>
                                                            </>
                                                        )}

                                                        {req.status === "accepted" && (
                                                            <Button
                                                                size="sm"
                                                                onClick={() => handleUpdateStatus(req.id || req._id, "completed")}
                                                                className="rounded-full h-8 px-4 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
                                                            >
                                                                <CheckCheck className="w-3.5 h-3.5 mr-1" /> Mark Complete
                                                            </Button>
                                                        )}

                                                        {req.status === "declined" && (
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => handleUpdateStatus(req.id || req._id, "pending")}
                                                                className="rounded-full h-8 px-3 text-xs font-bold"
                                                            >
                                                                Re-open Request
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* TAB 2: AREA OVERVIEW (PASSIVE SURVEILLANCE & LOGS) */}
                {activeTab === "area_triage" && (
                    <div className="space-y-6" data-testid="area-triage-panel">
                        {/* Summary Metrics */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <StatCard testid="stat-total" icon={Users} label="Total Area Triage" value={areaTriage.length} tone="bg-primary/10 text-primary" />
                            <StatCard testid="stat-emergency" icon={AlertTriangle} label="Emergencies Today" value={stats?.emergencies_today ?? 0} tone="bg-destructive/10 text-destructive" />
                            <StatCard testid="stat-ivr" icon={Phone} label="IVR Calls" value={stats?.by_source?.ivr ?? 0} tone="bg-secondary/15 text-secondary" />
                            <StatCard testid="stat-doctor" icon={Stethoscope} label="Needs Doctor" value={(stats?.by_urgency?.emergency ?? 0) + (stats?.by_urgency?.soon ?? 0)} tone="bg-accent/20 text-accent" />
                        </div>

                        {/* Search & Filter Bar */}
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                            <div className="flex gap-2 flex-wrap">
                                {[
                                    { id: "all", label: "All Cases" },
                                    { id: "emergency", label: "Emergency 🚨" },
                                    { id: "soon", label: "See Soon ⏳" },
                                    { id: "home", label: "Home Care 🏠" },
                                    { id: "needs_review", label: "Needs Review 🧑‍⚕️" },
                                ].map(t => (
                                    <button
                                        key={t.id}
                                        onClick={() => setAreaUrgencyFilter(t.id)}
                                        className={`px-4 py-2 rounded-full text-xs font-bold border transition-all ${
                                            areaUrgencyFilter === t.id ? "bg-foreground text-background border-foreground shadow-xs" : "bg-card border-border text-muted-foreground hover:text-foreground"
                                        }`}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>

                            <div className="relative w-full sm:w-72">
                                <Search className="w-4 h-4 absolute left-3.5 top-3 text-muted-foreground" />
                                <Input
                                    placeholder="Search symptoms or caller..."
                                    value={areaSearch}
                                    onChange={(e) => setAreaSearch(e.target.value)}
                                    className="pl-9.5 rounded-full bg-card h-10 text-xs border-border/80"
                                />
                            </div>
                        </div>

                        {/* Area Triage Table */}
                        <div className="bg-card border border-border/80 rounded-3xl overflow-hidden shadow-sm">
                            <div className="grid grid-cols-12 gap-4 px-6 py-3.5 bg-muted/60 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/60">
                                <div className="col-span-3">Caller</div>
                                <div className="col-span-4">Symptoms & Summary</div>
                                <div className="col-span-2">Triage Urgency</div>
                                <div className="col-span-1">Audio</div>
                                <div className="col-span-2 text-right">Time</div>
                            </div>
                            <div className="divide-y divide-border/60">
                                {filteredAreaTriage.length === 0 ? (
                                    <div className="px-6 py-16 text-center text-muted-foreground">
                                        No area triage logs matching current filter.
                                    </div>
                                ) : (
                                    filteredAreaTriage.map((r, i) => {
                                        const meta = URGENCY_META[r.urgency] || URGENCY_META.soon;
                                        const Icon = ICONS[r.urgency] || Clock;
                                        const isEmergency = r.urgency === "emergency";
                                        return (
                                            <div
                                                key={r.id || i}
                                                onClick={() => setSelectedAreaItem(r)}
                                                className={`grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-muted/30 transition-all border-l-4 cursor-pointer ${
                                                    isEmergency ? "border-l-rose-600 bg-rose-500/5 hover:bg-rose-500/10" : "border-l-transparent"
                                                }`}
                                            >
                                                <div className="col-span-3 flex items-center gap-2.5 min-w-0">
                                                    <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${r.source === "ivr" ? "bg-secondary/15 text-secondary" : "bg-primary/10 text-primary"}`}>
                                                        {r.source === "ivr" ? <Phone className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
                                                    </span>
                                                    <div className="min-w-0">
                                                        <p className="font-bold truncate text-sm text-foreground">{r.caller}</p>
                                                        <p className="text-[11px] text-muted-foreground capitalize">{r.source} · {r.language?.toUpperCase()}</p>
                                                    </div>
                                                </div>

                                                <div className="col-span-4 min-w-0">
                                                    <p className="text-sm font-semibold text-foreground truncate">{r.summary || r.transcript}</p>
                                                    <p className="text-xs text-muted-foreground truncate italic">"{r.transcript}"</p>
                                                    {r.symptoms && r.symptoms.length > 0 && (
                                                        <div className="flex flex-wrap gap-1 mt-1.5">
                                                            {r.symptoms.slice(0, 3).map((s, si) => (
                                                                <span key={si} className="bg-primary/10 text-primary text-[10px] px-2 py-0.5 rounded-full font-bold">{s}</span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="col-span-2 flex flex-col gap-1">
                                                    <Badge className={`${meta.badge} rounded-full gap-1.5 font-bold border-0 px-3 py-1 w-fit text-xs`}>
                                                        <Icon className="w-3.5 h-3.5" /> {meta.label}
                                                    </Badge>
                                                </div>

                                                <div className="col-span-1">
                                                    <button
                                                        onClick={(e) => {
                                                             e.stopPropagation();
                                                             playDoctorAudio(r.spoken || r.advice || r.transcript, r.language);
                                                        }}
                                                        className="w-8 h-8 rounded-full bg-primary/10 hover:bg-primary text-primary hover:text-white transition-colors flex items-center justify-center shadow-2xs"
                                                        title="Play voice output"
                                                    >
                                                        <Volume2 className="w-4 h-4" />
                                                    </button>
                                                </div>

                                                <div className="col-span-2 text-right text-xs font-semibold text-muted-foreground">
                                                    {new Date(r.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </main>

            {/* Accept / Schedule Dialog Box */}
            <AnimatePresence>
                {actingRequest && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/60 backdrop-blur-sm" onClick={() => setActingRequest(null)}>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-card border border-border/80 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between">
                                <h3 className="font-head font-bold text-lg text-foreground">Accept & Schedule Consultation</h3>
                                <button onClick={() => setActingRequest(null)} className="text-muted-foreground hover:text-foreground">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <p className="text-xs text-muted-foreground">
                                Add an optional appointment slot or doctor note that will be instantly visible to the patient on their tracking portal.
                            </p>

                            <div>
                                <Label className="text-xs font-bold">Doctor Instructions / Appointment Slot</Label>
                                <Textarea
                                    rows={3}
                                    placeholder="e.g. Appointment confirmed for today at 3:30 PM. Please bring any past prescription slips."
                                    value={actionNote}
                                    onChange={(e) => setActionNote(e.target.value)}
                                    className="mt-1.5 text-xs rounded-2xl bg-background"
                                />
                            </div>

                            <div className="flex justify-end gap-2 pt-2">
                                <Button variant="ghost" size="sm" onClick={() => setActingRequest(null)} className="rounded-full text-xs font-bold">
                                    Cancel
                                </Button>
                                <Button
                                    size="sm"
                                    disabled={updatingStatus}
                                    onClick={() => handleUpdateStatus(actingRequest.id || actingRequest._id, "accepted", actionNote)}
                                    className="rounded-full text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white px-5 shadow-xs"
                                >
                                    {updatingStatus ? "Confirming..." : "Confirm & Notify Patient"}
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Area Case Detail Modal */}
            <AnimatePresence>
                {selectedAreaItem && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/60 backdrop-blur-sm" onClick={() => setSelectedAreaItem(null)}>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-card border border-border/80 rounded-3xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 md:p-8 shadow-2xl relative space-y-4"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button onClick={() => setSelectedAreaItem(null)} className="absolute top-5 right-5 text-muted-foreground hover:text-foreground">
                                <X className="w-5 h-5" />
                            </button>

                            <h3 className="font-head font-bold text-xl">Area Triage Case Details</h3>
                            <div className="text-xs space-y-2">
                                <p><b>Caller:</b> {selectedAreaItem.caller}</p>
                                <p><b>Language:</b> {selectedAreaItem.language?.toUpperCase()}</p>
                                <p><b>Urgency:</b> <span className="uppercase font-bold">{selectedAreaItem.urgency}</span></p>
                                <p><b>Transcript:</b> "{selectedAreaItem.transcript}"</p>
                                <p><b>Advice:</b> {selectedAreaItem.advice}</p>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}

// -----------------------------------------------------------------------
// Super Admin Portal View
// -----------------------------------------------------------------------

function SuperAdminDashboard({ user, onLogout }) {
    const [adminStats, setAdminStats] = useState(null);
    const [providers, setProviders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("providers"); // providers | triage_feed
    const [triageFeed, setTriageFeed] = useState([]);

    const loadAdminData = async () => {
        setLoading(true);
        try {
            const [statRes, provRes, triageRes] = await Promise.all([
                api.get("/admin/stats"),
                api.get("/admin/providers"),
                api.get("/triage/requests")
            ]);
            setAdminStats(statRes.data);
            setProviders(provRes.data || []);
            setTriageFeed(triageRes.data || []);
        } catch (e) {
            console.error("Admin load error:", e);
            toast.error("Could not load administrative data");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAdminData();
    }, []);

    const handleUpdateProviderStatus = async (providerId, newStatus) => {
        try {
            const { data } = await api.patch(`/admin/providers/${providerId}/status`, { status: newStatus });
            toast.success(`Provider status updated to ${newStatus.toUpperCase()}`);
            setProviders(providers.map(p => (p.id === providerId || p._id === providerId ? { ...p, status: newStatus } : p)));
        } catch (e) {
            toast.error("Failed to update provider status");
        }
    };

    const handleDeleteProvider = async (providerId) => {
        if (!window.confirm("Are you sure you want to remove this provider account?")) return;
        try {
            await api.delete(`/admin/providers/${providerId}`);
            toast.success("Provider account removed");
            setProviders(providers.filter(p => p.id !== providerId && p._id !== providerId));
        } catch (e) {
            toast.error("Could not delete provider");
        }
    };

    return (
        <div className="min-h-screen grain-bg" data-testid="superadmin-dashboard">
            {/* Header */}
            <header className="sticky top-0 z-30 bg-zinc-950 text-white border-b border-zinc-800">
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-amber-500 text-zinc-950 flex items-center justify-center font-bold shadow-md">
                            <ShieldCheck className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="font-head font-black tracking-tight">SwasthVaani SuperAdmin</span>
                                <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[10px] font-bold">
                                    Root Access
                                </Badge>
                            </div>
                            <span className="text-[11px] text-zinc-400">National Health Directory & Governance</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={loadAdminData} className="rounded-full text-xs font-semibold text-zinc-300 hover:text-white">
                            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
                        </Button>
                        <Button variant="outline" size="sm" onClick={onLogout} className="rounded-full text-xs font-semibold border-zinc-700 text-zinc-200 hover:bg-zinc-800">
                            <LogOut className="w-3.5 h-3.5 mr-1.5" /> Logout
                        </Button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
                {/* Aggregate System Stats */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard
                        testid="admin-stat-clinics"
                        icon={Building2}
                        label="Registered Clinics"
                        value={adminStats?.providers?.clinics ?? providers.filter(p => p.type === "clinic").length}
                        tone="bg-primary/10 text-primary"
                    />
                    <StatCard
                        testid="admin-stat-ngos"
                        icon={HeartHandshake}
                        label="Registered NGOs"
                        value={adminStats?.providers?.ngos ?? providers.filter(p => p.type === "ngo").length}
                        tone="bg-secondary/15 text-secondary"
                    />
                    <StatCard
                        testid="admin-stat-requests"
                        icon={Stethoscope}
                        label="Direct Patient Bookings"
                        value={adminStats?.patient_requests?.total ?? 0}
                        tone="bg-blue-500/15 text-blue-600"
                    />
                    <StatCard
                        testid="admin-stat-triage"
                        icon={Activity}
                        label="Global Triage Logs"
                        value={adminStats?.triage?.total ?? triageFeed.length}
                        tone="bg-amber-500/15 text-amber-600"
                    />
                </div>

                {/* Navigation Tabs */}
                <div className="flex bg-muted/80 p-1 rounded-2xl border border-border/60 w-fit">
                    <button
                        onClick={() => setActiveTab("providers")}
                        className={`px-5 py-2 rounded-xl text-xs font-bold transition-all ${
                            activeTab === "providers" ? "bg-card text-foreground shadow-xs border border-border/80" : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        Manage Clinics & NGOs ({providers.length})
                    </button>
                    <button
                        onClick={() => setActiveTab("triage_feed")}
                        className={`px-5 py-2 rounded-xl text-xs font-bold transition-all ${
                            activeTab === "triage_feed" ? "bg-card text-foreground shadow-xs border border-border/80" : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        Global Triage Feed ({triageFeed.length})
                    </button>
                </div>

                {/* Providers Table Tab */}
                {activeTab === "providers" && (
                    <div className="bg-card border border-border/80 rounded-3xl overflow-hidden shadow-sm">
                        <div className="p-6 border-b border-border/60 flex items-center justify-between">
                            <div>
                                <h3 className="font-head font-bold text-lg text-foreground">Registered Healthcare Facilities & NGOs</h3>
                                <p className="text-xs text-muted-foreground">Approve new registrations, manage status, and monitor consultation load.</p>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-muted/60 text-muted-foreground font-semibold uppercase text-[10px] tracking-wider border-b border-border/60">
                                    <tr>
                                        <th className="py-3.5 px-6">Facility Name</th>
                                        <th className="py-3.5 px-4">Type</th>
                                        <th className="py-3.5 px-4">Specialties</th>
                                        <th className="py-3.5 px-4">PIN / City</th>
                                        <th className="py-3.5 px-4">Total Referrals</th>
                                        <th className="py-3.5 px-4">Status</th>
                                        <th className="py-3.5 px-6 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/60">
                                    {providers.map((p, idx) => {
                                        const isApproved = p.status === "approved";
                                        const isDeactivated = p.status === "deactivated";

                                        return (
                                            <tr key={p.id || p._id || idx} className="hover:bg-muted/30 transition-colors">
                                                <td className="py-4 px-6">
                                                    <p className="font-bold text-foreground text-sm">{p.name}</p>
                                                    <p className="text-[11px] text-muted-foreground">{p.email} · {p.phone || "No phone"}</p>
                                                    {p.qualification && (
                                                        <p className="text-[10px] text-muted-foreground italic mt-0.5">{p.qualification}</p>
                                                    )}
                                                </td>

                                                <td className="py-4 px-4">
                                                    <Badge variant="outline" className="text-[10px] uppercase font-bold py-0.5">
                                                        {p.type === "ngo" ? "NGO" : p.facility_type || "Clinic"}
                                                    </Badge>
                                                </td>

                                                <td className="py-4 px-4 max-w-xs">
                                                    <div className="flex flex-wrap gap-1">
                                                        {(p.specialties || ["General Physician"]).slice(0, 3).map((s, si) => (
                                                            <span key={si} className="bg-primary/10 text-primary text-[10px] px-2 py-0.5 rounded-full font-semibold">
                                                                {s}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </td>

                                                <td className="py-4 px-4 font-semibold text-foreground">
                                                    {p.pincode || "—"}
                                                </td>

                                                <td className="py-4 px-4 font-bold text-foreground">
                                                    {p.total_requests || 0}
                                                </td>

                                                <td className="py-4 px-4">
                                                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                                                        isApproved ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                                                            : isDeactivated ? "bg-rose-500/10 text-rose-700 border-rose-500/30"
                                                                : "bg-amber-500/15 text-amber-700 border-amber-500/30"
                                                    }`}>
                                                        {p.status?.toUpperCase() || "PENDING"}
                                                    </span>
                                                </td>

                                                <td className="py-4 px-6 text-right">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        {!isApproved && (
                                                            <Button
                                                                size="sm"
                                                                onClick={() => handleUpdateProviderStatus(p.id || p._id, "approved")}
                                                                className="rounded-full h-7 px-3 text-[11px] font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-2xs"
                                                            >
                                                                Approve
                                                            </Button>
                                                        )}
                                                        {isApproved && (
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => handleUpdateProviderStatus(p.id || p._id, "deactivated")}
                                                                className="rounded-full h-7 px-3 text-[11px] font-bold text-amber-600 border-amber-300 hover:bg-amber-50"
                                                            >
                                                                Deactivate
                                                            </Button>
                                                        )}
                                                        {isDeactivated && (
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => handleUpdateProviderStatus(p.id || p._id, "approved")}
                                                                className="rounded-full h-7 px-3 text-[11px] font-bold text-emerald-600 border-emerald-300"
                                                            >
                                                                Reactivate
                                                            </Button>
                                                        )}
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => handleDeleteProvider(p.id || p._id)}
                                                            className="rounded-full h-7 w-7 p-0 text-rose-600 hover:bg-rose-50"
                                                            title="Delete Provider"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Global Triage Feed Tab */}
                {activeTab === "triage_feed" && (
                    <div className="bg-card border border-border/80 rounded-3xl p-6 shadow-sm">
                        <h3 className="font-head font-bold text-lg text-foreground mb-4">Global Health Triage Activity</h3>
                        <div className="space-y-3">
                            {triageFeed.map((item, idx) => {
                                const urgencyMeta = URGENCY_META[item.urgency] || URGENCY_META.soon;
                                return (
                                    <div key={idx} className="bg-background/60 border border-border/60 rounded-2xl p-4 flex items-center justify-between text-xs">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-foreground">{item.caller}</span>
                                                <Badge className={`${urgencyMeta.badge} text-[10px] font-bold py-0.5 border-0`}>
                                                    {urgencyMeta.label}
                                                </Badge>
                                                {item.suggested_specialty && (
                                                    <span className="text-primary font-semibold text-[10px]">
                                                        · {item.suggested_specialty}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-muted-foreground mt-1 italic">"{item.transcript}"</p>
                                        </div>
                                        <div className="text-right text-muted-foreground text-[11px] font-medium">
                                            {new Date(item.created_at).toLocaleString()}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}

function StatCard({ icon: Icon, label, value, tone, testid }) {
    return (
        <div className="bg-card border border-border/80 rounded-3xl p-5 shadow-xs hover:border-primary/40 transition-all" data-testid={testid}>
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center mb-3.5 shadow-2xs ${tone}`}>
                <Icon className="w-5 h-5" />
            </div>
            <p className="font-head font-black text-3xl sm:text-4xl tracking-tight text-foreground">{value}</p>
            <p className="text-xs font-semibold text-muted-foreground mt-1">{label}</p>
        </div>
    );
}
