import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { formatApiError } from "../lib/api";
import { Film } from "lucide-react";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
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
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
              className="mt-2 bg-black/40 border-white/10 text-white focus-visible:ring-white/30"
              data-testid="register-password" />
          </div>
          <Button type="submit" disabled={loading} className="w-full bg-[#E50914] hover:bg-[#F40612] text-white" data-testid="register-submit">
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
