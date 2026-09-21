import { ReactNode } from "react";

import { RowActions, type RowAction } from "@/components/patterns/RowActions";

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: ReactNode;
  /**
   * Secondary page operations (export, refresh, docs for this page, feedback).
   * They render in a `…` menu so the header keeps one primary action.
   */
  menu?: RowAction[];
}

export function PageHeader({ title, description, children, menu }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 border-b border-byword-border pb-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="type-kicker mb-2 text-byword-blue">Assembly console</p>
        <h1 className="type-page-title">{title}</h1>
        {description && (
          <p className="type-body mt-1.5 max-w-3xl">{description}</p>
        )}
      </div>
      {(children || menu?.length) && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {children}
          {menu?.length ? (
            <RowActions actions={menu} triggerLabel={`More actions for ${title}`} size="default" />
          ) : null}
        </div>
      )}
    </div>
  );
}
