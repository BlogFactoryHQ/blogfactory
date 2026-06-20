import { useQuery } from "@tanstack/react-query";
import {
  Bot,
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  Globe2,
  KeyRound,
  Plug,
  Rss,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  BywordCard,
  BywordPageShell,
  IconTile,
  SectionHeader,
} from "@/components/layout/BywordSurface";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ApiKeyMetadata {
  hasOpenrouterKey: boolean;
  openrouterKeyLast4: string | null;
  hasGoogleAiKey: boolean;
  googleKeyLast4: string | null;
  updatedAt: string | null;
}

const publishingIntegrations = [
  {
    id: "wordpress",
    name: "WordPress",
    description: "Publish to posts and pages",
    badge: "CMS",
    status: "Not connected",
    icon: Globe2,
  },
  {
    id: "webflow",
    name: "Webflow",
    description: "Sync to CMS collections",
    badge: "CMS",
    status: "Coming soon",
    icon: Rss,
  },
  {
    id: "shopify",
    name: "Shopify",
    description: "Product descriptions and blog",
    badge: "Commerce",
    status: "Coming soon",
    icon: ShoppingBag,
  },
  {
    id: "ghost",
    name: "Ghost",
    description: "Publish to your Ghost blog",
    badge: "CMS",
    status: "Coming soon",
    icon: CircleDashed,
  },
  {
    id: "hubspot",
    name: "HubSpot",
    description: "Blog posts and landing pages",
    badge: "CRM",
    status: "Coming soon",
    icon: Plug,
  },
  {
    id: "medium",
    name: "Medium",
    description: "Publish to Medium stories",
    badge: "Social",
    status: "Coming soon",
    icon: ExternalLink,
  },
  {
    id: "wix",
    name: "Wix",
    description: "Publish site blog content",
    badge: "CMS",
    status: "Coming soon",
    icon: Sparkles,
  },
];

function IntegrationCard({
  icon,
  name,
  description,
  badge,
  status,
  connected,
  action,
}: {
  icon: typeof Plug;
  name: string;
  description: string;
  badge: string;
  status: string;
  connected?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div className="group flex min-h-[130px] items-center gap-5 rounded-lg border border-byword-border bg-card p-5 transition-calm hover:border-byword-blue/40">
      <IconTile icon={icon} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-foreground">{name}</h3>
          <Badge variant="secondary" className="bg-byword-blue-soft text-byword-blue">
            {badge}
          </Badge>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          {connected ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-status-success" />
          ) : (
            <CircleDashed className="h-3.5 w-3.5" />
          )}
          {status}
        </div>
      </div>
      {action}
    </div>
  );
}

export default function Integrations() {
  const { data: apiKeys } = useQuery({
    queryKey: ["api-keys"],
    queryFn: () => api.get<ApiKeyMetadata>("/settings/api-keys"),
  });

  const aiProviders = [
    {
      id: "openrouter",
      name: "OpenRouter",
      description: "Text generation and OpenRouter-hosted image models",
      badge: "AI",
      icon: Bot,
      connected: !!apiKeys?.hasOpenrouterKey,
      status: apiKeys?.hasOpenrouterKey ? `Configured ****${apiKeys.openrouterKeyLast4}` : "Missing API key",
    },
    {
      id: "google",
      name: "Google Gemini",
      description: "Google AI Studio image generation",
      badge: "Image",
      icon: Sparkles,
      connected: !!apiKeys?.hasGoogleAiKey,
      status: apiKeys?.hasGoogleAiKey ? `Configured ****${apiKeys.googleKeyLast4}` : "Missing API key",
    },
  ];

  return (
    <BywordPageShell className="max-w-7xl">
      <PageHeader
        title="Integrations"
        description="Connect the publishing stack and provider keys BlogFactory will use."
      />

      <div className="space-y-8">
        <div className="grid overflow-hidden rounded-lg border border-byword-border bg-card md:grid-cols-3">
          {[
            ["Publishing", `${publishingIntegrations.length} platforms`],
            ["AI Providers", `${aiProviders.filter((provider) => provider.connected).length} configured`],
            ["Status", "Private beta"],
          ].map(([label, value]) => (
            <div key={label} className="border-b border-byword-border p-6 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
            </div>
          ))}
        </div>

        <BywordCard>
          <SectionHeader
            icon={Globe2}
            title="CMS & Publishing"
            description={`${publishingIntegrations.length} platforms prepared for future connection flows.`}
          />
          <div className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
            {publishingIntegrations.map((integration) => (
              <IntegrationCard
                key={integration.id}
                icon={integration.icon}
                name={integration.name}
                description={integration.description}
                badge={integration.badge}
                status={integration.status}
              />
            ))}
          </div>
        </BywordCard>

        <BywordCard>
          <SectionHeader
            icon={KeyRound}
            title="AI Providers"
            description="Provider availability reflects the encrypted keys saved in Article Settings."
          />
          <div className="grid gap-4 p-6 md:grid-cols-2">
            {aiProviders.map((provider) => (
              <IntegrationCard
                key={provider.id}
                icon={provider.icon}
                name={provider.name}
                description={provider.description}
                badge={provider.badge}
                status={provider.status}
                connected={provider.connected}
                action={
                  <Button
                    asChild
                    size="sm"
                    variant={provider.connected ? "outline" : "default"}
                    className={cn("shrink-0", provider.connected && "text-byword-blue")}
                  >
                    <a href="/settings">
                      {provider.connected ? "Manage" : "Add key"}
                    </a>
                  </Button>
                }
              />
            ))}
          </div>
        </BywordCard>
      </div>
    </BywordPageShell>
  );
}
