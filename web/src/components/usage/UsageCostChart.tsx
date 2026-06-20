import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { DailyUsage } from "@/hooks/useUsageAnalytics";
import { format, parseISO } from "date-fns";

interface Props {
  data: DailyUsage[];
}

export function UsageCostChart({ data }: Props) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
        No usage data for this period.
      </div>
    );
  }

  return (
    <div className="h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            dataKey="date"
            tickFormatter={(val) => format(parseISO(val), "MMM d")}
            className="text-xs fill-muted-foreground"
            tick={{ fontSize: 11 }}
          />
          <YAxis
            tickFormatter={(val) => `$${val.toFixed(2)}`}
            className="text-xs fill-muted-foreground"
            tick={{ fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "0.5rem",
              fontSize: "0.75rem",
            }}
            labelFormatter={(val) => format(parseISO(val as string), "MMM d, yyyy")}
            formatter={(value: number) => [`$${value.toFixed(4)}`, "Cost"]}
          />
          <Bar dataKey="cost" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
