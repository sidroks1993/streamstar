import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { formatApiError } from "../lib/api";
import { Film, Eye, EyeOff } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success("Welcome back");
      navigate("/dashboard");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Login failed");
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
        <Link to="/" className="flex items-center gap-2 mb-8" data-testid="login-logo">
          <Film className="w-5 h-5 text-[#E50914]" />
          <span className="font-display text-lg">StreamStar</span>
        </Link>
        <h1 className="font-display text-3xl mb-2 tracking-tight">Sign in</h1>
        <p className="text-white/60 text-sm mb-8">Welcome back. Let&apos;s find something to watch together.</p>

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
          <Button type="submit" disabled={loading} className="w-full bg-[#E50914] hover:bg-[#F40612] text-white" data-testid="login-submit">
            {loading ? "Signing in…" : "Sign in"}
          </Button>
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
          No account yet? <Link to="/register" className="text-[#E50914] hover:text-[#F40612]" data-testid="link-register">Create one</Link>
        </p>
      </div>
    </div>
  );
}
