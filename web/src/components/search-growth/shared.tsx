import { useRef, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

// A status-error line: where an action failed, say so beside the control and name the way forward.
export function InlineError({ message }: { message: string }) {
  return (
    <p role="alert" className="flex items-start gap-2 text-sm text-status-error">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 break-words">{message}</span>
    </p>
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
