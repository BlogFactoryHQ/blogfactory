import {
  ArrowRight,
  Bot,
  Cable,
  Check,
  CircleDot,
  FileCheck2,
  KeyRound,
  Layers3,
  LockKeyhole,
  Send,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { BywordCard, FactoryMark, WorkspaceBackground } from "@/components/layout/BywordSurface";
import { requiredHttpsUrl } from "@/lib/https-url";

const steps = [
  [Cable, "Connect sources", "Bring in the feeds, sites, and Search Console context your operation already uses."],
  [Bot, "Agents create drafts", "Use your own AI provider while BlogFactory keeps the work organized and site-scoped."],
  [Send, "Review, then send", "Approve the final revision and deliver it to the selected CMS as a draft—never live."],
] as const;

const boundaries = [
  [KeyRound, "Bring your own AI", "Your model credentials and provider choice stay under your control."],
  [ShieldCheck, "Site-scoped access", "Every connection and operation is limited to the sites you authorize."],
  [FileCheck2, "Draft-only delivery", "CMS handoffs create drafts for human review. BlogFactory does not publish live."],
] as const;

const faqs = [
  ["Who is BlogFactory for?", "Publishers and content teams operating one or more sites and coordinating repeatable editorial work."],
  ["Does BlogFactory include an AI model?", "No. You connect the AI provider you already use and keep control of that relationship."],
  ["Can it publish directly to a live site?", "No. The highest delivery authority is creating a CMS draft after explicit approval."],
  ["What can agents do?", "Agents can research, generate, revise, diagnose, and prepare CMS drafts through BlogFactory's site-scoped MCP tools."],
  ["Is the product available now?", "BlogFactory is in private beta. Join the waitlist to hear when access opens."],
] as const;

function WaitlistLink({ href, className = "" }: { href: string; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-sm bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[0_2px_0_hsl(13_100%_35%)] transition-calm hover:-translate-y-0.5 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${className}`}
    >
      Join the waitlist
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </a>
  );
}

function DemoWorkspace() {
  return (
    <BywordCard className="relative mx-auto max-w-6xl text-left">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-byword-border px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <CircleDot className="h-4 w-4 text-status-success" aria-hidden="true" />
          <span className="type-object-title">Demo workspace</span>
        </div>
        <span className="type-kicker rounded-sm border border-byword-border bg-muted/50 px-2 py-1">Illustrative product view</span>
      </div>
      <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[1.05fr_1.4fr]">
        <section className="rounded-sm border border-byword-border bg-background/70 p-4" aria-label="Overview demo">
          <div className="flex items-center justify-between border-b border-byword-border pb-3">
            <div>
              <p className="type-kicker">Overview</p>
              <h3 className="type-panel-title mt-1">Editorial control plane</h3>
            </div>
            <Workflow className="h-5 w-5 text-byword-blue" aria-hidden="true" />
          </div>
          <div className="mt-4 space-y-3">
            {[
              ["Review requested", "Spring editorial refresh", "Needs editor"],
              ["Source connected", "Industry feed", "Ready"],
              ["CMS destination", "Primary publication", "Draft only"],
            ].map(([label, title, status]) => (
              <div key={title} className="flex items-start justify-between gap-4 rounded-sm border border-byword-border bg-card p-3">
                <div>
                  <p className="type-kicker">{label}</p>
                  <p className="type-object-title mt-1">{title}</p>
                </div>
                <span className="type-meta shrink-0 text-byword-blue">{status}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-4">
          <section className="overflow-hidden rounded-sm border border-byword-border bg-card" aria-label="Review queue demo">
            <div className="flex items-center justify-between border-b border-byword-border px-4 py-3">
              <div>
                <p className="type-kicker">Review queue</p>
                <h3 className="type-panel-title mt-1">Work that needs a decision</h3>
              </div>
              <Layers3 className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <div className="divide-y divide-byword-border">
              {[
                ["Product glossary update", "Revision ready", "Review"],
                ["Evergreen guide refresh", "SEO fields missing", "Resolve"],
                ["Weekly market brief", "Destination confirmed", "Approve"],
              ].map(([title, note, action]) => (
                <div key={title} className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div>
                    <p className="type-object-title">{title}</p>
                    <p className="type-meta mt-1">{note}</p>
                  </div>
                  <span className="type-kicker text-byword-blue">{action}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-sm border border-byword-border bg-secondary p-4 text-secondary-foreground" aria-label="Runs demo">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] font-semibold uppercase text-secondary-foreground/55">Runs</p>
                <h3 className="mt-1 text-sm font-semibold">Every agent action stays visible</h3>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-sm border border-white/15 px-2 py-1 font-mono text-[10px] text-white/75">
                <Check className="h-3 w-3" aria-hidden="true" /> Audited
              </span>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {["Source read", "Draft prepared", "Review requested"].map((item) => (
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
      <header className="border-b border-byword-border bg-card/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-10">
          <FactoryMark />
          <span className="type-kicker rounded-sm border border-byword-border bg-muted/50 px-2.5 py-1.5">Private beta</span>
        </div>
      </header>

      <main>
        <section className="px-4 pb-16 pt-20 text-center sm:px-6 sm:pb-20 sm:pt-28 lg:px-10">
          <div className="mx-auto max-w-4xl">
            <p className="type-kicker text-byword-blue">Content operations for one or more sites</p>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.02] text-foreground sm:text-6xl lg:text-[68px]">
              Run your content operation from one control plane.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              Connect sources, coordinate AI-assisted drafts, review every change, and send approved work to your CMS as a draft.
            </p>
            <div className="mt-8">
              <WaitlistLink href={href} />
            </div>
            <p className="type-meta mt-4">Bring your own AI · Site-scoped access · Draft-only delivery</p>
          </div>
        </section>

        <section className="px-4 pb-20 sm:px-6 lg:px-10">
          <DemoWorkspace />
        </section>

        <section className="border-y border-byword-border bg-card/75 px-4 py-20 sm:px-6 lg:px-10">
          <div className="mx-auto max-w-6xl">
            <p className="type-kicker text-byword-blue">How it works</p>
            <h2 className="mt-3 max-w-2xl text-3xl font-semibold leading-tight sm:text-4xl">A clear path from input to reviewed CMS draft.</h2>
            <div className="mt-10 grid gap-px overflow-hidden rounded-md border border-byword-border bg-byword-border md:grid-cols-3">
              {steps.map(([Icon, title, description], index) => (
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

        <section className="px-4 py-20 sm:px-6 lg:px-10">
          <div className="mx-auto max-w-6xl">
            <p className="type-kicker text-byword-blue">Product boundaries</p>
            <h2 className="mt-3 max-w-2xl text-3xl font-semibold leading-tight sm:text-4xl">Control stays with your team.</h2>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {boundaries.map(([Icon, title, description]) => (
                <BywordCard key={title} className="p-6">
                  <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
                  <h3 className="mt-8 text-lg font-semibold">{title}</h3>
                  <p className="type-body mt-2">{description}</p>
                </BywordCard>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-byword-border bg-card/75 px-4 py-20 sm:px-6 lg:px-10">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.7fr_1.3fr]">
            <div>
              <p className="type-kicker text-byword-blue">FAQ</p>
              <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">Before you join.</h2>
            </div>
            <div className="divide-y divide-byword-border border-y border-byword-border">
              {faqs.map(([question, answer]) => (
                <details key={question} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
                    {question}
                    <span className="font-mono text-lg font-normal text-muted-foreground group-open:rotate-45" aria-hidden="true">+</span>
                  </summary>
                  <p className="type-body max-w-2xl pt-3">{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-24 text-center sm:px-6 lg:px-10">
          <div className="mx-auto max-w-3xl">
            <LockKeyhole className="mx-auto h-7 w-7 text-byword-blue" aria-hidden="true" />
            <h2 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">Build a calmer content operation.</h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-muted-foreground">Join the private beta waitlist for BlogFactory.</p>
            <div className="mt-8">
              <WaitlistLink href={href} />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-byword-border bg-card px-4 py-6 sm:px-6 lg:px-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <FactoryMark />
          <p className="type-meta">Content operations control plane</p>
        </div>
      </footer>
    </WorkspaceBackground>
  );
}
