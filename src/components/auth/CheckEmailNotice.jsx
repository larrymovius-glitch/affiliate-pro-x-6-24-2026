import React from "react";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

// Supabase's "Confirm signup" email template sends a confirmation link
// (emailRedirectTo), not a numeric OTP code -- there's no code to ever
// receive. This used to show a 6-digit code entry box that could never be
// filled in, a dead end. The link itself already works: clicking it
// completes signup and redirects back into the app with a session.
export default function CheckEmailNotice({ email, error, resending, onResend }) {
  return (
    <div className="space-y-5 text-center">
      <MailCheck className="mx-auto h-10 w-10 text-primary" />
      <p className="text-sm text-muted-foreground">
        We sent a confirmation link to <span className="font-medium text-foreground">{email}</span>.
        Click it to finish creating your account.
      </p>
      {error && <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      <Button type="button" variant="ghost" className="w-full" onClick={onResend} disabled={resending}>
        {resending ? "Sending another email..." : "Resend email"}
      </Button>
    </div>
  );
}
