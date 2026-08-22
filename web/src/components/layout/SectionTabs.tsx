import { NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";

export type SectionTab = { label: string; to: string };

export function SectionTabs({ label, items }: { label: string; items: SectionTab[] }) {
  return <>
    <div className="sticky top-0 z-30 border-b border-byword-border bg-background/95 px-4 backdrop-blur sm:px-6 lg:px-10">
      <nav aria-label={label} className="mx-auto flex max-w-7xl gap-1 overflow-x-auto py-2">
        {items.map((item) => <NavLink key={item.to} to={item.to} className={({ isActive }) => cn(
          "shrink-0 rounded-sm border px-3 py-2 text-xs font-semibold transition-calm",
          isActive ? "border-byword-blue bg-byword-blue-soft text-byword-blue" : "border-transparent text-muted-foreground hover:border-byword-border hover:bg-card hover:text-foreground",
        )}>{item.label}</NavLink>)}
      </nav>
    </div>
    <Outlet />
  </>;
}
