import React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

export default function OtpVerificationForm({ email, otp, error, loading, resending, onOtpChange, onSubmit, onResend }) {
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <p className="text-center text-sm text-muted-foreground">Enter the 6-digit code sent to <span className="font-medium text-foreground">{email}</span>.</p>
      {error && <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      <InputOTP maxLength={6} value={otp} onChange={onOtpChange} containerClassName="justify-center" autoFocus>
        <InputOTPGroup>{[0, 1, 2, 3, 4, 5].map((index) => <InputOTPSlot key={index} index={index} className="h-11 w-11" />)}</InputOTPGroup>
      </InputOTP>
      <Button type="submit" className="h-12 w-full font-medium" disabled={loading || otp.length !== 6}>
        {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Verifying...</> : "Verify and continue"}
      </Button>
      <Button type="button" variant="ghost" className="w-full" onClick={onResend} disabled={resending}>
        {resending ? "Sending another code..." : "Resend code"}
      </Button>
    </form>
  );
}