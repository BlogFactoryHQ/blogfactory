import { useQuery } from "@tanstack/react-query";

import { useSites } from "@/hooks/useSites";
import { api } from "@/lib/api";
import type { WorkspaceDigest } from "@/lib/control-plane";
import type { WorkspaceSetupStep } from "@/components/setup/WorkspaceSetupGuide";

export type ReadinessStep = {
  step: WorkspaceSetupStep;
  label: string;
  description: string;
  done: boolean;
  /** Required steps gate real work; optional steps add capability. */
  required: boolean;
  /** Set when a saved credential exists but cannot be used. */
  broken?: boolean;
};

export type WorkspaceReadiness = {
  steps: ReadinessStep[];
  completed: number;
  total: number;
  percent: number;
  nextStep: ReadinessStep | null;
  complete: boolean;
  isLoading: boolean;
  digest: WorkspaceDigest | undefined;
  /** Stable signature of the current readiness, used for dismissal state. */
  fingerprint: string;
};

/**
 * Single source of truth for "is this workspace set up?".
 *
 * Reads the same workspace digest (and React Query cache entry) as Overview,
 * so the sidebar checklist and the Overview readiness card see the same data.
 * It adds no new endpoint.
 */
export function useWorkspaceReadiness(): WorkspaceReadiness {
  const { activeSite } = useSites();
  const { data, isLoading } = useQuery({
    queryKey: ["control-plane-overview", activeSite?.id],
    queryFn: () => api.get<WorkspaceDigest>(`/control-plane/overview?site_id=${encodeURIComponent(activeSite!.id)}`),
    enabled: Boolean(activeSite?.id),
    staleTime: 30_000,
  });

  const generation = data?.connections.generation;
  const hasFirstDraft = Boolean(data && (data.outcomes.drafts > 0 || data.recent_outputs.length > 0));

  const steps: ReadinessStep[] = [
    {
      step: "site",
      label: "Connect a site",
      description: "The domain every draft is written for.",
      done: Boolean(activeSite),
      required: true,
    },
    {
      step: "generation",
      label: "Add AI access",
      description: "An OpenRouter key, stored encrypted per site.",
      done: Boolean(generation?.ready),
      required: true,
      broken: generation?.credential_status === "undecryptable",
    },
    {
      step: "create",
      label: "Create the first draft",
      description: "See a real article before changing any setting.",
      done: hasFirstDraft,
      required: true,
    },
    {
      step: "cms",
      label: "Connect a CMS",
      description: "Where approved drafts are delivered.",
      done: Boolean(data && data.connections.cms.connected > 0),
      required: false,
    },
    {
      step: "search-console",
      label: "Connect Search Console",
      description: "Real search evidence for growth work.",
      done: Boolean(data?.connections.search_console.connected),
      required: false,
    },
    {
      step: "mcp",
      label: "Connect an agent",
      description: "Give an MCP client site-scoped access.",
      done: Boolean(data && data.connections.active > 0),
      required: false,
    },
  ];

  const completed = steps.filter((item) => item.done).length;
  const total = steps.length;
  const broken = steps.find((item) => item.broken);
  const nextStep = broken || steps.find((item) => !item.done) || null;

  return {
    steps,
    completed,
    total,
    percent: total ? Math.round((completed / total) * 100) : 0,
    nextStep,
    complete: completed === total,
    isLoading: isLoading && Boolean(activeSite?.id),
    digest: data,
    fingerprint: steps.map((item) => `${item.step}:${item.done ? 1 : 0}${item.broken ? "!" : ""}`).join("|"),
  };
}
