import { type ReactNode, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { FactoryMark } from "@/components/layout/BywordSurface";
import { toast } from "sonner";

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

export default function Auth() {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = authReturnTo(location.state, new URLSearchParams(location.search).get("returnTo"));
  const { login, devLogin } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isDevLoading, setIsDevLoading] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

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
        <h1 className="type-panel-title mb-1 text-lg">Sign in</h1>
        <p className="type-body mb-6">Access your BlogFactory workspace.</p>
        <form onSubmit={handleSignIn} className="space-y-5">
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
                  autoComplete="current-password"
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
    </AuthShell>
  );
}
