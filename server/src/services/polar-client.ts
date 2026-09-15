import { Polar } from "@polar-sh/sdk";

export function polarServer(env: NodeJS.ProcessEnv = process.env) {
  return env.POLAR_SERVER === "production" ? "production" : "sandbox";
}

export function getPolarClient(env: NodeJS.ProcessEnv = process.env) {
  const accessToken = env.POLAR_ACCESS_TOKEN?.trim();
  if (!accessToken) throw new Error("POLAR_ACCESS_TOKEN is not configured");
  return new Polar({ accessToken, server: polarServer(env) });
}

export function appUrl(env: NodeJS.ProcessEnv = process.env) {
  return (env.APP_URL || env.WEB_APP_URL || env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
}
