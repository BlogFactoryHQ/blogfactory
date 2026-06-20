import { Link, useLocation } from "react-router-dom";
import {
  FileText,
  Rss,
  PenTool,
  ListTodo,
  Users,
  ImageIcon,
  BarChart3,
  LogOut,
  Settings,
  ChevronsLeft,
  Shield,
  Search,
  Plug,
  ChevronDown,
  BookOpen,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useSidebar } from "@/contexts/SidebarContext";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const primaryNavigation = [
  { name: "Create Content", href: "/content-creator", icon: PenTool },
  { name: "My Content", href: "/posts", icon: FileText },
  { name: "RSS Feeds", href: "/rss-feeds", icon: Rss },
  { name: "Job Queue", href: "/jobs", icon: ListTodo },
  { name: "Personas", href: "/personas", icon: Users },
  { name: "Image Gallery", href: "/gallery", icon: ImageIcon },
  { name: "Usage", href: "/usage", icon: BarChart3 },
];

const adminNavigation = [
  { name: "Admin Users", href: "/admin/users", icon: Shield },
];

const lowerNavigation = [
  { name: "Learn", href: "/", icon: BookOpen },
  { name: "Integrations", href: "/integrations", icon: Plug },
  { name: "Article Settings", href: "/settings", icon: Settings },
  { name: "Notifications", href: "/jobs", icon: Bell },
];

export function AppSidebar() {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { isCollapsed, toggle } = useSidebar();

  const displayName = user?.displayName || user?.email?.split("@")[0] || "User";
  const email = user?.email || "";
  const visibleNavigation = user?.role === "admin" ? [...primaryNavigation, ...adminNavigation] : primaryNavigation;

  const handleSidebarClick = (e: React.MouseEvent) => {
    if (!isCollapsed) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-signout]')) return;
    e.preventDefault();
    toggle();
  };

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        onClick={handleSidebarClick}
        className={cn(
          "fixed inset-y-0 left-0 z-50 bg-sidebar border-r border-sidebar-border flex flex-col overflow-hidden",
          "transition-[width] duration-200 ease-out",
          isCollapsed ? "w-[64px] cursor-pointer" : "w-[236px]"
        )}
      >
        <div className="shrink-0 space-y-3 border-b border-sidebar-border p-3">
          <div className="flex h-12 items-center gap-3 overflow-hidden rounded-md border border-sidebar-border bg-card px-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-byword-blue-soft text-byword-blue">
              <span className="text-[11px] font-bold tracking-tight">BF</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">BlogFactory</p>
              <p className="truncate text-[11px] text-sidebar-muted">Private beta</p>
            </div>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-sidebar-muted" />
            <button
              className={cn(
                "ml-1 h-7 w-7 shrink-0 items-center justify-center rounded-md text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                isCollapsed ? "hidden" : "flex"
              )}
              onClick={(e) => { e.stopPropagation(); toggle(); }}
              aria-label="Collapse sidebar"
            >
              <ChevronsLeft className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className={cn("flex h-9 items-center gap-2 rounded-md bg-muted/60 px-3 text-sm text-muted-foreground", isCollapsed && "hidden")}>
            <Search className="h-4 w-4" />
            <span className="flex-1">Search</span>
            <span className="text-[11px] text-muted-foreground/60">⌘K</span>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-hidden px-3 py-4">
          {visibleNavigation.map((item) => {
            const isActive =
              item.href === "/"
                ? location.pathname === "/"
                : location.pathname.startsWith(item.href);

            const inner = (
              <div
                className={cn(
                  "flex h-9 items-center overflow-hidden rounded-md transition-calm",
                  isActive
                    ? "bg-byword-blue-soft text-byword-blue"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center">
                  <item.icon className="h-4 w-4" strokeWidth={isActive ? 2 : 1.5} />
                </div>
                <span className="shrink-0 whitespace-nowrap pr-2 text-[14px] font-medium">
                  {item.name}
                </span>
              </div>
            );

            if (isCollapsed) {
              return (
                <Tooltip key={item.name}>
                  <TooltipTrigger asChild>{inner}</TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">{item.name}</TooltipContent>
                </Tooltip>
              );
            }

            return <Link key={item.name} to={item.href}>{inner}</Link>;
          })}
        </nav>

        <div className="space-y-1 border-t border-sidebar-border px-3 py-3">
          {!isCollapsed && lowerNavigation.map((item) => {
            const isActive =
              item.href === "/"
                ? location.pathname === "/"
                : location.pathname.startsWith(item.href);
            return (
              <Link key={item.name} to={item.href} className={cn(
                "flex h-9 items-center gap-3 rounded-md px-2 text-sm transition-calm",
                isActive ? "bg-byword-blue-soft text-byword-blue" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}>
                <item.icon className="h-4 w-4" strokeWidth={1.7} />
                {item.name}
              </Link>
            );
          })}
        </div>

        <div className="border-t border-sidebar-border px-3 py-3 overflow-hidden">
          <div className="flex items-center overflow-hidden rounded-md p-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-byword-blue text-white text-[11px] font-semibold shrink-0 cursor-default">
                  {displayName[0].toUpperCase()}
                </div>
              </TooltipTrigger>
              {isCollapsed && (
                <TooltipContent side="right" className="text-xs">
                  <p className="font-medium">{displayName}</p>
                  <p className="text-muted-foreground">{email}</p>
                </TooltipContent>
              )}
            </Tooltip>
            <div className="ml-2.5 flex-1 min-w-0 shrink-0">
              <p className="text-[13px] font-medium text-foreground truncate leading-tight">{displayName}</p>
              <p className="text-[11px] text-sidebar-muted truncate leading-tight">{email}</p>
            </div>
            <button
              data-signout
              className="ml-2 h-7 w-7 shrink-0 flex items-center justify-center rounded-md text-sidebar-muted hover:text-foreground hover:bg-sidebar-accent transition-colors duration-150"
              onClick={signOut}
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>
    </TooltipProvider>
  );
}
