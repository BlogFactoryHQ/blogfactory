// End-to-end check of the product-led SEO surfaces against a disposable PostgreSQL database.
// Real: database, HTTP routes, MCP tool handlers, Google autocomplete, public sites (example.com, plausible.io sitemap).
// Stubbed at the fetch boundary: Brave Search, DataForSEO, OpenRouter and OpenAI embeddings, so request shape and parsing are
// verified without provider accounts. Run: DATABASE_URL=<disposable> POSTGRES_INTEGRATION_ALLOW_WRITES=1 bun run test:postgres:product-seo
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
if (process.env.POSTGRES_INTEGRATION_ALLOW_WRITES !== "1") {
  throw new Error("POSTGRES_INTEGRATION_ALLOW_WRITES=1 is required; use a disposable database because this test runs migrations and writes fixtures");
}
process.env.API_KEY_ENCRYPTION_SECRET ||= "integration-test-encryption-secret-0123456789";
process.env.JWT_SECRET ||= "integration-test-jwt-secret-0123456789";
delete process.env.BRAVE_SEARCH_API_KEY;
delete process.env.DATAFORSEO_LOGIN;
delete process.env.DATAFORSEO_PASSWORD;

const serverRoot = fileURLToPath(new URL("..", import.meta.url));
const migrate = Bun.spawn([process.execPath, "run", "src/db/migrate.ts"], { cwd: serverRoot, env: process.env, stdout: "ignore", stderr: "inherit" });
assert.equal(await migrate.exited, 0, "database migration failed");

// ── fetch boundary stubs ──
type Stub = { match: (url: string) => boolean; respond: (url: string, init?: RequestInit) => Response | Promise<Response> };
const realFetch = globalThis.fetch;
const calls: Array<{ url: string; init?: RequestInit }> = [];
let stubs: Stub[] = [];
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
  const stub = stubs.find((item) => item.match(url));
  if (stub) { calls.push({ url, init }); return stub.respond(url, init); }
  return realFetch(input as never, init);
}) as typeof fetch;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const callsTo = (host: string) => calls.filter((call) => new URL(call.url).hostname === host);

const sql = postgres(databaseUrl, { max: 4 });
const userA = randomUUID();
const userB = randomUUID();
const siteA = randomUUID();
const siteB = randomUUID();
const siteLocal = randomUUID();
let currentUser = userA;
let step = 0;
const section = (name: string) => console.log(`  ${String(++step).padStart(2, "0")} ${name}`);

try {
  await sql`INSERT INTO users (id, email, password_hash, approval_status) VALUES (${userA}, ${`a-${userA}@example.com`}, 'test', 'approved')`;
  await sql`INSERT INTO users (id, email, password_hash, approval_status) VALUES (${userB}, ${`b-${userB}@example.com`}, 'test', 'approved')`;
  await sql`INSERT INTO sites (id, user_id, name, domain, language) VALUES (${siteA}, ${userA}, 'Kellik', 'example.com', 'en')`;
  await sql`INSERT INTO sites (id, user_id, name, domain, language) VALUES (${siteB}, ${userB}, 'Other', 'other-site.example', 'en')`;
  await sql`INSERT INTO sites (id, user_id, name, domain) VALUES (${siteLocal}, ${userA}, 'Local', 'localhost')`;

  const { productSeoRoutes } = await import("./routes/product-seo.js");
  const app = new Hono<{ Variables: { userId: string } }>();
  app.use("*", async (c, next) => { c.set("userId", currentUser); await next(); });
  app.route("/api/product-seo", productSeoRoutes);
  const call = async (method: string, path: string, body?: unknown, as = userA) => {
    currentUser = as;
    const response = await app.request(`/api/product-seo${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json().catch(() => null) as any };
  };

  // 1. product profile: live crawl of example.com, heuristic profile (no AI key), knowledge document
  section("profile generation, knowledge document, tenant isolation");
  let r = await call("POST", "/profile/generate", { siteId: siteA });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.profile.source, "heuristic");
  assert.ok(r.body.profile.pagesRead.length >= 1);
  assert.equal(r.body.knowledge.saved, true);
  assert.equal(r.body.knowledge.enabled, false, "the knowledge base is not switched on silently");
  r = await call("GET", `/profile?siteId=${siteA}`);
  assert.equal(r.body.knowledge.saved, true);
  assert.equal((await call("GET", `/profile?siteId=${siteA}`, undefined, userB)).status, 404, "another user cannot read the profile");
  assert.equal((await call("POST", "/profile/generate", { siteId: siteA }, userB)).status, 404);
  r = await call("POST", "/knowledge/enable", { siteId: siteA });
  assert.deepEqual(r.body, { saved: true, enabled: true });
  const [settings] = await sql`SELECT knowledge_base_enabled, knowledge_documents FROM user_settings WHERE site_id = ${siteA}`;
  assert.equal(settings.knowledge_base_enabled, true);
  assert.equal(settings.knowledge_documents.filter((doc: any) => doc.source === "product_profile").length, 1);
  await call("POST", "/profile/generate", { siteId: siteA });
  const [again] = await sql`SELECT knowledge_documents FROM user_settings WHERE site_id = ${siteA}`;
  assert.equal(again.knowledge_documents.filter((doc: any) => doc.source === "product_profile").length, 1, "re-analysis replaces the product document");

  // 2. edit profile, apply CTA
  section("profile edit and CTA");
  r = await call("PUT", "/profile", { siteId: siteA, profile: {
    summary: "Hair growth tracker app", audience: ["people with hair loss"], problems: ["slow progress is hard to see"], features: ["weekly progress photos"],
    competitors: ["Hairmetric", "Trackr"], seedTopics: ["hair growth tracker", "hair loss progress"], cta: { label: "Try Kellik", description: "Track your hair growth in minutes." },
  } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.profile.cta.label, "Try Kellik");
  assert.equal((await call("PUT", "/profile", { siteId: siteA, profile: { summary: "", seedTopics: [] } })).status, 400);
  r = await call("POST", "/cta/apply", { siteId: siteA });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.cta.url, "https://example.com");
  const [ctas] = await sql`SELECT brand_ctas FROM user_settings WHERE site_id = ${siteA}`;
  assert.equal(ctas.brand_ctas[0].label, "Try Kellik");
  assert.equal((await call("POST", "/cta/apply", { siteId: siteA }, userB)).status, 404);

  // 3. topic discovery: live Google autocomplete
  section("topic discovery (live autocomplete)");
  r = await call("POST", "/topics/discover", { siteId: siteA });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.topics.length >= 10, `only ${r.body.topics.length} topics`);
  assert.ok(r.body.queriesRun >= 20);
  const topicByKey = new Map<string, any>(r.body.topics.map((topic: any) => [topic.keyword, topic]));
  assert.equal(topicByKey.get("hairmetric alternatives")?.template, true, "rival template topics are included");
  assert.equal(topicByKey.get("kellik vs hairmetric")?.template, true);
  assert.ok(r.body.topics.some((topic: any) => topic.question), "question topics are found");
  const scores = r.body.topics.map((topic: any) => topic.score);
  assert.deepEqual(scores, [...scores].sort((a: number, b: number) => b - a), "sorted by score");
  assert.ok(r.body.topics.every((topic: any) => topic.volume === undefined), "no volume without a provider");

  // 4. cannibalization against an existing post
  section("title cannibalization");
  const existingPost = randomUUID();
  await sql`INSERT INTO posts (id, user_id, site_id, title, content, source_type, model_id) VALUES (${existingPost}, ${userA}, ${siteA}, 'Best Hair Growth Tracker', ${"# Best Hair Growth Tracker\n\nbody"}, 'article_keyword', 'test')`;
  r = await call("POST", "/topics/discover", { siteId: siteA });
  const flagged = r.body.topics.filter((topic: any) => topic.overlap);
  assert.ok(flagged.length >= 1, `a topic matching the existing post is flagged; got ${r.body.topics.length} topics: ${r.body.topics.slice(0, 15).map((topic: any) => topic.keyword).join(" | ")}`);
  assert.ok(flagged.every((topic: any) => topic.overlap.method === "title"));
  assert.ok(flagged.some((topic: any) => topic.keyword === "best hair growth tracker" && topic.overlap.similarity === 1));
  assert.ok(r.body.topics.some((topic: any) => topic.keyword === "hair growth tracker shirt" && !topic.overlap), "a looser variant is not over-flagged");

  // 5. keyword research without a SERP provider
  section("keyword research without Brave key");
  r = await call("POST", "/keyword-research", { siteId: siteA, keyword: "hair growth tracker" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.questions.length >= 5);
  assert.equal(r.body.serp, null);
  assert.equal(r.body.serpConfigured, false);
  assert.ok(r.body.notes.some((note: string) => note.includes("BRAVE_SEARCH_API_KEY")));
  assert.equal(r.body.planBrief.source, "questions");
  assert.ok(r.body.planBrief.outline.some((entry: any) => entry.text === "FAQ"));
  assert.equal((await call("POST", "/keyword-research", { siteId: siteA, keyword: "ab" })).status, 400);

  // 6. SERP brief and term list through a stubbed Brave API plus stubbed result pages
  section("SERP brief through the Brave request shape");
  process.env.BRAVE_SEARCH_API_KEY = "brave-test-key";
  // Real, resolvable hostnames: the SSRF guard resolves DNS before fetch, and only fetch itself is stubbed.
  const page = (headings: string[], extra: string) => `<html><body><h1>T</h1>${headings.map((heading) => `<h2>${heading}</h2><p>${"minoxidil dermatologist progress photos routine ".repeat(30)}${extra}</p>`).join("")}</body></html>`;
  const serpPages: Record<string, string> = {
    "https://example.com/serp-a": page(["What is a hair tracker", "Best hair trackers"], "alpha"),
    "https://example.org/serp-b": page(["What is a hair tracker?", "Best hair trackers 2026"], "beta"),
    "https://www.iana.org/serp-c": page(["What is a hair tracker", "Pricing"], "gamma"),
  };
  stubs = [
    { match: (url) => url.startsWith("https://api.search.brave.com/"), respond: () => json({ web: { results: Object.keys(serpPages).map((url, index) => ({ title: `Result ${index + 1}`, url, description: "d" })) } }) },
    { match: (url) => url in serpPages, respond: (url) => new Response(serpPages[url], { headers: { "content-type": "text/html" } }) },
  ];
  calls.length = 0;
  r = await call("POST", "/keyword-research", { siteId: siteA, keyword: "hair growth tracker" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const braveCall = callsTo("api.search.brave.com")[0];
  assert.ok(braveCall, "Brave was called");
  const braveUrl = new URL(braveCall.url);
  assert.equal(braveUrl.searchParams.get("q"), "hair growth tracker");
  assert.equal(braveUrl.searchParams.get("count"), "10");
  assert.equal(braveUrl.searchParams.get("country"), "US");
  assert.equal((braveCall.init?.headers as Record<string, string>)["X-Subscription-Token"], "brave-test-key");
  assert.equal(r.body.serp.outlines.length, 3);
  assert.ok(r.body.serp.brief.sharedHeadings.length >= 1);
  assert.equal(r.body.planBrief.source, "serp");
  assert.ok(r.body.serp.brief.terms.some((term: any) => term.term === "minoxidil"), "terms shared by the pages are extracted");
  const braveBefore = callsTo("api.search.brave.com").length;
  await call("POST", "/keyword-research", { siteId: siteA, keyword: "hair growth tracker" });
  assert.equal(callsTo("api.search.brave.com").length, braveBefore, "the second run is served from cache");

  // 7. plan: briefs, fill month, topical map
  section("plan items with brief, fill my month, topical map");
  const briefs = { "hair growth tracker": r.body.planBrief };
  r = await call("POST", "/topics/plan", { siteId: siteA, keywords: ["hair growth tracker", "hair loss progress photos"], briefs });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.items.length, 2);
  const briefItem = r.body.items.find((item: any) => item.keyword === "hair growth tracker");
  assert.ok(briefItem.evidence.brief.outline.length >= 2);
  r = await call("GET", `/plan-items/${briefItem.id}/brief?siteId=${siteA}`);
  assert.equal(r.status, 200);
  assert.ok(r.body.outlineText.startsWith("H2: "));
  assert.equal((await call("GET", `/plan-items/${briefItem.id}/brief?siteId=${siteA}`, undefined, userB)).status, 404, "brief is tenant scoped");
  assert.equal((await call("POST", "/topics/plan", { siteId: siteA, keywords: [] })).status, 400);
  r = await call("POST", "/topics/fill-plan", { siteId: siteA });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.ok(r.body.picked.length >= 1 && r.body.picked.length <= 12);
  assert.ok(r.body.picked.every((topic: any) => !topic.overlap), "covered topics are not scheduled");
  const perCluster = new Map<string, number>();
  for (const topic of r.body.picked) perCluster.set(topic.cluster, (perCluster.get(topic.cluster) || 0) + 1);
  assert.ok([...perCluster.values()].every((count) => count <= 3), "at most three topics per cluster");
  assert.ok(r.body.picked.length >= Math.min(8, r.body.picked.length), "spokes fill the month when clusters are few");
  const dates = await sql`SELECT planned_for FROM campaign_items WHERE user_id = ${userA} AND planned_for IS NOT NULL`;
  assert.equal(new Set(dates.map((row) => row.planned_for)).size, dates.length, "one topic per day");
  r = await call("GET", `/topical-map?siteId=${siteA}`);
  assert.equal(r.status, 200);
  assert.ok(r.body.total >= 3);
  assert.ok(r.body.clusters.every((cluster: any) => cluster.pillar.keyword.length <= Math.min(...cluster.spokes.map((spoke: any) => spoke.keyword.length), 999)), "pillar is the shortest term");
  assert.equal((await call("GET", `/topical-map?siteId=${siteA}`, undefined, userB)).status, 404);

  // 8. post tools
  section("post analysis, JSON-LD, repurpose, term coverage");
  const postId = randomUUID();
  const faq = "## FAQ\n\n### Does it work?\n\nYes, it works because weekly progress photos make slow changes visible over time.\n\n### Is it free?\n\nThe basic plan is free and includes weekly photos for everyone.\n";
  const content = `# Hair Growth Tracker Guide\n\nA hair growth tracker helps you see slow progress. ${"It keeps photos and notes together so changes are easy to compare. ".repeat(12)}\n\n## Why tracking works\n\nTracking turns a feeling into evidence you can compare week by week with your dermatologist and minoxidil routine.\n\n## How to start\n\nTake a photo in the same light each week.\n\n${faq}`;
  await sql`INSERT INTO posts (id, user_id, site_id, title, content, source_type, model_id, campaign_item_id) VALUES (${postId}, ${userA}, ${siteA}, 'Hair Growth Tracker Guide', ${content}, 'article_keyword', 'test', ${briefItem.id})`;
  r = await call("GET", `/posts/${postId}/analysis`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.usedKeyword, "hair growth tracker", "keyword comes from the plan item");
  assert.equal(r.body.keyword.inTitle, true);
  assert.ok(r.body.seoQa.total > 0 && Array.isArray(r.body.seoQa.checks));
  assert.ok(r.body.duplicates.every((item: any) => item.id !== postId), "a post is never its own duplicate");
  assert.equal((await call("GET", `/posts/${postId}/analysis`, undefined, userB)).status, 404);
  r = await call("GET", `/posts/${postId}/json-ld`);
  assert.equal(r.body.article["@type"], "BlogPosting");
  assert.equal(r.body.faq.mainEntity.length, 2);
  r = await call("GET", `/posts/${postId}/repurpose`);
  assert.ok(r.body.xThread.every((tweet: string) => tweet.length <= 280));
  assert.ok(r.body.newsletter.body.includes("{{article_url}}"), "unpublished posts get a placeholder link");
  r = await call("GET", `/posts/${postId}/term-coverage`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.available, true, JSON.stringify(r.body));
  assert.ok(r.body.coverage > 0 && r.body.total > 0);
  assert.ok(r.body.covered.includes("minoxidil"));
  delete process.env.BRAVE_SEARCH_API_KEY;
  r = await call("GET", `/posts/${postId}/term-coverage`);
  assert.equal(r.body.available, false);
  assert.ok(r.body.reason.includes("BRAVE_SEARCH_API_KEY"));

  // 9. template datasets
  section("template datasets");
  r = await call("POST", "/programmatic/datasets", { siteId: siteA });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.deepEqual(r.body.datasets.map((dataset: any) => dataset.templateId).sort(), ["builtin-alternatives", "builtin-product-comparison", "builtin-use-case"]);
  const firstIds = r.body.datasets.map((dataset: any) => dataset.id).sort();
  r = await call("POST", "/programmatic/datasets", { siteId: siteA });
  assert.deepEqual(r.body.datasets.map((dataset: any) => dataset.id).sort(), firstIds, "re-running updates instead of duplicating");
  const [datasetCount] = await sql`SELECT count(*)::int AS n FROM programmatic_datasets WHERE user_id = ${userA}`;
  assert.equal(datasetCount.n, 3);
  assert.equal((await call("POST", "/programmatic/datasets", { siteId: siteB }, userB)).status, 400, "a site without a profile is refused");

  // 10. weekly topic refresh
  section("topic suggestions and weekly drain");
  r = await call("POST", "/topics/check", { siteId: siteA });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.topics.length >= 1 && r.body.newCount === r.body.topics.length);
  r = await call("GET", `/profile?siteId=${siteA}`);
  assert.equal(r.body.suggestions.topics.length > 0, true);
  const { drainTopicRefresh } = await import("./services/topic-refresh.js");
  assert.equal((await drainTopicRefresh(5)).filter((item) => item.siteId === siteA).length, 0, "a freshly checked site is not due");
  await sql`UPDATE sites SET topic_suggestions_checked_at = now() - interval '8 days' WHERE id = ${siteA}`;
  const drained = await drainTopicRefresh(5);
  assert.deepEqual(drained.filter((item) => item.siteId === siteA).map((item) => item.status), ["refreshed"]);
  const [checked] = await sql`SELECT topic_suggestions_checked_at > now() - interval '1 minute' AS fresh FROM sites WHERE id = ${siteA}`;
  assert.equal(checked.fresh, true);

  // 11. rank tracking through the Brave request shape
  section("rank tracking");
  // The weekly drain is global; keep other sites' leftovers (a reused database) out of the counts below.
  await sql`UPDATE rank_keywords SET last_checked_at = now() WHERE site_id <> ${siteA}`;
  r = await call("POST", "/rankings/track", { siteId: siteA, keywords: [" Hair Growth Tracker ", "hair growth tracker", "x", "second keyword"] });
  assert.equal(r.status, 201);
  assert.equal(r.body.added, 2);
  r = await call("POST", "/rankings/track", { siteId: siteA, fromPlan: true });
  assert.ok(r.body.added >= 1, "plan keywords can be tracked in one click");
  assert.equal((await call("POST", "/rankings/track", { siteId: siteA, keywords: ["nope nope"] }, userB)).status, 404);
  r = await call("POST", "/rankings/check", { siteId: siteA });
  assert.equal(r.status, 400, "checks need a provider");
  assert.ok(r.body.error.includes("BRAVE_SEARCH_API_KEY"));
  process.env.BRAVE_SEARCH_API_KEY = "brave-test-key";
  let rankResults = [
    { title: "a", url: "https://other.example/x", description: "" }, { title: "b", url: "https://rival.example/y", description: "" },
    { title: "c", url: "https://www.example.com/blog/page", description: "" },
  ];
  stubs = [{ match: (url) => url.startsWith("https://api.search.brave.com/"), respond: () => json({ web: { results: rankResults } }) }];
  calls.length = 0;
  r = await call("POST", "/rankings/check", { siteId: siteA });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.checked, callsTo("api.search.brave.com").length);
  assert.equal(new URL(callsTo("api.search.brave.com")[0].url).searchParams.get("count"), "20");
  r = await call("GET", `/rankings?siteId=${siteA}`);
  const tracked = r.body.rankings.length;
  assert.ok(tracked >= 3);
  assert.ok(callsTo("api.search.brave.com").length <= 10, "a manual check is capped at ten keywords");
  // Never-checked keywords go first, so a second click reaches the rest instead of re-checking the same ten.
  if (tracked > 10) await call("POST", "/rankings/check", { siteId: siteA });
  r = await call("GET", `/rankings?siteId=${siteA}`);
  assert.ok(r.body.rankings.every((row: any) => row.lastCheckedAt !== null), "every tracked keyword has been checked after two clicks");
  assert.ok(r.body.rankings.every((row: any) => row.position === 3 && row.url.includes("/blog/page") && row.history.length === 1));
  await call("POST", "/rankings/check", { siteId: siteA });
  r = await call("GET", `/rankings?siteId=${siteA}`);
  assert.ok(r.body.rankings.every((row: any) => row.history.length === 1), "a second check the same day replaces the point");
  await sql`UPDATE rank_keywords SET history = jsonb_build_array(jsonb_build_object('date', to_char(now() - interval '2 days', 'YYYY-MM-DD'), 'position', 3)), last_checked_at = now() - interval '8 days' WHERE site_id = ${siteA}`;
  rankResults = rankResults.slice(0, 2);
  const { drainRankChecks } = await import("./services/rank-tracking.js");
  const rankDrain = await drainRankChecks(25);
  assert.ok(rankDrain.checked >= 3, "the weekly pass checks due keywords");
  r = await call("GET", `/rankings?siteId=${siteA}`);
  assert.ok(r.body.rankings.every((row: any) => row.position === null && row.change === -18 && row.history.length === 2), "falling out of the top 20 shows as a drop");
  assert.equal((await drainRankChecks(25)).checked, 0, "recently checked keywords are not due");
  r = await call("POST", "/rankings/untrack", { siteId: siteA, keyword: "Second Keyword" });
  assert.equal(r.body.removed, true);
  delete process.env.BRAVE_SEARCH_API_KEY;
  assert.equal((await drainRankChecks(25)).skipped, "no_provider");

  // 12. DataForSEO volume through the documented request shape
  section("keyword volume through the DataForSEO request shape");
  process.env.DATAFORSEO_LOGIN = "login@example.com";
  process.env.DATAFORSEO_PASSWORD = "secret";
  stubs = [{
    match: (url) => url.startsWith("https://api.dataforseo.com/"),
    respond: (_url, init) => {
      const keywords: string[] = JSON.parse(String(init?.body))[0].keywords;
      return json({ status_code: 20000, tasks: [{ status_code: 20000, result: keywords.map((keyword, index) => ({ keyword, search_volume: index % 5 === 4 ? null : 100000 - index * 1500, competition: "LOW", cpc: 0.4 })) }] });
    },
  }];
  calls.length = 0;
  r = await call("POST", "/topics/discover", { siteId: siteA });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const dfsCalls = callsTo("api.dataforseo.com");
  assert.equal(dfsCalls.length, 1, "one volume request per discovery run");
  const dfsInit = dfsCalls[0].init!;
  assert.equal(new URL(dfsCalls[0].url).pathname, "/v3/keywords_data/google_ads/search_volume/live");
  assert.equal((dfsInit.headers as Record<string, string>).Authorization, `Basic ${Buffer.from("login@example.com:secret").toString("base64")}`);
  const dfsBody = JSON.parse(String(dfsInit.body));
  assert.equal(dfsBody.length, 1, "one task per live call");
  assert.equal(dfsBody[0].language_code, "en");
  assert.equal(dfsBody[0].location_code, 2840);
  assert.ok(dfsBody[0].keywords.length <= 60 && dfsBody[0].keywords.every((keyword: string) => keyword === keyword.toLowerCase()));
  assert.ok(r.body.topics.some((topic: any) => typeof topic.volume === "number"), "topics carry volume");
  assert.ok(r.body.topics.some((topic: any) => topic.volume === null), "keywords without data are kept");
  const withVolume = r.body.topics.filter((topic: any) => typeof topic.volume === "number" && !topic.overlap);
  assert.ok(withVolume[0].volume >= withVolume[withVolume.length - 1].volume || withVolume[0].score >= withVolume[withVolume.length - 1].score);
  r = await call("POST", "/keyword-research", { siteId: siteA, keyword: "hair growth tracker" });
  assert.equal(typeof r.body.metrics.volume, "number");
  stubs = [{ match: (url) => url.startsWith("https://api.dataforseo.com/"), respond: () => json({ status_code: 50000 }, 500) }];
  r = await call("POST", "/topics/discover", { siteId: siteA });
  assert.equal(r.status, 200, "a failing volume provider does not break discovery");
  delete process.env.DATAFORSEO_LOGIN;
  delete process.env.DATAFORSEO_PASSWORD;

  // 13. embedding cannibalization through a stubbed OpenAI embeddings call
  section("embedding cannibalization");
  await sql`UPDATE sites SET internal_link_index = ${sql.json({ sitemapUrl: "x", siteHost: "example.com", pageCount: 1, vectorCount: 1, createdAt: new Date().toISOString(), pages: [{ url: "https://example.com/guide", title: "Hair loss tracking handbook", path: "/guide", embedding: [1, 0, 0] }] })} WHERE id = ${siteA}`;
  const { setApiKey } = await import("./services/api-keys.js");
  await setApiKey(userA, "openai", "sk-integration-test-key");
  stubs = [{
    match: (url) => url === "https://api.openai.com/v1/embeddings",
    respond: (_url, init) => json({ data: (JSON.parse(String(init?.body)).input as string[]).map((_text, index) => ({ index, embedding: [1, 0, 0] })) }),
  }];
  calls.length = 0;
  r = await call("POST", "/topics/discover", { siteId: siteA });
  assert.equal(callsTo("api.openai.com").length, 1, "topics are embedded in one batch");
  assert.equal((callsTo("api.openai.com")[0].init!.headers as Record<string, string>).Authorization, "Bearer sk-integration-test-key");
  const embedded = r.body.topics.filter((topic: any) => topic.overlap?.method === "embedding");
  assert.ok(embedded.length >= 5, "vector-similar topics are flagged");
  assert.ok(embedded.every((topic: any) => topic.overlap.title === "Hair loss tracking handbook" && topic.overlap.similarity === 1));
  stubs = [{ match: (url) => url === "https://api.openai.com/v1/embeddings", respond: () => json({ error: "no" }, 500) }];
  r = await call("POST", "/topics/discover", { siteId: siteA });
  assert.equal(r.status, 200, "an embeddings failure falls back to the title check");
  assert.ok(r.body.topics.every((topic: any) => topic.overlap?.method !== "embedding"));

  // 14. AI search visibility through a stubbed OpenRouter call
  section("AI search visibility");
  r = await call("POST", "/ai-visibility/check", { siteId: siteA });
  assert.equal(r.status, 400, "needs an OpenRouter key");
  await setApiKey(userA, "openrouter", "sk-or-integration-test-key");
  stubs = [{
    match: (url) => url === "https://openrouter.ai/api/v1/chat/completions",
    respond: (_url, init) => {
      const prompt = JSON.parse(String(init?.body)).messages[0].content as string;
      const cited = prompt.includes("hair growth tracker");
      return json({ choices: [{ message: { content: cited ? "Kellik is a good pick, also Hairmetric." : "Try Trackr.", annotations: cited ? [{ type: "url_citation", url_citation: { url: "https://www.example.com/guide", title: "Guide" } }] : [] } }] });
    },
  }];
  calls.length = 0;
  r = await call("POST", "/ai-visibility/check", { siteId: siteA, prompts: ["What are the best hair growth tracker apps?", "Which scalp serum should I buy?"] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const orCalls = callsTo("openrouter.ai");
  assert.equal(orCalls.length, 2);
  const orBody = JSON.parse(String(orCalls[0].init!.body));
  assert.equal(orBody.model, "google/gemini-3.5-flash");
  assert.deepEqual(orBody.plugins, [{ id: "web" }]);
  assert.equal(new Headers(orCalls[0].init!.headers).get("authorization"), "Bearer sk-or-integration-test-key");
  assert.equal(r.body.results[0].mentioned, true);
  assert.equal(r.body.results[0].cited, true);
  assert.deepEqual(r.body.results[0].competitors, ["Hairmetric"]);
  assert.equal(r.body.results[1].mentioned, false);
  assert.deepEqual([r.body.mentionRate, r.body.citationRate], [50, 50]);
  r = await call("GET", `/ai-visibility?siteId=${siteA}`);
  assert.equal(r.body.visibility.results.length, 2, "the last run is stored");
  stubs = [{ match: (url) => url.startsWith("https://openrouter.ai/"), respond: () => json({ error: "bad" }, 500) }];
  r = await call("POST", "/ai-visibility/check", { siteId: siteA, prompts: ["What are the best hair growth tracker apps?"] });
  assert.equal(r.status, 200);
  assert.ok(r.body.results[0].error, "a provider failure is recorded per question");
  assert.equal(r.body.mentionRate, 0);
  stubs = [];

  // 15. technical audit (live example.com) and the SSRF guard
  section("technical audit, live and guarded");
  r = await call("POST", "/audit", { siteId: siteA });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.pagesChecked >= 1, "example.com was read");
  assert.ok(typeof r.body.score === "number" && r.body.score <= 100);
  assert.ok(r.body.pages.some((entry: any) => entry.issues.some((issue: any) => issue.rule === "meta_description_missing" || issue.rule === "canonical_missing")), "example.com has known gaps");
  const firstAudit = r.body.checkedAt;
  assert.equal((await call("POST", "/audit", { siteId: siteA })).body.checkedAt, firstAudit, "cached for 30 minutes");
  assert.notEqual((await call("POST", "/audit", { siteId: siteA, fresh: true })).body.checkedAt, firstAudit);
  r = await call("POST", "/audit", { siteId: siteLocal });
  assert.equal(r.status, 200);
  assert.equal(r.body.pagesChecked, 0, "localhost is never fetched");
  assert.ok(r.body.notes.some((note: string) => note.includes("No page could be read")));
  for (const domain of ["127.0.0.1", "169.254.169.254", "10.0.0.5", "[::1]"]) {
    await sql`UPDATE sites SET domain = ${domain} WHERE id = ${siteLocal}`;
    assert.equal((await call("POST", "/audit", { siteId: siteLocal, fresh: true })).body.pagesChecked, 0, `${domain} is blocked`);
  }
  assert.equal((await call("POST", "/audit", { siteId: siteA }, userB)).status, 404);

  // 16. competitor gap against a real public sitemap
  section("competitor gap (live sitemap)");
  r = await call("POST", "/competitor-gaps", { siteId: siteA, competitor: "plausible.io" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.sitemapUrls > 20, `only ${r.body.sitemapUrls} sitemap urls`);
  assert.ok(r.body.contentUrls >= 1, "blog-style URLs were found");
  assert.ok(r.body.gaps.length >= 1);
  assert.ok(r.body.gaps.every((gap: any) => gap.url.startsWith("https://plausible.io/")));
  for (const bad of ["example.com", "localhost", "http://169.254.169.254", "192.168.1.1", ""]) {
    r = await call("POST", "/competitor-gaps", { siteId: siteA, competitor: bad });
    assert.equal(r.status, 400, `${bad || "(empty)"} must be refused`);
  }

  // 17. MCP tool handlers on the same database
  section("MCP tool handlers");
  const { MCP_TOOL_REGISTRY, McpToolError } = await import("./mcp/tools.js");
  const principal = { tokenId: randomUUID(), clientName: "test", userId: userA, scopes: new Set(["content:read"]), siteIds: new Set([siteA]), displayName: null, role: "user", approvalStatus: "approved" } as never;
  const analyzed = await (MCP_TOOL_REGISTRY.analyze_post.handler as any)(principal, { post_id: postId });
  assert.equal(analyzed.site_id, siteA);
  assert.equal(analyzed.analysis.usedKeyword, "hair growth tracker");
  assert.equal(analyzed.structured_data.faq.mainEntity.length, 2);
  const restricted = { ...(principal as object), siteIds: new Set([siteB]) } as never;
  await assert.rejects((MCP_TOOL_REGISTRY.analyze_post.handler as any)(restricted, { post_id: postId }), (error: unknown) => error instanceof McpToolError && error.code === "not_found");
  await assert.rejects((MCP_TOOL_REGISTRY.discover_topics.handler as any)(restricted, { site_id: siteA }), (error: unknown) => error instanceof McpToolError && error.code === "forbidden");
  const discovered = await (MCP_TOOL_REGISTRY.discover_topics.handler as any)(principal, { site_id: siteA });
  assert.ok(discovered.topics.length > 0);
  const researched = await (MCP_TOOL_REGISTRY.research_keyword.handler as any)(principal, { site_id: siteA, keyword: "hair growth tracker" });
  assert.ok(researched.research.plan_brief.outline.length > 0);
  const gapped = await (MCP_TOOL_REGISTRY.find_content_gaps.handler as any)(principal, { site_id: siteA, competitor: "plausible.io" });
  assert.ok(gapped.gap.gaps.length > 0);
  await assert.rejects((MCP_TOOL_REGISTRY.find_content_gaps.handler as any)(principal, { site_id: siteA, competitor: "localhost" }), (error: unknown) => error instanceof McpToolError && error.code === "validation_error");

  // 18. operation ledger: web mutations are logged without bodies
  section("operation ledger");
  const events = await sql`SELECT action, status FROM operation_events WHERE user_id = ${userA} AND action IN ('product_profile.generate', 'topics.discover', 'site.audit', 'rankings.check', 'ai_visibility.check')`;
  const actions = new Set(events.map((event) => event.action));
  for (const action of ["product_profile.generate", "topics.discover", "site.audit", "rankings.check", "ai_visibility.check"]) assert.ok(actions.has(action), `${action} is logged`);
  const [leak] = await sql`SELECT count(*)::int AS n FROM operation_events WHERE user_id = ${userA} AND (metadata::text ILIKE '%sk-or-%' OR metadata::text ILIKE '%brave-test-key%' OR metadata::text ILIKE '%secret%')`;
  assert.equal(leak.n, 0, "no credentials in the ledger");

  console.log("Product-led SEO integration check passed");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  globalThis.fetch = realFetch;
  await sql`DELETE FROM users WHERE id IN (${userA}, ${userB})`.catch(() => undefined);
  await sql.end({ timeout: 2 });
  // The app's own connection pool keeps the event loop alive, so exit explicitly once the checks are done.
  process.exit(process.exitCode ?? 0);
}
