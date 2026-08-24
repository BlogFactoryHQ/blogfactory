import { FormEvent, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleDollarSign,
  ExternalLink,
  FileText,
  Globe2,
  KeyRound,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputAffordance } from "@/components/ui/input-affordance";
import { BywordCard, FactoryDivider, FactoryMark, IconTile, WorkspaceBackground } from "@/components/layout/BywordSurface";
import { preferredTextModelId } from "@/components/content/LiveTextModelSelect";
import { useJobTracker, type JobTerminalResult, type TrackedJob } from "@/hooks/useJobTracker";
import { useOpenRouterSetup } from "@/hooks/useOpenRouterSetup";
import { useSites, type Site } from "@/hooks/useSites";
import type { LiveTextModel } from "@/hooks/useTextModels";
import { api } from "@/lib/api";
import type { WorkspaceDigest } from "@/lib/control-plane";
import { estimateGenerationCost } from "@/lib/cost-estimator";
import { normalizeHttpUrl, stripHttpProtocol } from "@/lib/url-validation";
import { cn } from "@/lib/utils";

type OnboardingStep = "site" | "loading" | "key" | "topic" | "review" | "generating" | "success";

type FirstDraftPost = {
  id: string;
  title: string;
  summary: string | null;
  content: string;
  status: string;
};

type FirstDraftResult = {
  post: FirstDraftPost;
  totalCost: number;
  createdAt: string | null;
  completedAt: string | null;
};

const ONBOARDING_IMAGE_CONFIG = {
  cover: { enabled: false, resolution: "1K" as const },
  inline: { enabled: false, count: 0, resolution: "1K" as const },
};

const STEP_META = [
  { label: "Site", icon: Globe2 },
  { label: "AI access", icon: KeyRound },
  { label: "Topic", icon: FileText },
  { label: "First draft", icon: Sparkles },
];

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const formatCost = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 4 }).format(value);

function activeStepIndex(step: OnboardingStep) {
  if (step === "site" || step === "loading") return 0;
  if (step === "key") return 1;
  if (step === "topic") return 2;
  return 3;
}

function elapsedSeconds(createdAt: string | null, completedAt: string | null) {
  if (!createdAt || !completedAt) return null;
  const elapsed = new Date(completedAt).getTime() - new Date(createdAt).getTime();
  return Number.isFinite(elapsed) && elapsed >= 0 ? Math.round(elapsed / 1000) : null;
}

function firstDraftExcerpt(post: FirstDraftPost) {
  if (post.summary?.trim()) return post.summary.trim();
  return post.content.replace(/[#_*`>[\]()]/g, " ").replace(/\s+/g, " ").trim().slice(0, 280);
}

export default function Onboarding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeSite, sites, createSite, isCreating, isLoading: sitesLoading } = useSites();
  const [createdSite, setCreatedSite] = useState<Site | null>(null);
  const [step, setStep] = useState<OnboardingStep>("loading");
  const [siteUrl, setSiteUrl] = useState("");
  const [openRouterKey, setOpenRouterKey] = useState("");
  const [keyError, setKeyError] = useState("");
  const [topic, setTopic] = useState("");
  const [customTopic, setCustomTopic] = useState("");
  const [generationError, setGenerationError] = useState("");
  const [result, setResult] = useState<FirstDraftResult | null>(null);

  const site = createdSite || activeSite || sites[0] || null;
  const digestQuery = useQuery({
    queryKey: ["control-plane-overview", site?.id],
    queryFn: () => api.get<WorkspaceDigest>(`/control-plane/overview?site_id=${encodeURIComponent(site!.id)}`),
    enabled: Boolean(site?.id),
    staleTime: 15_000,
  });
  const openRouter = useOpenRouterSetup({
    siteId: site?.id,
    checkSaved: Boolean(site?.id && digestQuery.data?.connections.generation.ready),
  });
  const generationReady = openRouter.verified;
  const modelsQuery = useQuery({
    queryKey: ["text-models"],
    queryFn: () => api.get<LiveTextModel[]>("/models/text"),
    enabled: Boolean(site && generationReady),
    staleTime: 60 * 60 * 1000,
  });
  const textModels = modelsQuery.data || [];
  const modelId = preferredTextModelId(textModels);
  const selectedModel = textModels.find((model) => model.id === modelId) || null;
  const topicOptions = useMemo(() => (site?.topics || []).filter(Boolean).slice(0, 3), [site?.topics]);
  const costEstimate = useMemo(() => estimateGenerationCost({
    postCount: 1,
    articleWordCount: 1200,
    textModel: selectedModel,
    imageConfig: ONBOARDING_IMAGE_CONFIG,
    imageDeliveryMode: "generate",
  }), [selectedModel]);

  const onJobComplete = async (terminal: JobTerminalResult) => {
    if (terminal.status === "failed" || !terminal.postIds[0]) {
      setGenerationError(terminal.error || "The draft could not be created. Your topic is still here, so you can retry.");
      setStep("generating");
      return;
    }
    try {
      const post = await api.get<FirstDraftPost>(`/posts/${terminal.postIds[0]}`);
      setResult({ post, totalCost: terminal.totalCost, createdAt: terminal.createdAt, completedAt: terminal.completedAt });
      setStep("success");
      await queryClient.invalidateQueries({ queryKey: ["control-plane-overview", site?.id] });
    } catch (error) {
      setGenerationError(errorMessage(error, "The draft was saved, but its preview could not be loaded. Open Runs to recover it."));
      setStep("generating");
    }
  };

  const { activeJobs, startJob, updateJob } = useJobTracker(onJobComplete);
  const activeJob = activeJobs[0] || null;

  useEffect(() => {
    if (!sitesLoading && !site && step === "loading") setStep("site");
  }, [site, sitesLoading, step]);

  useEffect(() => {
    if (sitesLoading || !site || !digestQuery.data || result) return;
    if (digestQuery.data.outcomes.drafts > 0 || digestQuery.data.recent_outputs.length > 0) {
      navigate("/", { replace: true });
      return;
    }
    if (step !== "loading") return;
    if (!digestQuery.data.connections.generation.ready || openRouter.savedKeyCheck.isError) {
      setStep("key");
      return;
    }
    if (openRouter.savedKeyCheck.isSuccess) setStep("topic");
  }, [digestQuery.data, navigate, openRouter.savedKeyCheck.isError, openRouter.savedKeyCheck.isSuccess, result, site, sitesLoading, step]);

  const submitSite = async (event: FormEvent) => {
    event.preventDefault();
    if (!siteUrl.trim()) {
      toast.error("Add a website URL to continue");
      return;
    }
    try {
      setStep("loading");
      const nextSite = await createSite({ url: normalizeHttpUrl(siteUrl) });
      setCreatedSite(nextSite);
      toast.success("Site connected");
    } catch (error) {
      setStep("site");
      toast.error(errorMessage(error, "Could not connect this site"));
    }
  };

  const submitOpenRouter = async (event: FormEvent) => {
    event.preventDefault();
    if (!openRouterKey.trim()) return;
    setKeyError("");
    try {
      await openRouter.saveAndVerify.mutateAsync(openRouterKey);
      setOpenRouterKey("");
      setStep("topic");
      toast.success("OpenRouter key saved and verified");
    } catch (error) {
      setKeyError(errorMessage(error, "The key could not be saved and verified."));
    }
  };

  const chooseTopic = (value: string) => {
    const next = value.trim();
    if (!next) return;
    setTopic(next);
    setGenerationError("");
    setStep("review");
  };

  const generateFirstDraft = async () => {
    if (!site || !topic || !modelId) return;
    setGenerationError("");
    setStep("generating");
    const trackId = startJob({ jobId: null, sourceType: "article_keyword", sourceLabel: topic, variations: 1 });
    try {
      const response = await api.post<{ jobId?: string; postIds?: string[]; error?: string }>("/content/generate", {
        sourceType: "article_keyword",
        sourceValue: topic,
        personaId: null,
        modelId,
        variations: 1,
        articleWordCount: 1200,
        enableResearch: false,
        generateImages: false,
        siteId: site.id,
      });
      if (response.error) throw new Error(response.error);
      if (response.postIds?.[0]) {
        await onJobComplete({ jobId: response.jobId || "", status: "completed", postIds: response.postIds, totalCost: 0, createdAt: null, completedAt: null, error: "" });
      } else if (response.jobId) {
        updateJob(trackId, { jobId: response.jobId, step: "extracting", backendStep: "starting" });
      } else {
        throw new Error("The generation job did not start. Try again.");
      }
    } catch (error) {
      const message = errorMessage(error, "The draft could not be started. Your topic is still here, so you can retry.");
      setGenerationError(message);
      updateJob(trackId, { step: "error", error: message });
    }
  };

  const currentIndex = activeStepIndex(step);

  return (
    <WorkspaceBackground className="min-h-screen px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-6 flex flex-col gap-5 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
          <FactoryMark />
          <ol className="grid grid-cols-4 gap-1" aria-label="Onboarding progress">
            {STEP_META.map((item, index) => {
              const Icon = item.icon;
              const complete = index < currentIndex || step === "success";
              const active = index === currentIndex && step !== "success";
              return <li key={item.label} className="min-w-0">
                <div aria-current={active ? "step" : undefined} aria-label={`${item.label}${complete ? ", complete" : active ? ", current step" : ""}`} className={cn("flex min-w-9 items-center justify-center gap-2 rounded-sm border px-2 py-2 text-xs sm:min-w-0 sm:justify-start", complete ? "border-emerald-200 bg-emerald-50 text-emerald-800" : active ? "border-byword-blue/30 bg-byword-blue-soft text-byword-blue" : "border-byword-border bg-card text-muted-foreground")}>
                  {complete ? <Check className="h-3.5 w-3.5 shrink-0" /> : <Icon className="h-3.5 w-3.5 shrink-0" />}
                  <span className="hidden truncate sm:inline">{item.label}</span>
                </div>
              </li>;
            })}
          </ol>
        </header>

        {step === "site" && (
          <BywordCard className="mx-auto max-w-xl overflow-hidden p-6 sm:p-8">
            <FactoryDivider className="-mx-8 -mt-8 mb-8 w-[calc(100%+4rem)]" />
            <div className="mb-8 text-center">
              <IconTile icon={Globe2} className="mx-auto h-12 w-12" />
              <p className="type-kicker mt-5 text-byword-blue">Step 1 · Your site</p>
              <h1 className="mt-2 text-2xl font-semibold">What site are we writing for?</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">We only ask for information the product uses. BlogFactory reads the homepage and sitemap to find useful starting topics.</p>
            </div>
            <form onSubmit={submitSite} className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="site-url">Website</label>
                <InputAffordance id="site-url" type="text" inputMode="url" prefix="https://" icon={Globe2} value={siteUrl} onChange={(event) => setSiteUrl(stripHttpProtocol(event.target.value))} className="h-12 text-base" placeholder="example.com" help="Paste a homepage URL or type the domain." onClear={() => setSiteUrl("")} clearLabel="Clear site URL" />
              </div>
              <Button className="h-12 w-full" type="submit" disabled={isCreating || !siteUrl.trim()}>Connect site <ArrowRight className="ml-2 h-4 w-4" /></Button>
            </form>
          </BywordCard>
        )}

        {step === "loading" && (
          <BywordCard className="mx-auto max-w-2xl overflow-hidden">
            <div className="border-b border-byword-border p-7 text-center sm:p-9">
              <IconTile icon={Globe2} className="mx-auto h-14 w-14" />
              <h1 className="mt-6 text-2xl font-semibold">Understanding {site?.domain || siteUrl || "your site"}</h1>
              <p className="mt-2 text-sm text-muted-foreground">The server is checking the real site now. Large sitemaps can take longer.</p>
            </div>
            {digestQuery.error ? <div className="p-6 text-sm" role="alert"><p className="font-semibold text-destructive">Workspace readiness could not be loaded.</p><p className="mt-1 text-muted-foreground">Your site is still saved. Retry the check or leave safely and return later.</p><div className="mt-4 flex flex-wrap gap-2"><Button type="button" size="sm" onClick={() => digestQuery.refetch()}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Retry check</Button><Button asChild variant="outline" size="sm"><Link to="/">Exit safely</Link></Button></div></div> : <div className="grid gap-px bg-byword-border sm:grid-cols-3" role="status">
              {["Find homepage and sitemap", "Build the page index", "Extract topics and language"].map((label) => <div key={label} className="flex items-center gap-3 bg-card p-5 text-sm"><Loader2 className="h-4 w-4 shrink-0 animate-spin text-byword-blue" />{label}</div>)}
            </div>}
          </BywordCard>
        )}

        {step === "key" && site && (
          <BywordCard className="mx-auto max-w-2xl overflow-hidden">
            <div className="border-b border-byword-border p-6 sm:p-8">
              <p className="type-kicker text-byword-blue">Step 2 · AI access</p>
              <h1 className="mt-2 text-2xl font-semibold">Add OpenRouter to create your first draft</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">The key belongs to your account, is stored encrypted, and is tested here. You will not be sent to Settings.</p>
            </div>
            <div className="space-y-6 p-6 sm:p-8">
              <SiteProof site={site} />
              <div className="rounded-md border border-byword-border bg-muted/25 p-4 text-sm leading-6">
                <p className="font-semibold">Need a key?</p>
                <p className="mt-1 text-muted-foreground">Create one in OpenRouter, then return to this tab and paste it below.</p>
                <Button asChild variant="outline" size="sm" className="mt-3"><a href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer">Open OpenRouter keys <ExternalLink className="ml-1.5 h-3.5 w-3.5" /></a></Button>
              </div>
              <form onSubmit={submitOpenRouter} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="onboarding-openrouter-key" className="text-sm font-medium">OpenRouter API key</label>
                  <Input id="onboarding-openrouter-key" type="password" value={openRouterKey} onChange={(event) => setOpenRouterKey(event.target.value)} placeholder="sk-or-…" autoComplete="off" spellCheck={false} autoFocus />
                </div>
                {(keyError || openRouter.savedKeyCheck.error) && <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive" role="alert"><p className="font-semibold">The key did not pass verification.</p><p className="mt-1">{keyError || errorMessage(openRouter.savedKeyCheck.error, "The saved key is no longer accepted by OpenRouter.")}</p><p className="mt-2">Check that the full key was copied, replace it above, and try again.</p></div>}
                <Button type="submit" className="h-11" disabled={!openRouterKey.trim() || openRouter.saveAndVerify.isPending}>{openRouter.saveAndVerify.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}Save, test, and continue</Button>
              </form>
            </div>
          </BywordCard>
        )}

        {step === "topic" && site && (
          <BywordCard className="mx-auto max-w-3xl overflow-hidden">
            <div className="border-b border-byword-border p-6 sm:p-8">
              <p className="type-kicker text-byword-blue">Step 3 · First topic</p>
              <h1 className="mt-2 text-2xl font-semibold">Choose your first topic</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">These topics came from {site.domain}. Pick one or write your own—advanced controls can wait until after the first draft.</p>
            </div>
            <div className="space-y-6 p-6 sm:p-8">
              <SiteProof site={site} />
              {!topicOptions.length && <div className={cn("rounded-md border p-4 text-sm leading-6", site.indexingError ? "border-amber-200 bg-amber-50 text-amber-950" : "border-byword-border bg-muted/25 text-foreground")} role="status">
                <p className="font-semibold">{site.indexingError ? "The site is connected, but its sitemap could not be read." : "No reliable site topics were found yet."}</p>
                <p className="mt-1 text-muted-foreground">Write the first topic below. You can refresh the site index later from Control → Sites.</p>
              </div>}
              {topicOptions.length > 0 && <div className="grid gap-3 sm:grid-cols-3">{topicOptions.map((option, index) => <button key={option} type="button" onClick={() => chooseTopic(option)} className="group rounded-md border border-byword-border bg-card p-4 text-left outline-none transition-calm hover:border-byword-blue/45 hover:bg-byword-blue-soft/35 focus-visible:ring-2 focus-visible:ring-ring"><span className="type-kicker text-muted-foreground">{index === 0 ? "Suggested start" : `Site topic ${index + 1}`}</span><span className="mt-3 block text-base font-semibold capitalize group-hover:text-byword-blue">{option}</span><ArrowRight className="mt-4 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></button>)}</div>}
              <form className="rounded-md border border-byword-border bg-muted/20 p-4" onSubmit={(event) => { event.preventDefault(); chooseTopic(customTopic); }}>
                <label htmlFor="first-draft-topic" className="text-sm font-medium">{topicOptions.length ? "Or write your own topic" : "What should the first draft cover?"}</label>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Input id="first-draft-topic" value={customTopic} onChange={(event) => setCustomTopic(event.target.value)} placeholder="e.g. A practical guide to contract automation" autoFocus={!topicOptions.length} />
                  <Button type="submit" disabled={!customTopic.trim()}>Use this topic <ArrowRight className="ml-1.5 h-4 w-4" /></Button>
                </div>
              </form>
            </div>
          </BywordCard>
        )}

        {step === "review" && site && (
          <BywordCard className="mx-auto max-w-2xl overflow-hidden">
            <div className="border-b border-byword-border p-6 sm:p-8">
              <p className="type-kicker text-byword-blue">Step 4 · First draft</p>
              <h1 className="mt-2 text-2xl font-semibold">One clear decision before we write</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">BlogFactory picked the writing defaults. You can change models, images, voice, and research after you have seen the first result.</p>
            </div>
            <div className="space-y-5 p-6 sm:p-8">
              <div className="rounded-md border border-byword-border bg-muted/20 p-5"><p className="type-kicker text-muted-foreground">Topic</p><p className="mt-2 text-lg font-semibold">{topic}</p><p className="mt-2 text-sm text-muted-foreground">{site.domain}</p></div>
              {modelsQuery.isLoading && <div className="flex items-center gap-3 rounded-md border border-byword-border p-4 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin text-byword-blue" />Loading the live OpenRouter model catalog…</div>}
              {modelsQuery.error && <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm" role="alert"><p className="font-semibold text-destructive">The model catalog could not be loaded.</p><p className="mt-1 text-muted-foreground">Your key may have changed or OpenRouter may be temporarily unavailable. Nothing has been charged.</p><div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={() => modelsQuery.refetch()}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Retry catalog</Button><Button type="button" variant="ghost" size="sm" onClick={() => setStep("key")}>Check key</Button></div></div>}
              {selectedModel && <div className="rounded-md border border-byword-border p-5">
                <div className="flex items-start justify-between gap-4"><div><p className="font-semibold">Projected cost</p><p className="mt-1 text-sm text-muted-foreground">1,200 words · text only · one draft</p></div><p className="text-xl font-semibold tabular-nums">{formatCost(costEstimate.totalExpected)}</p></div>
                <div className="mt-4 grid gap-2 border-t border-byword-border pt-4 text-xs text-muted-foreground sm:grid-cols-3"><span>{selectedModel.name}</span><span>No image generation</span><span>Saved as draft</span></div>
              </div>}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <Button type="button" variant="ghost" onClick={() => setStep("topic")}><ArrowLeft className="mr-1.5 h-4 w-4" />Change topic</Button>
                <Button type="button" className="h-11" onClick={generateFirstDraft} disabled={!selectedModel}><Sparkles className="mr-2 h-4 w-4" />Create first draft · {formatCost(costEstimate.totalExpected)}</Button>
              </div>
              <p className="text-center text-xs text-muted-foreground">Charged directly by OpenRouter. BlogFactory keeps the result as a draft for review.</p>
            </div>
          </BywordCard>
        )}

        {step === "generating" && site && (
          <BywordCard className="mx-auto max-w-2xl overflow-hidden">
            <div className="border-b border-byword-border p-6 text-center sm:p-8">
              <IconTile icon={Sparkles} className="mx-auto h-14 w-14" />
              <h1 className="mt-5 text-2xl font-semibold">Creating your first draft</h1>
              <p className="mt-2 text-sm text-muted-foreground">{topic} · {site.domain}</p>
            </div>
            <div className="space-y-6 p-6 sm:p-8">
              <FirstDraftProgress job={activeJob} failed={Boolean(generationError)} />
              {generationError && <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm" role="alert"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" /><div><p className="font-semibold text-destructive">The draft was not completed.</p><p className="mt-1 text-muted-foreground">{generationError}</p></div></div><div className="mt-4 flex flex-wrap gap-2"><Button type="button" size="sm" onClick={generateFirstDraft}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Retry same topic</Button><Button asChild variant="outline" size="sm"><Link to="/runs">Open Runs</Link></Button><Button asChild variant="ghost" size="sm"><Link to="/">Exit safely</Link></Button></div></div>}
              {!generationError && <p className="text-center text-xs text-muted-foreground">Keep this tab open. If you leave, the job continues and remains available in Runs.</p>}
            </div>
          </BywordCard>
        )}

        {step === "success" && site && result && (
          <BywordCard className="mx-auto max-w-3xl overflow-hidden">
            <FactoryDivider />
            <div className="p-6 sm:p-8">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-4"><IconTile icon={CheckCircle2} className="h-12 w-12 border-emerald-200 bg-emerald-50 text-emerald-700" /><div><p className="type-kicker text-emerald-700">First value reached</p><h1 className="mt-1 text-2xl font-semibold">Your first draft is ready</h1><p className="mt-2 text-sm text-muted-foreground">You can review and edit it before anything leaves BlogFactory.</p></div></div>
                <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-mono text-[10px] font-semibold uppercase text-emerald-800"><ShieldCheck className="h-3.5 w-3.5" />Draft only</span>
              </div>
              <div className="mt-7 rounded-md border border-byword-border bg-muted/20 p-5 sm:p-6">
                <p className="type-kicker text-muted-foreground">Saved for {site.domain}</p>
                <h2 className="mt-3 text-2xl font-semibold leading-tight">{result.post.title}</h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{firstDraftExcerpt(result.post)}</p>
                <div className="mt-5 grid gap-3 border-t border-byword-border pt-5 sm:grid-cols-3"><ResultMetric icon={CircleDollarSign} label="Actual cost" value={formatCost(result.totalCost)} /><ResultMetric icon={Sparkles} label="Generation time" value={elapsedSeconds(result.createdAt, result.completedAt) == null ? "Completed" : `${elapsedSeconds(result.createdAt, result.completedAt)} seconds`} /><ResultMetric icon={FileText} label="Status" value="Review draft" /></div>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <Button asChild className="h-11"><Link to={`/library/posts/${result.post.id}/preview`}>Review draft <ArrowRight className="ml-1.5 h-4 w-4" /></Link></Button>
                <Button asChild variant="outline" className="h-11"><Link to={`/control/integrations?from=first-draft&siteId=${encodeURIComponent(site.id)}`}>{digestQuery.data?.connections.cms.connected ? "Manage CMS draft delivery" : "Set up CMS draft delivery"} <ArrowRight className="ml-1.5 h-4 w-4" /></Link></Button>
              </div>
              <div className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm"><Link className="text-byword-blue hover:underline" to="/create">Create another</Link><Link className="text-muted-foreground hover:text-foreground hover:underline" to="/control/brand-voice?from=first-draft">Make it sound like my brand</Link><Link className="text-muted-foreground hover:text-foreground hover:underline" to="/">Go to Overview</Link></div>
            </div>
          </BywordCard>
        )}
      </div>
    </WorkspaceBackground>
  );
}

function SiteProof({ site }: { site: Site }) {
  return <div className="flex flex-col gap-4 rounded-md border border-byword-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-center gap-3"><IconTile icon={Globe2} className="h-9 w-9" /><div className="min-w-0"><p className="truncate font-semibold">{site.name}</p><p className="truncate text-xs text-muted-foreground">{site.domain}</p></div></div><div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground"><span><strong className="block text-sm text-foreground">{site.pageCount}</strong>pages</span><span><strong className="block text-sm text-foreground">{site.topics.length}</strong>topics</span><span><strong className="block text-sm uppercase text-foreground">{site.language || "auto"}</strong>language</span></div></div>;
}

function onboardingPhase(job: TrackedJob | null) {
  const value = job?.backendStep || "starting";
  if (/completed_post|saving|final/i.test(value)) return 3;
  if (/repair|validat|check|resolving/i.test(value)) return 2;
  if (/generating|writing/i.test(value)) return 1;
  return 0;
}

function FirstDraftProgress({ job, failed }: { job: TrackedJob | null; failed: boolean }) {
  const current = onboardingPhase(job);
  const phases = ["Planning from your topic and site", "Writing the article", "Checking structure and output", "Saving the draft"];
  return <div className="space-y-3" aria-label="First draft progress">{phases.map((label, index) => { const complete = !failed && (job?.step === "complete" || index < current); const active = !failed && job?.step !== "complete" && index === current; return <div key={label} className={cn("flex items-center gap-3 rounded-md border px-4 py-3 text-sm", complete ? "border-emerald-200 bg-emerald-50 text-emerald-900" : active ? "border-byword-blue/30 bg-byword-blue-soft" : "border-byword-border text-muted-foreground")}>
    {complete ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" /> : active ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-byword-blue" /> : <span className="h-4 w-4 shrink-0 rounded-full border border-byword-border" />}
    <span>{label}</span>
  </div>; })}</div>;
}

function ResultMetric({ icon: Icon, label, value }: { icon: typeof FileText; label: string; value: string }) {
  return <div className="flex items-start gap-3"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-byword-blue" /><div><p className="type-kicker text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div></div>;
}
