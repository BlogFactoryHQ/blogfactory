import { getPolarClient } from "../services/polar-client.js";
import { PRODUCT_ENV, type BillingSku } from "../services/billing-config.js";

const catalog: Array<{ sku: BillingSku; name: string; description: string; cents: number; interval?: "month" | "year" }> = [
  { sku: "cloud_monthly", name: "BlogFactory Cloud Monthly", description: "3 sites, 1 GB, 3 RSS feeds, 150 successful drafts per UTC month.", cents: 500, interval: "month" },
  { sku: "cloud_yearly", name: "BlogFactory Cloud Yearly", description: "Cloud plan billed yearly; draft quota resets monthly.", cents: 4900, interval: "year" },
  { sku: "advanced_monthly", name: "BlogFactory Advanced Monthly", description: "10 sites, 10 GB, 20 RSS feeds, unlimited manual and 600 automated drafts per UTC month.", cents: 1500, interval: "month" },
  { sku: "advanced_yearly", name: "BlogFactory Advanced Yearly", description: "Advanced plan billed yearly; automation quota resets monthly.", cents: 14900, interval: "year" },
  { sku: "ai_credits_14000", name: "BlogFactory Managed AI Credits", description: "14,000 prepaid Managed AI Credits, valid for 365 days.", cents: 2000 },
];

const polar = getPolarClient();
const existing = [];
for await (const page of await polar.products.list({ limit: 100, isArchived: false })) existing.push(...page.result.items);

for (const item of catalog) {
  const match = existing.find((product) => product.metadata.sku === item.sku
    && product.recurringInterval === (item.interval || null)
    && product.prices.some((price) => "priceAmount" in price && price.priceAmount === item.cents && price.priceCurrency.toLowerCase() === "usd"));
  const product = match || await polar.products.create({
    name: item.name,
    description: item.description,
    visibility: "public",
    metadata: { sku: item.sku, catalog_version: new Date().toISOString().slice(0, 10) },
    prices: [{ amountType: "fixed", priceCurrency: "usd", priceAmount: item.cents }],
    ...(item.interval ? { recurringInterval: item.interval } : {}),
  });
  console.log(`${PRODUCT_ENV[item.sku]}=${product.id}${match ? " # existing" : " # created"}`);
}
