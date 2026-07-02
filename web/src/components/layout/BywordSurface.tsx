import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function WorkspaceBackground({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-h-[calc(100vh-88px)] factory-grid-bg text-foreground", className)}>
      {children}
    </div>
  );
}

export function BywordPageShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <WorkspaceBackground>
      <div className={cn("mx-auto w-full max-w-6xl px-6 py-8 lg:px-10", className)}>
        {children}
      </div>
    </WorkspaceBackground>
  );
}

export function BywordCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-md border border-byword-border bg-card/95 factory-panel", className)}>
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
    <div className={cn("inline-flex items-center gap-3 text-byword-blue", className)}>
      <div className="flex h-9 w-9 items-end justify-center rounded-sm border border-byword-border bg-byword-blue-soft p-1.5 shadow-[2px_2px_0_hsl(32_20%_4%/0.7)]">
        <div className="grid h-5 w-6 grid-cols-3 items-end gap-0.5">
          <span className="h-3 bg-current" />
          <span className="h-5 bg-current" />
          <span className="h-4 bg-current" />
        </div>
      </div>
      {showText && (
        <span className="font-mono text-[11px] font-semibold uppercase text-foreground">
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
    <div className="relative flex items-start justify-between gap-4 border-b border-byword-border px-6 py-5">
      <div className="absolute inset-x-0 top-0 h-1 factory-divider opacity-60" aria-hidden="true" />
      <div className="flex items-start gap-3">
        <IconTile icon={Icon} />
        <div>
          <h2 className="font-mono text-sm font-semibold uppercase text-foreground">{title}</h2>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function IconTile({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-byword-border bg-byword-blue-soft text-byword-blue shadow-[2px_2px_0_hsl(32_20%_4%/0.65)]", className)}>
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
        "group relative flex min-h-[150px] flex-col items-start overflow-hidden rounded-md border bg-card p-6 text-left transition-calm",
        selected ? "border-byword-blue bg-byword-blue-soft text-byword-blue factory-panel" : "border-byword-border hover:border-byword-blue/60 hover:bg-secondary/50",
        disabled && "cursor-not-allowed opacity-60"
      )}
    >
      <div className="absolute inset-x-0 top-0 h-1 pixel-edge text-byword-blue opacity-40" aria-hidden="true" />
      {badge && (
        <span className="absolute right-5 top-5 rounded-sm border border-byword-border bg-muted px-2 py-1 font-mono text-[10px] font-bold uppercase text-muted-foreground">
          {badge}
        </span>
      )}
      <IconTile icon={Icon} className={selected ? "border-byword-blue bg-byword-blue text-primary-foreground" : "group-hover:border-byword-blue group-hover:bg-byword-blue-soft"} />
      <div className="mt-7">
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
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
      className={cn(
        "flex w-full items-center gap-4 border-l-2 px-5 py-4 text-left transition-calm",
        active ? "border-byword-blue bg-byword-blue-soft text-byword-blue" : "border-transparent text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
      )}
    >
      <Icon className="h-5 w-5 shrink-0" strokeWidth={1.8} />
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}
