import { Hono } from "hono";
import { readJsonObject } from "../http/error-contract.js";
import { getUserId } from "../middleware/auth.js";
import { completeMcpOAuthLogin } from "../services/mcp-oauth.js";
import {
  listMcpOAuthConnections,
  revokeMcpOAuthConnection,
} from "../services/mcp-oauth-connections.js";

type McpOAuthRoutesDependencies = {
  complete: (userId: string, externalAuthId: unknown, siteIds: unknown) => Promise<{ redirect_uri: string }>;
  list: (userId: string) => Promise<unknown[]>;
  revoke: (userId: string, connectionId: string) => Promise<{ revoked: true }>;
};

export function createMcpOAuthRoutes(dependencies: McpOAuthRoutesDependencies) {
  const routes = new Hono();
  routes.post("/complete", async (c) => {
    const body = await readJsonObject(c);
    return c.json(await dependencies.complete(getUserId(c), body.external_auth_id, body.site_ids));
  });
  routes.get("/connections", async (c) => (
    c.json({ connections: await dependencies.list(getUserId(c)) })
  ));
  routes.delete("/connections/:id", async (c) => (
    c.json(await dependencies.revoke(getUserId(c), c.req.param("id")))
  ));
  return routes;
}

export const mcpOAuthRoutes = createMcpOAuthRoutes({
  complete: completeMcpOAuthLogin,
  list: listMcpOAuthConnections,
  revoke: revokeMcpOAuthConnection,
});
