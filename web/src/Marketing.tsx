import {
  ArrowRight,
  Bot,
  BookOpen,
  Cable,
  Check,
  ChevronDown,
  CircleDot,
  CircleHelp,
  FileCheck2,
  FileSearch,
  Github,
  KeyRound,
  Layers3,
  LockKeyhole,
  Radar,
  Send,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { BywordCard, FactoryMark, WorkspaceBackground } from "@/components/layout/BywordSurface";
import { requiredHttpsUrl } from "@/lib/https-url";

const productLoop = [
  [FileSearch, "Bring in evidence", "Connect sites, feeds, campaigns, briefs, and Search Console context."],
  [Bot, "Agents create and revise", "Use MCP-compatible clients to research, generate, diagnose, and update drafts."],
  [FileCheck2, "Your team reviews", "See revisions, provenance, SEO fields, destinations, and preflight blockers before approval."],
  [Send, "Send a CMS draft", "Deliver the approved version to the selected CMS as a draft—never straight to live."],
] as const;

const outcomes = [
  [Layers3, "Know what needs attention", "A prioritized Review Queue brings blockers, requested changes, stale approvals, and warnings into one place."],
  [FileCheck2, "Review changes, not mystery drafts", "Revision history, provenance, and preflight checks make every editorial decision inspectable."],
  [ShieldCheck, "Keep every site separated", "Sources, permissions, content, and destinations remain scoped to the site your team authorizes."],
  [Workflow, "Move faster without losing control", "Agents work through MCP while people keep approval and CMS handoff authority."],
  [Radar, "Use search evidence operationally", "Search Console signals become concrete work instead of another dashboard to monitor."],
] as const;

const ecosystem = [
  ["CMS destinations", "WordPress · Ghost · Wix · Framer"],
  ["Agent work layer", "ChatGPT · Codex · MCP-compatible clients"],
  ["Inputs", "RSS · websites · campaigns · spreadsheets · Search Console"],
  ["AI control", "Your credentials · your model selection"],
] as const;

const trustPoints = ["Bring your own AI", "Site-scoped access", "Never publishes live"] as const;
const sourceUrl = "https://github.com/BoraGkc/blogfactory";

const faqs = [
  [
    "Why not use ChatGPT or Codex directly?",
    "You can use them—and connect them to BlogFactory through MCP. BlogFactory adds persistent site context, action queues, revisions, approvals, destinations, and audit history around the work.",
  ],
  [
    "Does BlogFactory include an AI model?",
    "No. You connect your own AI access and choose the model used for generation. BlogFactory organizes the workflow around it.",
  ],
  [
    "What can agents access?",
    "Only the tools and site data allowed by the connected account and token scopes. Site authorization is checked on every operation.",
  ],
  [
    "Can an agent publish directly to a live site?",
    "No. The highest delivery authority is creating a CMS draft after explicit approval. Live publishing remains outside the agent surface.",
  ],
  [
    "Which CMS platforms are supported?",
    "BlogFactory currently supports draft destinations for WordPress, Ghost, Wix, and Framer.",
  ],
  [
    "Is content or credential data exposed through MCP?",
    "Authorized tools can return the editorial content needed for their task. Credentials, tokens, and provider secrets are never returned, and operation history stores only sanitized metadata.",
  ],
  [
    "When will BlogFactory Cloud be available?",
    "Cloud is coming soon. The first release is the self-hosted edition; join the Cloud waitlist if you want BlogFactory to operate the infrastructure for you.",
  ],
] as const;

function WaitlistLink({ href, className = "" }: { href: string; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      data-cta="cloud-waitlist"
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-sm bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[0_2px_0_hsl(13_100%_35%)] transition-calm hover:-translate-y-0.5 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${className}`}
    >
      Cloud coming soon
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </a>
  );
}

function SourceLink({ className = "" }: { className?: string }) {
  return (
    <a
      href={sourceUrl}
      target="_blank"
      rel="noreferrer"
      data-cta="source"
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-sm bg-secondary px-5 text-sm font-semibold text-secondary-foreground transition-calm hover:-translate-y-0.5 hover:bg-secondary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${className}`}
    >
      <Github className="h-4 w-4" aria-hidden="true" />
      View source
    </a>
  );
}

function ProductWorkspace() {
  return (
    <BywordCard className="relative mx-auto max-w-6xl text-left">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-byword-border px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <CircleDot className="h-4 w-4 text-status-success" aria-hidden="true" />
          <span className="type-object-title">Product workflow</span>
        </div>
        <span className="type-kicker rounded-sm border border-byword-border bg-muted/50 px-2 py-1">Product composite</span>
      </div>

      <div className="grid gap-px border-b border-byword-border bg-byword-border sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["01", "Evidence", "RSS + Search Console", "Ready"],
          ["02", "Agent work", "Draft revision v3", "Prepared"],
          ["03", "Review", "Preflight + changes", "Needs decision"],
          ["04", "Destination", "Ghost CMS", "Draft only"],
        ].map(([number, label, detail, status]) => (
          <div key={number} className="bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="type-data text-muted-foreground">{number}</span>
              <span className="type-kicker text-byword-blue">{status}</span>
            </div>
            <p className="type-object-title mt-5">{label}</p>
            <p className="type-meta mt-1">{detail}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[1.05fr_1.4fr]">
        <section className="rounded-sm border border-byword-border bg-background/70 p-4" aria-label="Review queue product composite">
          <div className="flex items-center justify-between border-b border-byword-border pb-3">
            <div>
              <p className="type-kicker">Review queue</p>
              <h3 className="type-panel-title mt-1">Work that needs a decision</h3>
            </div>
            <Layers3 className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <div className="mt-4 space-y-3">
            {[
              ["Product glossary update", "Changes requested", "Blocker"],
              ["Evergreen guide refresh", "SEO fields missing", "Resolve"],
              ["Weekly market brief", "Revision ready", "Review"],
            ].map(([title, note, action]) => (
              <div key={title} className="flex items-start justify-between gap-4 rounded-sm border border-byword-border bg-card p-3">
                <div>
                  <p className="type-object-title">{title}</p>
                  <p className="type-meta mt-1">{note}</p>
                </div>
                <span className="type-kicker shrink-0 text-byword-blue">{action}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-4">
          <section className="overflow-hidden rounded-sm border border-byword-border bg-card" aria-label="Review packet product composite">
            <div className="flex items-center justify-between border-b border-byword-border px-4 py-3">
              <div>
                <p className="type-kicker">Review packet</p>
                <h3 className="type-panel-title mt-1">Evergreen guide refresh</h3>
              </div>
              <FileCheck2 className="h-5 w-5 text-byword-blue" aria-hidden="true" />
            </div>
            <div className="grid gap-px bg-byword-border sm:grid-cols-3">
              {[
                ["Revision", "v3 · Current"],
                ["Preflight", "2 blockers"],
                ["Destination", "WordPress draft"],
              ].map(([label, value]) => (
                <div key={label} className="bg-card px-4 py-3">
                  <p className="type-kicker">{label}</p>
                  <p className="type-object-title mt-1">{value}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-2 border-t border-byword-border p-4 sm:grid-cols-2">
              {["Primary query missing", "Cover image warning", "Destination confirmed", "Approval required"].map((item, index) => (
                <div key={item} className="flex items-center gap-2 rounded-sm border border-byword-border bg-background/70 px-3 py-2">
                  <span className={`h-1.5 w-1.5 rounded-full ${index < 2 ? "bg-amber-500" : "bg-status-success"}`} aria-hidden="true" />
                  <span className="type-meta">{item}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-sm border border-byword-border bg-secondary p-4 text-secondary-foreground" aria-label="Operation history product composite">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] font-semibold uppercase text-secondary-foreground/55">Operation history</p>
                <h3 className="mt-1 text-sm font-semibold">Every agent action stays visible</h3>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-sm border border-white/15 px-2 py-1 font-mono text-[10px] text-white/75">
                <Check className="h-3 w-3" aria-hidden="true" /> Sanitized
              </span>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {["Source read", "Draft updated", "Review requested"].map((item) => (
                <div key={item} className="rounded-sm border border-white/10 bg-white/5 px-3 py-2 font-mono text-[10px] text-white/70">{item}</div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </BywordCard>
  );
}

export function Marketing({ waitlistUrl }: { waitlistUrl?: string }) {
  const href = requiredHttpsUrl("VITE_WAITLIST_URL", waitlistUrl || import.meta.env.VITE_WAITLIST_URL);

  return (
    <WorkspaceBackground className="overflow-hidden">
      <a href="#main-content" className="fixed left-4 top-4 z-[60] -translate-y-24 rounded-sm bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground transition-transform focus:translate-y-0">
        Skip to content
      </a>
      <header className="sticky top-0 z-50 border-b border-byword-border bg-card/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-3 px-4 py-3 sm:px-6 lg:px-10">
          <FactoryMark className="shrink-0" />
          <nav className="order-3 flex w-full flex-col gap-2 border-t border-byword-border pt-3 md:order-none md:w-auto md:flex-row md:border-0 md:pt-0" aria-label="Marketing sections">
              <details name="marketing-menu" className="group relative w-full md:w-auto">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-1.5 rounded-sm px-3 py-2 type-meta text-foreground transition-colors hover:bg-byword-blue-soft hover:text-byword-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:justify-start">
                  Product <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <div className="relative z-50 mt-2 grid w-full grid-cols-1 overflow-hidden rounded-md border border-byword-border bg-card shadow-[0_12px_32px_rgba(35,37,39,0.12)] md:absolute md:left-0 md:top-full md:mt-3 md:w-[34rem] md:grid-cols-[1.3fr_0.9fr] md:shadow-[0_18px_48px_rgba(35,37,39,0.16)]">
                  <div className="space-y-2 p-3">
                    <a href="#workflow" className="flex gap-3 rounded-sm p-3 transition-colors hover:bg-byword-blue-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-byword-blue-soft text-byword-blue"><Workflow className="h-4 w-4" aria-hidden="true" /></span><span><span className="block text-sm font-semibold">Content workflow</span><span className="mt-1 block text-sm text-muted-foreground">Bring evidence, agent work, review, and CMS drafts into one operation.</span></span></a>
                    <a href="#why-blogfactory" className="flex gap-3 rounded-sm p-3 transition-colors hover:bg-byword-blue-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-byword-blue-soft text-byword-blue"><FileCheck2 className="h-4 w-4" aria-hidden="true" /></span><span><span className="block text-sm font-semibold">Human review</span><span className="mt-1 block text-sm text-muted-foreground">Keep approvals, preflight, and destination choice with your team.</span></span></a>
                    <a href="#faq" className="flex gap-3 rounded-sm p-3 transition-colors hover:bg-byword-blue-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-byword-blue-soft text-byword-blue"><Radar className="h-4 w-4" aria-hidden="true" /></span><span><span className="block text-sm font-semibold">How it works</span><span className="mt-1 block text-sm text-muted-foreground">See the authority boundary and common questions.</span></span></a>
                  </div>
                  <div className="border-t border-byword-border bg-muted/35 p-5 md:border-l md:border-t-0">
                    <p className="type-kicker text-byword-blue">Draft-only by design</p>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">Agents can prepare approved CMS drafts. Live publishing remains outside the agent surface.</p>
                    <a href="#faq" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-byword-blue hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Read the FAQ <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></a>
                  </div>
                </div>
              </details>
              <details name="marketing-menu" className="group relative w-full md:w-auto">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-1.5 rounded-sm px-3 py-2 type-meta text-foreground transition-colors hover:bg-byword-blue-soft hover:text-byword-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:justify-start">
                  Resources <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <div className="relative z-50 mt-2 grid w-full grid-cols-1 overflow-hidden rounded-md border border-byword-border bg-card shadow-[0_12px_32px_rgba(35,37,39,0.12)] md:absolute md:left-0 md:top-full md:mt-3 md:w-[34rem] md:grid-cols-[1.3fr_0.9fr] md:shadow-[0_18px_48px_rgba(35,37,39,0.16)]">
                  <div className="space-y-2 p-3">
                    <a href="/docs" className="flex gap-3 rounded-sm p-3 transition-colors hover:bg-byword-blue-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-byword-blue-soft text-byword-blue"><BookOpen className="h-4 w-4" aria-hidden="true" /></span><span><span className="block text-sm font-semibold">Documentation</span><span className="mt-1 block text-sm text-muted-foreground">Self-hosting, MCP connection, review, and CMS draft delivery.</span></span></a>
                    <a href="/help" className="flex gap-3 rounded-sm p-3 transition-colors hover:bg-byword-blue-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-byword-blue-soft text-byword-blue"><CircleHelp className="h-4 w-4" aria-hidden="true" /></span><span><span className="block text-sm font-semibold">Help center</span><span className="mt-1 block text-sm text-muted-foreground">Practical answers for the setup and operational workflow.</span></span></a>
                    <a href={sourceUrl} target="_blank" rel="noreferrer" className="flex gap-3 rounded-sm p-3 transition-colors hover:bg-byword-blue-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-byword-blue-soft text-byword-blue"><Github className="h-4 w-4" aria-hidden="true" /></span><span><span className="block text-sm font-semibold">Source code</span><span className="mt-1 block text-sm text-muted-foreground">Inspect and run the open-source release candidate yourself.</span></span></a>
                  </div>
                  <div className="border-t border-byword-border bg-muted/35 p-5 md:border-l md:border-t-0">
                    <p className="type-kicker text-byword-blue">Cloud</p>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">BlogFactory Cloud is coming soon. Join the waitlist for updates.</p>
                    <WaitlistLink href={href} className="mt-6 h-10 px-4 text-xs" />
                  </div>
                </div>
              </details>
          </nav>
          <span className="type-kicker rounded-sm border border-byword-border bg-muted/50 px-2.5 py-1.5">Open-source release candidate</span>
        </div>
      </header>

      <main id="main-content">
        <section className="px-4 pb-16 pt-16 text-center sm:px-6 sm:pb-20 sm:pt-24 lg:px-10 lg:pt-28">
          <div className="mx-auto max-w-4xl">
            <p className="type-kicker text-byword-blue">Open source · Self-hosted first · Cloud coming soon</p>
            <h1 className="mx-auto mt-5 max-w-[16ch] text-[42px] font-semibold leading-[0.98] tracking-[-0.035em] text-foreground sm:text-6xl lg:text-[68px]">
              Turn scattered AI content work into reviewed CMS drafts.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              Self-host the complete content operations control plane, connect your own AI, and keep reviewed delivery at the CMS draft boundary.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <SourceLink />
              <WaitlistLink href={href} />
            </div>
            <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-2" aria-label="Product guarantees">
              {trustPoints.map((point, index) => (
                <li key={point} className="type-meta flex items-center gap-3">
                  {index > 0 && <span className="h-1 w-1 rounded-full bg-byword-border" aria-hidden="true" />}
                  {point}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="px-4 pb-20 sm:px-6 lg:px-10">
          <ProductWorkspace />
        </section>

        <section className="border-y border-byword-border bg-card/75 px-4 py-16 sm:px-6 lg:px-10" aria-labelledby="editions-title">
          <div className="mx-auto max-w-6xl">
            <p className="type-kicker text-byword-blue">Choose your path</p>
            <h2 id="editions-title" className="mt-3 max-w-3xl text-3xl font-semibold leading-tight sm:text-4xl">Run it yourself now. Let us run it later.</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <BywordCard className="p-6">
                <p className="type-kicker text-status-success">Open-source release candidate</p>
                <h3 className="mt-3 text-xl font-semibold">Community self-hosted</h3>
                <p className="type-body mt-3">Docker Compose, PostgreSQL, S3-compatible storage, the web control plane, and MCP—with your own AI credentials.</p>
                <SourceLink className="mt-6" />
              </BywordCard>
              <BywordCard className="p-6">
                <p className="type-kicker text-primary">Coming soon</p>
                <h3 className="mt-3 text-xl font-semibold">BlogFactory Cloud</h3>
                <p className="type-body mt-3">The same product with managed infrastructure, updates, backups, and workers. No checkout or hosted plan is live yet.</p>
                <WaitlistLink href={href} className="mt-6" />
              </BywordCard>
            </div>
          </div>
        </section>

        <section id="workflow" className="scroll-mt-20 border-y border-byword-border bg-card/75 px-4 py-20 sm:px-6 lg:px-10">
          <div className="mx-auto max-w-6xl">
            <p className="type-kicker text-byword-blue">One operating loop</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight sm:text-4xl">From source evidence to a reviewed CMS draft.</h2>
            <div className="mt-10 grid gap-px overflow-hidden rounded-md border border-byword-border bg-byword-border sm:grid-cols-2 lg:grid-cols-4">
              {productLoop.map(([Icon, title, description], index) => (
                <article key={title} className="bg-card p-6 sm:p-7">
                  <div className="flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-sm border border-byword-border bg-background text-byword-blue">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <span className="type-data text-sm text-muted-foreground">0{index + 1}</span>
                  </div>
                  <h3 className="mt-8 text-lg font-semibold">{title}</h3>
                  <p className="type-body mt-2">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="why-blogfactory" className="scroll-mt-20 px-4 py-20 sm:px-6 lg:px-10">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div>
              <p className="type-kicker text-byword-blue">Why BlogFactory</p>
              <h2 className="mt-3 max-w-xl text-3xl font-semibold leading-tight sm:text-4xl">Your AI can write. BlogFactory runs the operation.</h2>
              <p className="type-body mt-5 max-w-xl text-base leading-7">
                ChatGPT, Codex, and other MCP clients can do the editorial work. BlogFactory gives that work persistent site context, a place for decisions, and a controlled route to each CMS.
              </p>
            </div>
            <BywordCard>
              <div className="grid gap-px bg-byword-border sm:grid-cols-2">
                <div className="bg-card p-6">
                  <div className="flex items-center gap-3">
                    <Cable className="h-5 w-5 text-byword-blue" aria-hidden="true" />
                    <h3 className="text-lg font-semibold">Agents do the work</h3>
                  </div>
                  <p className="type-body mt-4">Research, generate, revise, diagnose, and prepare approved CMS drafts through site-scoped MCP tools.</p>
                </div>
                <div className="bg-card p-6">
                  <div className="flex items-center gap-3">
                    <KeyRound className="h-5 w-5 text-primary" aria-hidden="true" />
                    <h3 className="text-lg font-semibold">People keep control</h3>
                  </div>
                  <p className="type-body mt-4">Review changes, resolve blockers, choose destinations, approve handoffs, and inspect operation history in the web app.</p>
                </div>
              </div>
            </BywordCard>
          </div>
        </section>

        <section className="border-y border-byword-border bg-card/75 px-4 py-20 sm:px-6 lg:px-10">
          <div className="mx-auto max-w-6xl">
            <p className="type-kicker text-byword-blue">Operational outcomes</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight sm:text-4xl">Move faster without turning editorial control into guesswork.</h2>
            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-6">
              {outcomes.map(([Icon, title, description], index) => (
                <BywordCard key={title} className={`p-6 ${index < 3 ? "lg:col-span-2" : "lg:col-span-3"}`}>
                  <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
                  <h3 className="mt-8 text-lg font-semibold">{title}</h3>
                  <p className="type-body mt-2">{description}</p>
                </BywordCard>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-20 sm:px-6 lg:px-10">
          <div className="mx-auto max-w-6xl">
            <p className="type-kicker text-byword-blue">Works with your operation</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight sm:text-4xl">Connect the tools you already use.</h2>
            <div className="mt-10 grid gap-px overflow-hidden rounded-md border border-byword-border bg-byword-border sm:grid-cols-2 lg:grid-cols-4">
              {ecosystem.map(([label, detail]) => (
                <article key={label} className="min-h-36 bg-card p-6">
                  <h3 className="type-kicker text-byword-blue">{label}</h3>
                  <p className="mt-4 text-sm font-semibold leading-6 text-foreground">{detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="scroll-mt-20 border-y border-byword-border bg-card/75 px-4 py-20 sm:px-6 lg:px-10">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.7fr_1.3fr]">
            <div>
              <p className="type-kicker text-byword-blue">FAQ</p>
              <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">Before you join.</h2>
            </div>
            <div className="divide-y divide-byword-border border-y border-byword-border">
              {faqs.map(([question, answer]) => (
                <details key={question} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold transition-colors hover:text-byword-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
                    {question}
                    <span className="font-mono text-lg font-normal text-muted-foreground transition-transform group-open:rotate-45" aria-hidden="true">+</span>
                  </summary>
                  <p className="type-body max-w-2xl pt-3">{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-24 text-center sm:px-6 lg:px-10">
          <BywordCard className="mx-auto max-w-5xl bg-secondary px-6 py-14 text-secondary-foreground sm:px-12 sm:py-16">
            <LockKeyhole className="mx-auto h-7 w-7 text-primary" aria-hidden="true" />
            <h2 className="mt-5 text-3xl font-semibold leading-tight text-secondary-foreground sm:text-5xl">Self-host the operation. Keep editorial control.</h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-secondary-foreground/65">Start with the open-source release candidate. BlogFactory Cloud is coming soon.</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <SourceLink />
              <WaitlistLink href={href} />
            </div>
          </BywordCard>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-secondary px-4 text-secondary-foreground sm:px-6 lg:px-10">
        <div className="mx-auto max-w-6xl py-14 sm:py-16">
          <div className="flex flex-wrap items-center justify-between gap-6 border-b border-white/10 pb-10 max-sm:flex-col max-sm:items-stretch">
            <FactoryMark className="text-white [&>div]:border-white/25 [&>div]:bg-transparent [&>div>div]:text-white [&>span]:text-white" />
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 max-sm:flex-col max-sm:items-stretch">
              <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 max-sm:grid max-sm:grid-cols-2" aria-label="Footer navigation">
                <a href="#workflow" className="type-meta text-secondary-foreground/70 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Workflow</a>
                <a href="#faq" className="type-meta text-secondary-foreground/70 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">FAQ</a>
                <a href="/docs" className="type-meta text-secondary-foreground/70 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Docs</a>
                <a href="/help" className="type-meta text-secondary-foreground/70 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Help</a>
              </nav>
              <a href={sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-sm border border-white/20 px-3 py-2 text-xs font-semibold text-white transition-colors hover:border-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary max-sm:justify-center"><Github className="h-4 w-4" aria-hidden="true" />View source</a>
            </div>
          </div>

          <div className="grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <h2 className="text-sm font-semibold text-white">Product</h2>
              <nav className="mt-5 grid gap-3" aria-label="Product links">
                <a href="#workflow" className="text-sm text-secondary-foreground/65 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Content workflow</a>
                <a href="#why-blogfactory" className="text-sm text-secondary-foreground/65 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Human review</a>
                <a href="#faq" className="text-sm text-secondary-foreground/65 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Draft-only delivery</a>
              </nav>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Get started</h2>
              <nav className="mt-5 grid gap-3" aria-label="Getting started links">
                <a href="/docs" className="text-sm text-secondary-foreground/65 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Self-host BlogFactory</a>
                <a href="/docs#connect-mcp" className="text-sm text-secondary-foreground/65 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Connect MCP</a>
                <a href="/help" className="text-sm text-secondary-foreground/65 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Help center</a>
              </nav>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Open source</h2>
              <nav className="mt-5 grid gap-3" aria-label="Open source links">
                <a href={sourceUrl} target="_blank" rel="noreferrer" className="text-sm text-secondary-foreground/65 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Source code</a>
                <a href={`${sourceUrl}/issues`} target="_blank" rel="noreferrer" className="text-sm text-secondary-foreground/65 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Report an issue</a>
                <a href="/docs" className="text-sm text-secondary-foreground/65 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Documentation</a>
              </nav>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Cloud</h2>
              <p className="mt-5 text-sm leading-6 text-secondary-foreground/65">BlogFactory Cloud is coming soon. Join the waitlist for updates.</p>
              <WaitlistLink href={href} className="mt-5 h-10 px-4 text-xs max-sm:w-full" />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6 text-xs text-secondary-foreground/55 max-sm:flex-col max-sm:items-start">
            <p>Agent work. Human control. CMS drafts.</p>
            <p>© {new Date().getFullYear()} BlogFactory</p>
          </div>
        </div>
      </footer>
    </WorkspaceBackground>
  );
}
