import React from "react";
import { Loader2, Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function EmailRegistrationForm({ email, password, error, loading, onEmailChange, onPasswordChange, onSubmit }) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      <div className="space-y-2">
        <Label htmlFor="register-email">Email</Label>
        <div className="relative">
          <Mail aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="register-email" type="email" autoComplete="email" value={email} onChange={(event) => onEmailChange(event.target.value)} className="h-12 pl-10" placeholder="you@example.com" required />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="register-password">Password</Label>
        <div className="relative">
          <Lock aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="register-password" type="password" autoComplete="new-password" value={password} onChange={(event) => onPasswordChange(event.target.value)} className="h-12 pl-10" placeholder="At least 8 characters" minLength={8} required />
        </div>
      </div>
      <Button type="submit" className="h-12 w-full font-medium" disabled={loading}>
        {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Creating account...</> : "Create account with email"}
      </Button>
    </form>
  );
}