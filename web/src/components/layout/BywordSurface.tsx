import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function WorkspaceBackground({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-h-screen factory-grid-bg text-foreground", className)}>
      {children}
    </div>
  );
}

export function BywordPageShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <WorkspaceBackground>
      <div className={cn("mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-8", className)}>
        {children}
      </div>
    </WorkspaceBackground>
  );
}

export function BywordCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-md border border-byword-border bg-card factory-panel", className)}>
      {children}
    </div>
  );
}

export function FactoryDivider({ className }: { className?: string }) {
  return <div className={cn("h-1 w-full opacity-80 factory-divider", className)} aria-hidden="true" />;
}

export function FactoryMark({
  showText = true,
  className,
}: {
  showText?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex items-center gap-3 text-foreground", className)}>
      <div className="relative flex h-9 w-9 items-end justify-center overflow-hidden rounded-sm border border-byword-border bg-card p-1.5 factory-panel">
        <div className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
        <div className="grid h-5 w-6 grid-cols-3 items-end gap-0.5 text-secondary">
          <span className="h-3 bg-current" />
          <span className="h-5 bg-current" />
          <span className="h-4 bg-current" />
        </div>
      </div>
      {showText && (
        <span className="type-meta font-semibold uppercase text-foreground">
          BlogFactory
        </span>
      )}
    </div>
  );
}

export function SectionHeader({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="relative flex flex-col gap-4 border-b border-byword-border bg-card px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5 lg:px-6">
      <div className="absolute inset-x-0 top-0 h-1 factory-divider opacity-45" aria-hidden="true" />
      <div className="flex min-w-0 items-start gap-3">
        <IconTile icon={Icon} />
        <div className="min-w-0">
          <h2 className="type-panel-title">{title}</h2>
          {description && <p className="type-body mt-1">{description}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function IconTile({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-byword-border bg-card text-byword-blue factory-panel transition-calm", className)}>
      <Icon className="h-5 w-5" strokeWidth={1.8} />
    </div>
  );
}

export function OptionCard({
  icon: Icon,
  title,
  description,
  selected,
  badge,
  onClick,
  disabled,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  selected?: boolean;
  badge?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group relative flex min-h-[150px] flex-col items-start overflow-hidden rounded-md border bg-card p-6 text-left transition-calm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-offset-1",
        selected ? "border-byword-blue bg-byword-blue-soft text-byword-blue factory-panel" : "border-byword-border hover:-translate-y-0.5 hover:border-byword-blue/60 hover:bg-byword-blue-soft/50 hover:shadow-[0_12px_28px_hsl(210_5%_20%/0.07)]",
        disabled && "cursor-not-allowed opacity-60"
      )}
    >
      <div className="absolute inset-x-0 top-0 h-1 pixel-edge text-foreground/25" aria-hidden="true" />
      {badge && (
        <span className="type-kicker absolute right-5 top-5 rounded-sm border border-byword-border bg-muted px-2 py-1">
          {badge}
        </span>
      )}
      <IconTile icon={Icon} className={selected ? "border-byword-blue bg-byword-blue text-white" : "group-hover:border-byword-blue group-hover:bg-byword-blue-soft"} />
      <div className="mt-7">
        <h3 className="text-lg font-semibold leading-snug text-foreground">{title}</h3>
        <p className="type-body mt-2">{description}</p>
      </div>
    </button>
  );
}

export function SettingNavItem({
  icon: Icon,
  title,
  description,
  active,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex w-full items-center gap-4 border-l-2 px-5 py-4 text-left transition-calm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-offset-1",
        active ? "border-byword-blue bg-byword-blue-soft text-byword-blue shadow-[inset_0_1px_0_hsl(0_0%_100%)]" : "border-transparent text-muted-foreground hover:bg-card hover:text-foreground"
      )}
    >
      <Icon className="h-5 w-5 shrink-0" strokeWidth={1.8} />
      <span>
        <span className="type-object-title block">{title}</span>
        <span className="type-meta mt-0.5 block">{description}</span>
      </span>
    </button>
  );
}
