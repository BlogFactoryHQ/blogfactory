// Embedding-based cannibalization: compare candidate topics with indexed page vectors when the user has an OpenAI key.
import { getOpenAiKey } from "./api-keys.js";
import { cosineSimilarity, embedTexts, type InternalLinkIndex } from "./internal-linking.js";
import type { TopicCandidate } from "./product-seo.js";

// Short keyword vs long page vectors score lower than page vs page, so this is deliberately below typical duplicate cutoffs.
export const EMBEDDING_OVERLAP_THRESHOLD = 0.6;
const PENALTY = 40;

interface VectorPage { title: string; embedding?: number[] }

export function applyEmbeddingOverlap(
  topics: TopicCandidate[],
  vectors: number[][],
  pages: VectorPage[],
  threshold = EMBEDDING_OVERLAP_THRESHOLD,
): TopicCandidate[] {
  const withVectors = pages.filter((page) => page.embedding?.length);
  if (!withVectors.length) return topics;
  return topics.map((topic, index) => {
    const vector = vectors[index];
    if (topic.overlap || !vector?.length) return topic;
    let best: { title: string; similarity: number } | null = null;
    for (const page of withVectors) {
      const similarity = cosineSimilarity(vector, page.embedding);
      if (similarity >= threshold && (!best || similarity > best.similarity)) best = { title: page.title, similarity };
    }
    if (!best) return topic;
    return {
      ...topic,
      score: Math.max(0, topic.score - PENALTY),
      overlap: { title: best.title, similarity: Math.round(best.similarity * 100) / 100, method: "embedding" as const },
    };
  }).sort((a, b) => b.score - a.score);
}

export async function embeddingOverlap(userId: string, topics: TopicCandidate[], index: InternalLinkIndex | null): Promise<TopicCandidate[]> {
  const pages = (index?.pages || []).filter((page) => page.embedding?.length);
  if (!topics.length || !pages.length) return topics;
  try {
    const key = await getOpenAiKey(userId);
    if (!key) return topics;
    const vectors = await embedTexts(topics.map((topic) => topic.keyword), key);
    return applyEmbeddingOverlap(topics, vectors, pages);
  } catch {
    return topics; // title similarity already ran; embeddings are an upgrade, not a dependency
  }
}
