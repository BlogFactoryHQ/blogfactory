import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";
import type { GalleryFilters as GalleryFiltersType } from "@/hooks/useImageAssets";

interface GalleryFiltersProps {
  filters: GalleryFiltersType;
  onChange: (filters: GalleryFiltersType) => void;
}

export function GalleryFilters({ filters, onChange }: GalleryFiltersProps) {
  const update = (partial: Partial<GalleryFiltersType>) =>
    onChange({ ...filters, ...partial });

  return (
    <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm pb-4 pt-1 border-b border-border mb-6">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search post title, prompt, model..."
            value={filters.search}
            onChange={(e) => update({ search: e.target.value })}
            className="pl-9"
          />
        </div>

        {/* Type */}
        <Select value={filters.type} onValueChange={(v) => update({ type: v as any })}>
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="cover">Cover</SelectItem>
            <SelectItem value="inline">Inline</SelectItem>
          </SelectContent>
        </Select>

        {/* Status */}
        <Select value={filters.status} onValueChange={(v) => update({ status: v as any })}>
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="used">Used</SelectItem>
            <SelectItem value="unused">Unused</SelectItem>
            <SelectItem value="orphaned">Orphaned</SelectItem>
          </SelectContent>
        </Select>

        {/* Post status */}
        <Select value={filters.postStatus} onValueChange={(v) => update({ postStatus: v as any })}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All posts</SelectItem>
            <SelectItem value="draft">Draft posts</SelectItem>
            <SelectItem value="published">Published</SelectItem>
          </SelectContent>
        </Select>

        {/* Date range */}
        <Select value={filters.dateRange} onValueChange={(v) => update({ dateRange: v as any })}>
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All time</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
          </SelectContent>
        </Select>

        {/* Aspect ratio */}
        <Select value={filters.aspectRatio} onValueChange={(v) => update({ aspectRatio: v })}>
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any ratio</SelectItem>
            <SelectItem value="16:9">16:9</SelectItem>
            <SelectItem value="3:2">3:2</SelectItem>
            <SelectItem value="4:3">4:3</SelectItem>
            <SelectItem value="1:1">1:1</SelectItem>
            <SelectItem value="9:16">9:16</SelectItem>
          </SelectContent>
        </Select>

      </div>
    </div>
  );
}
