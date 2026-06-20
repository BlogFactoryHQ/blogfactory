import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  Check,
  FileStack,
  Globe2,
  Loader2,
  Sparkles,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useSites, type Site } from "@/hooks/useSites";
import { BywordCard, IconTile, WorkspaceBackground } from "@/components/layout/BywordSurface";

const profileTypes = [
  { id: "agency", label: "Agency", icon: Building2 },
  { id: "brand", label: "Brand", icon: FileStack },
  { id: "freelancer", label: "Freelancer", icon: User },
  { id: "other", label: "Other", icon: Sparkles },
];

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

function SiteSummary({ site }: { site: Site }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4 rounded-lg border border-byword-border bg-muted/30 p-4">
        <IconTile icon={Globe2} />
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-foreground">{site.name}</p>
          <p className="truncate text-sm text-muted-foreground">{site.domain}</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-byword-border p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Pages</p>
          <p className="mt-2 text-2xl font-semibold">{site.pageCount}</p>
        </div>
        <div className="rounded-lg border border-byword-border p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Topics</p>
          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
            {site.topics.length ? site.topics.slice(0, 4).join(", ") : "Ready to learn"}
          </p>
        </div>
        <div className="rounded-lg border border-byword-border p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Vectors</p>
          <p className="mt-2 text-2xl font-semibold">{site.vectorCount}</p>
        </div>
        <div className="rounded-lg border border-byword-border p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Language</p>
          <p className="mt-2 text-2xl font-semibold">{site.language || "auto"}</p>
        </div>
      </div>
    </div>
  );
}

export default function Onboarding() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { createSite, isCreating } = useSites();
  const [firstName, setFirstName] = useState(user?.displayName?.split(" ")[0] || user?.email?.split("@")[0] || "");
  const [profileType, setProfileType] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [createdSite, setCreatedSite] = useState<Site | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!siteUrl.trim()) {
      toast.error("Add a website URL to continue");
      return;
    }

    try {
      const site = await createSite({ url: siteUrl.trim() });
      setCreatedSite(site);
      toast.success("Workspace ready");
    } catch (err: unknown) {
      toast.error(errorMessage(err, "Could not connect this site"));
    }
  };

  return (
    <WorkspaceBackground className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-2xl">
        {!isCreating && !createdSite && (
          <>
            <BywordCard className="mx-auto max-w-xl p-8">
              <div className="mb-8 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg bg-byword-blue-soft text-byword-blue">
                  <span className="text-sm font-bold">BF</span>
                </div>
                <h1 className="mt-6 text-2xl font-semibold">Welcome to BlogFactory</h1>
                <p className="mt-2 text-sm text-byword-blue">Hi, {firstName || "there"}!</p>
              </div>

              <form onSubmit={submit} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground" htmlFor="first-name">First name</label>
                  <Input
                    id="first-name"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    className="h-12 text-base"
                    placeholder="Bora"
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">I am...</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {profileTypes.map((type) => (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => setProfileType(type.id)}
                        className={cn(
                          "flex h-14 items-center gap-3 rounded-lg border px-4 text-left transition-calm",
                          profileType === type.id
                            ? "border-byword-blue bg-byword-blue-soft text-byword-blue"
                            : "border-byword-border bg-card hover:border-byword-blue/40"
                        )}
                      >
                        <IconTile icon={type.icon} className="h-8 w-8" />
                        <span className="font-semibold">{type.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground" htmlFor="site-url">Connect your first site</label>
                  <div className="relative">
                    <Globe2 className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="site-url"
                      value={siteUrl}
                      onChange={(event) => setSiteUrl(event.target.value)}
                      className="h-12 pl-11 text-base"
                      placeholder="ortakalan.io"
                    />
                  </div>
                </div>

                <Button className="h-12 w-full" type="submit" disabled={isCreating || !siteUrl.trim()}>
                  Continue to BlogFactory
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </form>
            </BywordCard>
          </>
        )}

        {isCreating && (
          <BywordCard className="mx-auto max-w-2xl overflow-hidden">
            <div className="border-b border-byword-border p-8 text-center">
              <IconTile icon={Globe2} className="mx-auto h-14 w-14" />
              <h1 className="mt-6 text-2xl font-semibold">Setting up {siteUrl || "your site"}</h1>
              <p className="mt-2 text-muted-foreground">Usually takes about 15 seconds</p>
            </div>
            <div className="space-y-6 p-8">
              {[
                { label: "Reading homepage", done: true },
                { label: "Finding pages", done: true },
                { label: "Analyzing site", done: false },
                { label: "Preparing suggestions", done: false },
              ].map((step) => (
                <div key={step.label} className={cn("flex items-center gap-5 text-lg", step.done ? "text-foreground" : "text-muted-foreground/50")}>
                  {step.done ? <Check className="h-5 w-5 text-muted-foreground" /> : <Loader2 className="h-4 w-4 animate-spin" />}
                  {step.label}
                </div>
              ))}
            </div>
          </BywordCard>
        )}

        {!isCreating && createdSite && (
          <BywordCard className="mx-auto max-w-2xl p-8">
            <div className="mb-8 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <Check className="h-6 w-6 text-muted-foreground" />
              </div>
              <h1 className="mt-6 text-2xl font-semibold">Your workspace is ready</h1>
            </div>
            <SiteSummary site={createdSite} />
            <Button className="mt-8 h-12 w-full" onClick={() => navigate("/content-creator", { replace: true })}>
              Get Started
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <p className="mt-5 text-center text-sm text-muted-foreground">You can add unlimited sites from the workspace switcher.</p>
          </BywordCard>
        )}
      </div>
    </WorkspaceBackground>
  );
}
