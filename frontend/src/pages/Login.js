import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { formatApiError } from "../lib/api";
import Logo from "../components/Logo";
import { Eye, EyeOff, Film } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/dashboard";
  const isInviteRedirect = /^\/watch\//.test(next);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [needsVerify, setNeedsVerify] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setNeedsVerify(false);
    try {
      await login(email, password);
      toast.success("Welcome back");
      navigate(next);
    } catch (err) {
      const msg = formatApiError(err.response?.data?.detail) || "Login failed";
      toast.error(msg);
      if (err.response?.status === 403 && /verify/i.test(msg)) setNeedsVerify(true);
    } finally {
      setLoading(false);
    }
  };

  const resendVerification = async () => {
    try {
      await (await import("../lib/api")).default.post("/auth/resend-verification", { email });
      toast.success("Verification email sent again — check inbox and spam");
    } catch {
      toast.error("Could not resend right now");
    }
  };

  const googleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + next;
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#050505] px-6">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center gap-2 mb-8" data-testid="login-logo">
          <Logo size={22} />
          <span className="font-display text-lg">© StreamStar</span>
        </Link>
        <h1 className="font-display text-3xl mb-2 tracking-tight">Sign in</h1>
        <p className="text-white/60 text-sm mb-6">Welcome back. Let&apos;s find something to watch together.</p>
        {isInviteRedirect && (
          <div className="mb-6 rounded-lg border border-[#A855F7]/30 bg-gradient-to-br from-[#A855F7]/15 to-[#EC4899]/5 p-4 flex items-start gap-3" data-testid="invite-banner-login">
            <div className="w-9 h-9 rounded-md bg-[#A855F7]/20 border border-[#A855F7]/40 flex items-center justify-center shrink-0">
              <Film className="w-4 h-4 text-[#A855F7]" />
            </div>
            <div className="text-sm">
              <div className="text-white font-medium">Sign in to join the watch party</div>
              <div className="text-white/60 mt-1">You&apos;ll knock and the host will let you in.</div>
            </div>
          </div>
        )}

        <form onSubmit={submit} className="space-y-4" data-testid="login-form">
          <div>
            <Label htmlFor="email" className="text-white/70 text-xs uppercase tracking-widest">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="mt-2 bg-black/40 border-white/10 text-white focus-visible:ring-white/30"
              required data-testid="login-email" />
          </div>
          <div>
            <Label htmlFor="password" className="text-white/70 text-xs uppercase tracking-widest">Password</Label>
            <div className="relative mt-2">
              <Input id="password" type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                className="bg-black/40 border-white/10 text-white focus-visible:ring-white/30 pr-10"
                required data-testid="login-password" />
              <button type="button" onClick={() => setShowPw((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-white/50 hover:text-white"
                data-testid="login-toggle-pw" aria-label="Toggle password visibility">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <Button type="submit" disabled={loading} className="w-full bg-[#A855F7] hover:bg-[#C026D3] text-white" data-testid="login-submit">
            {loading ? "Signing in…" : "Sign in"}
          </Button>
          {needsVerify && (
            <div className="rounded-md border border-[#A855F7]/40 bg-[#A855F7]/10 p-3 text-sm text-white/90 space-y-2" data-testid="verify-banner">
              <div>Your email isn&apos;t verified yet. Check your inbox (and spam folder).</div>
              <button type="button" onClick={resendVerification} className="text-[#A855F7] hover:text-[#C026D3] underline text-xs" data-testid="resend-verify-btn">
                Resend verification email
              </button>
            </div>
          )}
        </form>

        <div className="flex items-center gap-4 my-6">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-xs uppercase tracking-widest text-white/40">or</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <Button onClick={googleLogin} variant="outline"
          className="w-full border-white/15 bg-white/5 hover:bg-white/10 text-white"
          data-testid="google-login-btn">
          Continue with Google
        </Button>

        <p className="text-sm text-white/60 mt-8 text-center">
          No account yet? <Link to={`/register${isInviteRedirect ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-[#A855F7] hover:text-[#C026D3]" data-testid="link-register">Create one</Link>
        </p>
        <p className="text-xs text-white/40 mt-2 text-center">
          <Link to="/forgot-password" className="hover:text-white" data-testid="link-forgot">Forgot password?</Link>
        </p>
      </div>
    </div>
  );
}
