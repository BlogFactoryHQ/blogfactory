import {
  ArrowRight,
  Bot,
  Cable,
  Check,
  CircleDot,
  FileCheck2,
  FileSearch,
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
    "Who is the private beta for?",
    "Publishers and content teams operating one or more sites who already use AI and need a safer, repeatable way to coordinate editorial work.",
  ],
] as const;

function WaitlistLink({ href, className = "" }: { href: string; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-sm bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[0_2px_0_hsl(13_100%_35%)] transition-calm hover:-translate-y-0.5 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${className}`}
    >
      Join the private beta
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
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
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-10">
          <FactoryMark />
          <div className="flex items-center gap-5">
            <nav className="hidden items-center gap-5 md:flex" aria-label="Marketing sections">
              <a href="#workflow" className="type-meta text-foreground transition-colors hover:text-byword-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Workflow</a>
              <a href="#why-blogfactory" className="type-meta text-foreground transition-colors hover:text-byword-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Why BlogFactory</a>
              <a href="#faq" className="type-meta text-foreground transition-colors hover:text-byword-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">FAQ</a>
            </nav>
            <span className="type-kicker rounded-sm border border-byword-border bg-muted/50 px-2.5 py-1.5">Private beta</span>
          </div>
        </div>
      </header>

      <main id="main-content">
        <section className="px-4 pb-16 pt-16 text-center sm:px-6 sm:pb-20 sm:pt-24 lg:px-10 lg:pt-28">
          <div className="mx-auto max-w-4xl">
            <p className="type-kicker text-byword-blue">For publishers and teams running one or more sites</p>
            <h1 className="mx-auto mt-5 max-w-[16ch] text-[42px] font-semibold leading-[0.98] tracking-[-0.035em] text-foreground sm:text-6xl lg:text-[68px]">
              Turn scattered AI content work into reviewed CMS drafts.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              Your agents research and create through BlogFactory. Your team reviews revisions, resolves blockers, and sends approved work to the right CMS—as a draft.
            </p>
            <div className="mt-8">
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
            <h2 className="mt-5 text-3xl font-semibold leading-tight text-secondary-foreground sm:text-5xl">Bring your agents. Keep editorial control.</h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-secondary-foreground/65">Join the BlogFactory private beta.</p>
            <div className="mt-8">
              <WaitlistLink href={href} />
            </div>
          </BywordCard>
        </section>
      </main>

      <footer className="border-t border-byword-border bg-card px-4 py-6 sm:px-6 lg:px-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <FactoryMark />
          <p className="type-meta">Agent work. Human control. CMS drafts.</p>
        </div>
      </footer>
    </WorkspaceBackground>
  );
}
