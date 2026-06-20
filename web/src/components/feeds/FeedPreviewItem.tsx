import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ExternalLink,
  ArrowUp,
  MessageSquare,
  Clock,
  Eye,
  Image as ImageIcon,
  Video,
  FileText,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { stripHtml, wordCount, detectMedia } from "@/lib/html-utils";

export type ItemStatus = "new" | "duplicate" | "filtered";

export interface PreviewFeedItem {
  title: string;
  link: string;
  score?: number;
  comments?: number;
  author?: string;
  pubDate?: string;
  summary?: string;
  thumbnail?: string;
  content?: string;
  // Enhanced fields
  status?: ItemStatus;
  statusReason?: string;
  contentLength?: number;
  fullTextLength?: number;
}

interface FeedPreviewItemProps {
  item: PreviewFeedItem;
  index: number;
  showFullTextColumn: boolean;
}

export function FeedPreviewItem({ item, index, showFullTextColumn }: FeedPreviewItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const plainContent = stripHtml(item.summary || item.content || "");
  const words = wordCount(plainContent);
  const media = detectMedia(item.content || item.summary || "");

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(item.link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const statusBadge = () => {
    if (!item.status) return null;
    const config = {
      new: { label: "New", variant: "default" as const, className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" },
      duplicate: { label: "Duplicate", variant: "outline" as const, className: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30" },
      filtered: { label: "Filtered", variant: "outline" as const, className: "bg-muted text-muted-foreground border-border" },
    };
    const c = config[item.status];
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant={c.variant} className={`text-xs ${c.className}`}>
            {c.label}
          </Badge>
        </TooltipTrigger>
        {item.statusReason && (
          <TooltipContent side="top" className="max-w-[250px]">
            <p className="text-xs">{item.statusReason}</p>
          </TooltipContent>
        )}
      </Tooltip>
    );
  };

  return (
    <div className="p-4 rounded-lg border border-border hover:border-primary/40 transition-colors bg-card">
      <div className="flex items-start gap-3">
        {/* Thumbnail */}
        {item.thumbnail && (
          <div className="flex-shrink-0">
            <img
              src={item.thumbnail}
              alt=""
              className="w-24 h-16 object-cover rounded-md bg-muted"
            />
          </div>
        )}

        {/* Score (non-thumbnail) */}
        {item.score !== undefined && !item.thumbnail && (
          <div className="flex flex-col items-center text-muted-foreground min-w-[40px]">
            <ArrowUp className="h-4 w-4" />
            <span className="text-sm font-medium">{item.score.toLocaleString()}</span>
          </div>
        )}

        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-start gap-2">
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground hover:text-primary transition-colors line-clamp-2 flex items-start gap-1.5"
            >
              {item.title}
              <ExternalLink className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-muted-foreground" />
            </a>
            <div className="flex-shrink-0 flex items-center gap-1.5 ml-auto">
              {statusBadge()}
            </div>
          </div>

          {/* Clean content preview */}
          {plainContent && (
            <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">
              {plainContent}
            </p>
          )}

          {/* Expanded view */}
          {expanded && plainContent.length > 150 && (
            <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
              {plainContent}
            </p>
          )}

          {/* Metadata row */}
          <div className="flex items-center gap-3 mt-2.5 flex-wrap">
            {item.author && item.author !== "unknown" && (
              <span className="text-xs text-muted-foreground">by {item.author}</span>
            )}
            {item.score !== undefined && item.thumbnail && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Eye className="h-3 w-3" />
                {item.score.toLocaleString()} views
              </span>
            )}
            {item.comments !== undefined && item.comments > 0 && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <MessageSquare className="h-3 w-3" />
                {item.comments}
              </span>
            )}
            {item.pubDate && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground cursor-default">
                    <Clock className="h-3 w-3" />
                    {formatDistanceToNow(new Date(item.pubDate), { addSuffix: true })}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {format(new Date(item.pubDate), "PPpp")}
                </TooltipContent>
              </Tooltip>
            )}

            {/* Content length indicators */}
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <FileText className="h-3 w-3" />
              {words > 0 ? `${words} words` : "No content"}
            </span>

            {showFullTextColumn && item.fullTextLength !== undefined && item.fullTextLength > 0 && (
              <span className="flex items-center gap-1 text-xs text-primary/70">
                <FileText className="h-3 w-3" />
                Full: {item.fullTextLength.toLocaleString()} chars
              </span>
            )}

            {/* Media indicators */}
            {media.hasImages && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <ImageIcon className="h-3 w-3" />
              </span>
            )}
            {media.hasVideo && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Video className="h-3 w-3" />
              </span>
            )}
          </div>

          {/* URL + actions row */}
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-muted-foreground truncate max-w-[300px] font-mono">
              {item.link}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={handleCopyUrl}
            >
              {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
            </Button>
            {plainContent.length > 150 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
