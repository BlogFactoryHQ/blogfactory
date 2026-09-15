import { useEffect, useState, createContext, useContext, ReactNode } from "react";
import { api } from "@/lib/api";

interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  emailVerified?: boolean;
  role: "admin" | "user";
  approvalStatus: "pending" | "approved" | "rejected";
  rejectedReason?: string | null;
  createdAt?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  signOut: () => void;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  devLogin: () => Promise<void>;
  signup: (email: string, password: string, displayName?: string, consent?: boolean, marketingOptIn?: boolean, turnstileToken?: string) => Promise<"authenticated" | "verification_sent">;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = api.getToken();
    api
      .get<AuthUser>("/auth/me")
      .then((u) => setUser(u))
      .catch(() => {
        if (token) api.setToken(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (email: string, password: string, rememberMe = false) => {
    const { token, user: u } = await api.post<{ token: string; user: AuthUser }>("/auth/login", {
      email,
      password,
      rememberMe,
    });
    api.setToken(token);
    setUser(u);
  };

  const signup = async (email: string, password: string, displayName?: string, consent?: boolean, marketingOptIn?: boolean, turnstileToken?: string) => {
    const result = await api.post<{ token?: string; user?: AuthUser; message?: string }>("/auth/signup", {
      email,
      password,
      displayName,
      consent,
      marketingOptIn,
      turnstileToken,
    });
    if (!result.token || !result.user) return "verification_sent";
    api.setToken(result.token);
    setUser(result.user);
    return "authenticated";
  };

  const devLogin = async () => {
    const { token, user: u } = await api.post<{ token: string; user: AuthUser }>("/auth/dev-login");
    api.setToken(token);
    setUser(u);
  };

  const signOut = () => {
    const localSession = Boolean(api.getToken());
    api.setToken(null);
    setUser(null);
    if (localSession) {
      window.location.href = "/auth";
      return;
    }
    api.post<{ url: string }>("/auth/workos/logout")
      .then(({ url }) => { window.location.href = url; })
      .catch(() => { window.location.href = "/auth"; });
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, signOut, login, devLogin, signup }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
