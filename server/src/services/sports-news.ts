export interface SportsMatrixRow {
  region?: string;
  sport?: string;
  beat?: string;
  reliability?: number;
  sourceName: string;
  sportTag?: string;
  sourceType?: string;
  category?: string;
  speed?: string;
  trust?: string;
  publishRule?: string;
  tags?: string;
  embedSource?: string;
  siteLink?: string;
  xLink?: string;
  otherLink?: string;
  status?: string;
  note?: string;
}

export interface SportsNewsDecision {
  allowed: boolean;
  label?: string;
  sourceName?: string;
  attribution?: string;
  tags?: string[];
  cmsKeywords?: string[];
  embedNotice?: string;
  requiresSecondSource?: boolean;
  reason?: string;
}

function clean(value: unknown, max = 500) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function normalized(value: unknown) {
  return clean(value, 1000)
    .toLocaleLowerCase("tr")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9ğüşöçıİĞÜŞÖÇ@._/-]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function host(value: string) {
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname
      .replace(/^www\./, "")
      .toLocaleLowerCase("tr");
  } catch {
    return "";
  }
}

function handleFromUrl(value: string) {
  try {
    const url = new URL(value);
    return url.pathname.split("/").filter(Boolean)[0] || "";
  } catch {
    return "";
  }
}

function tags(value: unknown) {
  return clean(value, 1000)
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function cmsTags(value: unknown) {
  return tags(value).map((tag) => tag.replace(/^#+/, "").trim()).filter(Boolean);
}

function sourceLinks(row: SportsMatrixRow) {
  return [row.siteLink, row.xLink, row.otherLink].map((value) => clean(value)).filter(Boolean);
}

function scoreRow(row: SportsMatrixRow, haystack: string, candidates: string[]) {
  let score = 0;
  const sourceName = normalized(row.sourceName);
  if (sourceName && haystack.includes(sourceName)) score += sourceName.length > 8 ? 8 : 5;

  const xHandle = handleFromUrl(clean(row.xLink));
  if (xHandle && haystack.includes(normalized(xHandle))) score += 8;

  for (const link of sourceLinks(row)) {
    const linkHost = host(link);
    if (!linkHost) continue;
    if (candidates.some((candidate) => host(candidate) === linkHost)) score += 7;
    else if (haystack.includes(normalized(linkHost))) score += 4;
  }

  return score;
}

export function normalizeSportsMatrixRows(value: unknown): SportsMatrixRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => item && typeof item === "object" ? item as Record<string, unknown> : null)
    .filter(Boolean)
    .map((item) => ({
      region: clean(item!.region),
      sport: clean(item!.sport),
      beat: clean(item!.beat),
      reliability: Number(item!.reliability) || undefined,
      sourceName: clean(item!.sourceName),
      sportTag: clean(item!.sportTag),
      sourceType: clean(item!.sourceType),
      category: clean(item!.category),
      speed: clean(item!.speed),
      trust: clean(item!.trust),
      publishRule: clean(item!.publishRule, 1200),
      tags: clean(item!.tags),
      embedSource: clean(item!.embedSource),
      siteLink: clean(item!.siteLink),
      xLink: clean(item!.xLink),
      otherLink: clean(item!.otherLink),
      status: clean(item!.status),
      note: clean(item!.note, 1200),
    }))
    .filter((row) => row.sourceName);
}

export function sportsMatrixRowsFromSettings(settings: Record<string, any> | null | undefined) {
  const rules = settings?.contentRules ?? settings?.content_rules ?? {};
  return normalizeSportsMatrixRows(rules?.news?.matrixRows ?? rules?.sportsNews?.matrixRows);
}

function labelFor(row: SportsMatrixRow) {
  const sourceType = normalized(row.sourceType);
  const rule = normalized(row.publishRule);
  const reliability = row.reliability || 0;

  if (sourceType.includes("resmi") || sourceType.includes("official") || rule.includes("resmi") || rule.includes("official")) return "[OFFICIAL]";
  if (/ajans|agency|kurum|media|publisher/.test(sourceType) || rule.includes("dogrulanmis") || rule.includes("verified")) return "[VERIFIED NEWS]";
  if (/insider|analyst|reporter/.test(sourceType) || reliability >= 4) return "[ATTRIBUTED]";
  return "[NEWS]";
}

function standardDecision(reason: string): SportsNewsDecision {
  return {
    allowed: true,
    label: "[NEWS]",
    attribution: "Source reports",
    tags: [],
    cmsKeywords: [],
    requiresSecondSource: false,
    reason,
  };
}

export function classifySportsNews(input: {
  title?: string;
  content?: string;
  url?: string;
  sourceValue?: string;
  platformConfig?: unknown;
  matrixRows: SportsMatrixRow[];
}): SportsNewsDecision {
  const rows = normalizeSportsMatrixRows(input.matrixRows);
  if (!rows.length) return standardDecision("No source rules imported; using standard news rules.");

  const candidates = [input.url, input.sourceValue]
    .concat(JSON.stringify(input.platformConfig || {}))
    .map((value) => clean(value, 2000))
    .filter(Boolean);
  const haystack = normalized([input.title, input.content, ...candidates].filter(Boolean).join(" "));

  const match = rows
    .map((row) => ({ row, score: scoreRow(row, haystack, candidates) }))
    .sort((a, b) => b.score - a.score)[0];

  if (!match || match.score <= 0) return standardDecision("No matching source rule; using standard news rules.");

  const row = match.row;
  const status = normalized(row.status);
  if (status.includes("pasif") || status.includes("passive") || status.includes("disabled")) {
    return { allowed: false, sourceName: row.sourceName, reason: `${row.sourceName} is passive in the matrix.` };
  }
  if (/veri|scout/i.test(normalized(row.sourceType)) || normalized(row.publishRule).startsWith("veri")) {
    return { allowed: false, sourceName: row.sourceName, reason: `${row.sourceName} is data/scout only.` };
  }

  const label = labelFor(row);
  const rule = normalized(row.publishRule);
  const requiresSecondSource = (row.reliability || 0) < 5 || rule.includes("2. kaynak") || rule.includes("ikinci kaynak") || rule.includes("teyit");
  return {
    allowed: true,
    label,
    sourceName: row.sourceName,
    attribution: `${row.sourceName} haberine göre`,
    tags: tags(row.tags),
    cmsKeywords: cmsTags(row.tags),
    embedNotice: row.embedSource ? `[SYSTEM_NOTICE: Yayında ${row.embedSource} resmî widget'ı gömülmelidir.]` : undefined,
    requiresSecondSource,
    reason: row.publishRule,
  };
}

export function buildSportsNewsInstructions(decision: SportsNewsDecision) {
  if (!decision.allowed) return "";
  return `\n\nNewsroom rules:
- Editorial label: ${decision.label}.
- Use source attribution when making claims: "${decision.attribution}". Do not present a single-source claim as independently confirmed.
- Never write "confirmed", "official", "kesin", or "resmî" unless the matched source is official and the label is [OFFICIAL].
- Use neutral news language. No clickbait, hype, or exaggerated certainty.
- Summarize and rewrite; do not copy the source article.
${decision.requiresSecondSource ? "- Mark big claims as needing a second source or official confirmation; keep the wording cautious." : ""}
${decision.embedNotice ? `- Include this exact line near the end: ${decision.embedNotice}` : ""}
${decision.tags?.length ? `- Use these source-rule tags where relevant: ${decision.tags.join(", ")}.` : ""}
${decision.cmsKeywords?.length ? `- Add a "## SEO Keywords" section with these comma-separated tags: ${decision.cmsKeywords.join(", ")}.` : ""}
- Return only the finished markdown article.`;
}
