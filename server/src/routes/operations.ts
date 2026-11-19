import { Hono } from "hono";
import { ApiError } from "../http/error-contract.js";
import { getUserId } from "../middleware/auth.js";
import { listOperationEvents } from "../services/operation-events.js";
import { getSiteForUser } from "../services/user-settings.js";

export const operationsRoutes = new Hono();

operationsRoutes.get("/", async (c) => {
  const userId = getUserId(c);
  const siteId = c.req.query("site_id");
  const requestedLimit = Number(c.req.query("limit") || 50);
  if (siteId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(siteId)) {
    throw new ApiError(400, "validation_error", "site_id must be a UUID");
  }
  if (siteId && !await getSiteForUser(userId, siteId)) throw new ApiError(404, "not_found", "Site not found");
  return c.json({
    items: await listOperationEvents({
      userId,
      siteId,
      limit: Number.isFinite(requestedLimit) ? requestedLimit : 50,
    }),
  });
});
