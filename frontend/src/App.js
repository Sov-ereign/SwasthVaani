import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import Landing from "@/pages/Landing";
import VoiceApp from "@/pages/VoiceApp";
import Dashboard from "@/pages/Dashboard";

function App() {
    return (
        <div className="App">
            <BrowserRouter>
                <Toaster position="top-center" richColors />
                <Routes>
                    <Route path="/" element={<Landing />} />
                    <Route path="/speak" element={<VoiceApp />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                </Routes>
            </BrowserRouter>
        </div>
    );
}

export default App;
