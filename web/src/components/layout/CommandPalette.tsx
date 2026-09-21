import { useDeferredValue, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BarChart3,
  Bot,
  FileText,
  Globe2,
  HelpCircle,
  ImageIcon,
  LayoutDashboard,
  LifeBuoy,
  ListTodo,
  MessageSquarePlus,
  type LucideIcon,
  Palette,
  Plug,
  Plus,
  Rss,
  Search,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useAuth } from "@/hooks/useAuth";
import { useSites, type Site } from "@/hooks/useSites";
import { api } from "@/lib/api";
import { DOCS_URL, FEEDBACK_URL, HELP_URL, openExternal } from "@/lib/external-links";
import { postListPath, type ListPagination } from "@/lib/list-query";

type CommandEntry = {
  id: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  shortcut?: string;
  run: () => void;
};

type PostSearchResponse = {
  items: Array<{ id: string; title: string; status: string; updated_at: string }>;
  pagination: ListPagination;
};

const NAV_TARGETS: Array<{ label: string; hint: string; to: string; icon: LucideIcon }> = [
  { label: "Overview", hint: "Workspace summary", to: "/", icon: LayoutDashboard },
  { label: "Create Content", hint: "Start a generation run", to: "/create", icon: Plus },
  { label: "Review Queue", hint: "Drafts needing a decision", to: "/review", icon: FileText },
  { label: "Runs", hint: "Jobs, cost, recovery", to: "/runs", icon: ListTodo },
  { label: "Search Growth", hint: "Evidence and growth plan", to: "/overview/growth", icon: Search },
  { label: "Sources · RSS", hint: "Scheduled content sources", to: "/sources/rss", icon: Rss },
  { label: "Sources · Campaigns", hint: "Keyword batches", to: "/sources/campaigns", icon: Sparkles },
  { label: "Sources · Batch Import", hint: "Import an archive", to: "/sources/batch-import", icon: FileText },
  { label: "Content", hint: "All drafts and posts", to: "/library/content", icon: FileText },
  { label: "Image Gallery", hint: "Generated and stock images", to: "/library/images", icon: ImageIcon },
  { label: "Control · MCP Connections", hint: "Agent access tokens", to: "/control/connections", icon: Bot },
  { label: "Control · Integrations", hint: "CMS destinations", to: "/control/integrations", icon: Plug },
  { label: "Control · Sites", hint: "Connected domains", to: "/control/sites", icon: Globe2 },
  { label: "Control · Brand Voice", hint: "Writer profiles", to: "/control/brand-voice", icon: Palette },
  { label: "Control · Article Settings", hint: "Models, images, knowledge", to: "/control/article-settings", icon: Settings },
  { label: "Control · Usage", hint: "Spend and budget", to: "/control/usage", icon: BarChart3 },
];

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { sites, activeSiteId, activateSite } = useSites();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const trimmed = deferredQuery.trim();

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const postSearch = useQuery({
    queryKey: ["command-palette-posts", trimmed],
    queryFn: () =>
      api.get<PostSearchResponse>(
        postListPath({
          page: 1,
          limit: 5,
          search: trimmed,
          status: "all",
          sourceType: "all",
          modelId: "all",
          personaId: "all",
          campaignId: "all",
          sort: "created_at",
          direction: "desc",
        }),
      ),
    enabled: open && trimmed.length >= 2,
    staleTime: 15_000,
  });

  const go = (to: string) => {
    onOpenChange(false);
    navigate(to);
  };

  const switchTo = async (site: Site) => {
    onOpenChange(false);
    if (site.id === activeSiteId) return;
    try {
      await activateSite(site.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not switch sites");
    }
  };

  const actions: CommandEntry[] = [
    { id: "create", label: "Create content", hint: "New generation run", icon: Plus, run: () => go("/create") },
    { id: "add-source", label: "Add a content source", hint: "RSS or news feed", icon: Rss, run: () => go("/sources/rss/new") },
    { id: "connect-cms", label: "Connect a CMS destination", hint: "WordPress, Ghost, Wix, Framer", icon: Plug, run: () => go("/control/integrations") },
    { id: "connect-agent", label: "Connect an MCP client", hint: "Site-scoped agent access", icon: Bot, run: () => go("/control/connections") },
    ...(user?.role === "admin"
      ? [{ id: "admin", label: "Manage users", hint: "Approvals and roles", icon: Users, run: () => go("/admin/users") } as CommandEntry]
      : []),
  ];

  const help: CommandEntry[] = [
    { id: "docs", label: "Documentation", icon: HelpCircle, run: () => { onOpenChange(false); openExternal(DOCS_URL); } },
    { id: "help", label: "Help center", icon: LifeBuoy, run: () => { onOpenChange(false); openExternal(HELP_URL); } },
    { id: "feedback", label: "Send feedback", icon: MessageSquarePlus, run: () => { onOpenChange(false); openExternal(FEEDBACK_URL); } },
  ];

  const posts = postSearch.data?.items || [];

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Command menu" description="Search pages, sites, content, and actions.">
      <CommandInput value={query} onValueChange={setQuery} placeholder="Search pages, sites, content, actions…" />
      <CommandList>
        <CommandEmpty>
          {trimmed.length >= 2 && postSearch.isFetching ? "Searching…" : "Nothing matches that search."}
        </CommandEmpty>

        <CommandGroup heading="Go to">
          {NAV_TARGETS.map((target) => (
            <CommandItem key={target.to} value={`${target.label} ${target.hint}`} onSelect={() => go(target.to)}>
              <target.icon />
              <span className="truncate">{target.label}</span>
              <span className="ml-auto hidden truncate pl-3 text-xs text-muted-foreground sm:inline">{target.hint}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        {posts.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Content">
              {posts.map((post) => (
                <CommandItem key={post.id} value={`post ${post.id} ${post.title}`} keywords={[trimmed]} onSelect={() => go(`/library/posts/${post.id}/preview`)}>
                  <FileText />
                  <span className="truncate">{post.title}</span>
                  <CommandShortcut>{post.status}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {sites.length > 1 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Switch site">
              {sites.map((site) => (
                <CommandItem key={site.id} value={`site ${site.name} ${site.domain}`} onSelect={() => switchTo(site)}>
                  <Globe2 />
                  <span className="truncate">{site.domain}</span>
                  {site.id === activeSiteId && <CommandShortcut>active</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading="Actions">
          {actions.map((action) => (
            <CommandItem key={action.id} value={`${action.label} ${action.hint || ""}`} onSelect={action.run}>
              <action.icon />
              <span className="truncate">{action.label}</span>
              {action.hint && <span className="ml-auto hidden truncate pl-3 text-xs text-muted-foreground sm:inline">{action.hint}</span>}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading="Help">
          {help.map((entry) => (
            <CommandItem key={entry.id} value={entry.label} onSelect={entry.run}>
              <entry.icon />
              <span className="truncate">{entry.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
