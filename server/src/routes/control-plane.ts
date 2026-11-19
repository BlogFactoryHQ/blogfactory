import { Hono } from "hono";
import { ApiError } from "../http/error-contract.js";
import { getUserId } from "../middleware/auth.js";
import { ACTION_KINDS, ACTION_SEVERITIES, getWorkspaceDigest, listActionItems, type ActionKind, type ActionSeverity } from "../services/control-plane.js";

export const controlPlaneRoutes = new Hono();

function requiredSiteId(value: string | undefined) {
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new ApiError(400, "validation_error", "A valid site_id is required");
  }
  return value;
}

controlPlaneRoutes.get("/overview", async (c) => {
  const result = await getWorkspaceDigest({ userId: getUserId(c), siteId: requiredSiteId(c.req.query("site_id")) });
  if (!result) throw new ApiError(404, "not_found", "Site not found");
  return c.json(result);
});

controlPlaneRoutes.get("/action-items", async (c) => {
  const severity = c.req.query("severity");
  const kind = c.req.query("kind");
  if (severity && !ACTION_SEVERITIES.includes(severity as ActionSeverity)) throw new ApiError(400, "validation_error", "Invalid severity");
  if (kind && !ACTION_KINDS.includes(kind as ActionKind)) throw new ApiError(400, "validation_error", "Invalid kind");
  const result = await listActionItems({
    userId: getUserId(c),
    siteId: requiredSiteId(c.req.query("site_id")),
    severity: severity as ActionSeverity | undefined,
    kind: kind as ActionKind | undefined,
    limit: Number.isFinite(Number(c.req.query("limit"))) ? Number(c.req.query("limit")) : 20,
    page: Number.isFinite(Number(c.req.query("page"))) ? Number(c.req.query("page")) : 1,
  });
  if (!result) throw new ApiError(404, "not_found", "Site not found");
  return c.json(result);
});
