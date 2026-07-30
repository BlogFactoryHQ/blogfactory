import { Hono } from "hono";
import { readJsonObject } from "../http/error-contract.js";
import { getUserId } from "../middleware/auth.js";
import {
  createMcpAccessToken,
  listMcpAccessTokens,
  parseCreateMcpTokenInput,
  revokeMcpAccessToken,
  type CreateMcpTokenInput,
} from "../services/mcp-access-tokens.js";

type McpTokenRoutesDependencies = {
  list: (userId: string) => Promise<unknown[]>;
  create: (userId: string, input: CreateMcpTokenInput) => Promise<unknown>;
  revoke: (userId: string, tokenId: string) => Promise<{ revoked: true }>;
};

export function createMcpTokenRoutes(dependencies: McpTokenRoutesDependencies) {
  const routes = new Hono();

  routes.get("/", async (c) => c.json({ tokens: await dependencies.list(getUserId(c)) }));
  routes.post("/", async (c) => {
    const input = parseCreateMcpTokenInput(await readJsonObject(c));
    return c.json(await dependencies.create(getUserId(c), input), 201);
  });
  routes.delete("/:id", async (c) => c.json(await dependencies.revoke(getUserId(c), c.req.param("id"))));

  return routes;
}

export const mcpTokenRoutes = createMcpTokenRoutes({
  list: listMcpAccessTokens,
  create: createMcpAccessToken,
  revoke: revokeMcpAccessToken,
});
