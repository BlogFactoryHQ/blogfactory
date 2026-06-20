import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
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

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Posts", href: "/posts", icon: FileText },
  { name: "RSS Feeds", href: "/rss-feeds", icon: Rss },
  { name: "Content Creator", href: "/content-creator", icon: PenTool },
  { name: "Job Queue", href: "/jobs", icon: ListTodo },
  { name: "Personas", href: "/personas", icon: Users },
  { name: "Image Gallery", href: "/gallery", icon: ImageIcon },
  { name: "Usage", href: "/usage", icon: BarChart3 },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function AppSidebar() {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { isCollapsed, toggle } = useSidebar();

  const displayName = user?.user_metadata?.display_name || user?.email?.split("@")[0] || "User";
  const email = user?.email || "";

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
          isCollapsed ? "w-[60px] cursor-pointer" : "w-60"
        )}
      >
        {/* Brand */}
        <div className="flex items-center h-14 px-[14px] border-b border-sidebar-border shrink-0 overflow-hidden">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground shrink-0">
            <span className="text-[11px] font-bold text-background tracking-tight">BF</span>
          </div>
          <span className="text-sm font-semibold text-foreground tracking-tight whitespace-nowrap ml-2.5 shrink-0">
            BlogFactory
          </span>
          <button
            className={cn(
              "ml-auto h-7 w-7 shrink-0 flex items-center justify-center rounded-md text-sidebar-muted hover:text-foreground hover:bg-sidebar-accent transition-colors duration-150",
              isCollapsed && "pointer-events-none"
            )}
            onClick={(e) => { e.stopPropagation(); toggle(); }}
          >
            <ChevronsLeft className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 px-[14px] space-y-0.5 overflow-hidden">
          {navigation.map((item) => {
            const isActive =
              item.href === "/"
                ? location.pathname === "/"
                : location.pathname.startsWith(item.href);

            const inner = (
              <div
                className={cn(
                  "flex items-center h-8 rounded-lg transition-colors duration-150 overflow-hidden",
                  isActive
                    ? "bg-foreground text-background"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <div className="flex items-center justify-center w-8 h-8 shrink-0">
                  <item.icon className="h-4 w-4" strokeWidth={isActive ? 2 : 1.5} />
                </div>
                <span className="text-[13px] font-medium whitespace-nowrap pr-2 shrink-0">
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

        {/* Footer */}
        <div className="py-3 px-[14px] border-t border-sidebar-border overflow-hidden">
          <div className="flex items-center overflow-hidden">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-foreground text-[11px] font-semibold shrink-0 cursor-default">
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
