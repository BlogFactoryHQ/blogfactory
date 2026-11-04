// Pillar and cluster view of the SEO plan, computed on read from plan keywords (nothing extra is stored).
import { clusterKeywords } from "./product-seo.js";
import { getSeoGrowthPlan } from "./seo-growth-plan.js";

export interface MapItem {
  id: string;
  keyword: string;
  stage: string;
  plannedFor: string | null;
  postId: string | null;
}
export interface MapCluster { label: string; pillar: MapItem; spokes: MapItem[] }

export function buildTopicalMap(items: MapItem[]): { clusters: MapCluster[]; total: number } {
  const byKeyword = new Map<string, MapItem>();
  for (const item of items) {
    const key = item.keyword.trim().toLowerCase();
    if (key && !byKeyword.has(key)) byKeyword.set(key, { ...item, keyword: key });
  }
  const clusters = clusterKeywords([...byKeyword.keys()]).map((cluster) => {
    // The shortest keyword is the head term, so it becomes the pillar; ties go to the earliest planned date.
    const members = cluster.members.map((keyword) => byKeyword.get(keyword)!);
    const pillar = [...members].sort((a, b) => a.keyword.length - b.keyword.length || (a.plannedFor || "9").localeCompare(b.plannedFor || "9"))[0];
    return { label: pillar.keyword, pillar, spokes: members.filter((item) => item !== pillar) };
  }).sort((a, b) => b.spokes.length - a.spokes.length || a.label.localeCompare(b.label));
  return { clusters, total: byKeyword.size };
}

export async function getTopicalMap(userId: string, siteId: string) {
  const plan = await getSeoGrowthPlan(userId, siteId);
  if (!plan) return null;
  const items = plan.items.filter((item) => item.actionType === "new_content" && item.keyword).map((item) => ({
    id: item.id, keyword: item.keyword as string, stage: item.stage, plannedFor: item.plannedFor, postId: item.postId,
  }));
  return buildTopicalMap(items);
}
