import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Activity, LogOut, AlertTriangle, Clock, Home, Phone, Globe, Users, RefreshCw, ArrowLeft, Stethoscope, Download, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { api, URGENCY_META } from "@/lib/api";

const ICONS = { emergency: AlertTriangle, soon: Clock, home: Home };

export default function Dashboard() {
    const [authed, setAuthed] = useState(!!localStorage.getItem("sv_token"));

    if (!authed) return <Login onSuccess={() => setAuthed(true)} />;
    return <DashboardView onLogout={() => { localStorage.removeItem("sv_token"); setAuthed(false); }} />;
}

function Login({ onSuccess }) {
    const [email, setEmail] = useState("clinic@swasthvaani.health");
    const [password, setPassword] = useState("clinic123");
    const [loading, setLoading] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const { data } = await api.post("/auth/login", { email, password });
            localStorage.setItem("sv_token", data.token);
            toast.success("Welcome back");
            onSuccess();
        } catch (err) {
            // Demo fallback login if backend is running with local secret or offline
            if (email.trim().toLowerCase() === "clinic@swasthvaani.health" && password === "clinic123") {
                localStorage.setItem("sv_token", "demo-token-12345");
                toast.success("Signed in (Demo Mode)");
                onSuccess();
            } else {
                toast.error(err?.response?.data?.detail || "Invalid login details");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen grain-bg flex" data-testid="clinic-login">
            <div className="hidden lg:block w-1/2 relative">
                <img src="https://images.pexels.com/photos/5355853/pexels-photo-5355853.jpeg?auto=compress&cs=tinysrgb&w=1200"
                    alt="Medical professional" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-foreground/40" />
                <div className="absolute bottom-10 left-10 right-10 text-background">
                    <h2 className="font-head font-extrabold text-4xl tracking-tight">Clinic triage console</h2>
                    <p className="mt-3 text-background/80 text-lg">Every incoming voice request, ranked by urgency — so you know who needs you first.</p>
                </div>
            </div>
            <div className="flex-1 flex items-center justify-center px-6">
                <div className="w-full max-w-sm">
                    <Link to="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8">
                        <ArrowLeft className="w-4 h-4" /> <span className="font-semibold text-sm">Home</span>
                    </Link>
                    <div className="flex items-center gap-2.5 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                            <Activity className="w-5 h-5 text-primary-foreground" />
                        </div>
                        <span className="font-head font-extrabold text-xl tracking-tight">SwasthVaani</span>
                    </div>
                    <h1 className="font-head font-extrabold text-2xl tracking-tight">Clinic login</h1>
                    <p className="text-muted-foreground mt-1 text-sm">Sign in to view triage requests.</p>
                    <form onSubmit={submit} className="mt-6 space-y-4">
                        <div>
                            <Label htmlFor="email" className="font-semibold">Email</Label>
                            <Input id="email" data-testid="login-email" value={email} onChange={(e) => setEmail(e.target.value)}
                                className="mt-1.5 rounded-xl h-12 bg-card" />
                        </div>
                        <div>
                            <Label htmlFor="password" className="font-semibold">Password</Label>
                            <Input id="password" type="password" data-testid="login-password" value={password}
                                onChange={(e) => setPassword(e.target.value)} className="mt-1.5 rounded-xl h-12 bg-card" />
                        </div>
                        <Button type="submit" disabled={loading} data-testid="login-submit"
                            className="w-full rounded-full h-12 font-bold bg-primary hover:bg-primary/90 transition-colors">
                            {loading ? "Signing in…" : "Sign in"}
                        </Button>
                    </form>
                    <p className="text-xs text-muted-foreground mt-4">Demo: clinic@swasthvaani.health / clinic123</p>
                </div>
            </div>
        </div>
    );
}

function StatCard({ icon: Icon, label, value, tone, testid }) {
    return (
        <div className="bg-card border border-border rounded-2xl p-5" data-testid={testid}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${tone}`}>
                <Icon className="w-5 h-5" />
            </div>
            <p className="font-head font-extrabold text-3xl tracking-tight">{value}</p>
            <p className="text-sm text-muted-foreground mt-0.5">{label}</p>
        </div>
    );
}

function DashboardView({ onLogout }) {
    const [requests, setRequests] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filterUrgency, setFilterUrgency] = useState("all");
    const [searchQuery, setSearchQuery] = useState("");

    const load = async () => {
        try {
            const [r, s] = await Promise.all([api.get("/triage/requests"), api.get("/triage/stats")]);
            setRequests(r.data);
            setStats(s.data);
        } catch (e) {
            if (e?.response?.status === 401) { toast.error("Session expired"); onLogout(); }
        } finally { setLoading(false); }
    };

    useEffect(() => { load(); const iv = setInterval(load, 15000); return () => clearInterval(iv); }, []);

    const exportCSV = () => {
        if (!requests.length) return toast.error("No data to export");
        const headers = ["Caller", "Source", "Language", "Urgency", "Symptoms", "Advice", "CreatedAt"];
        const rows = requests.map(r => [
            `"${r.caller}"`,
            `"${r.source}"`,
            `"${r.language}"`,
            `"${r.urgency}"`,
            `"${(r.summary || r.transcript).replace(/"/g, '""')}"`,
            `"${(r.spoken || r.advice).replace(/"/g, '""')}"`,
            `"${r.created_at}"`
        ]);
        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `swasthvaani_triage_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success("Exported triage log CSV");
    };

    const filteredRequests = requests.filter(r => {
        const matchesUrgency = filterUrgency === "all" || r.urgency === filterUrgency;
        const matchesSearch = !searchQuery.trim() || 
            (r.caller && r.caller.toLowerCase().includes(searchQuery.toLowerCase())) ||
            (r.transcript && r.transcript.toLowerCase().includes(searchQuery.toLowerCase())) ||
            (r.summary && r.summary.toLowerCase().includes(searchQuery.toLowerCase()));
        return matchesUrgency && matchesSearch;
    });

    return (
        <div className="min-h-screen grain-bg" data-testid="clinic-dashboard">
            <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-md border-b border-border">
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
                            <Activity className="w-5 h-5 text-primary-foreground" />
                        </div>
                        <div>
                            <span className="font-head font-extrabold tracking-tight leading-none block">SwasthVaani</span>
                            <span className="text-xs text-muted-foreground">Clinic console</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={exportCSV} className="rounded-full font-semibold border-2 hidden sm:inline-flex">
                            <Download className="w-4 h-4 mr-1.5" /> Export CSV
                        </Button>
                        <Button variant="ghost" size="sm" onClick={load} data-testid="refresh-btn" className="rounded-full font-semibold">
                            <RefreshCw className="w-4 h-4 mr-1.5" /> Refresh
                        </Button>
                        <Button variant="outline" size="sm" onClick={onLogout} data-testid="logout-btn" className="rounded-full font-semibold border-2">
                            <LogOut className="w-4 h-4 mr-1.5" /> Logout
                        </Button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 py-8">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
                    <div>
                        <h1 className="font-head font-extrabold text-3xl tracking-tight">Incoming triage</h1>
                        <p className="text-muted-foreground mt-1">Live queue of voice requests from patients and IVR calls.</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <StatCard testid="stat-total" icon={Users} label="Total requests" value={stats?.total ?? "—"} tone="bg-primary/10 text-primary" />
                    <StatCard testid="stat-emergency" icon={AlertTriangle} label="Emergencies today" value={stats?.emergencies_today ?? "—"} tone="bg-destructive/10 text-destructive" />
                    <StatCard testid="stat-ivr" icon={Phone} label="IVR calls" value={stats?.by_source?.ivr ?? 0} tone="bg-secondary/15 text-secondary" />
                    <StatCard testid="stat-active" icon={Stethoscope} label="Need a doctor" value={(stats?.by_urgency?.emergency ?? 0) + (stats?.by_urgency?.soon ?? 0)} tone="bg-accent/20 text-accent" />
                </div>

                {/* Filter and Search Bar */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
                    <div className="flex gap-2 w-full sm:w-auto">
                        {[
                            { id: "all", label: "All" },
                            { id: "emergency", label: "Emergency 🚨" },
                            { id: "soon", label: "See Soon ⏳" },
                            { id: "home", label: "Home Care 🏠" },
                        ].map(t => (
                            <button
                                key={t.id}
                                onClick={() => setFilterUrgency(t.id)}
                                className={`px-4 py-2 rounded-full text-xs font-bold border transition-colors ${
                                    filterUrgency === t.id ? "bg-foreground text-background border-foreground" : "bg-card border-border text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    <div className="relative w-full sm:w-64">
                        <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                        <Input
                            placeholder="Search symptoms or caller..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 rounded-full bg-card h-10 text-xs"
                        />
                    </div>
                </div>

                <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                    <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <div className="col-span-3">Caller</div>
                        <div className="col-span-4">Symptoms</div>
                        <div className="col-span-2">Urgency</div>
                        <div className="col-span-1">Lang</div>
                        <div className="col-span-2 text-right">Time</div>
                    </div>
                    <div className="divide-y divide-border" data-testid="requests-table">
                        {loading ? (
                            <div className="px-6 py-16 text-center text-muted-foreground">Loading queue…</div>
                        ) : filteredRequests.length === 0 ? (
                            <div className="px-6 py-16 text-center">
                                <p className="font-head font-bold text-lg">No matching triage requests</p>
                                <p className="text-muted-foreground mt-1">
                                    Open the <Link to="/speak" className="text-primary font-semibold underline">voice demo</Link> and speak symptoms to see one appear here.
                                </p>
                            </div>
                        ) : (
                            filteredRequests.map((r, i) => {
                                const meta = URGENCY_META[r.urgency] || URGENCY_META.soon;
                                const Icon = ICONS[r.urgency] || Clock;
                                return (
                                    <motion.div key={r.id || i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}
                                        className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-muted/30 transition-colors" data-testid={`request-row-${i}`}>
                                        <div className="col-span-3 flex items-center gap-2 min-w-0">
                                            <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${r.source === "ivr" ? "bg-secondary/15 text-secondary" : "bg-primary/10 text-primary"}`}>
                                                {r.source === "ivr" ? <Phone className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
                                            </span>
                                            <div className="min-w-0">
                                                <p className="font-semibold truncate text-sm">{r.caller}</p>
                                                <p className="text-xs text-muted-foreground capitalize">{r.source}</p>
                                            </div>
                                        </div>
                                        <div className="col-span-4 min-w-0">
                                            <p className="text-sm font-semibold text-foreground truncate">{r.summary || r.transcript}</p>
                                            <p className="text-xs text-muted-foreground truncate italic">"{r.transcript}"</p>
                                        </div>
                                        <div className="col-span-2">
                                            <Badge className={`${meta.badge} rounded-full gap-1.5 font-semibold border-0 px-3 py-1`}>
                                                <Icon className="w-3.5 h-3.5" /> {meta.label}
                                            </Badge>
                                        </div>
                                        <div className="col-span-1 text-xs font-bold uppercase text-muted-foreground">{r.language}</div>
                                        <div className="col-span-2 text-right text-xs font-medium text-muted-foreground">
                                            {new Date(r.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                        </div>
                                    </motion.div>
                                );
                            })
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
