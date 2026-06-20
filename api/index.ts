/**
 * Vercel Serverless Function entrypoint.
 *
 * This file is the entry point for Vercel's serverless runtime.
 * It imports the Hono app and wraps it with Hono's Vercel adapter.
 *
 * For local development, use `bun run dev` inside /api (or `npm run dev` from root).
 */
import { handle } from "hono/vercel";
import { app } from "./src/index.js";

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const DELETE = handle(app);
export const PATCH = handle(app);
export const OPTIONS = handle(app);
