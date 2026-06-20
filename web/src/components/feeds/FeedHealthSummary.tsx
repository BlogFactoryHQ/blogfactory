import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Clock, BarChart3 } from "lucide-react";
import type { PreviewFeedItem } from "./FeedPreviewItem";

interface FeedHealthSummaryProps {
  items: PreviewFeedItem[];
  fetchedAt: Date | null;
  platform: string;
}

export function FeedHealthSummary({ items, fetchedAt, platform }: FeedHealthSummaryProps) {
  const total = items.length;
  const newCount = items.filter((i) => i.status === "new").length;
  const dupCount = items.filter((i) => i.status === "duplicate").length;
  const filteredCount = items.filter((i) => i.status === "filtered").length;
  const eligible = newCount; // new items are eligible for generation

  const warnings: string[] = [];
  if (total > 0 && dupCount > total * 0.7) {
    warnings.push("Most items are duplicates — consider a different source or clear old posts");
  }
  if (total === 0) {
    warnings.push("No items returned — check your feed URL or platform config");
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
      {/* Stats row */}
      <div className="flex items-center gap-4 flex-wrap text-xs">
        <div className="flex items-center gap-1.5">
          <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-medium">{total} fetched</span>
        </div>
        {newCount > 0 && (
          <Badge variant="outline" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-xs">
            {newCount} new
          </Badge>
        )}
        {dupCount > 0 && (
          <Badge variant="outline" className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 text-xs">
            {dupCount} duplicate
          </Badge>
        )}
        {filteredCount > 0 && (
          <Badge variant="outline" className="text-xs">
            {filteredCount} filtered
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-1.5 text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          <span>{eligible} eligible for generation</span>
        </div>
      </div>

      {/* Last fetch */}
      {fetchedAt && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          Fetched at {fetchedAt.toLocaleTimeString()}
        </div>
      )}

      {/* Warnings */}
      {warnings.map((w, i) => (
        <div key={i} className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <span>{w}</span>
        </div>
      ))}
    </div>
  );
}
