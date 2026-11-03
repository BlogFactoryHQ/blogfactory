import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { BywordCard } from "@/components/layout/BywordSurface";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { InlineError } from "@/components/search-growth/shared";
import { api } from "@/lib/api";

interface Repurposed {
  xThread: string[];
  linkedin: string;
  newsletter: { subject: string; preheader: string; body: string };
  publishedUrl: string | null;
}

function CopyButton({ label, text }: { label: string; text: string }) {
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); toast.success(`${label} copied`); } catch { toast.error("Could not copy. Select the text and copy it by hand."); }
  };
  return <Button type="button" size="sm" variant="outline" onClick={copy}><Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />Copy<span className="sr-only"> {label}</span></Button>;
}

export function PostRepurposePanel({ postId, updatedAt }: { postId: string; updatedAt: string }) {
  const [open, setOpen] = useState(false);
  // Only fetched once the panel is opened; updatedAt re-runs it after each saved revision.
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["post-repurpose", postId, updatedAt],
    queryFn: () => api.get<Repurposed>(`/product-seo/posts/${postId}/repurpose`),
    enabled: open,
    staleTime: 60_000,
  });

  return (
    <BywordCard className="mb-6">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 rounded-sm p-4 text-left transition-calm hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset sm:p-5">
          <span className="min-w-0">
            <span className="type-object-title block">Repurpose</span>
            <span className="type-body mt-0.5 block">X thread, LinkedIn post and newsletter blurb from the saved version. Built from your text, no AI cost.</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-5 border-t border-byword-border p-4 text-sm sm:p-5">
          {isLoading && <p role="status" className="type-body flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Building copy</p>}
          {isError && <InlineError message="The copy could not be built." onRetry={() => refetch()} />}
          {data && (
            <>
              {!data.publishedUrl && <p className="type-meta">No published link yet, so links use a placeholder. Run this again after publishing.</p>}
              <section aria-labelledby="repurpose-x" className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2"><h3 id="repurpose-x" className="type-object-title">X thread · {data.xThread.length} posts</h3><CopyButton label="X thread" text={data.xThread.join("\n\n")} /></div>
                <ol className="space-y-1.5">{data.xThread.map((tweet, index) => <li key={index} className="rounded-sm border border-byword-border p-2">{tweet} <span className="type-meta">{tweet.length}/280</span></li>)}</ol>
              </section>
              <section aria-labelledby="repurpose-linkedin" className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2"><h3 id="repurpose-linkedin" className="type-object-title">LinkedIn post</h3><CopyButton label="LinkedIn post" text={data.linkedin} /></div>
                <div className="whitespace-pre-wrap rounded-sm border border-byword-border p-3">{data.linkedin}</div>
              </section>
              <section aria-labelledby="repurpose-newsletter" className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2"><h3 id="repurpose-newsletter" className="type-object-title">Newsletter</h3><CopyButton label="newsletter" text={`Subject: ${data.newsletter.subject}\nPreheader: ${data.newsletter.preheader}\n\n${data.newsletter.body}`} /></div>
                <p><span className="font-medium">Subject:</span> {data.newsletter.subject}</p>
                <p><span className="font-medium">Preheader:</span> {data.newsletter.preheader}</p>
                <div className="whitespace-pre-wrap rounded-sm border border-byword-border p-3">{data.newsletter.body}</div>
              </section>
            </>
          )}
        </CollapsibleContent>
      </Collapsible>
    </BywordCard>
  );
}
