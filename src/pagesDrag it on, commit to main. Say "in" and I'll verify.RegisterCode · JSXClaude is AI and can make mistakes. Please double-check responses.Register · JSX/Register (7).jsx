import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { UserPlus } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import EmailRegistrationForm from "@/components/auth/EmailRegistrationForm";
import OtpVerificationForm from "@/components/auth/OtpVerificationForm";

export default function Register() {
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) sessionStorage.setItem("pending_referral_code", ref);
  }, [searchParams]);

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
      if (signUpError) throw signUpError;

      // Email confirmation off => session returned immediately, skip OTP step.
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

  const handleVerify = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: "signup",
      });
      if (verifyError) throw verifyError;
      window.location.href = "/";
    } catch (err) {
      setError(err.message || "That verification code is invalid");
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
      setError(err.message || "Unable to resend the code");
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
      title={step === "verify" ? "Verify your email" : "Create your account"}
      subtitle={step === "verify" ? "One quick step, then your dashboard" : "Choose Google or create an account with email"}
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
        <OtpVerificationForm email={email} otp={otp} error={error} loading={loading} resending={resending} onOtpChange={setOtp} onSubmit={handleVerify} onResend={handleResend} />
      )}
    </AuthLayout>
  );
}
