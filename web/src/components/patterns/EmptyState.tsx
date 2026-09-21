import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { type LucideIcon, AlertTriangle, FilterX, Inbox } from "lucide-react";

import { Button } from "@/components/ui/button";
import { IconTile } from "@/components/layout/BywordSurface";
import { cn } from "@/lib/utils";

export type EmptyStateTone = "empty" | "filtered" | "error";
export type EmptyStateSize = "page" | "panel" | "row";

export type EmptyStateAction = {
  label: string;
  onClick?: () => void;
  href?: string;
  external?: boolean;
};

export interface EmptyStateProps {
  /** `page` for a full route, `panel` inside a card, `row` inside a table body. */
  size?: EmptyStateSize;
  /**
   * `empty` = never had data, `filtered` = filters matched nothing,
   * `error` = the read failed. They need different copy and different actions.
   */
  tone?: EmptyStateTone;
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  primaryAction?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  className?: string;
}

const toneIcon: Record<EmptyStateTone, LucideIcon> = {
  empty: Inbox,
  filtered: FilterX,
  error: AlertTriangle,
};

const sizeClasses: Record<EmptyStateSize, string> = {
  page: "px-6 py-16",
  panel: "px-6 py-12",
  row: "px-4 py-8",
};

function ActionButton({ action, variant }: { action: EmptyStateAction; variant: "default" | "outline" }) {
  if (action.href && !action.external) {
    return (
      <Button asChild variant={variant} size="sm">
        <Link to={action.href}>{action.label}</Link>
      </Button>
    );
  }
  if (action.href) {
    return (
      <Button asChild variant={variant} size="sm">
        <a href={action.href} target="_blank" rel="noreferrer">
          {action.label}
        </a>
      </Button>
    );
  }
  return (
    <Button type="button" variant={variant} size="sm" onClick={action.onClick}>
      {action.label}
    </Button>
  );
}

/**
 * The single empty/zero-result surface for the app. Every empty state must name the
 * next action, not only the absence of data.
 */
export function EmptyState({
  size = "panel",
  tone = "empty",
  icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  className,
}: EmptyStateProps) {
  const Icon = icon || toneIcon[tone];

  if (size === "row") {
    return (
      <div className={cn("flex flex-col items-center gap-2 text-center", sizeClasses.row, className)}>
        <p className={cn("text-sm font-semibold", tone === "error" ? "text-status-error" : "text-foreground")}>{title}</p>
        {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
        {(primaryAction || secondaryAction) && (
          <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
            {primaryAction && <ActionButton action={primaryAction} variant="outline" />}
            {secondaryAction && <ActionButton action={secondaryAction} variant="outline" />}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col items-center text-center", sizeClasses[size], className)}>
      <IconTile
        icon={Icon}
        className={cn(
          size === "page" ? "h-12 w-12" : "h-10 w-10",
          tone === "error" && "border-status-error/30 bg-status-error/10 text-status-error",
        )}
      />
      <h3 className={cn("mt-5 font-semibold text-foreground", size === "page" ? "text-lg" : "text-base")}>{title}</h3>
      {description && <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>}
      {(primaryAction || secondaryAction) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {primaryAction && <ActionButton action={primaryAction} variant="default" />}
          {secondaryAction && <ActionButton action={secondaryAction} variant="outline" />}
        </div>
      )}
    </div>
  );
}
