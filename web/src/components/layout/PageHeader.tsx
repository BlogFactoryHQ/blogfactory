import { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: ReactNode;
}

export function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <div className="mb-8 flex items-start justify-between gap-4 border-b border-byword-border pb-5">
      <div>
        <p className="mb-2 font-mono text-[10px] font-semibold uppercase text-byword-blue">Assembly Console</p>
        <h1 className="font-mono text-[23px] font-semibold uppercase text-foreground">{title}</h1>
        {description && (
          <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
