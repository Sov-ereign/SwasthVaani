import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Activity, Clock, CheckCircle2, XCircle, CheckCheck, RefreshCw, Building2, MapPin, Phone, Stethoscope, AlertTriangle, Search, PlusCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api, getPatientSessionId, URGENCY_META } from "@/lib/api";

const STATUS_CONFIG = {
    pending: {
        label: "Pending Review",
        icon: Clock,
        bg: "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400",
        badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
        desc: "Clinic / NGO has received your request and is reviewing it."
    },
    accepted: {
        label: "Accepted — Visit Confirmed",
        icon: CheckCircle2,
        bg: "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
        badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
        desc: "The clinic has confirmed your consultation request."
    },
    declined: {
        label: "Declined",
        icon: XCircle,
        bg: "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400",
        badge: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
        desc: "Provider is currently unavailable. Please consult another nearby clinic."
    },
    completed: {
        label: "Consultation Completed",
        icon: CheckCheck,
        bg: "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400",
        badge: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
        desc: "This consultation has been marked completed by the provider."
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
            toast.error("Could not refresh requests");
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
            <header className="h-16 px-5 flex items-center justify-between max-w-3xl mx-auto w-full border-b border-border/40">
                <Link to="/speak" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
                    <ArrowLeft className="w-5 h-5" /> <span className="font-semibold text-sm">Back to Voice Triage</span>
                </Link>
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                        <Activity className="w-4 h-4 text-primary-foreground" />
                    </div>
                    <span className="font-head font-extrabold tracking-tight">SwasthVaani</span>
                </div>
            </header>

            <main className="flex-1 max-w-3xl mx-auto w-full px-5 py-8">
                {/* Title & Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border/40">
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="font-head font-extrabold text-2xl sm:text-3xl tracking-tight">My Consultation Requests</h1>
                            <Badge variant="outline" className="text-xs font-semibold">{requests.length}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">Track status and doctor updates for your clinic & NGO consultation bookings.</p>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button onClick={() => fetchRequests(phoneFilter)} variant="outline" size="sm" className="rounded-full h-10 px-4 text-xs font-bold border-border/80">
                            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
                        </Button>
                        <Link to="/speak">
                            <Button size="sm" className="rounded-full h-10 px-4 text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm">
                                <PlusCircle className="w-3.5 h-3.5 mr-1.5" /> New Triage
                            </Button>
                        </Link>
                    </div>
                </div>

                {/* Phone Lookup Filter */}
                <form onSubmit={handleSearch} className="mt-6 bg-card border border-border/70 rounded-2xl p-4 flex flex-col sm:flex-row gap-3 shadow-xs">
                    <div className="relative flex-1">
                        <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-muted-foreground" />
                        <Input
                            placeholder="Lookup requests by phone (e.g. +91 98111 22334)"
                            value={phoneFilter}
                            onChange={(e) => setPhoneFilter(e.target.value)}
                            className="pl-10 h-11 rounded-xl text-sm bg-background/50"
                        />
                    </div>
                    <div className="flex gap-2">
                        <Button type="submit" size="sm" disabled={searching} className="rounded-xl h-11 px-5 text-xs font-bold">
                            {searching ? "Searching..." : "Lookup"}
                        </Button>
                        {phoneFilter && (
                            <Button type="button" variant="ghost" size="sm" onClick={handleResetFilter} className="rounded-xl h-11 px-3 text-xs font-medium">
                                Show Session
                            </Button>
                        )}
                    </div>
                </form>

                {/* Request List */}
                <div className="mt-6 space-y-4">
                    {loading && requests.length === 0 ? (
                        <div className="py-16 text-center text-muted-foreground flex flex-col items-center">
                            <RefreshCw className="w-8 h-8 animate-spin text-primary mb-3" />
                            <p className="font-semibold text-sm">Loading your consultation records...</p>
                        </div>
                    ) : requests.length === 0 ? (
                        <div className="py-16 text-center bg-card border border-dashed border-border rounded-3xl p-8 flex flex-col items-center">
                            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-4">
                                <Stethoscope className="w-7 h-7" />
                            </div>
                            <h3 className="font-head font-bold text-lg">No consultation requests found</h3>
                            <p className="text-sm text-muted-foreground max-w-md mt-1 mb-6">
                                When you complete voice triage and select a recommended specialist or clinic, your request will appear here with live tracking.
                            </p>
                            <Link to="/speak">
                                <Button className="rounded-full h-11 px-6 font-bold bg-primary text-primary-foreground">
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
                                        className="bg-card border border-border/80 rounded-2xl p-5 sm:p-6 shadow-xs hover:border-border transition-all"
                                        data-testid={`patient-request-card-${req.id || idx}`}
                                    >
                                        {/* Top Header: Provider & Status Badge */}
                                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-border/50">
                                            <div>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <h3 className="font-head font-bold text-lg text-foreground">{req.provider_name || "Healthcare Facility"}</h3>
                                                    <span className="text-[11px] uppercase tracking-wider font-extrabold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                                                        {req.provider_type === "ngo" ? "NGO Partner" : "Clinic"}
                                                    </span>
                                                </div>
                                                {req.provider_pincode && (
                                                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                                        <MapPin className="w-3 h-3 text-muted-foreground" /> PIN Code: <span className="font-semibold text-foreground">{req.provider_pincode}</span>
                                                    </p>
                                                )}
                                            </div>

                                            {/* Status Badge */}
                                            <div className="flex items-center gap-1.5 self-start">
                                                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${statusCfg.badge}`}>
                                                    <StatusIcon className="w-3.5 h-3.5" />
                                                    {statusCfg.label}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Triage & Clinical Info */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4 text-xs">
                                            <div>
                                                <p className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">Triage Urgency</p>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className={`inline-block w-2.5 h-2.5 rounded-full ${urgencyMeta.dot}`} />
                                                    <span className="font-bold text-sm text-foreground">{urgencyMeta.label}</span>
                                                </div>
                                            </div>

                                            <div>
                                                <p className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">Specialty Department</p>
                                                <p className="font-bold text-sm text-foreground mt-1 flex items-center gap-1.5">
                                                    <Stethoscope className="w-3.5 h-3.5 text-primary" />
                                                    {req.suggested_specialty || "General Physician"}
                                                </p>
                                            </div>

                                            <div className="sm:col-span-2 bg-background/60 rounded-xl p-3 border border-border/50">
                                                <p className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">Symptom Summary</p>
                                                <p className="text-foreground text-xs mt-0.5 font-medium">{req.symptom_summary || req.transcript || "Consultation requested"}</p>
                                            </div>
                                        </div>

                                        {/* Clinic Doctor Instructions / Feedback Box if accepted or notes added */}
                                        {req.notes && (
                                            <div className="mt-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3.5">
                                                <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Message from Provider:
                                                </p>
                                                <p className="text-xs text-foreground mt-1 font-medium leading-relaxed">{req.notes}</p>
                                            </div>
                                        )}

                                        {/* Footer: Timestamps & Patient ID */}
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-muted-foreground pt-3 border-t border-border/40 mt-2 gap-2">
                                            <span>Requested: {new Date(req.created_at).toLocaleString()}</span>
                                            {req.patient_contact && <span>Contact: {req.patient_contact}</span>}
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
