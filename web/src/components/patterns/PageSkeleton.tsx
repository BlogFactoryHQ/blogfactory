import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Shape-matched loading placeholders. Prefer these over a centered spinner on any
 * route that renders a known layout: a spinner tells the user nothing about what
 * is arriving.
 */

export function TableSkeleton({ rows = 6, columns = 5, className }: { rows?: number; columns?: number; className?: string }) {
  return (
    <div className={cn("divide-y divide-border", className)} role="status" aria-label="Loading table">
      <div className="flex items-center gap-4 bg-muted/40 px-4 py-2.5">
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton key={index} className={cn("h-3", index === 0 ? "w-40" : "w-20")} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex items-center gap-4 px-4 py-3">
          {Array.from({ length: columns }).map((_, index) => (
            <Skeleton
              key={index}
              className={cn("h-4", index === 0 ? "w-56 max-w-[40%] flex-1" : "w-20")}
              style={{ opacity: 1 - rowIndex * 0.08 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("divide-y divide-border", className)} role="status" aria-label="Loading list">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center justify-between gap-4 px-5 py-4">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-5 w-16" />
        </div>
      ))}
    </div>
  );
}

export function CardGridSkeleton({ cards = 4, className }: { cards?: number; className?: string }) {
  return (
    <div className={cn("grid gap-4 md:grid-cols-2 xl:grid-cols-4", className)} role="status" aria-label="Loading cards">
      {Array.from({ length: cards }).map((_, index) => (
        <div key={index} className="space-y-4 rounded-md border border-border bg-card p-5">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      ))}
    </div>
  );
}

export function StatRowSkeleton({ items = 3, className }: { items?: number; className?: string }) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-3", className)} role="status" aria-label="Loading metrics">
      {Array.from({ length: items }).map((_, index) => (
        <div key={index} className="space-y-3 rounded-md border border-border bg-card p-5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-16" />
        </div>
      ))}
    </div>
  );
}

export function DetailSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-4", className)} role="status" aria-label="Loading content">
      <Skeleton className="h-7 w-2/3" />
      <Skeleton className="h-3 w-1/3" />
      <div className="space-y-2 pt-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className={cn("h-3", index % 3 === 2 ? "w-3/5" : "w-full")} />
        ))}
      </div>
    </div>
  );
}
