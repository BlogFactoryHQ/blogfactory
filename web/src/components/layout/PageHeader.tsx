import { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: ReactNode;
}

export function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 border-b border-byword-border pb-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="mb-2 font-mono text-[10px] font-semibold uppercase text-byword-blue">Assembly Console</p>
        <h1 className="break-words font-mono text-[23px] font-semibold uppercase text-foreground">{title}</h1>
        {description && (
          <p className="mt-1.5 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
        )}
      </div>
      {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
