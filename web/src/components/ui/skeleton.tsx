import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-sm border border-border bg-muted device-hairline-bg", className)} {...props} />;
}

export { Skeleton };
