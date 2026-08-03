
    setError("");
    setLoading(true);
    try {
      const referralCode = sessionStorage.getItem("pending_referral_code");
      await base44.auth.register({ email, password, ...(referralCode && { referral_code: referralCode }) });
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
      const response = await base44.auth.verifyOtp({ email, otpCode: otp });
      base44.auth.setToken(response.access_token);
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
      await base44.auth.resendOtp(email);
    } catch (err) {
      setError(err.message || "Unable to resend the code");
    } finally {
      setResending(false);
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
          <Button variant="outline" className="h-12 w-full text-sm font-medium" onClick={() => base44.auth.loginWithProvider("google", "/")}>
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
