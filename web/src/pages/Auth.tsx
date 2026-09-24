import { type ReactNode, useEffect, useRef, useState } from "react";
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
  const resetToken = new URLSearchParams(location.search).get("reset");
  const [mode, setMode] = useState<"login" | "signup" | "forgot" | "reset">(resetToken ? "reset" : "login");
  const [isLoading, setIsLoading] = useState(false);
  const [isDevLoading, setIsDevLoading] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [consent, setConsent] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [signupEnabled, setSignupEnabled] = useState(selfHosted ?? false);
  const [workosEnabled, setWorkosEnabled] = useState(false);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileHost = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selfHosted !== undefined) {
      setSignupEnabled(selfHosted);
      return;
    }
    let active = true;
    api.get<{ signup_enabled: boolean; auth_provider?: "local" | "workos"; turnstile_site_key?: string | null }>("/auth/config")
      .then((config) => { if (active) { setSignupEnabled(config.signup_enabled); setWorkosEnabled(config.auth_provider === "workos"); setTurnstileSiteKey(config.turnstile_site_key || null); } })
      .catch(() => { if (active) setSignupEnabled(false); });
    return () => { active = false; };
  }, [selfHosted]);

  useEffect(() => {
    if (!signupEnabled && mode === "signup") setMode("login");
  }, [mode, signupEnabled]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const verify = params.get("verify");
    if (!verify) return;
    api.post("/auth/verify-email", { token: verify })
      .then(() => { toast.success("Email verified. You can sign in."); navigate("/auth", { replace: true }); })
      .catch((error: Error) => toast.error(error.message));
  }, [location.search, navigate]);

  useEffect(() => {
    if (new URLSearchParams(location.search).get("error") === "auth_failed") toast.error("Sign in could not be completed. Please try again.");
  }, [location.search]);

  useEffect(() => {
    if (mode !== "signup" || !turnstileSiteKey || !turnstileHost.current) return;
    const render = () => {
      const turnstile = (window as Window & { turnstile?: { render: (element: HTMLElement, options: Record<string, unknown>) => void } }).turnstile;
      if (turnstile && turnstileHost.current) turnstile.render(turnstileHost.current, { sitekey: turnstileSiteKey, callback: (token: string) => setTurnstileToken(token), "expired-callback": () => setTurnstileToken("") });
    };
    const existing = document.querySelector<HTMLScriptElement>('script[src*="challenges.cloudflare.com/turnstile"]');
    if (existing) { render(); return; }
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true; script.defer = true; script.onload = render;
    document.head.appendChild(script);
  }, [mode, turnstileSiteKey]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await login(email, password, rememberMe);
      toast.success("Signed in");
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
      const result = await signup(email, password, displayName, consent, false, turnstileToken);
      if (result === "verification_sent") {
        toast.success("Check your email to verify your account");
        setMode("login");
      } else {
        toast.success("Account created");
        navigate(returnTo, { replace: true });
      }
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

  const handleWorkos = async (screenHint: "sign-in" | "sign-up") => {
    setIsLoading(true);
    try {
      const { url } = await api.post<{ url: string }>("/auth/workos/start", {
        screenHint,
        returnTo: screenHint === "sign-up" ? "/billing" : returnTo,
        consent: screenHint === "sign-up" ? consent : false,
        turnstileToken: screenHint === "sign-up" ? turnstileToken : undefined,
      });
      window.location.href = url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Authentication could not be started");
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault(); setIsLoading(true);
    try {
      await api.post("/auth/forgot-password", { email });
      toast.success("If that account exists, a reset link has been sent.");
      setMode("login");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Request failed"); }
    finally { setIsLoading(false); }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault(); setIsLoading(true);
    try {
      await api.post("/auth/reset-password", { token: resetToken, password });
      toast.success("Password reset. You can sign in.");
      navigate("/auth", { replace: true }); setMode("login"); setPassword("");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Reset failed"); }
    finally { setIsLoading(false); }
  };

  if (workosEnabled) return (
    <AuthShell>
      <h1 className="type-panel-title mb-1 text-lg">{mode === "signup" ? "Create account" : "Sign in"}</h1>
      <p className="type-body mb-6">{mode === "signup" ? "Verify your email in AuthKit, then choose a Cloud plan." : "Continue securely with BlogFactory AuthKit."}</p>
      <div className="space-y-5">
        {mode === "signup" && <div className="flex items-start space-x-2">
          <Checkbox id="workos-consent" checked={consent} onCheckedChange={(checked) => setConsent(checked === true)} />
          <Label htmlFor="workos-consent" className="cursor-pointer text-xs leading-5 text-muted-foreground">I accept the BlogFactory Terms of Service and Privacy Policy.</Label>
        </div>}
        {mode === "signup" && turnstileSiteKey && <div ref={turnstileHost} />}
        <Button className="h-10 w-full" disabled={isLoading || (mode === "signup" && (!consent || Boolean(turnstileSiteKey && !turnstileToken)))} onClick={() => handleWorkos(mode === "signup" ? "sign-up" : "sign-in")}>
          {isLoading ? "Redirecting..." : mode === "signup" ? "Continue to create account" : "Continue to sign in"}
        </Button>
        {signupEnabled && <Button type="button" variant="ghost" className="w-full" onClick={() => setMode(mode === "login" ? "signup" : "login")} disabled={isLoading}>
          {mode === "login" ? "Create account" : "Back to sign in"}
        </Button>}
      </div>
    </AuthShell>
  );

  if (mode === "forgot" || mode === "reset") return (
    <AuthShell>
      <h1 className="type-panel-title mb-1 text-lg">{mode === "forgot" ? "Reset password" : "Choose a new password"}</h1>
      <p className="type-body mb-6">{mode === "forgot" ? "We will send a one-time reset link if the account exists." : "This link can be used once and expires after one hour."}</p>
      <form onSubmit={mode === "forgot" ? handleForgotPassword : handleResetPassword} className="space-y-5">
        {mode === "forgot" ? <div className="space-y-1.5"><Label htmlFor="reset-email">Email</Label><Input id="reset-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
          : <div className="space-y-1.5"><Label htmlFor="reset-password">New password</Label><Input id="reset-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} required /></div>}
        <Button className="w-full" type="submit" disabled={isLoading}>{isLoading ? "Working..." : mode === "forgot" ? "Send reset link" : "Reset password"}</Button>
        <Button className="w-full" type="button" variant="ghost" onClick={() => setMode("login")}>Back to sign in</Button>
      </form>
    </AuthShell>
  );

  return (
    <AuthShell>
        <h1 className="type-panel-title mb-1 text-lg">{mode === "login" ? "Sign in" : "Create account"}</h1>
        <p className="type-body mb-6">{mode === "login" ? "Access your BlogFactory workspace." : selfHosted ? "Administrator emails are approved immediately. Other accounts wait for administrator approval." : "Verify your email, then choose a Cloud plan."}</p>
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

              {mode === "signup" && turnstileSiteKey && <div ref={turnstileHost} />}

              <Button type="submit" className="w-full h-10" disabled={isLoading || (mode === "signup" && (!consent || Boolean(turnstileSiteKey && !turnstileToken)))}>
                {isLoading ? "Working..." : mode === "login" ? "Sign in" : "Create account"}
              </Button>

              {mode === "login" && <Button type="button" variant="ghost" className="w-full" onClick={() => setMode("forgot")}>Forgot password?</Button>}

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
