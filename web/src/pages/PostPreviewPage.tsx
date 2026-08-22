import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Eye, Loader2, Pencil } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Link, useParams } from "react-router-dom";
import { BywordCard, FactoryMark, WorkspaceBackground } from "@/components/layout/BywordSurface";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { resolveImagePath } from "@/hooks/useSignedUrl";
import type { PostRevision } from "@/components/posts/EditorialSafetyPanel";

type PreviewPost = {
  id: string;
  title: string;
  content: string;
  summary: string | null;
  cover_image_url: string | null;
  site_name?: string | null;
  editorial_state: string;
  current_revision: PostRevision | null;
};

export default function PostPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const { data: post, isLoading, error } = useQuery({
    queryKey: ["post", id],
    queryFn: () => api.get<PreviewPost>(`/posts/${id}`),
    enabled: Boolean(id),
  });

  if (isLoading) return <WorkspaceBackground className="flex min-h-screen items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></WorkspaceBackground>;
  if (error || !post) return <WorkspaceBackground className="flex min-h-screen flex-col items-center justify-center gap-4"><p className="text-muted-foreground">Preview not available.</p><Button asChild variant="outline"><Link to="/library/content"><ArrowLeft className="mr-2 h-4 w-4" />Back to content</Link></Button></WorkspaceBackground>;

  return (
    <WorkspaceBackground className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-byword-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3"><FactoryMark /><span className="hidden h-6 w-px bg-border sm:block" /><span className="section-label">Saved preview</span></div>
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline"><Link to={`/library/posts/${post.id}/edit`}><Pencil className="mr-1.5 h-4 w-4" />Back to editor</Link></Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:py-10">
        <div className="mb-5 flex gap-3 rounded-sm border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950" role="note">
          <Eye className="mt-0.5 h-4 w-4 shrink-0" />
          <p>This is BlogFactory’s editorial rendering of the last saved revision. Use the CMS preview for the destination site’s exact theme and layout.</p>
        </div>
        <BywordCard>
          <div className="border-b border-byword-border px-5 py-8 sm:px-10 sm:py-12">
            <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] uppercase text-muted-foreground">
              <span>{post.site_name || "BlogFactory"}</span>
              <span>{post.current_revision ? `Revision ${post.current_revision.revision_number}` : "Saved draft"}</span>
              <span>{post.editorial_state.replace("_", " ")}</span>
            </div>
            <h1 className="mt-4 max-w-4xl text-3xl font-semibold leading-tight text-foreground sm:text-5xl">{post.title}</h1>
            {post.summary && <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">{post.summary}</p>}
          </div>
          {post.cover_image_url && <div className="border-b border-byword-border bg-muted/20 p-4 sm:p-6"><img src={resolveImagePath(post.cover_image_url) || post.cover_image_url} alt="" className="mx-auto max-h-[34rem] w-full rounded-sm object-cover" /></div>}
          <article className="type-editorial prose prose-base mx-auto max-w-3xl px-5 py-8 prose-headings:font-semibold prose-p:leading-8 prose-img:rounded-sm sm:px-10 sm:py-12">
            <ReactMarkdown
              skipHtml={true}
              disallowedElements={["script", "iframe", "object", "embed", "form", "input", "button"]}
              unwrapDisallowed={true}
              components={{ img: ({ src, alt }) => <img src={resolveImagePath(src) || src || ""} alt={alt || ""} /> }}
            >
              {post.content}
            </ReactMarkdown>
          </article>
        </BywordCard>
      </main>
    </WorkspaceBackground>
  );
}
