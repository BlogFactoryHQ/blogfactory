import { chmodSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { getPolarClient } from "../services/polar-client.js";

const url = "https://app.blogfactory.io/api/webhooks/polar";
const events = [
  "order.paid",
  "order.refunded",
  "refund.created",
  "refund.updated",
  "subscription.created",
  "subscription.updated",
  "subscription.active",
  "subscription.canceled",
  "subscription.uncanceled",
  "subscription.revoked",
  "subscription.past_due",
  "customer.state_changed",
] as const;

const polar = getPolarClient();
const endpoints = [];
for await (const page of await polar.webhooks.listWebhookEndpoints({ limit: 100 })) endpoints.push(...page.result.items);
const existing = endpoints.find((endpoint) => endpoint.url === url);
const endpoint = existing
  ? await polar.webhooks.updateWebhookEndpoint({ id: existing.id, webhookEndpointUpdate: { name: "BlogFactory Cloud", format: "raw", events: [...events], enabled: true } })
  : await polar.webhooks.createWebhookEndpoint({ url, name: "BlogFactory Cloud", format: "raw", events: [...events] });

const envPath = resolve(process.cwd(), ".env");
const env = readFileSync(envPath, "utf8");
const next = /^POLAR_WEBHOOK_SECRET=.*$/m.test(env)
  ? env.replace(/^POLAR_WEBHOOK_SECRET=.*$/m, `POLAR_WEBHOOK_SECRET=${endpoint.secret}`)
  : `${env.replace(/\s*$/, "\n")}POLAR_WEBHOOK_SECRET=${endpoint.secret}\n`;
const temporaryPath = `${envPath}.tmp`;
writeFileSync(temporaryPath, next, { mode: 0o600 });
renameSync(temporaryPath, envPath);
chmodSync(envPath, 0o600);
console.log(JSON.stringify({ id: endpoint.id, url: endpoint.url, status: existing ? "updated" : "created", secretStored: true }));
