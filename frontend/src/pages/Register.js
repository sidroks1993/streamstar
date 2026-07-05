import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { formatApiError } from "../lib/api";
import { Film, Eye, EyeOff, Check, X } from "lucide-react";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const passwordsMatch = password.length > 0 && password === confirm;
  const passwordValid = password.length >= 6;

  const submit = async (e) => {
    e.preventDefault();
    if (!passwordValid) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (!passwordsMatch) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      await register(email, password, name);
      toast.success("Account created");
      navigate("/dashboard");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const googleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/dashboard";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#050505] px-6">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center gap-2 mb-8">
          <Film className="w-5 h-5 text-[#E50914]" />
          <span className="font-display text-lg">StreamStar</span>
        </Link>
        <h1 className="font-display text-3xl mb-2 tracking-tight">Create your account</h1>
        <p className="text-white/60 text-sm mb-8">Two clicks and you&apos;re in the theater.</p>

        <form onSubmit={submit} className="space-y-4" data-testid="register-form">
          <div>
            <Label className="text-white/70 text-xs uppercase tracking-widest">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required
              className="mt-2 bg-black/40 border-white/10 text-white focus-visible:ring-white/30"
              data-testid="register-name" />
          </div>
          <div>
            <Label className="text-white/70 text-xs uppercase tracking-widest">Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="mt-2 bg-black/40 border-white/10 text-white focus-visible:ring-white/30"
              data-testid="register-email" />
          </div>
          <div>
            <Label className="text-white/70 text-xs uppercase tracking-widest">Password</Label>
            <div className="relative mt-2">
              <Input type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                required minLength={6}
                className="bg-black/40 border-white/10 text-white focus-visible:ring-white/30 pr-10"
                data-testid="register-password" />
              <button type="button" onClick={() => setShowPw((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-white/50 hover:text-white"
                data-testid="register-toggle-pw" aria-label="Toggle password visibility">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {password.length > 0 && !passwordValid && (
              <div className="mt-1 text-[11px] text-[#E50914]">At least 6 characters</div>
            )}
          </div>
          <div>
            <Label className="text-white/70 text-xs uppercase tracking-widest">Confirm password</Label>
            <div className="relative mt-2">
              <Input type={showPw ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)}
                required minLength={6}
                className="bg-black/40 border-white/10 text-white focus-visible:ring-white/30 pr-10"
                data-testid="register-confirm" />
              {confirm.length > 0 && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2 p-1">
                  {passwordsMatch
                    ? <Check className="w-4 h-4 text-emerald-500" data-testid="pw-match" />
                    : <X className="w-4 h-4 text-[#E50914]" data-testid="pw-mismatch" />}
                </div>
              )}
            </div>
            {confirm.length > 0 && !passwordsMatch && (
              <div className="mt-1 text-[11px] text-[#E50914]">Passwords do not match</div>
            )}
          </div>
          <Button type="submit" disabled={loading || !passwordsMatch || !passwordValid}
            className="w-full bg-[#E50914] hover:bg-[#F40612] text-white disabled:opacity-50"
            data-testid="register-submit">
            {loading ? "Creating…" : "Create account"}
          </Button>
        </form>

        <div className="flex items-center gap-4 my-6">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-xs uppercase tracking-widest text-white/40">or</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <Button onClick={googleLogin} variant="outline"
          className="w-full border-white/15 bg-white/5 hover:bg-white/10 text-white"
          data-testid="google-register-btn">
          Continue with Google
        </Button>

        <p className="text-sm text-white/60 mt-8 text-center">
          Already have an account? <Link to="/login" className="text-[#E50914] hover:text-[#F40612]" data-testid="link-login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
