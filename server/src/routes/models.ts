import { Hono } from "hono";
import { getUserId } from "../middleware/auth.js";
import { getOpenRouterModels } from "../services/openrouter-models.js";
import { MANAGED_IMAGE_MODELS, MANAGED_TEXT_MODELS, resolveOpenRouterAccess } from "../services/managed-openrouter.js";

export const modelsRoutes = new Hono();

modelsRoutes.get("/text", async (c) => {
  const refresh = c.req.query("refresh") === "true";
  const access = await resolveOpenRouterAccess(getUserId(c));
  const models = await getOpenRouterModels(access.apiKey, "text", refresh);
  return c.json(access.mode === "managed" ? models.filter((model: { id: string }) => MANAGED_TEXT_MODELS.includes(model.id as typeof MANAGED_TEXT_MODELS[number])) : models);
});

modelsRoutes.get("/image", async (c) => {
  const refresh = c.req.query("refresh") === "true";
  const access = await resolveOpenRouterAccess(getUserId(c));
  const models = await getOpenRouterModels(access.apiKey, "image", refresh);
  return c.json(access.mode === "managed" ? models.filter((model: { id: string }) => MANAGED_IMAGE_MODELS.includes(model.id as typeof MANAGED_IMAGE_MODELS[number])) : models);
});
