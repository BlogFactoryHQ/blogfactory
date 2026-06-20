import { Badge } from "@/components/ui/badge";
import { Star, ImagePlus, AlertTriangle, ImageOff, DollarSign, Images } from "lucide-react";

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
        <Star className="h-3.5 w-3.5 text-amber-500" />
        {cover} cover
      </Badge>
      <Badge variant="secondary" className="text-sm py-1 px-3 gap-1.5">
        <ImagePlus className="h-3.5 w-3.5 text-primary" />
        {inline} inline
      </Badge>
      {orphaned > 0 && (
        <Badge variant="outline" className="text-sm py-1 px-3 gap-1.5 border-destructive/30 text-destructive">
          <AlertTriangle className="h-3.5 w-3.5" />
          {orphaned} orphaned
        </Badge>
      )}
      {unused > 0 && (
        <Badge variant="outline" className="text-sm py-1 px-3 gap-1.5 text-muted-foreground">
          <ImageOff className="h-3.5 w-3.5" />
          {unused} unused
        </Badge>
      )}
      {totalCost > 0 && (
        <Badge variant="secondary" className="text-sm py-1 px-3 gap-1.5">
          <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
          ${totalCost.toFixed(2)} total cost
        </Badge>
      )}
    </div>
  );
}
