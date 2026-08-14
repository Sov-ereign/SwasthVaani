import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import Landing from "@/pages/Landing";
import VoiceApp from "@/pages/VoiceApp";
import Dashboard from "@/pages/Dashboard";
import MyRequests from "@/pages/MyRequests";

function App() {
    return (
        <div className="App">
            <BrowserRouter>
                <Toaster position="top-center" richColors />
                <Routes>
                    <Route path="/" element={<Landing />} />
                    <Route path="/speak" element={<VoiceApp />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/my-requests" element={<MyRequests />} />
                </Routes>
            </BrowserRouter>
        </div>
    );
}

export default App;
