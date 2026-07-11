import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { authMiddleware } from "./middleware/auth.js";
import { errorResponse, handleApiError, normalizeApiErrors } from "./http/error-contract.js";

import { authRoutes } from "./routes/auth.js";
import { postsRoutes } from "./routes/posts.js";
import { feedsRoutes } from "./routes/feeds.js";
import { personasRoutes } from "./routes/personas.js";
import { jobsRoutes } from "./routes/jobs.js";
import { settingsRoutes } from "./routes/settings.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { modelsRoutes } from "./routes/models.js";
import { imagesRoutes } from "./routes/images.js";
import { storageRoutes } from "./routes/storage.js";
import { contentRoutes } from "./routes/content.js";
import { schedulerRoutes } from "./routes/scheduler.js";
import { webhooksRoutes } from "./routes/webhooks.js";
import { adminRoutes } from "./routes/admin.js";
import { sitesRoutes } from "./routes/sites.js";
import { integrationsRoutes } from "./routes/integrations.js";
import { indexingRoutes } from "./routes/indexing.js";
import { searchConsoleRoutes } from "./routes/search-console.js";
import { optimizeRoutes } from "./routes/optimize.js";
import { campaignsRoutes } from "./routes/campaigns.js";
import { cronRoutes } from "./routes/cron.js";
import { programmaticRoutes } from "./routes/programmatic.js";

const app = new Hono();

app.use("*", cors());
app.use("*", logger());
app.use("/api/*", normalizeApiErrors);
app.use("/api/*", authMiddleware);

app.route("/api/auth", authRoutes);
app.route("/api/posts", postsRoutes);
app.route("/api/feeds", feedsRoutes);
app.route("/api/personas", personasRoutes);
app.route("/api/jobs", jobsRoutes);
app.route("/api/settings", settingsRoutes);
app.route("/api/dashboard", dashboardRoutes);
app.route("/api/analytics", analyticsRoutes);
app.route("/api/models", modelsRoutes);
app.route("/api/images", imagesRoutes);
app.route("/api/storage", storageRoutes);
app.route("/api/content", contentRoutes);
app.route("/api/scheduler", schedulerRoutes);
app.route("/api/webhooks", webhooksRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/sites", sitesRoutes);
app.route("/api/integrations", integrationsRoutes);
app.route("/api/indexing", indexingRoutes);
app.route("/api/search-console", searchConsoleRoutes);
app.route("/api/optimize", optimizeRoutes);
app.route("/api/campaigns", campaignsRoutes);
app.route("/api/cron", cronRoutes);
app.route("/api/programmatic", programmaticRoutes);

app.get("/api/health", (c) =>
  c.json({ status: "ok", version: "1.0.0" })
);

app.notFound((c) => errorResponse(c, 404, "not_found", "API route not found"));
app.onError(handleApiError);

// Named export for Vercel serverless entrypoint
export { app };

// Default export for Bun local development
console.log("Backend listening on port 3000");
export default {
  port: 3000,
  fetch: app.fetch,
};
