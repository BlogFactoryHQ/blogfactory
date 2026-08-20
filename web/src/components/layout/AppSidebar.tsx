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
  ChevronsRight,
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
  Loader2,
  Cable,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useSites } from "@/hooks/useSites";
import type { Site } from "@/hooks/useSites";
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
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FactoryMark } from "@/components/layout/BywordSurface";
import { toast } from "sonner";

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
  { name: "MCP", href: "/settings?section=mcp", icon: Cable, exact: true },
  { name: "Article Settings", href: "/settings", icon: Settings, exact: true },
  { name: "Sites", href: "/sites", icon: Globe2 },
];

const searchNavigation = [...primaryNavigation, ...monitorNavigation, ...lowerNavigation];

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { sites, activeSite, activeSiteId, activateSite, isActivating } = useSites();
  const { isCollapsed, toggle } = useSidebar();
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [switchingSite, setSwitchingSite] = useState<Site | null>(null);
  const effectiveCollapsed = isCollapsed || isCompactViewport;

  const displayName = user?.displayName || user?.email?.split("@")[0] || "User";
  const email = user?.email || "";
  const workspaceName = activeSite?.domain || activeSite?.name || "Connect site";
  const workspaceInitial = (activeSite?.name || activeSite?.domain || "B").charAt(0).toUpperCase();
  const switchingLabel = switchingSite?.name || switchingSite?.domain || "selected site";
  const switchingInitial = (switchingSite?.name || switchingSite?.domain || "S").charAt(0).toUpperCase();
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

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsCompactViewport(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const openSearch = () => {
    setSearchQuery("");
    setIsSearchOpen(true);
  };

  const goTo = (href: string) => {
    setIsSearchOpen(false);
    navigate(href);
  };

  const switchSite = async (site: Site) => {
    if (isActivating || site.id === activeSiteId) return;
    setSwitchingSite(site);
    try {
      await activateSite(site.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not switch sites");
    } finally {
      setSwitchingSite(null);
    }
  };

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col overflow-hidden border-r border-sidebar-border bg-sidebar shadow-[inset_-1px_0_0_hsl(var(--sidebar-border)/0.55)]",
          "transition-[width] duration-200 ease-out",
          effectiveCollapsed ? "w-[60px]" : "w-[224px]"
        )}
      >
        <div className="shrink-0 space-y-3 border-b border-sidebar-border p-2.5">
          <div className={cn("flex items-center", effectiveCollapsed ? "flex-col justify-center gap-2" : "justify-between px-1 pt-1")}>
            <FactoryMark showText={!effectiveCollapsed} />
            <button
              type="button"
              onClick={toggle}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-sidebar-border bg-card text-sidebar-muted shadow-[inset_0_1px_0_hsl(0_0%_100%)] transition-calm hover:border-byword-blue/60 hover:bg-byword-blue-soft hover:text-byword-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-1"
              aria-label={effectiveCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={effectiveCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {effectiveCollapsed ? <ChevronsRight className="h-3.5 w-3.5" /> : <ChevronsLeft className="h-3.5 w-3.5" />}
            </button>
          </div>
          {!effectiveCollapsed && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild disabled={effectiveCollapsed}>
                <button className="flex h-10 w-full items-center gap-2.5 overflow-hidden rounded-sm border border-sidebar-border bg-card px-2.5 text-left shadow-[inset_0_1px_0_hsl(0_0%_100%)] transition-calm hover:border-byword-blue/60 hover:bg-byword-blue-soft/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-1">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border border-byword-border bg-byword-blue-soft text-byword-blue">
                    <span className="text-[10px] font-bold tracking-tight">{workspaceInitial}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold leading-tight text-foreground">{workspaceName}</p>
                    <p className="truncate text-[10px] leading-tight text-sidebar-muted">{activeSite ? "Active site" : "BlogFactory"}</p>
                  </div>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-sidebar-muted" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" sideOffset={8} className="w-[432px] rounded-md border-byword-border p-3">
                {activeSite && (
                  <>
                    <DropdownMenuLabel className="px-2 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                      Current domain
                    </DropdownMenuLabel>
                    <div className="mb-3 flex items-center gap-4 rounded-md border border-byword-border bg-byword-blue-soft p-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-sm border border-byword-border bg-card text-byword-blue">
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
                      disabled={isActivating}
                      onClick={() => switchSite(site)}
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-sm border border-byword-border text-byword-blue">
                        <span className="text-xs font-bold">{(site.name || site.domain || "S").charAt(0).toUpperCase()}</span>
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
                    className="cursor-pointer justify-center gap-2 rounded-sm border border-transparent py-2"
                    onClick={() => navigate("/sites")}
                  >
                    <Settings className="h-4 w-4" />
                    Manage
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="cursor-pointer justify-center gap-2 rounded-sm border border-dashed border-byword-border py-2"
                    onClick={() => navigate("/sites")}
                  >
                    <Plus className="h-4 w-4" />
                    Add
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {effectiveCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={openSearch}
                  className="flex h-10 w-10 items-center justify-center rounded-sm border border-sidebar-border bg-card text-sidebar-muted shadow-[inset_0_1px_0_hsl(0_0%_100%)] transition-calm hover:border-byword-blue/60 hover:bg-byword-blue-soft hover:text-byword-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-1"
                  aria-label="Search pages"
                >
                  <Search className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">Search</TooltipContent>
            </Tooltip>
          ) : (
            <button
              type="button"
              onClick={openSearch}
              className="flex h-8 w-full items-center gap-2 rounded-sm border border-sidebar-border bg-card px-2.5 text-left text-[13px] text-muted-foreground shadow-[inset_0_1px_0_hsl(0_0%_100%)] transition-calm hover:border-byword-blue/60 hover:bg-byword-blue-soft hover:text-byword-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-1"
            >
              <Search className="h-4 w-4" />
              <span className="flex-1">Search</span>
              <span className="text-[11px] text-muted-foreground/60">⌘K</span>
            </button>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-3">
          <SidebarSection title="Create" items={primaryNavigation} locationPath={location.pathname} locationSearch={location.search} isCollapsed={effectiveCollapsed} />
          <SidebarSection title="Monitor" items={monitorNavigation} locationPath={location.pathname} locationSearch={location.search} isCollapsed={effectiveCollapsed} />
          <SidebarSection title="Settings" items={lowerNavigation} locationPath={location.pathname} locationSearch={location.search} isCollapsed={effectiveCollapsed} />
        </nav>

        <div className="border-t border-sidebar-border px-2.5 py-2.5 overflow-hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                data-profile-menu
                className="flex w-full items-center overflow-hidden rounded-sm p-1 text-left transition-calm hover:bg-sidebar-accent"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-secondary bg-secondary text-[11px] font-semibold text-secondary-foreground">
                  {displayName[0].toUpperCase()}
                </span>
                <span className={cn("ml-2 min-w-0 flex-1 shrink-0", effectiveCollapsed && "hidden")}>
                  <span className="block truncate text-[12px] font-medium leading-tight text-foreground">{displayName}</span>
                  <span className="block truncate text-[11px] leading-tight text-sidebar-muted">{email}</span>
                </span>
                <ChevronDown className={cn("ml-2 h-3.5 w-3.5 shrink-0 text-sidebar-muted", effectiveCollapsed && "hidden")} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={8} className="w-56 rounded-md border-byword-border">
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
            <div className="flex items-center gap-2 rounded-sm border border-input bg-card px-3">
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
                  className="flex h-9 w-full items-center gap-3 rounded-sm px-2 text-left text-sm transition-calm hover:bg-byword-blue-soft hover:text-byword-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
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

        <Dialog open={Boolean(switchingSite || isActivating)}>
          <DialogContent
            className="max-w-md gap-0 overflow-hidden p-0 [&>button]:hidden"
            onInteractOutside={(event) => event.preventDefault()}
            onEscapeKeyDown={(event) => event.preventDefault()}
          >
            <DialogTitle className="sr-only">Switching active site</DialogTitle>
            <DialogDescription className="sr-only">
              BlogFactory is changing the active site and refreshing site-specific workspace data.
            </DialogDescription>
            <div className="h-1 factory-divider opacity-70" aria-hidden="true" />
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-sm border border-byword-border bg-byword-blue-soft text-byword-blue factory-panel">
                  <span className="text-sm font-bold">{switchingInitial}</span>
                  <Loader2 className="absolute -right-1 -top-1 h-4 w-4 animate-spin rounded-full bg-card text-byword-blue" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="type-kicker text-muted-foreground">Site routing</p>
                  <h2 className="mt-2 text-xl font-semibold leading-tight text-foreground">
                    Loading {switchingLabel}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    BlogFactory is switching the active domain and refreshing site-scoped settings,
                    integrations, content filters, and workspace data.
                  </p>
                </div>
              </div>

              <div className="mt-6 rounded-md border border-byword-border bg-muted/45 p-4">
                <div className="flex items-center justify-between gap-4">
                  <span className="type-kicker text-muted-foreground">Destination</span>
                  <span className="truncate text-sm font-semibold text-byword-blue">
                    {switchingSite?.domain || "Preparing domain"}
                  </span>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full border border-byword-border bg-card">
                  <div className="h-full w-full origin-left animate-pulse bg-byword-blue" />
                </div>
                <div className="mt-4 grid gap-2 text-xs text-muted-foreground">
                  <div className="flex items-center justify-between gap-3">
                    <span>Current domain</span>
                    <span className="truncate font-medium text-foreground">{activeSite?.domain || "Workspace"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Workspace data</span>
                    <span className="font-medium text-foreground">Refreshing</span>
                  </div>
                </div>
              </div>
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
  exact?: boolean;
};

function SidebarSection({
  title,
  items,
  locationPath,
  locationSearch,
  isCollapsed,
}: {
  title: string;
  items: NavItem[];
  locationPath: string;
  locationSearch: string;
  isCollapsed: boolean;
}) {
  return (
    <div className="mb-4 last:mb-0">
      {!isCollapsed && (
        <p className="mb-1.5 px-2 font-mono text-[10px] font-semibold uppercase text-sidebar-muted/70">
          {title}
        </p>
      )}
      <div className="space-y-0.5">
        {items.map((item) => {
          const currentLocation = `${locationPath}${locationSearch}`;
          const isActive = item.exact
            ? currentLocation === item.href
            : item.href === "/" ? locationPath === "/" : locationPath.startsWith(item.href);
          const inner = (
            <div
              className={cn(
                "flex items-center overflow-hidden rounded-sm transition-calm",
                isCollapsed ? "h-10 justify-center border" : "h-8 border-l-2",
                isActive
                  ? "border-byword-blue bg-byword-blue-soft text-byword-blue shadow-[inset_0_1px_0_hsl(0_0%_100%)]"
                  : "border-transparent text-sidebar-foreground hover:border-sidebar-border hover:bg-card/85 hover:text-sidebar-accent-foreground"
              )}
            >
              <div className={cn("flex shrink-0 items-center justify-center", isCollapsed ? "h-10 w-10" : "h-8 w-8")}>
                <item.icon className="h-4 w-4" strokeWidth={isActive ? 2 : 1.5} />
              </div>
              {!isCollapsed && (
                <span className="shrink-0 whitespace-nowrap pr-2 text-[13px] font-medium">
                  {item.name}
                </span>
              )}
            </div>
          );

          if (isCollapsed) {
            return (
              <Tooltip key={item.name}>
                <TooltipTrigger asChild>
                  <Link to={item.href} aria-label={item.name} className="block">
                    {inner}
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">{item.name}</TooltipContent>
              </Tooltip>
            );
          }

          return <Link key={item.name} to={item.href} className="block">{inner}</Link>;
        })}
      </div>
    </div>
  );
}
