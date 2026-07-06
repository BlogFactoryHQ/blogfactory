import { FileText, Rss, Link as LinkIcon, FileUp, Youtube, Trash2, Check, Megaphone, ImageIcon } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import {
  TableCell,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { safeFormatDate } from "@/lib/date-format";

const sourceIcons: Record<string, typeof FileText> = {
  article_keyword: FileText,
  article_title: FileText,
  rss_feed: Rss,
  url: LinkIcon,
  pdf: FileUp,
  raw_text: FileText,
  youtube: Youtube,
  manual: FileText,
  campaign: Megaphone,
};

interface Post {
  id: string;
  title: string;
  content: string;
  status: string;
  source_type: string;
  source_ref_id: string | null;
  campaign_id: string | null;
  campaign_item_id: string | null;
  persona_id: string | null;
  model_id: string;
  job_id: string | null;
  created_at: string;
  cover_image_url: string | null;
  inline_images: string[] | null;
  personas?: { name: string } | null;
  feeds?: { name: string } | null;
  campaigns?: { name: string } | null;
}

interface PostTableRowProps {
  post: Post;
  isSelected: boolean;
  onSelect: (checked: boolean) => void;
  onClick: () => void;
  onQuickPublish: (e: React.MouseEvent) => void;
  onQuickDelete: (e: React.MouseEvent) => void;
  onOpenImagePrompts: (e: React.MouseEvent) => void;
  formatModelName: (modelId: string) => string;
  className?: string;
  displayTitle?: string;
  titlePrefix?: string;
}

export function PostTableRow({
  post,
  isSelected,
  onSelect,
  onClick,
  onQuickPublish,
  onQuickDelete,
  onOpenImagePrompts,
  formatModelName,
  className,
  displayTitle,
  titlePrefix,
}: PostTableRowProps) {
  const SourceIcon = sourceIcons[post.source_type] || FileText;

  return (
    <TableRow
      className={cn(
        "table-row-calm cursor-pointer group",
        isSelected && "bg-primary/5",
        className
      )}
      onClick={onClick}
      title="Edit post"
    >
      <TableCell className="w-12" onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={isSelected}
          onCheckedChange={onSelect}
          aria-label={`Select ${post.title}`}
        />
      </TableCell>
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
          {titlePrefix && <span className="text-xs font-semibold text-muted-foreground">{titlePrefix}</span>}
          <span>{displayTitle || post.title}</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <SourceIcon className="h-4 w-4 flex-shrink-0" />
            <span className="capitalize text-sm">{post.source_type?.replace("_", " ")}</span>
          </div>
          {post.feeds?.name && (
            <span className="text-xs text-muted-foreground/70 truncate max-w-[150px]" title={post.feeds.name}>
              {post.feeds.name}
            </span>
          )}
          {post.campaigns?.name && (
            <span className="text-xs text-muted-foreground/70 truncate max-w-[150px]" title={post.campaigns.name}>
              {post.campaigns.name}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell>{post.personas?.name || "—"}</TableCell>
      <TableCell>
        <span className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
          {formatModelName(post.model_id)}
        </span>
      </TableCell>
      <TableCell>
        <StatusBadge
          status={post.status === "published" ? "success" : "draft"}
          label={post.status === "published" ? "Published" : "Draft"}
          showIcon={false}
        />
      </TableCell>
      <TableCell className="text-muted-foreground">
        {safeFormatDate(post.created_at, "MMM d, yyyy")}
      </TableCell>
      <TableCell className="w-32">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-primary"
            onClick={onOpenImagePrompts}
            title="Image prompts"
          >
            <ImageIcon className="h-4 w-4" />
          </Button>
          {post.status !== "published" && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-primary"
              onClick={onQuickPublish}
              title="Quick publish"
            >
              <Check className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={onQuickDelete}
            title="Quick delete"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
