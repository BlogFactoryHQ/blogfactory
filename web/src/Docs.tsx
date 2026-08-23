import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { ArrowRight, ExternalLink, FileText, Search } from "lucide-react";
import { FactoryMark, WorkspaceBackground } from "@/components/layout/BywordSurface";
import gettingStartedSource from "../../README.md?raw";
import selfHostingSource from "../../docs/self-hosting.md?raw";
import mcpSource from "../../docs/mcp.md?raw";
import architectureSource from "../../docs/architecture.md?raw";
import operationsSource from "../../docs/operations.md?raw";

const sourceUrl = "https://github.com/BlogFactoryHQ/blogfactory";
const docsBaseUrl = "https://blogfactory.io/docs";

const documents = [
  { slug: "getting-started", group: "Getting Started", title: "Get from installation to an approved draft", description: "Understand the self-hosted-first model and the evidence → agent → review → CMS draft loop.", source: "README.md", body: gettingStartedSource, prerequisites: "Docker Compose, a PostgreSQL database, S3-compatible storage, and your own AI credentials." },
  { slug: "self-hosting", group: "Run BlogFactory", title: "Install, secure, back up, and upgrade BlogFactory", description: "Use the canonical Docker Compose path, validate readiness, and keep both data stores recoverable.", source: "docs/self-hosting.md", body: selfHostingSource, prerequisites: "Docker Engine with Compose v2, 4 GB RAM for a small instance, and HTTPS for public access." },
  { slug: "mcp", group: "Connect MCP", title: "Connect a site-scoped MCP client", description: "Use browser OAuth or a personal connection token, then work inside the draft-only authority boundary.", source: "docs/mcp.md", body: mcpSource, prerequisites: "A BlogFactory account, at least one authorized site, and an MCP-compatible client." },
  { slug: "content-review", group: "Content Operations", title: "Create, review, and approve a draft", description: "Follow the revision-aware workflow, resolve preflight blockers, and keep human approval at the handoff point.", source: "docs/mcp.md", body: mcpSource, prerequisites: "A draft or generation job, plus a selected site and CMS destination." },
  { slug: "search-growth", group: "Search Growth", title: "Use Search Console evidence operationally", description: "Interpret complete totals and bounded opportunity data before choosing editorial work.", source: "docs/mcp.md", body: mcpSource, prerequisites: "A connected Search Console property with synchronized data." },
  { slug: "operations", group: "Resources", title: "Operate and verify a production deployment", description: "Keep environment configuration, migrations, builds, routing, and live acceptance checks distinct.", source: "docs/operations.md", body: operationsSource, prerequisites: "A prepared deployment environment; production secrets must remain outside this documentation." },
  { slug: "architecture", group: "Resources", title: "Understand the product boundaries", description: "See the web/MCP split, tenancy, background work, safety constraints, and source ownership.", source: "docs/architecture.md", body: architectureSource, prerequisites: "None. Read this before extending the product or its integrations." },
] as const;

type DocumentPage = typeof documents[number];

function sourceLink(source: string) { return `${sourceUrl}/blob/main/${source}`; }
function activeSlug() {
  const segment = window.location.pathname.replace(/^\/docs\/?/, "").split("/")[0];
  return documents.some((document) => document.slug === segment) ? segment : undefined;
}

function updateMetadata(page?: DocumentPage) {
  const title = page ? `${page.title} — BlogFactory Docs` : "BlogFactory Documentation";
  const description = page?.description || "Task-focused documentation for self-hosted BlogFactory operators and MCP users.";
  const canonical = page ? `${docsBaseUrl}/${page.slug}` : docsBaseUrl;
  document.title = title;
  document.querySelector('meta[name="description"]')?.setAttribute("content", description);
  document.querySelector('link[rel="canonical"]')?.setAttribute("href", canonical);
  document.querySelector('meta[property="og:title"]')?.setAttribute("content", title);
  document.querySelector('meta[property="og:description"]')?.setAttribute("content", description);
  document.querySelector('meta[property="og:url"]')?.setAttribute("content", canonical);
}

function DocsHeader() {
  return <header className="sticky top-0 z-50 border-b border-byword-border bg-card/90 backdrop-blur-md"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-10"><a href="/" className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><FactoryMark /></a><nav className="flex items-center gap-4 sm:gap-5" aria-label="Public navigation"><a href="/" className="type-meta text-foreground hover:text-byword-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Product</a><a href="/docs" aria-current="page" className="type-meta font-semibold text-byword-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Docs</a><a href="/help" className="type-meta text-foreground hover:text-byword-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Help</a></nav></div></header>;
}

function DocsNavigation({ page }: { page?: DocumentPage }) {
  return <aside className="lg:sticky lg:top-24 lg:h-fit" aria-label="Documentation navigation"><a href="/docs" className="type-kicker text-byword-blue hover:underline">BlogFactory docs</a><nav className="mt-4 flex gap-2 overflow-x-auto pb-2 lg:block lg:space-y-5 lg:overflow-visible" aria-label="Documentation sections">{[...new Set(documents.map((document) => document.group))].map((group) => <div key={group} className="shrink-0"><p className="type-kicker hidden text-muted-foreground lg:block">{group}</p><div className="flex gap-1 lg:mt-2 lg:block lg:space-y-1">{documents.filter((document) => document.group === group).map((document) => <a key={document.slug} href={`/docs/${document.slug}`} aria-current={page?.slug === document.slug ? "page" : undefined} className={`type-meta block shrink-0 rounded-sm px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${page?.slug === document.slug ? "bg-byword-blue-soft font-semibold text-byword-blue" : "hover:bg-byword-blue-soft hover:text-byword-blue"}`}>{document.title}</a>)}</div></div>)}</nav><a href="/help" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-byword-blue hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Troubleshoot a problem <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></a></aside>;
}

function MarkdownGuide({ page }: { page: DocumentPage }) {
  const index = documents.findIndex((document) => document.slug === page.slug);
  const previous = documents[index - 1];
  const next = documents[index + 1];
  return <article className="min-w-0"><p className="type-kicker text-byword-blue">{page.group}</p><h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl">{page.title}</h1><p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">{page.description}</p><div className="mt-8 rounded-sm border border-byword-border bg-card p-5"><p className="type-kicker text-byword-blue">Before you begin</p><p className="type-body mt-2">{page.prerequisites}</p></div><div className="mt-10 max-w-3xl [&_h1]:mt-10 [&_h1]:text-3xl [&_h1]:font-semibold [&_h2]:mt-10 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:mt-7 [&_h3]:text-xl [&_h3]:font-semibold [&_a]:text-byword-blue [&_a]:underline [&_a]:underline-offset-4 [&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_pre]:my-5 [&_pre]:overflow-x-auto [&_pre]:rounded-sm [&_pre]:bg-secondary [&_pre]:p-4 [&_pre]:text-secondary-foreground [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_li]:my-2 [&_p]:mt-4 [&_p]:leading-7"><ReactMarkdown>{page.body}</ReactMarkdown></div><div className="mt-10 border-t border-byword-border pt-6"><a href={sourceLink(page.source)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-byword-blue hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">View canonical source on GitHub <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a><div className="mt-8 grid gap-3 sm:grid-cols-2">{previous ? <a href={`/docs/${previous.slug}`} className="rounded-sm border border-byword-border bg-card p-4 hover:border-byword-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="type-kicker text-muted-foreground">Previous</span><span className="mt-1 block font-semibold">{previous.title}</span></a> : <span />}{next && <a href={`/docs/${next.slug}`} className="rounded-sm border border-byword-border bg-card p-4 hover:border-byword-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="type-kicker text-muted-foreground">Next</span><span className="mt-1 block font-semibold">{next.title}</span></a>}</div></div></article>;
}

function DocsIndex() {
  const [query, setQuery] = useState("");
  const visibleDocuments = useMemo(() => documents.filter((document) => `${document.group} ${document.title} ${document.description}`.toLowerCase().includes(query.trim().toLowerCase())), [query]);
  return <article><p className="type-kicker text-byword-blue">Documentation</p><h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight sm:text-6xl">Run a reviewed content operation.</h1><p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">Practical, source-backed guides for self-hosted operators and the people who connect MCP clients to BlogFactory.</p><label className="relative mt-8 block max-w-2xl"><span className="sr-only">Search documentation</span><Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search installation, MCP, review, Search Console…" className="h-14 w-full rounded-sm border border-byword-border bg-card pl-12 pr-4 text-base outline-none focus:border-byword-blue focus:ring-2 focus:ring-byword-blue/20" /></label><div className="mt-10 space-y-10">{[...new Set(visibleDocuments.map((document) => document.group))].map((group) => <section key={group}><h2 className="type-kicker text-byword-blue">{group}</h2><div className="mt-4 grid gap-4 sm:grid-cols-2">{visibleDocuments.filter((document) => document.group === group).map((document) => <a key={document.slug} href={`/docs/${document.slug}`} className="group rounded-sm border border-byword-border bg-card p-5 hover:-translate-y-0.5 hover:border-byword-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><FileText className="h-5 w-5 text-primary" aria-hidden="true" /><h3 className="mt-5 text-lg font-semibold group-hover:text-byword-blue">{document.title}</h3><p className="type-body mt-2">{document.description}</p><span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-byword-blue">Read guide <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></span></a>)}</div></section>)}</div>{!visibleDocuments.length && <div className="mt-10 rounded-sm border border-byword-border bg-card p-6"><h2 className="text-lg font-semibold">No matching documentation.</h2><p className="type-body mt-2">Try “MCP”, “Docker”, “review”, or “Search Console”, or use Help for a symptom-based answer.</p><a href="/help" className="mt-4 inline-flex text-sm font-semibold text-byword-blue hover:underline">Open Help Center</a></div>}</article>;
}

export function Docs() {
  const slug = activeSlug();
  const page = documents.find((document) => document.slug === slug);
  useEffect(() => updateMetadata(page), [page]);
  return <WorkspaceBackground><a href="#main-content" className="fixed left-4 top-4 z-[60] -translate-y-24 rounded-sm bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground transition-transform focus:translate-y-0">Skip to content</a><DocsHeader /><main id="main-content" className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-10 lg:py-16"><div className="grid gap-10 lg:grid-cols-[15rem_minmax(0,1fr)]"><DocsNavigation page={page} />{page ? <MarkdownGuide page={page} /> : <DocsIndex />}</div></main><footer className="border-t border-byword-border bg-card px-4 py-6 sm:px-6 lg:px-10"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3"><FactoryMark /><nav className="flex items-center gap-4" aria-label="Footer navigation"><a href="/docs" className="type-meta hover:text-byword-blue">Docs</a><a href="/help" className="type-meta hover:text-byword-blue">Help</a><a href={sourceUrl} target="_blank" rel="noreferrer" className="type-meta hover:text-byword-blue">Source</a></nav></div></footer></WorkspaceBackground>;
}
