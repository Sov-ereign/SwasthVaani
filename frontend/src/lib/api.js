import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:8000";
const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
    const token = localStorage.getItem("sv_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

export const LANGUAGES = [
    { code: "hi", name: "हिंदी", en: "Hindi" },
    { code: "en", name: "English", en: "English" },
    { code: "ta", name: "தமிழ்", en: "Tamil" },
];

export const URGENCY_META = {
    emergency: {
        label: "Emergency",
        sub: { hi: "अभी अस्पताल जाएँ", en: "Go to hospital now", ta: "இப்போது மருத்துவமனைக்கு செல்லுங்கள்" },
        bg: "bg-destructive",
        text: "text-destructive-foreground",
        ring: "ring-destructive/30",
        dot: "bg-destructive",
        badge: "bg-destructive text-destructive-foreground",
    },
    soon: {
        label: "See a doctor soon",
        sub: { hi: "जल्द डॉक्टर से मिलें", en: "See a doctor soon", ta: "விரைவில் மருத்துவரை பாருங்கள்" },
        bg: "bg-accent",
        text: "text-accent-foreground",
        ring: "ring-accent/30",
        dot: "bg-accent",
        badge: "bg-accent text-accent-foreground",
    },
    home: {
        label: "Home care",
        sub: { hi: "घर पर देखभाल", en: "Home care advice", ta: "வீட்டு பராமரிப்பு" },
        bg: "bg-secondary",
        text: "text-secondary-foreground",
        ring: "ring-secondary/30",
        dot: "bg-secondary",
        badge: "bg-secondary text-secondary-foreground",
    },
};
