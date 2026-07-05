import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Logo from "../components/Logo";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import api from "../lib/api";
import { toast } from "sonner";

export default function JoinByCode() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();
  const submit = async (e) => {
    e.preventDefault();
    const c = code.trim().toLowerCase().replace(/\s|-/g, "");
    if (c.length < 4) { toast.error("Enter the code you were given"); return; }
    setLoading(true);
    try {
      await api.get(`/rooms/${c}`);
      nav(`/watch/${c}`);
    } catch {
      // Not logged in? Push to login with return
      try {
        await api.get("/auth/me");
        toast.error("No room found with that code");
      } catch {
        sessionStorage.setItem("pendingRoom", c);
        nav(`/login`);
      }
    } finally { setLoading(false); }
  };
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#050505] px-6">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center gap-2 mb-8"><Logo size={22} /><span className="font-display text-lg">StreamStar ©</span></Link>
        <h1 className="font-display text-3xl mb-2 tracking-tight">Join a watch party</h1>
        <p className="text-white/60 text-sm mb-8">Enter the code your host sent you. Codes are not case-sensitive.</p>
        <form onSubmit={submit} className="space-y-4" data-testid="join-code-form">
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. 12752f51ab" maxLength={20}
            className="bg-black/40 border-white/10 text-white text-center font-mono text-2xl tracking-widest uppercase py-6 focus-visible:ring-[#A855F7]"
            data-testid="join-code-input" />
          <Button type="submit" disabled={loading} className="w-full bg-[#A855F7] hover:bg-[#C026D3] text-white py-6" data-testid="join-code-submit">
            {loading ? "Joining…" : "Join room"}
          </Button>
        </form>
        <p className="text-sm text-white/60 mt-8 text-center">
          <Link to="/" className="hover:text-white">Back to home</Link>
        </p>
      </div>
    </div>
  );
}
