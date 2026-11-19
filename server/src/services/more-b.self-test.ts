import assert from "node:assert/strict";
import { fetchKeywordMetrics, parseVolumeResponse, rescoreWithVolume, volumeProviderConfigured } from "./keyword-volume.js";
import { appendHistory, findPosition, hostOf, normalizeTrackedKeywords, rankChange } from "./rank-tracking.js";
import { defaultVisibilityPrompts, evaluateAnswer, parseChatAnswer, summarizeVisibility } from "./ai-visibility.js";
import { auditPage, auditScore, duplicateIssues, pageFacts, pickAuditUrls } from "./site-audit.js";
import { readCronDrainConfig } from "../routes/cron.js";
import type { TopicCandidate } from "./product-seo.js";

// ── keyword volume (response shape from DataForSEO docs) ──
delete process.env.DATAFORSEO_LOGIN;
delete process.env.DATAFORSEO_PASSWORD;
assert.equal(volumeProviderConfigured(), false);
assert.equal((await fetchKeywordMetrics(["hair growth tracker"], "en")).size, 0, "no credentials means no request and no data");
process.env.DATAFORSEO_LOGIN = "x"; process.env.DATAFORSEO_PASSWORD = "y";
assert.equal(volumeProviderConfigured(), true);
delete process.env.DATAFORSEO_LOGIN; delete process.env.DATAFORSEO_PASSWORD;

const parsed = parseVolumeResponse({ tasks: [
  { status_code: 20000, result: [
    { keyword: "Hair Growth Tracker", search_volume: 1900, competition: "LOW", cpc: 0.42 },
    { keyword: "no data keyword", search_volume: null, competition: null, cpc: null },
    { search_volume: 5 },
  ] },
  { status_code: 40501, result: [{ keyword: "ignored", search_volume: 9 }] },
] });
assert.deepEqual(parsed.get("hair growth tracker"), { volume: 1900, competition: "LOW", cpc: 0.42 });
assert.equal(parsed.get("no data keyword")?.volume, null);
assert.equal(parsed.has("ignored"), false, "failed tasks are skipped");
assert.equal(parseVolumeResponse(null).size, 0);

const topic = (keyword: string, score: number, fit: number, overlap = false): TopicCandidate => ({
  keyword, cluster: keyword, score, intent: "informational", fit, sources: 1, question: false, template: false,
  overlap: overlap ? { title: "x", similarity: 0.8 } : null,
});
const rescored = rescoreWithVolume([topic("a b", 90, 0.5), topic("c d", 10, 0.5), topic("e f", 70, 0.5, true), topic("g h", 55, 0.5)], new Map([
  ["a b", { volume: 10, competition: null, cpc: null }],
  ["c d", { volume: 100000, competition: "HIGH", cpc: 1 }],
  ["e f", { volume: 100000, competition: null, cpc: null }],
  ["g h", { volume: null, competition: null, cpc: null }],
]));
const byKey = new Map(rescored.map((item) => [item.keyword, item]));
assert.ok(byKey.get("c d")!.score > byKey.get("a b")!.score, "real volume beats the autocomplete proxy");
assert.equal(byKey.get("c d")!.volume, 100000);
assert.equal(byKey.get("g h")!.score, 55, "keywords with no volume data keep their score");
assert.equal(byKey.get("e f")!.score, byKey.get("c d")!.score - 40, "overlap penalty survives rescoring");
assert.equal(rescored[0].keyword, "c d", "sorted after rescoring");

// ── rank tracking ──
assert.equal(hostOf("https://www.Kellik.app/blog"), "kellik.app");
assert.equal(hostOf("kellik.app"), "kellik.app");
assert.equal(hostOf("not a url ::"), "");
const results = [
  { title: "a", url: "https://other.com/x", description: "" },
  { title: "b", url: "https://blog.kellik.app/guide", description: "" },
  { title: "c", url: "https://notkellik.app/", description: "" },
];
assert.deepEqual(findPosition(results, "https://www.kellik.app"), { position: 2, url: "https://blog.kellik.app/guide" });
assert.equal(findPosition(results.slice(2), "kellik.app"), null, "lookalike domains do not count");
assert.equal(findPosition(results, ""), null);

const h1 = appendHistory([], { date: "2026-11-01", position: 12 });
const h2 = appendHistory(h1, { date: "2026-11-01", position: 9 });
assert.deepEqual(h2, [{ date: "2026-11-01", position: 9 }], "same-day check replaces");
const long = Array.from({ length: 15 }, (_, i) => ({ date: `2026-10-${String(i + 10)}`, position: i }));
assert.equal(appendHistory(long, { date: "2026-11-09", position: 1 }).length, 12, "history is capped");
assert.equal(rankChange([{ date: "a", position: 8 }]), null);
assert.equal(rankChange([{ date: "a", position: 12 }, { date: "b", position: 7 }]), 5, "positive means up");
assert.equal(rankChange([{ date: "a", position: 5 }, { date: "b", position: null }]), -16, "dropping out of the top 20 shows as a fall");
assert.deepEqual(normalizeTrackedKeywords([" Hair Growth ", "hair growth", "ab", 5, "x".repeat(100), "valid keyword"]), ["hair growth", "valid keyword"], "trims, lowercases, dedupes and drops too short or too long");

// ── AI visibility ──
assert.deepEqual(defaultVisibilityPrompts({ seedTopics: ["hair tracker", "hair photos", "regrowth"], competitors: ["Hairmetric"] }, "en"), [
  "What are the best hair tracker?", "What are the best hair photos?", "What are the best alternatives to Hairmetric?", "How do I choose regrowth?",
]);
assert.ok(defaultVisibilityPrompts({ seedTopics: ["saç takibi"], competitors: [] }, "tr")[0].startsWith("En iyi"));
assert.deepEqual(defaultVisibilityPrompts({ seedTopics: [], competitors: [] }, null), []);

const answer = parseChatAnswer({ choices: [{ message: { content: "Try Kellik or Hairmetric for tracking.", annotations: [
  { type: "url_citation", url_citation: { url: "https://www.kellik.app/guide", title: "Guide" } },
  { type: "url_citation", url_citation: { url: "https://www.kellik.app/guide", title: "Dup" } },
  { type: "other" },
] } }] });
assert.equal(answer.citations.length, 1, "citations dedupe");
const hit = evaluateAnswer("q", answer, "Kellik", "kellik.app", ["Hairmetric", "Trackr"]);
assert.equal(hit.cited, true);
assert.equal(hit.mentioned, true);
assert.deepEqual(hit.competitors, ["Hairmetric"]);
const miss = evaluateAnswer("q", { text: "Use Hairmetric.", citations: [{ url: "https://x.com", title: "" }] }, "Kellik", "kellik.app", ["Hairmetric"]);
assert.equal(miss.mentioned, false);
assert.equal(evaluateAnswer("q", { text: "see kellik.app", citations: [] }, "K", "kellik.app", []).mentioned, true, "domain in text counts as a mention, not a citation");
assert.equal(parseChatAnswer(null).text, "");
assert.deepEqual(summarizeVisibility([hit, miss, { ...miss, error: "fail" }]), { mentionRate: 50, citationRate: 50 }, "failed checks do not count");
assert.deepEqual(summarizeVisibility([]), { mentionRate: 0, citationRate: 0 });

// ── site audit ──
const good = `<!doctype html><html lang="en"><head><title>Kellik: track hair growth</title><meta name="description" content="${"Track hair growth with weekly photos and notes so you can see slow progress clearly. ".repeat(1)}"><meta name="viewport" content="width=device-width"><meta property="og:title" content="K"><link rel="canonical" href="https://kellik.app/"><script type="application/ld+json">{}</script></head><body><h1>Kellik</h1><p>${"word ".repeat(350)}</p><img src="a.png" alt="photo"></body></html>`;
const goodIssues = auditPage(pageFacts(good));
assert.deepEqual(goodIssues, [], "a healthy page raises nothing");
const bad = auditPage(pageFacts("<html><head><meta name='robots' content='noindex,follow'></head><body><h1>A</h1><h1>B</h1><img src='x.png'><p>short</p></body></html>"));
const rules = bad.map((issue) => issue.rule);
for (const rule of ["title_missing", "meta_description_missing", "h1_multiple", "noindex", "canonical_missing", "image_alt", "viewport_missing", "lang_missing", "og_missing", "thin_content", "structured_data_missing"]) assert.ok(rules.includes(rule), rule);
assert.equal(bad.find((issue) => issue.rule === "noindex")?.severity, "error");
assert.equal(pageFacts(`<title>x</title><meta content="Hello there" name="description">`).description, "Hello there", "attribute order does not matter");

const dups = duplicateIssues([
  { url: "/a", title: "Same", description: "d1" }, { url: "/b", title: "same", description: "d2" }, { url: "/c", title: "Other", description: null },
]);
assert.equal(dups.length, 1);
assert.deepEqual(dups[0].urls, ["/a", "/b"]);
assert.equal(auditScore([{ url: "a", issues: [] }], []), 100);
assert.equal(auditScore([{ url: "a", issues: [{ rule: "r", severity: "error", detail: "" }] }], [{ rule: "s", severity: "warn", detail: "" }]), 70);
assert.equal(auditScore([], []), 100);
assert.ok(auditScore([{ url: "a", issues: Array(10).fill({ rule: "r", severity: "error", detail: "" }) }], []) >= 0);

const picked = pickAuditUrls("https://kellik.app", ["https://kellik.app/", "https://kellik.app/blog/a", "https://kellik.app/blog/a#x", "https://kellik.app/file.pdf", "https://evil.com/p", "bad url", "https://www.kellik.app/blog/b"], 10);
assert.deepEqual(picked, ["https://kellik.app/", "https://kellik.app/blog/a", "https://www.kellik.app/blog/b"]);
assert.equal(pickAuditUrls("https://kellik.app", Array.from({ length: 50 }, (_, i) => `https://kellik.app/p${i}`), 5).length, 5);

assert.equal(readCronDrainConfig(() => undefined, {}).rank.limit, 10);
assert.equal(readCronDrainConfig((name) => ({ rankLimit: "99" }[name]), {}).rank.limit, 25);

console.log("more-b self-test passed");
