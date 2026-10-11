import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
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
      body: JSON.stringify({ email, outcome }),
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
          <Button variant="outline" className="h-12 w-full text-sm font-medium" onClick={handleGoogle}>
            <GoogleIcon className="mr-2 h-5 w-5" />Continue with Google
          </Button>
          <div className="relative my-6"><div className="absolute inset-0 flex items-center"><div className="w-full border-t" /></div><div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-3 text-muted-foreground">Or</span></div></div>
          <EmailRegistrationForm email={email} password={password} error={error} loading={loading} onEmailChange={setEmail} onPasswordChange={setPassword} onSubmit={handleRegister} />
        </>
      ) : (
        <CheckEmailNotice email={email} error={error} resending={resending} onResend={handleResend} />
      )}
    </AuthLayout>
  );
}
