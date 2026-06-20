import { useEffect, useState, createContext, useContext, ReactNode } from "react";
import { api } from "@/lib/api";

interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  emailVerified?: boolean;
  createdAt?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  signOut: () => void;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  signup: (email: string, password: string, displayName?: string, consent?: boolean, marketingOptIn?: boolean) => Promise<void>;
  googleLogin: (credential: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = api.getToken();
    if (!token) {
      setIsLoading(false);
      return;
    }

    api
      .get<AuthUser>("/auth/me")
      .then((u) => setUser(u))
      .catch(() => {
        api.setToken(null);
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

  const signup = async (email: string, password: string, displayName?: string, consent?: boolean, marketingOptIn?: boolean) => {
    const { token, user: u } = await api.post<{ token: string; user: AuthUser }>("/auth/signup", {
      email,
      password,
      displayName,
      consent,
      marketingOptIn,
    });
    api.setToken(token);
    setUser(u);
  };

  const googleLogin = async (credential: string) => {
    const { token, user: u } = await api.post<{ token: string; user: AuthUser }>("/auth/google", {
      credential,
    });
    api.setToken(token);
    setUser(u);
  };

  const signOut = () => {
    api.setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, signOut, login, signup, googleLogin }}>
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
