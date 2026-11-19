import { Badge } from "@/components/ui/badge";
import { Star, ImagePlus, ImageOff, DollarSign, Images } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";

interface GalleryStatsBarProps {
  total: number;
  cover: number;
  inline: number;
  orphaned: number;
  unused: number;
  totalCost: number;
}

export function GalleryStatsBar({ total, cover, inline, orphaned, unused, totalCost }: GalleryStatsBarProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Badge variant="secondary" className="text-sm py-1 px-3 gap-1.5">
        <Images className="h-3.5 w-3.5 text-muted-foreground" />
        {total} total
      </Badge>
      <Badge variant="secondary" className="text-sm py-1 px-3 gap-1.5">
        <Star className="h-3.5 w-3.5 text-muted-foreground" />
        {cover} cover
      </Badge>
      <Badge variant="secondary" className="text-sm py-1 px-3 gap-1.5">
        <ImagePlus className="h-3.5 w-3.5 text-muted-foreground" />
        {inline} inline
      </Badge>
      {orphaned > 0 && (
        <StatusBadge status="warning" label={`${orphaned} orphaned`} />
      )}
      {unused > 0 && (
        <Badge variant="outline" className="text-sm py-1 px-3 gap-1.5 text-muted-foreground">
          <ImageOff className="h-3.5 w-3.5" />
          {unused} unused
        </Badge>
      )}
      {totalCost > 0 && (
        <Badge variant="secondary" className="text-sm py-1 px-3 gap-1.5">
          <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
          ${totalCost.toFixed(2)} total cost
        </Badge>
      )}
    </div>
  );
}
