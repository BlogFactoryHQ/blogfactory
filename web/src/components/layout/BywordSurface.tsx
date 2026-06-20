import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function WorkspaceBackground({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-h-[calc(100vh-88px)] byword-dot-bg", className)}>
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
    <div className={cn("rounded-lg border border-byword-border bg-card shadow-[0_12px_40px_rgba(22,82,125,0.04)]", className)}>
      {children}
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
    <div className="flex items-start justify-between gap-4 border-b border-byword-border px-6 py-5">
      <div className="flex items-start gap-3">
        <IconTile icon={Icon} />
        <div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function IconTile({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-byword-blue-soft text-byword-blue", className)}>
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
        "relative flex min-h-[150px] flex-col items-start rounded-lg border bg-card p-6 text-left transition-calm",
        selected ? "border-byword-blue bg-byword-blue-soft/80 text-byword-blue shadow-[0_0_0_1px_rgba(20,129,192,0.2)]" : "border-byword-border hover:border-byword-blue/40 hover:bg-byword-blue-soft/30",
        disabled && "cursor-not-allowed opacity-60"
      )}
    >
      {badge && (
        <span className="absolute right-5 top-5 rounded bg-muted px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {badge}
        </span>
      )}
      <IconTile icon={Icon} className={selected ? "bg-byword-blue text-white" : ""} />
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
        active ? "border-byword-blue bg-byword-blue-soft text-byword-blue" : "border-transparent text-muted-foreground hover:bg-card/70 hover:text-foreground"
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
