import { useRef, type HTMLAttributes, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type TagTone = "success" | "warning" | "error" | "neutral";

const toneClass: Record<TagTone, string> = {
  success: "status-badge-success",
  warning: "status-badge-warning",
  error: "status-badge-error",
  neutral: "border-border bg-card text-foreground",
};

// A span (not the div-based Badge) so it can sit inside paragraphs and list items. Meaning always travels in the text, never in color alone.
export function Tag({ tone = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: TagTone }) {
  return <span className={cn("status-badge max-w-full", toneClass[tone], className)} {...props} />;
}

export function InlineError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="status-badge-error flex flex-wrap items-center gap-3 rounded-sm border px-3 py-2 text-sm">
      <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 break-words">{message}</span>
      {onRetry && <Button type="button" size="sm" variant="outline" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function PanelSkeleton({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div role="status" aria-label={label} className="space-y-2">
      {Array.from({ length: rows }, (_, index) => <Skeleton key={index} className="h-9 w-full" />)}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function EmptyNote({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-sm border border-dashed border-byword-border px-4 py-6 text-center">
      <p className="type-object-title">{title}</p>
      {children && <p className="type-body mx-auto mt-1 max-w-prose">{children}</p>}
    </div>
  );
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, destructive = false, onConfirm }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  // The dialog is opened from state, so Radix has no trigger to give focus back to. Remember who had focus when it opened.
  const returnTo = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current) returnTo.current = document.activeElement as HTMLElement | null;
  wasOpen.current = open;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent onCloseAutoFocus={(event) => { event.preventDefault(); returnTo.current?.focus(); }}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction className={destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined} onClick={onConfirm}>{confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
