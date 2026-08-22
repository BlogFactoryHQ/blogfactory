import { PageHeader } from "@/components/layout/PageHeader";
import { BywordPageShell } from "@/components/layout/BywordSurface";
import { McpConnectionsPanel } from "@/components/settings/McpConnectionsPanel";

export default function ControlConnections() {
  return <BywordPageShell className="max-w-7xl">
    <PageHeader title="MCP Connections" description="Authorize site-scoped agent access and inspect the current server catalog." />
    <McpConnectionsPanel />
  </BywordPageShell>;
}
