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
  Bell,
  Globe2,
  Plus,
  Check,
  Newspaper,
  Grid2X2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useSites } from "@/hooks/useSites";
import { useSidebar } from "@/contexts/SidebarContext";
import { useNavigate } from "react-router-dom";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const primaryNavigation = [
  { name: "News", href: "/news", icon: Newspaper },
  { name: "Create Content", href: "/content-creator", icon: PenTool },
  { name: "Programmatic", href: "/programmatic", icon: Grid2X2 },
  { name: "My Content", href: "/posts", icon: FileText },
  { name: "RSS Feeds", href: "/rss-feeds", icon: Rss },
  { name: "Job Queue", href: "/jobs", icon: ListTodo },
  { name: "Brand Voice", href: "/brand-voice", icon: Users },
  { name: "Image Gallery", href: "/gallery", icon: ImageIcon },
  { name: "Usage", href: "/usage", icon: BarChart3 },
];

const lowerNavigation = [
  { name: "Integrations", href: "/integrations", icon: Plug },
  { name: "Indexing", href: "/indexing", icon: Search },
  { name: "Article Settings", href: "/settings", icon: Settings },
  { name: "Sites", href: "/sites", icon: Globe2 },
];

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { sites, activeSite, activeSiteId, activateSite } = useSites();
  const { isCollapsed, toggle } = useSidebar();

  const displayName = user?.displayName || user?.email?.split("@")[0] || "User";
  const email = user?.email || "";
  const visibleNavigation = primaryNavigation;
  const workspaceName = activeSite?.domain || activeSite?.name || "Connect site";
  const workspaceInitial = (activeSite?.name || activeSite?.domain || "B").charAt(0).toUpperCase();

  const handleSidebarClick = (e: React.MouseEvent) => {
    if (!isCollapsed) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-signout]')) return;
    if (target.closest('[data-profile-menu]')) return;
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild disabled={isCollapsed}>
              <button className="flex h-12 w-full items-center gap-3 overflow-hidden rounded-md border border-sidebar-border bg-card px-3 text-left transition-calm hover:border-byword-blue/50">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-byword-blue-soft text-byword-blue">
                  <span className="text-[11px] font-bold tracking-tight">{workspaceInitial}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{workspaceName}</p>
                  <p className="truncate text-[11px] text-sidebar-muted">{activeSite ? "Active site" : "BlogFactory"}</p>
                </div>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-sidebar-muted" />
                <span
                  className={cn(
                    "ml-1 h-7 w-7 shrink-0 items-center justify-center rounded-md text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    isCollapsed ? "hidden" : "flex"
                  )}
                  onClick={(e) => { e.stopPropagation(); toggle(); }}
                  aria-label="Collapse sidebar"
                >
                  <ChevronsLeft className="h-3.5 w-3.5" />
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={8} className="w-[432px] rounded-lg border-byword-border p-3">
              {activeSite && (
                <>
                  <DropdownMenuLabel className="px-2 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    Current domain
                  </DropdownMenuLabel>
                  <div className="mb-3 flex items-center gap-4 rounded-lg border border-byword-border bg-byword-blue-soft/60 p-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-md bg-card text-byword-blue">
                      <span className="text-sm font-bold">{workspaceInitial}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-foreground">{activeSite.domain}</p>
                      <p className="text-sm text-muted-foreground">Active</p>
                    </div>
                    <Check className="h-5 w-5 text-byword-blue" />
                  </div>
                </>
              )}

              <DropdownMenuLabel className="px-2 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                Switch to
              </DropdownMenuLabel>
              <div className="max-h-64 overflow-y-auto">
                {sites.filter((site) => site.id !== activeSiteId).map((site) => (
                  <DropdownMenuItem
                    key={site.id}
                    className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-3"
                    onClick={() => activateSite(site.id)}
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-md border border-byword-border text-byword-blue">
                      <span className="text-xs font-bold">{site.name.charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{site.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{site.domain}</p>
                    </div>
                  </DropdownMenuItem>
                ))}
                {sites.length <= 1 && (
                  <p className="px-3 py-3 text-sm text-muted-foreground">No other sites connected yet.</p>
                )}
              </div>
              <DropdownMenuSeparator />
              <div className="grid grid-cols-2 gap-2 p-1">
                <DropdownMenuItem
                  className="cursor-pointer justify-center gap-2 rounded-md border border-transparent py-2"
                  onClick={() => navigate("/sites")}
                >
                  <Settings className="h-4 w-4" />
                  Manage
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer justify-center gap-2 rounded-md border border-dashed border-byword-border py-2"
                  onClick={() => navigate("/sites")}
                >
                  <Plus className="h-4 w-4" />
                  Add
                </DropdownMenuItem>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                data-profile-menu
                className="flex w-full items-center overflow-hidden rounded-md p-1.5 text-left transition-calm hover:bg-sidebar-accent"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-byword-blue text-[11px] font-semibold text-white">
                  {displayName[0].toUpperCase()}
                </span>
                <span className={cn("ml-2.5 min-w-0 flex-1 shrink-0", isCollapsed && "hidden")}>
                  <span className="block truncate text-[13px] font-medium leading-tight text-foreground">{displayName}</span>
                  <span className="block truncate text-[11px] leading-tight text-sidebar-muted">{email}</span>
                </span>
                <ChevronDown className={cn("ml-2 h-3.5 w-3.5 shrink-0 text-sidebar-muted", isCollapsed && "hidden")} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={8} className="w-56 rounded-lg border-byword-border">
              <DropdownMenuLabel className="truncate">
                {displayName}
                <span className="block truncate text-xs font-normal text-muted-foreground">{email}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => navigate("/jobs")}>
                <Bell className="h-4 w-4" />
                Notifications
              </DropdownMenuItem>
              {user?.role === "admin" && (
                <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => navigate("/admin/users")}>
                  <Shield className="h-4 w-4" />
                  Admin Users
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem data-signout className="cursor-pointer gap-2" onClick={signOut}>
                <LogOut className="h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
    </TooltipProvider>
  );
}
