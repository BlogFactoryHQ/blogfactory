// Turns the product profile into ready-to-run programmatic datasets (rows for the built-in templates).
import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { programmaticDatasets } from "../db/schema.js";
import { ownedSiteRow, type ProductProfile } from "./product-seo.js";

export interface ProfileDataset {
  name: string;
  templateId: string;
  columns: string[];
  rows: Array<Record<string, string>>;
}

const MAX_ROWS = 8;

export function buildProfileDatasets(profile: Pick<ProductProfile, "competitors" | "problems" | "audience">, productName: string, year = new Date().getFullYear()): ProfileDataset[] {
  const yr = String(year);
  const datasets: ProfileDataset[] = [];
  const seenCompetitors = new Set<string>();
  const competitors = profile.competitors.map((name) => name.trim())
    .filter((name) => name && !seenCompetitors.has(name.toLowerCase()) && seenCompetitors.add(name.toLowerCase())).slice(0, MAX_ROWS);
  if (competitors.length) {
    datasets.push({
      name: `${productName}: alternatives pages`, templateId: "builtin-alternatives", columns: ["competitor", "product", "year"],
      rows: competitors.map((competitor) => ({ competitor, product: productName, year: yr })),
    });
    datasets.push({
      name: `${productName}: versus pages`, templateId: "builtin-product-comparison", columns: ["product_a", "product_b", "year"],
      rows: competitors.map((competitor) => ({ product_a: productName, product_b: competitor, year: yr })),
    });
  }
  const useCases = [...profile.problems, ...profile.audience].map((item) => item.trim()).filter(Boolean);
  const seen = new Set<string>();
  const uniqueUseCases = useCases.filter((item) => !seen.has(item.toLowerCase()) && seen.add(item.toLowerCase())).slice(0, MAX_ROWS);
  if (uniqueUseCases.length) {
    datasets.push({
      name: `${productName}: use case pages`, templateId: "builtin-use-case", columns: ["product", "use_case", "year"],
      rows: uniqueUseCases.map((useCase) => ({ product: productName, use_case: useCase, year: yr })),
    });
  }
  return datasets;
}

export async function createProfileDatasets(userId: string, siteId: string) {
  const site = await ownedSiteRow(userId, siteId);
  if (!site) return null;
  const profile = site.productProfile as ProductProfile | null;
  if (!profile) throw new Error("Generate the product profile first");
  const datasets = buildProfileDatasets(profile, site.name);
  if (!datasets.length) throw new Error("The profile has no competitors, problems or audience to build pages from. Add some and try again.");
  const saved = [];
  for (const dataset of datasets) {
    const [existing] = await db.select({ id: programmaticDatasets.id }).from(programmaticDatasets)
      .where(and(eq(programmaticDatasets.userId, userId), eq(programmaticDatasets.name, dataset.name))).limit(1);
    const values = { columns: dataset.columns, rows: dataset.rows, updatedAt: new Date() };
    const [row] = existing
      ? await db.update(programmaticDatasets).set(values).where(eq(programmaticDatasets.id, existing.id)).returning()
      : await db.insert(programmaticDatasets).values({ userId, name: dataset.name, ...values }).returning();
    saved.push({ id: row.id, name: dataset.name, templateId: dataset.templateId, rows: dataset.rows.length });
  }
  return saved;
}
