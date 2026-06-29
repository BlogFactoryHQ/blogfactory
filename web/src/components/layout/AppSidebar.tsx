import { useEffect, useState } from "react";
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
  SearchCheck,
  Plug,
  ChevronDown,
  Bell,
  Globe2,
  Plus,
  Check,
  Newspaper,
  LayoutDashboard,
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
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const primaryNavigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Create Content", href: "/content-creator", icon: PenTool },
  { name: "News", href: "/news", icon: Newspaper },
  { name: "My Content", href: "/posts", icon: FileText },
  { name: "Search Growth", href: "/search-growth", icon: SearchCheck },
];

const monitorNavigation = [
  { name: "RSS Feeds", href: "/rss-feeds", icon: Rss },
  { name: "Job Queue", href: "/jobs", icon: ListTodo },
  { name: "Brand Voice", href: "/brand-voice", icon: Users },
  { name: "Image Gallery", href: "/gallery", icon: ImageIcon },
  { name: "Usage", href: "/usage", icon: BarChart3 },
];

const lowerNavigation = [
  { name: "Integrations", href: "/integrations", icon: Plug },
  { name: "Article Settings", href: "/settings", icon: Settings },
  { name: "Sites", href: "/sites", icon: Globe2 },
];

const searchNavigation = [...primaryNavigation, ...monitorNavigation, ...lowerNavigation];

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { sites, activeSite, activeSiteId, activateSite } = useSites();
  const { isCollapsed, toggle } = useSidebar();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const displayName = user?.displayName || user?.email?.split("@")[0] || "User";
  const email = user?.email || "";
  const workspaceName = activeSite?.domain || activeSite?.name || "Connect site";
  const workspaceInitial = (activeSite?.name || activeSite?.domain || "B").charAt(0).toUpperCase();
  const filteredNavigation = searchNavigation.filter((item) =>
    item.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const openSearch = () => {
    setSearchQuery("");
    setIsSearchOpen(true);
  };

  const goTo = (href: string) => {
    setIsSearchOpen(false);
    navigate(href);
  };

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
          isCollapsed ? "w-[60px] cursor-pointer" : "w-[224px]"
        )}
      >
        <div className="shrink-0 space-y-2 border-b border-sidebar-border p-2.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild disabled={isCollapsed}>
              <button className="flex h-10 w-full items-center gap-2.5 overflow-hidden rounded-md border border-sidebar-border bg-card px-2.5 text-left transition-calm hover:border-byword-blue/50">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-byword-blue-soft text-byword-blue">
                  <span className="text-[10px] font-bold tracking-tight">{workspaceInitial}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold leading-tight text-foreground">{workspaceName}</p>
                  <p className="truncate text-[10px] leading-tight text-sidebar-muted">{activeSite ? "Active site" : "BlogFactory"}</p>
                </div>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-sidebar-muted" />
                <span
                  className={cn(
                    "ml-0.5 h-6 w-6 shrink-0 items-center justify-center rounded-md text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
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
          <button
            type="button"
            onClick={openSearch}
            className={cn("flex h-8 w-full items-center gap-2 rounded-md bg-muted/60 px-2.5 text-left text-[13px] text-muted-foreground transition-calm hover:bg-muted hover:text-foreground", isCollapsed && "hidden")}
          >
            <Search className="h-4 w-4" />
            <span className="flex-1">Search</span>
            <span className="text-[11px] text-muted-foreground/60">⌘K</span>
          </button>
        </div>

        <nav className="flex-1 overflow-hidden px-2.5 py-3">
          <SidebarSection title="Create" items={primaryNavigation} locationPath={location.pathname} isCollapsed={isCollapsed} />
          <SidebarSection title="Monitor" items={monitorNavigation} locationPath={location.pathname} isCollapsed={isCollapsed} />
          <SidebarSection title="Settings" items={lowerNavigation} locationPath={location.pathname} isCollapsed={isCollapsed} />
        </nav>

        <div className="border-t border-sidebar-border px-2.5 py-2.5 overflow-hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                data-profile-menu
                className="flex w-full items-center overflow-hidden rounded-md p-1 text-left transition-calm hover:bg-sidebar-accent"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-byword-blue text-[11px] font-semibold text-white">
                  {displayName[0].toUpperCase()}
                </span>
                <span className={cn("ml-2 min-w-0 flex-1 shrink-0", isCollapsed && "hidden")}>
                  <span className="block truncate text-[12px] font-medium leading-tight text-foreground">{displayName}</span>
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

        <Dialog open={isSearchOpen} onOpenChange={setIsSearchOpen}>
          <DialogContent className="top-[20%] max-w-md gap-3 p-4">
            <DialogTitle className="sr-only">Search navigation</DialogTitle>
            <div className="flex items-center gap-2 rounded-md border border-input px-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                autoFocus
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search pages..."
                className="h-10 border-0 px-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {filteredNavigation.map((item) => (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => goTo(item.href)}
                  className="flex h-9 w-full items-center gap-3 rounded-md px-2 text-left text-sm transition-calm hover:bg-sidebar-accent"
                >
                  <item.icon className="h-4 w-4 text-sidebar-muted" />
                  <span>{item.name}</span>
                </button>
              ))}
              {filteredNavigation.length === 0 && (
                <p className="px-2 py-6 text-center text-sm text-muted-foreground">No pages found.</p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </aside>
    </TooltipProvider>
  );
}

type NavItem = {
  name: string;
  href: string;
  icon: typeof FileText;
};

function SidebarSection({
  title,
  items,
  locationPath,
  isCollapsed,
}: {
  title: string;
  items: NavItem[];
  locationPath: string;
  isCollapsed: boolean;
}) {
  return (
    <div className="mb-4 last:mb-0">
      {!isCollapsed && (
        <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted/70">
          {title}
        </p>
      )}
      <div className="space-y-0.5">
        {items.map((item) => {
          const isActive = item.href === "/" ? locationPath === "/" : locationPath.startsWith(item.href);
          const inner = (
            <div
              className={cn(
                "flex h-8 items-center overflow-hidden rounded-md border-l-2 transition-calm",
                isActive
                  ? "border-byword-blue bg-byword-blue-soft/70 text-byword-blue"
                  : "border-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center">
                <item.icon className="h-4 w-4" strokeWidth={isActive ? 2 : 1.5} />
              </div>
              <span className="shrink-0 whitespace-nowrap pr-2 text-[13px] font-medium">
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
      </div>
    </div>
  );
}
