import React, { useState } from "react";
import { Link } from "react-router-dom";
import api, { formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import Logo from "../components/Logo";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
      toast.success("If that email exists, a reset link is on its way.");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Try again");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#050505] px-6">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center gap-2 mb-8"><Logo size={22} /><span className="font-display text-lg">© StreamStar</span></Link>
        <h1 className="font-display text-3xl mb-2 tracking-tight">Forgot your password?</h1>
        <p className="text-white/60 text-sm mb-8">Enter your email and we&apos;ll send a reset link. Check your inbox (and spam folder).</p>
        {sent ? (
          <div className="rounded-md border border-[#A855F7]/40 bg-[#A855F7]/10 p-4 text-sm text-white" data-testid="reset-sent">
            Reset link sent. Open the email and click the button — the link expires in 1 hour.
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label className="text-white/70 text-xs uppercase tracking-widest">Email</Label>
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                className="mt-2 bg-black/40 border-white/10 text-white focus-visible:ring-white/30"
                data-testid="forgot-email" />
            </div>
            <Button type="submit" disabled={loading} className="w-full bg-[#A855F7] hover:bg-[#C026D3] text-white" data-testid="forgot-submit">
              {loading ? "Sending…" : "Send reset link"}
            </Button>
          </form>
        )}
        <p className="text-sm text-white/60 mt-8 text-center">
          <Link to="/login" className="text-[#A855F7] hover:text-[#C026D3]">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
