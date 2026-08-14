import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { 
    ArrowLeft, Activity, Clock, CheckCircle2, XCircle, CheckCheck, RefreshCw, 
    Building2, MapPin, Phone, Stethoscope, AlertTriangle, Search, PlusCircle, 
    Calendar, UserCheck, ChevronRight, MessageSquare, ShieldCheck, HeartPulse
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api, getPatientSessionId, URGENCY_META } from "@/lib/api";

const STATUS_CONFIG = {
    pending: {
        label: "Pending Review",
        icon: Clock,
        step: 1,
        bg: "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400",
        badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
        desc: "The clinic or NGO has received your referral and is assigning a doctor slot."
    },
    accepted: {
        label: "Confirmed / Scheduled",
        icon: CheckCircle2,
        step: 2,
        bg: "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
        badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
        desc: "Your consultation appointment is confirmed! Please review visit instructions below."
    },
    declined: {
        label: "Unavailable",
        icon: XCircle,
        step: 0,
        bg: "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400",
        badge: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
        desc: "Provider is currently at capacity. Please consult another nearby clinic or local PHC."
    },
    completed: {
        label: "Consultation Completed",
        icon: CheckCheck,
        step: 3,
        bg: "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400",
        badge: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
        desc: "This medical consultation has been concluded and closed by the provider."
    }
};

export default function MyRequests() {
    const sessionId = getPatientSessionId();
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [phoneFilter, setPhoneFilter] = useState("");
    const [searching, setSearching] = useState(false);

    const fetchRequests = async (phone = "") => {
        setLoading(true);
        try {
            const params = {};
            if (phone.trim()) {
                params.patient_contact = phone.trim();
            } else {
                params.session_id = sessionId;
            }
            const { data } = await api.get("/patient/requests", { params });
            setRequests(data || []);
        } catch (err) {
            console.error("Error fetching patient requests:", err);
            toast.error("Could not refresh consultation requests");
        } finally {
            setLoading(false);
            setSearching(false);
        }
    };

    useEffect(() => {
        fetchRequests();
    }, []);

    const handleSearch = (e) => {
        e.preventDefault();
        setSearching(true);
        fetchRequests(phoneFilter);
    };

    const handleResetFilter = () => {
        setPhoneFilter("");
        fetchRequests("");
    };

    return (
        <div className="min-h-screen grain-bg flex flex-col" data-testid="patient-requests-page">
            {/* Sticky Header */}
            <header className="sticky top-0 z-40 glass-header border-b border-border/80">
                <div className="max-w-3xl mx-auto px-5 h-16 flex items-center justify-between">
                    <Link to="/speak" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors group">
                        <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" /> 
                        <span className="font-bold text-xs sm:text-sm">Voice Triage</span>
                    </Link>
                    
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-xl gradient-bg flex items-center justify-center text-white shadow-xs">
                            <Activity className="w-4 h-4" />
                        </div>
                        <span className="font-head font-extrabold text-sm tracking-tight">SwasthVaani</span>
                    </div>
                </div>
            </header>

            <main className="flex-1 max-w-3xl mx-auto w-full px-5 py-8">
                {/* Title & Top Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border/60">
                    <div>
                        <div className="flex items-center gap-2.5">
                            <h1 className="font-head font-black text-2xl sm:text-3xl tracking-tight">
                                My Consultation Requests
                            </h1>
                            <Badge className="bg-primary/10 text-primary border-primary/20 text-xs font-black px-2.5 py-0.5 rounded-full">
                                {requests.length} Active
                            </Badge>
                        </div>
                        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                            Live tracking for your clinic and NGO doctor appointments booked through SwasthVaani.
                        </p>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto">
                        <Button 
                            onClick={() => fetchRequests(phoneFilter)} 
                            variant="outline" 
                            size="sm" 
                            className="rounded-full h-9 px-4 text-xs font-bold border-border/80 hover:bg-card"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
                        </Button>
                        <Link to="/speak">
                            <Button size="sm" className="rounded-full h-9 px-4 text-xs font-extrabold gradient-bg text-white shadow-md hover:opacity-95">
                                <PlusCircle className="w-3.5 h-3.5 mr-1.5" /> New Triage
                            </Button>
                        </Link>
                    </div>
                </div>

                {/* Phone Lookup Filter */}
                <form onSubmit={handleSearch} className="mt-6 bg-card border border-border/80 rounded-3xl p-3 sm:p-4 flex flex-col sm:flex-row gap-2.5 shadow-sm">
                    <div className="relative flex-1">
                        <Search className="w-4 h-4 absolute left-3.5 top-3 text-muted-foreground" />
                        <Input
                            placeholder="Lookup records by phone (e.g. +91 98111 22334)"
                            value={phoneFilter}
                            onChange={(e) => setPhoneFilter(e.target.value)}
                            className="pl-10 h-10 rounded-2xl text-xs sm:text-sm bg-background/50 border-border/70"
                        />
                    </div>
                    <div className="flex gap-2">
                        <Button type="submit" size="sm" disabled={searching} className="rounded-2xl h-10 px-5 text-xs font-bold gradient-bg text-white shadow-xs">
                            {searching ? "Searching..." : "Lookup"}
                        </Button>
                        {phoneFilter && (
                            <Button type="button" variant="ghost" size="sm" onClick={handleResetFilter} className="rounded-2xl h-10 px-3 text-xs font-semibold">
                                Reset
                            </Button>
                        )}
                    </div>
                </form>

                {/* Request List */}
                <div className="mt-6 space-y-4">
                    {loading && requests.length === 0 ? (
                        <div className="py-20 text-center text-muted-foreground flex flex-col items-center">
                            <RefreshCw className="w-8 h-8 animate-spin text-primary mb-3" />
                            <p className="font-bold text-sm text-foreground">Loading your consultation records...</p>
                        </div>
                    ) : requests.length === 0 ? (
                        <div className="py-16 text-center bg-card border border-dashed border-border/80 rounded-3xl p-8 flex flex-col items-center shadow-xs">
                            <div className="w-16 h-16 rounded-3xl bg-primary/10 text-primary flex items-center justify-center mb-4 shadow-inner">
                                <Stethoscope className="w-8 h-8" />
                            </div>
                            <h3 className="font-head font-black text-xl text-foreground">No consultation requests found</h3>
                            <p className="text-xs sm:text-sm text-muted-foreground max-w-md mt-1 mb-6 leading-relaxed">
                                When you complete voice triage and select a recommended specialist or clinic, your request will appear here with live tracking.
                            </p>
                            <Link to="/speak">
                                <Button className="rounded-full h-11 px-8 font-extrabold gradient-bg text-white shadow-md glow-primary">
                                    Start Voice Triage
                                </Button>
                            </Link>
                        </div>
                    ) : (
                        <AnimatePresence>
                            {requests.map((req, idx) => {
                                const statusCfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
                                const StatusIcon = statusCfg.icon;
                                const urgencyMeta = URGENCY_META[req.triage_urgency] || URGENCY_META.soon;

                                return (
                                    <motion.div
                                        key={req.id || req._id || idx}
                                        initial={{ opacity: 0, y: 12 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.3, delay: idx * 0.05 }}
                                        className="bg-card border border-border/80 rounded-3xl p-5 sm:p-6 shadow-sm hover:border-primary/40 transition-all space-y-4"
                                        data-testid={`patient-request-card-${req.id || idx}`}
                                    >
                                        {/* Top Header: Provider & Status Badge */}
                                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3 border-b border-border/50">
                                            <div>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <h3 className="font-head font-black text-lg text-foreground">
                                                        {req.provider_name || "Healthcare Facility"}
                                                    </h3>
                                                    <span className="text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                                                        {req.provider_type === "ngo" ? "NGO Partner" : "Clinic"}
                                                    </span>
                                                </div>
                                                {req.provider_pincode && (
                                                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                                        <MapPin className="w-3.5 h-3.5 text-muted-foreground" /> PIN: <span className="font-bold text-foreground">{req.provider_pincode}</span>
                                                    </p>
                                                )}
                                            </div>

                                            {/* Status Badge */}
                                            <div className="flex items-center gap-1.5 self-start">
                                                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-extrabold border ${statusCfg.badge}`}>
                                                    <StatusIcon className="w-3.5 h-3.5" /> {statusCfg.label}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Status Description Banner */}
                                        <div className={`p-3.5 rounded-2xl border text-xs font-semibold flex items-start gap-2.5 ${statusCfg.bg}`}>
                                            <StatusIcon className="w-4 h-4 shrink-0 mt-0.5" />
                                            <div>
                                                <p className="font-bold">{statusCfg.desc}</p>
                                                {req.notes && (
                                                    <p className="mt-1 text-foreground font-bold">
                                                        👉 Doctor Note: <span className="font-normal italic">"{req.notes}"</span>
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        {/* Clinical Summary & Transcript */}
                                        <div className="text-xs space-y-1.5 text-muted-foreground">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-bold text-foreground">Specialty:</span>
                                                <span className="bg-primary/10 text-primary font-bold px-2 py-0.5 rounded-full text-[11px]">
                                                    {req.suggested_specialty || "General Physician"}
                                                </span>
                                                <span className="font-bold text-foreground ml-2">Urgency:</span>
                                                <span className={`${urgencyMeta.badge} text-[10px] font-bold px-2 py-0.5 rounded-full`}>
                                                    {urgencyMeta.label}
                                                </span>
                                            </div>
                                            <p className="pt-1">
                                                <span className="font-bold text-foreground">Symptom Summary:</span> {req.symptom_summary || req.transcript}
                                            </p>
                                            {req.transcript && (
                                                <p className="italic bg-muted/40 p-2.5 rounded-xl border border-border/40 text-foreground">
                                                    "{req.transcript}"
                                                </p>
                                            )}
                                        </div>

                                        {/* Footer Info */}
                                        <div className="pt-2 text-xs border-t border-border/40 flex flex-wrap items-center gap-3 text-muted-foreground">
                                            <span><b>Patient:</b> <span className="font-bold text-foreground">{req.patient_name || "Anonymous"}</span></span>
                                            {req.patient_contact && <span>· <b>Phone:</b> <span className="font-bold text-foreground">{req.patient_contact}</span></span>}
                                            {req.patient_address && <span>· <b>Village/Address:</b> <span className="font-bold text-foreground">{req.patient_address}</span></span>}
                                        </div>

                                        <div className="flex items-center justify-between pt-2 text-[11px] text-muted-foreground font-semibold">
                                            <span>Requested: {new Date(req.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                                            <span>ID: #{String(req.id || req._id || "").slice(-6)}</span>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    )}
                </div>
            </main>
        </div>
    );
}
