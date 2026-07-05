import { type ReactNode, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FactoryMark } from "@/components/layout/BywordSurface";
import { toast } from "sonner";

type View = "signin" | "signup" | "forgot-password" | "reset-password";

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

export default function Auth() {
  const navigate = useNavigate();
  const { login, signup, devLogin } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isDevLoading, setIsDevLoading] = useState(false);
  const [view, setView] = useState<View>("signin");

  // Sign in fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

  // Sign up fields
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [consent, setConsent] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(true);

  // Forgot password fields
  const [forgotEmail, setForgotEmail] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await login(email, password, rememberMe);
      toast.success("Welcome back!");
      navigate("/");
    } catch (err: any) {
      toast.error(err.message || "An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consent) {
      toast.error("You must accept the Privacy Policy and Terms of Service");
      return;
    }
    setIsLoading(true);
    try {
      await signup(signupEmail, signupPassword, displayName, consent, marketingOptIn);
      toast.success("Account request created");
      navigate("/");
    } catch (err: any) {
      toast.error(err.message || "An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDevLogin = async () => {
    setIsDevLoading(true);
    try {
      await devLogin();
      toast.success("Local workspace ready");
      navigate("/");
    } catch (err: any) {
      toast.error(err.message || "Start the local backend, then try again");
    } finally {
      setIsDevLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const resp = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error);
      toast.success(data.message);
      setView("reset-password");
    } catch (err: any) {
      toast.error(err.message || "Failed to send reset email");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const resp = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resetToken, password: newPassword }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error);
      toast.success(data.message);
      setView("signin");
    } catch (err: any) {
      toast.error(err.message || "Failed to reset password");
    } finally {
      setIsLoading(false);
    }
  };

  if (view === "forgot-password") {
    return (
      <AuthShell>
          <h2 className="type-panel-title mb-1 text-lg">Forgot password</h2>
          <p className="type-body mb-6">Enter your email to receive a reset link.</p>

          <form onSubmit={handleForgotPassword} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="forgot-email" className="text-xs">Email</Label>
              <Input
                id="forgot-email"
                type="email"
                placeholder="you@example.com"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full h-10" disabled={isLoading}>
              {isLoading ? "Sending..." : "Send reset link"}
            </Button>
          </form>

          <button
            type="button"
            onClick={() => setView("signin")}
            className="mt-4 w-full rounded-sm text-center text-sm text-muted-foreground transition-calm hover:text-byword-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
          >
            Back to sign in
          </button>
      </AuthShell>
    );
  }

  if (view === "reset-password") {
    return (
      <AuthShell>
          <h2 className="type-panel-title mb-1 text-lg">Reset password</h2>
          <p className="type-body mb-6">Enter the reset token from your email and a new password.</p>

          <form onSubmit={handleResetPassword} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="reset-token" className="text-xs">Reset token</Label>
              <Input
                id="reset-token"
                type="text"
                placeholder="Paste your reset token"
                value={resetToken}
                onChange={(e) => setResetToken(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-password" className="text-xs">New password</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="Minimum 6 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={6}
                required
              />
            </div>
            <Button type="submit" className="w-full h-10" disabled={isLoading}>
              {isLoading ? "Resetting..." : "Reset password"}
            </Button>
          </form>

          <button
            type="button"
            onClick={() => setView("signin")}
            className="mt-4 w-full rounded-sm text-center text-sm text-muted-foreground transition-calm hover:text-byword-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
          >
            Back to sign in
          </button>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
        <Tabs defaultValue="signin" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-8">
            <TabsTrigger value="signin">Sign in</TabsTrigger>
            <TabsTrigger value="signup">Sign up</TabsTrigger>
          </TabsList>

          <TabsContent value="signin">
            <form onSubmit={handleSignIn} className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="signin-email" className="text-xs">Email</Label>
                <Input
                  id="signin-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="signin-password" className="text-xs">Password</Label>
                  <button
                    type="button"
                    onClick={() => setView("forgot-password")}
                    className="rounded-sm text-xs text-muted-foreground transition-calm hover:text-byword-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
                  >
                    Forgot password?
                  </button>
                </div>
                <Input
                  id="signin-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="remember-me"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked === true)}
                />
                <Label htmlFor="remember-me" className="text-xs text-muted-foreground cursor-pointer">
                  Remember me for 30 days
                </Label>
              </div>

              <Button type="submit" className="w-full h-10" disabled={isLoading}>
                {isLoading ? "Signing in..." : "Sign in"}
              </Button>

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
          </TabsContent>

          <TabsContent value="signup">
            <form onSubmit={handleSignUp} className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="signup-name" className="text-xs">Display name</Label>
                <Input
                  id="signup-name"
                  type="text"
                  placeholder="Your name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="signup-email" className="text-xs">Email</Label>
                <Input
                  id="signup-email"
                  type="email"
                  placeholder="you@example.com"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="signup-password" className="text-xs">Password</Label>
                <Input
                  id="signup-password"
                  type="password"
                  placeholder="••••••••"
                  value={signupPassword}
                  onChange={(e) => setSignupPassword(e.target.value)}
                  minLength={6}
                  required
                />
                <p className="text-[11px] text-muted-foreground">
                  Minimum 6 characters
                </p>
              </div>

              {/* Consent checkbox */}
              <div className="flex items-start space-x-2">
                <Checkbox
                  id="consent"
                  checked={consent}
                  onCheckedChange={(checked) => setConsent(checked === true)}
                  className="mt-0.5"
                />
                <Label htmlFor="consent" className="text-xs text-muted-foreground cursor-pointer leading-relaxed">
                  I agree to the Privacy Policy and Terms of Service
                </Label>
              </div>

              {/* Marketing opt-in */}
              <div className="flex items-start space-x-2">
                <Checkbox
                  id="marketing"
                  checked={marketingOptIn}
                  onCheckedChange={(checked) => setMarketingOptIn(checked === true)}
                  className="mt-0.5"
                />
                <Label htmlFor="marketing" className="text-xs text-muted-foreground cursor-pointer leading-relaxed">
                  Yes, I want to receive BlogFactory emails
                </Label>
              </div>

              <Button type="submit" className="w-full h-10" disabled={isLoading || !consent}>
                {isLoading ? "Creating account..." : "Create account"}
              </Button>

            </form>
          </TabsContent>
        </Tabs>
    </AuthShell>
  );
}
