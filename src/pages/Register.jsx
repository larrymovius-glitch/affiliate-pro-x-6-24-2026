import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { UserPlus } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import EmailRegistrationForm from "@/components/auth/EmailRegistrationForm";
import CheckEmailNotice from "@/components/auth/CheckEmailNotice";

export default function Register() {
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) sessionStorage.setItem("pending_referral_code", ref);
  }, [searchParams]);

  // Every try is recorded with where it came from, for the owner's Admin page
  // -- including the ones that never become an account. Never blocks signup.
  const logAttempt = (outcome) => {
    fetch("/api/logSignupAttempt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // The device clock's time zone, compared with the connection's to spot a VPN.
      body: JSON.stringify({ email, outcome, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "" }),
    }).catch(() => {});
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const referralCode = sessionStorage.getItem("pending_referral_code");

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { ...(referralCode && { referred_by_code: referralCode }) },
          emailRedirectTo: `${window.location.origin}/`,
        },
      });
      if (signUpError) {
        const code = /** @type {any} */ (signUpError).code || "";
        logAttempt(code === "email_address_invalid" ? "invalid_email" : code === "weak_password" ? "weak_password" : "error");
        throw signUpError;
      }

      // An email that already has an account comes back looking like a
      // success, with no identities and no email sent -- so the person waits
      // for a confirmation that never arrives. Say so instead.
      if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        logAttempt("already_registered");
        setError("That email already has an account. Sign in instead, or use Forgot password if you don't remember it.");
        return;
      }
      logAttempt("created");

      if (data?.session) {
        window.location.href = "/";
        return;
      }
      setStep("verify");
    } catch (err) {
      setError(err.message || "Unable to create your account");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError("");
    setResending(true);
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: `${window.location.origin}/` },
      });
      if (resendError) throw resendError;
    } catch (err) {
      setError(err.message || "Unable to resend the email");
    } finally {
      setResending(false);
    }
  };

  const handleGoogle = async () => {
    setError("");
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/` },
      });
      if (oauthError) throw oauthError;
    } catch (err) {
      setError(err.message || "Unable to continue with Google");
    }
  };

  return (
    <AuthLayout
      icon={UserPlus}
      title={step === "verify" ? "Check your email" : "Create your account"}
      subtitle={step === "verify" ? "Almost there" : "Choose Google or create an account with email"}
      footer={step === "register" ? <>Already have an account? <Link to="/login" className="text-primary font-medium hover:underline">Log in</Link></> : null}
    >
      {step === "register" ? (
        <>
          <button
            type="button"
            onClick={handleGoogle}
            className="flex h-14 w-full items-center justify-center gap-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
            style={{
              background: "linear-gradient(135deg, rgba(30,27,75,0.8) 0%, rgba(15,12,41,0.9) 100%)",
              border: "1px solid #f59e0b",
              boxShadow: "0 0 16px rgba(245,158,11,0.3)",
              color: "#f59e0b",
            }}
          >
            <GoogleIcon className="h-5 w-5" />Continue with Google
          </button>
          <div className="relative my-6"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10" /></div><div className="relative flex justify-center text-xs uppercase"><span className="px-3 text-slate-400">Or</span></div></div>
          <EmailRegistrationForm email={email} password={password} error={error} loading={loading} onEmailChange={setEmail} onPasswordChange={setPassword} onSubmit={handleRegister} />
          <p className="mt-4 text-center text-xs leading-relaxed text-slate-400">
            By creating an account, you agree to our{" "}
            <Link to="/terms-of-service" className="text-slate-200 underline hover:text-white">Terms of Service</Link>
            {" "}and{" "}
            <Link to="/privacy-policy" className="text-slate-200 underline hover:text-white">Privacy Policy</Link>.
          </p>
        </>
      ) : (
        <CheckEmailNotice email={email} error={error} resending={resending} onResend={handleResend} />
      )}
    </AuthLayout>
  );
}
