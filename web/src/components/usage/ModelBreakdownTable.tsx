import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ModelBreakdown } from "@/hooks/useUsageAnalytics";

interface Props {
  data: ModelBreakdown[];
}

export function ModelBreakdownTable({ data }: Props) {
  if (!data.length) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No model usage data yet.
      </div>
    );
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 4 }).format(amount);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Model</TableHead>
          <TableHead className="text-right">Requests</TableHead>
          <TableHead className="text-right">Tokens</TableHead>
          <TableHead className="text-right">Cost</TableHead>
          <TableHead className="text-right">Avg Latency</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row) => (
          <TableRow key={row.model_id}>
            <TableCell className="font-mono text-sm">{row.model_id}</TableCell>
            <TableCell className="text-right">{row.requests}</TableCell>
            <TableCell className="text-right">{row.total_tokens.toLocaleString()}</TableCell>
            <TableCell className="text-right">{formatCurrency(row.total_cost)}</TableCell>
            <TableCell className="text-right">
              {row.avg_latency ? `${Math.round(row.avg_latency)}ms` : "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
