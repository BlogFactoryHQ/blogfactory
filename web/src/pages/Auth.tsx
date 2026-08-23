import { type ReactNode, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { FactoryMark } from "@/components/layout/BywordSurface";
import { toast } from "sonner";
import { api } from "@/lib/api";

export function authReturnTo(state: unknown, queryValue?: string | null) {
  const stateValue = state && typeof state === "object" && "returnTo" in state
    ? (state as { returnTo?: unknown }).returnTo
    : undefined;
  const value = typeof stateValue === "string" ? stateValue : queryValue;
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : "/";
}

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center factory-grid-bg p-4">
      <div className="w-full max-w-md">
        <div className="mb-5 flex justify-center">
          <FactoryMark />
        </div>
        <div className="relative overflow-hidden rounded-md border border-byword-border bg-card p-5 factory-panel sm:p-6">
          <div className="absolute inset-x-0 top-0 h-1 factory-divider opacity-60" aria-hidden="true" />
          {children}
        </div>
        <p className="type-kicker mt-5 text-center">
          Content assembly line ready
        </p>
      </div>
    </div>
  );
}

export default function Auth({ selfHosted }: { selfHosted?: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = authReturnTo(location.state, new URLSearchParams(location.search).get("returnTo"));
  const { login, devLogin, signup } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [isLoading, setIsLoading] = useState(false);
  const [isDevLoading, setIsDevLoading] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [consent, setConsent] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [signupEnabled, setSignupEnabled] = useState(selfHosted ?? false);

  useEffect(() => {
    if (selfHosted !== undefined) {
      setSignupEnabled(selfHosted);
      return;
    }
    let active = true;
    api.get<{ signup_enabled: boolean }>("/auth/config")
      .then((config) => { if (active) setSignupEnabled(config.signup_enabled); })
      .catch(() => { if (active) setSignupEnabled(false); });
    return () => { active = false; };
  }, [selfHosted]);

  useEffect(() => {
    if (!signupEnabled && mode === "signup") setMode("login");
  }, [mode, signupEnabled]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await login(email, password, rememberMe);
      toast.success("Welcome back!");
      navigate(returnTo, { replace: true });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await signup(email, password, displayName, consent, false);
      toast.success("Account created");
      navigate(returnTo, { replace: true });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDevLogin = async () => {
    setIsDevLoading(true);
    try {
      await devLogin();
      toast.success("Local workspace ready");
      navigate(returnTo, { replace: true });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Start the local backend, then try again");
    } finally {
      setIsDevLoading(false);
    }
  };

  return (
    <AuthShell>
        <h1 className="type-panel-title mb-1 text-lg">{mode === "login" ? "Sign in" : "Create account"}</h1>
        <p className="type-body mb-6">{mode === "login" ? "Access your BlogFactory workspace." : "Administrator emails are approved immediately. Other accounts wait for administrator approval."}</p>
        <form onSubmit={mode === "login" ? handleSignIn : handleSignUp} className="space-y-5">
              {mode === "signup" && (
                <div className="space-y-1.5">
                  <Label htmlFor="signup-name" className="text-xs">Name</Label>
                  <Input
                    id="signup-name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    autoComplete="name"
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="signin-email" className="text-xs">Email</Label>
                <Input
                  id="signin-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="signin-password" className="text-xs">Password</Label>
                <Input
                  id="signin-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  minLength={6}
                  required
                />
              </div>

              {mode === "login" ? <div className="flex items-center space-x-2">
                <Checkbox
                  id="remember-me"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked === true)}
                />
                <Label htmlFor="remember-me" className="text-xs text-muted-foreground cursor-pointer">
                  Remember me for 30 days
                </Label>
              </div> : <div className="flex items-start space-x-2">
                <Checkbox
                  id="signup-consent"
                  checked={consent}
                  onCheckedChange={(checked) => setConsent(checked === true)}
                />
                <Label htmlFor="signup-consent" className="cursor-pointer text-xs leading-5 text-muted-foreground">
                  I accept the terms and privacy policy configured by this installation.
                </Label>
              </div>}

              <Button type="submit" className="w-full h-10" disabled={isLoading || (mode === "signup" && !consent)}>
                {isLoading ? "Working..." : mode === "login" ? "Sign in" : "Create account"}
              </Button>

              {signupEnabled && (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => setMode(mode === "login" ? "signup" : "login")}
                  disabled={isLoading}
                >
                  {mode === "login" ? "Create account" : "Back to sign in"}
                </Button>
              )}

              {import.meta.env.DEV && (
                <div className="rounded-md border border-byword-border bg-muted/35 p-3">
                  <p className="type-kicker mb-2">
                    Local development
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={handleDevLogin}
                    disabled={isLoading || isDevLoading}
                  >
                    {isDevLoading ? "Preparing workspace..." : "Enter local workspace"}
                  </Button>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    Creates an approved local admin, starter site, and default voice in your dev database.
                  </p>
                </div>
              )}

        </form>
    </AuthShell>
  );
}
