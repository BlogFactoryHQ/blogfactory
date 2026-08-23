import { useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Cable,
  CircleHelp,
  CloudCog,
  ExternalLink,
  FileCheck2,
  Github,
  Search,
  Send,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { BywordCard, FactoryMark, WorkspaceBackground } from "@/components/layout/BywordSurface";

const sourceUrl = "https://github.com/BlogFactoryHQ/blogfactory";
const issuesUrl = `${sourceUrl}/issues`;

type HelpArticle = {
  category: string;
  title: string;
  symptom: string;
  solution: string;
  href: string;
  linkLabel: string;
};

type HelpCategory = {
  title: string;
  description: string;
  icon: LucideIcon;
};

const documentation = (path: string) => `${sourceUrl}/blob/main/${path}`;
const categoryId = (title: string) => title.toLowerCase().replace(/ /g, "-").replace(/&-/g, "");

const helpCategories: HelpCategory[] = [
  { title: "Getting Started", description: "Understand the workflow and prepare your first workspace.", icon: BookOpen },
  { title: "Self-hosting", description: "Install, configure, back up, and upgrade a Community instance.", icon: CloudCog },
  { title: "MCP & Connections", description: "Connect an MCP client with OAuth or a site-scoped token.", icon: Cable },
  { title: "Content & Review", description: "Create, revise, inspect, and approve work without losing context.", icon: FileCheck2 },
  { title: "CMS Draft Delivery", description: "Resolve preflight issues and send one approved version as a CMS draft.", icon: Send },
  { title: "Search Growth & Troubleshooting", description: "Use Search Console evidence and diagnose the most common operational issues.", icon: Wrench },
];

const helpArticles: HelpArticle[] = [
  {
    category: "Getting Started",
    title: "Understand the editorial workflow",
    symptom: "You need to know where agent work ends and human approval begins.",
    solution: "BlogFactory moves from source evidence to a revision, review packet, explicit approval, and a selected CMS draft. Agents never publish live.",
    href: documentation("README.md"),
    linkLabel: "Read the product model",
  },
  {
    category: "Getting Started",
    title: "Create the first administrator account",
    symptom: "A new self-hosted instance has no user who can sign in.",
    solution: "Set ADMIN_EMAILS, start the stack, then create the first account with that address. Turn signup off again once the administrator is created.",
    href: documentation("docs/self-hosting.md"),
    linkLabel: "Follow self-host setup",
  },
  {
    category: "Self-hosting",
    title: "Check whether the instance is ready",
    symptom: "The app is running, but you are unsure whether PostgreSQL and object storage are available.",
    solution: "Use /api/health for process liveness and /api/ready for the real readiness check. Ready returns 200 only when PostgreSQL and the S3 bucket are reachable.",
    href: documentation("docs/self-hosting.md"),
    linkLabel: "Read acceptance checks",
  },
  {
    category: "Self-hosting",
    title: "Back up or roll back safely",
    symptom: "You are preparing an upgrade or need to recover an older instance.",
    solution: "Back up PostgreSQL and MinIO before upgrading. Application rollbacks use a prior image; restore both data stores only when schema compatibility requires it.",
    href: documentation("docs/self-hosting.md"),
    linkLabel: "Read backup and rollback steps",
  },
  {
    category: "Self-hosting",
    title: "Choose a supported deployment target",
    symptom: "You are deciding whether to use Docker Compose, Railway, Vercel, or Netlify.",
    solution: "Docker Compose is the canonical supported v0.1 installation. Railway has a prepared topology pending real-project acceptance; Vercel is expert-only, and Netlify is not a complete deployment target.",
    href: "/docs/self-hosting",
    linkLabel: "Open the self-hosting guide",
  },
  {
    category: "Self-hosting",
    title: "Does a Community instance call blogfactory.io?",
    symptom: "You need to confirm where self-hosted content, credentials, and operation data travel.",
    solution: "No. A running Community instance stays in your infrastructure and sends data only to the AI, CMS, and Google integrations you configure. GitHub and GHCR are needed only to install or update images.",
    href: "/docs/self-hosting",
    linkLabel: "Open the self-hosting guide",
  },
  {
    category: "Self-hosting",
    title: "Secure signup after the first administrator",
    symptom: "You have created the initial self-hosted administrator and want to prevent open signup.",
    solution: "Set BLOGFACTORY_ALLOW_SIGNUP=false and recreate the API service. Additional users are created through a temporary, administrator-approved signup flow.",
    href: "/docs/self-hosting",
    linkLabel: "Open the self-hosting guide",
  },
  {
    category: "Self-hosting",
    title: "A generation was interrupted by an API restart",
    symptom: "An in-flight generation stopped after the persistent API process restarted.",
    solution: "This is the current v0.1 ceiling. Existing retry and stale-job behavior handles recovery; durable jobs, leases, retries, and worker heartbeats remain a later Cloud phase.",
    href: "/docs/self-hosting",
    linkLabel: "Open the self-hosting guide",
  },
  {
    category: "MCP & Connections",
    title: "MCP returns 401 or asks for authentication",
    symptom: "Your MCP client cannot call the server or receives a Bearer challenge.",
    solution: "An unauthenticated /mcp response is expected. Connect with browser OAuth or create a site-scoped personal token in Control → MCP Connections.",
    href: documentation("docs/mcp.md"),
    linkLabel: "Set up an MCP connection",
  },
  {
    category: "MCP & Connections",
    title: "OAuth connection does not complete",
    symptom: "The browser flow fails or the server does not advertise a usable protected resource.",
    solution: "OAuth is fail-closed. Configure the WorkOS issuer, API key, and HTTPS MCP resource URL together; otherwise leave all three unset.",
    href: documentation("docs/mcp.md"),
    linkLabel: "Read OAuth requirements",
  },
  {
    category: "MCP & Connections",
    title: "Keep tokens and credentials safe",
    symptom: "You need to understand what an MCP connection can expose.",
    solution: "Tokens are shown once and stored hashed. Tool responses never return provider secrets, while every operation remains scoped to the authorized site.",
    href: documentation("docs/mcp.md"),
    linkLabel: "Read scopes and audit rules",
  },
  {
    category: "Content & Review",
    title: "Resolve an expected_updated_at version conflict",
    symptom: "An update fails because the draft changed after you loaded it.",
    solution: "Refresh the post, retrieve the current expected_updated_at value, and retry against that version. The failed attempt writes nothing.",
    href: documentation("docs/mcp.md"),
    linkLabel: "Read revision-aware editing",
  },
  {
    category: "Content & Review",
    title: "Review changes before delivery",
    symptom: "A draft is ready, but you need to verify the revision, provenance, or missing fields.",
    solution: "Use the Review Queue or review_post packet to inspect the current revision, preflight result, destination, and permissions before approving delivery.",
    href: documentation("docs/mcp.md"),
    linkLabel: "Read the review workflow",
  },
  {
    category: "CMS Draft Delivery",
    title: "Preflight blocks CMS draft delivery",
    symptom: "The selected destination cannot receive the draft.",
    solution: "Resolve revision, SEO, or destination blockers, select the exact CMS destination, then approve the current version. Cover-image and publishing-metadata warnings do not block delivery.",
    href: documentation("docs/mcp.md"),
    linkLabel: "Read delivery preflight rules",
  },
  {
    category: "CMS Draft Delivery",
    title: "Will BlogFactory publish live content?",
    symptom: "You need to confirm the authority boundary before connecting a CMS.",
    solution: "No. WordPress, Ghost, Wix, and Framer destinations receive approved content as drafts only. Live publishing and deletion are outside the agent surface.",
    href: documentation("README.md"),
    linkLabel: "Read the authority boundary",
  },
  {
    category: "Search Growth & Troubleshooting",
    title: "Understand Search Console data boundaries",
    symptom: "Dashboard totals and query rows do not look like the same dataset.",
    solution: "Headline totals use a complete 28-day property-level dataset. Page and query rows are a bounded opportunity dataset, and preliminary dates are excluded by default.",
    href: documentation("docs/mcp.md"),
    linkLabel: "Read Search Console behavior",
  },
  {
    category: "Search Growth & Troubleshooting",
    title: "Find deployment and health checks",
    symptom: "You need to verify a release without confusing a successful build for a working production surface.",
    solution: "Verify the public page, app health, MCP Bearer challenge, OAuth metadata, and the deployment SHA. A green build alone is not production acceptance.",
    href: documentation("docs/operations.md"),
    linkLabel: "Read production verification",
  },
];

function filterHelpArticles(query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return helpArticles;
  return helpArticles.filter((article) => [article.category, article.title, article.symptom, article.solution].join(" ").toLowerCase().includes(normalized));
}

const commonQuestions = [
  ["Is BlogFactory Cloud available?", "No. BlogFactory Cloud is coming soon; the current release candidate is self-hosted first."],
  ["Does BlogFactory include an AI model?", "No. You bring your own AI credentials and select the provider/model for generation."],
  ["Can an agent publish or delete content?", "No. The delivery ceiling is a CMS draft after explicit approval; live publishing and deletion are not available through MCP."],
  ["Which CMS destinations are supported?", "Approved drafts can be prepared for WordPress, Ghost, Wix, and Framer."],
  ["Are sites and operation records shared between users?", "No. Access is site-scoped. The operation ledger stores sanitized metadata, never prompts, article bodies, provider responses, or credentials."],
] as const;

function PublicHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-byword-border bg-card/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-10">
        <a href="/" className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><FactoryMark /></a>
        <nav className="flex items-center gap-4 sm:gap-5" aria-label="Public navigation">
          <a href="/" className="type-meta text-foreground transition-colors hover:text-byword-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Product</a>
          <a href="/docs" className="type-meta text-foreground transition-colors hover:text-byword-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Docs</a>
          <a href="/help" aria-current="page" className="type-meta font-semibold text-byword-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Help</a>
          <a href={sourceUrl} target="_blank" rel="noreferrer" className="type-meta text-foreground transition-colors hover:text-byword-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Source</a>
        </nav>
      </div>
    </header>
  );
}

export function Help() {
  const [query, setQuery] = useState("");
  const results = useMemo(() => filterHelpArticles(query), [query]);

  return (
    <WorkspaceBackground className="overflow-hidden">
      <a href="#main-content" className="fixed left-4 top-4 z-[60] -translate-y-24 rounded-sm bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground transition-transform focus:translate-y-0">Skip to content</a>
      <PublicHeader />
      <main id="main-content">
        <section className="border-b border-byword-border px-4 py-16 text-center sm:px-6 sm:py-20 lg:px-10">
          <div className="mx-auto max-w-3xl">
            <p className="type-kicker text-byword-blue">BlogFactory Help Center</p>
            <h1 className="mt-4 text-4xl font-semibold leading-tight sm:text-6xl">Get your content operation unstuck.</h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">Practical setup, connection, review, delivery, and troubleshooting guidance for self-hosted BlogFactory.</p>
            <label className="relative mx-auto mt-9 block max-w-2xl text-left">
              <span className="sr-only">Search help articles</span>
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search setup, MCP, drafts, errors…" className="h-14 w-full rounded-sm border border-byword-border bg-card pl-12 pr-4 text-base shadow-sm outline-none transition-calm placeholder:text-muted-foreground focus:border-byword-blue focus:ring-2 focus:ring-byword-blue/20" />
            </label>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6 lg:px-10" aria-labelledby="topics-title">
          <div className="mx-auto max-w-6xl">
            <p className="type-kicker text-byword-blue">Browse by topic</p>
            <h2 id="topics-title" className="mt-3 text-3xl font-semibold sm:text-4xl">Find the right part of the operation.</h2>
            <div className="mt-9 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {helpCategories.map(({ title, description, icon: Icon }) => (
                <a key={title} href={`#${categoryId(title)}`} className="group rounded-md border border-byword-border bg-card p-5 transition-calm hover:-translate-y-0.5 hover:border-byword-blue/60 hover:shadow-[0_12px_28px_hsl(210_5%_20%/0.07)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                  <h3 className="mt-6 text-lg font-semibold group-hover:text-byword-blue">{title}</h3>
                  <p className="type-body mt-2">{description}</p>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-byword-border bg-card/75 px-4 py-16 sm:px-6 lg:px-10" aria-labelledby="answers-title">
          <div className="mx-auto max-w-6xl">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="type-kicker text-byword-blue">Guides and fixes</p>
                <h2 id="answers-title" className="mt-3 text-3xl font-semibold sm:text-4xl">{query ? `${results.length} matching ${results.length === 1 ? "answer" : "answers"}` : "Common paths to a solution."}</h2>
              </div>
              {query && <button type="button" onClick={() => setQuery("")} className="type-meta text-byword-blue underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Clear search</button>}
            </div>
            {results.length ? (
              <div className="mt-10 space-y-12">
                {helpCategories.map((category) => {
                  const articles = results.filter((article) => article.category === category.title);
                  if (!articles.length) return null;
                  return (
                    <section key={category.title} id={categoryId(category.title)} className="scroll-mt-24" aria-labelledby={`${category.title}-title`}>
                      <h3 id={`${category.title}-title`} className="type-kicker text-byword-blue">{category.title}</h3>
                      <div className="mt-4 grid gap-4 lg:grid-cols-2">
                        {articles.map((article) => (
                          <BywordCard key={article.title} className="p-5 sm:p-6">
                            <h4 className="text-lg font-semibold">{article.title}</h4>
                            <p className="mt-4 font-mono text-xs leading-5 text-muted-foreground"><span className="text-foreground">When:</span> {article.symptom}</p>
                            <p className="type-body mt-4">{article.solution}</p>
                            <a href={article.href} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-byword-blue underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                              {article.linkLabel}<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                            </a>
                          </BywordCard>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : (
              <BywordCard className="mt-10 p-8 text-center">
                <CircleHelp className="mx-auto h-6 w-6 text-primary" aria-hidden="true" />
                <h3 className="mt-4 text-xl font-semibold">No matching help articles.</h3>
                <p className="type-body mx-auto mt-2 max-w-lg">Try a product term such as “MCP”, “ready”, “draft”, or “Search Console”, or report a reproducible issue.</p>
                <a href={issuesUrl} target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center gap-2 rounded-sm bg-secondary px-4 py-2.5 text-sm font-semibold text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Github className="h-4 w-4" aria-hidden="true" /> Open GitHub Issues
                </a>
              </BywordCard>
            )}
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6 lg:px-10" aria-labelledby="faq-title">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.7fr_1.3fr]">
            <div>
              <p className="type-kicker text-byword-blue">Common questions</p>
              <h2 id="faq-title" className="mt-3 text-3xl font-semibold sm:text-4xl">Know the boundary.</h2>
            </div>
            <div className="divide-y divide-byword-border border-y border-byword-border">
              {commonQuestions.map(([question, answer]) => (
                <details key={question} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold transition-colors hover:text-byword-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
                    {question}<span className="font-mono text-lg font-normal text-muted-foreground transition-transform group-open:rotate-45" aria-hidden="true">+</span>
                  </summary>
                  <p className="type-body max-w-2xl pt-3">{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-byword-border px-4 py-20 text-center sm:px-6 lg:px-10">
          <BywordCard className="mx-auto max-w-4xl bg-secondary px-6 py-12 text-secondary-foreground sm:px-12">
            <ShieldCheck className="mx-auto h-7 w-7 text-primary" aria-hidden="true" />
            <h2 className="mt-5 text-3xl font-semibold">Still stuck?</h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-secondary-foreground/65">Check the linked documentation first. If you can reproduce a product issue, report it on GitHub without sharing credentials or private content.</p>
            <a href={issuesUrl} target="_blank" rel="noreferrer" className="mt-7 inline-flex items-center gap-2 rounded-sm bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-[0_2px_0_hsl(13_100%_35%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              <Github className="h-4 w-4" aria-hidden="true" /> Open GitHub Issues <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </BywordCard>
        </section>
      </main>
      <footer className="border-t border-byword-border bg-card px-4 py-6 sm:px-6 lg:px-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <FactoryMark />
          <nav className="flex items-center gap-4" aria-label="Footer navigation"><a href="/" className="type-meta hover:text-byword-blue">Product</a><a href="/docs" className="type-meta hover:text-byword-blue">Docs</a><a href="/help" className="type-meta hover:text-byword-blue">Help</a><a href={sourceUrl} target="_blank" rel="noreferrer" className="type-meta hover:text-byword-blue">Source</a></nav>
        </div>
      </footer>
    </WorkspaceBackground>
  );
}
