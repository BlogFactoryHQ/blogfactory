import { evaluateSeoQa } from "./generation-output.js";
import type { GenerationSettings } from "./generation-types.js";

export type ScorecardCheck = {
  label: string;
  ok: boolean | null;
  detail: string;
};

export type RevisionScore = {
  revision_id: string;
  revision_number: number;
  created_at: string;
  score: number;
  passed: number;
  total: number;
  checks: ScorecardCheck[];
};

export type ScoredRevisionInput = {
  id: string;
  revisionNumber: number;
  createdAt: Date | string;
  content: string;
};

/**
 * Runs the same SEO QA evaluation generation uses, once per saved revision, so the
 * revision history can show how a draft's measurable quality moved rather than only
 * how many lines changed. The evaluation is a pure function of the snapshot content,
 * so re-scoring an old revision reproduces the score it would have had.
 */
export function scoreRevisions(
  revisions: ScoredRevisionInput[],
  opts: { keyword?: string; settings?: GenerationSettings; articleType?: string } = {},
): RevisionScore[] {
  return revisions.map((revision) => {
    const qa = evaluateSeoQa(revision.content || "", opts);
    const createdAt = revision.createdAt instanceof Date
      ? revision.createdAt.toISOString()
      : new Date(revision.createdAt).toISOString();
    return {
      revision_id: revision.id,
      revision_number: revision.revisionNumber,
      created_at: createdAt,
      score: qa.score,
      passed: qa.passed,
      total: qa.total,
      checks: qa.checks,
    };
  });
}
