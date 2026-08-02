import React, { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, Mail, Lock, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      window.location.href = "/";
    } catch (err) {
      setError(err.message || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = () => {
    base44.auth.loginWithProvider("google", "/");
  };

  return (
    <AuthLayout
      icon={LogIn}
      title="Welcome Back"
      subtitle="Your income is running. No hustle required."
      footer={
        <>
          New here?{" "}
          <Link to="/register" className="text-blue-400 font-semibold hover:underline">
            Create your free account
          </Link>
        </>
      }
    >
      {/* Google Button */}
      <button
        onClick={handleGoogle}
        className="w-full h-14 flex items-center justify-center gap-3 rounded-xl font-semibold text-sm mb-6 transition-all hover:opacity-90"
        style={{
          background: "linear-gradient(135deg, rgba(30,27,75,0.8) 0%, rgba(15,12,41,0.9) 100%)",
          border: "1px solid #f59e0b",
          boxShadow: "0 0 16px rgba(245,158,11,0.3)",
          color: "#f59e0b",
        }}
      >
        <GoogleIcon className="w-5 h-5" />
        Continue with Google
      </button>

      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-white/10" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="px-3 text-slate-500" style={{ background: "transparent" }}>OR</span>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm border border-red-500/20">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email" className="text-slate-200 font-medium">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 h-14 text-base rounded-xl text-white placeholder:text-slate-400"
              style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(167,139,250,0.5)", color: "#fff" }}
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-slate-200 font-medium">Password</Label>
            <Link to="/forgot-password" className="text-xs text-blue-400 hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 h-14 text-base rounded-xl text-white placeholder:text-slate-400"
              style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(167,139,250,0.5)", color: "#fff" }}
              required
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full h-14 rounded-xl font-bold text-base text-white transition-all hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
          style={{ background: "linear-gradient(90deg, #7c3aed 0%, #a855f7 40%, #f59e0b 100%)", boxShadow: "0 4px 20px rgba(168,85,247,0.4)" }}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Logging in...
            </>
          ) : (
            "Log in"
          )}
        </button>
      </form>
    </AuthLayout>
  );
}
