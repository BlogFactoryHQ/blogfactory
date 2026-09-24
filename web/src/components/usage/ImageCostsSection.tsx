import { Fragment } from "react";
import { BywordCard, SectionHeader } from "@/components/layout/BywordSurface";
import { StatCard } from "@/components/patterns/StatCard";
import { EmptyState } from "@/components/patterns/EmptyState";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Image, Layers, DollarSign } from "lucide-react";
import { summarizeImageCosts, type ImageCostRow } from "@/lib/image-costs";

interface ImageCostsSectionProps {
  breakdown: ImageCostRow[];
  days: number;
}

export function ImageCostsSection({ breakdown, days }: ImageCostsSectionProps) {
  const providerSummaries = summarizeImageCosts(breakdown);

  const totalImageCost = providerSummaries.reduce((s, p) => s + p.totalCost, 0);
  const totalImageCount = providerSummaries.reduce((s, p) => s + p.imageCount, 0);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 4,
    }).format(amount);

  return (
    <BywordCard>
      <SectionHeader icon={Image} title="Image generation costs" description={`Image spend by provider and model for the last ${days} days.`} />
      <div className="space-y-6 p-4 sm:p-5 lg:p-6">
        {/* Summary stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Total images" icon={Image} value={totalImageCount} hint={`Last ${days} days`} />
          <StatCard
            label="Total image cost"
            icon={DollarSign}
            value={formatCurrency(totalImageCost)}
            hint={`Avg ${formatCurrency(totalImageCount ? totalImageCost / totalImageCount : 0)}/image`}
          />
          <StatCard
            label="Providers used"
            icon={Layers}
            value={providerSummaries.length}
            hint={providerSummaries.length ? (
              <span className="flex flex-wrap gap-1">
                {providerSummaries.map((p) => (
                  <Badge key={p.provider} variant="outline" className="text-xs">
                    {p.label}
                  </Badge>
                ))}
              </span>
            ) : "None yet"}
          />
        </div>

        {/* Breakdown table */}
        {providerSummaries.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider / model</TableHead>
                <TableHead className="text-right">Images</TableHead>
                <TableHead className="text-right">Total cost</TableHead>
                <TableHead className="text-right">Avg cost / image</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {providerSummaries.map((provider) => (
                <Fragment key={provider.provider}>
                  {/* Provider row */}
                  <TableRow key={provider.provider} className="font-medium">
                    <TableCell>{provider.label}</TableCell>
                    <TableCell className="text-right">{provider.imageCount}</TableCell>
                    <TableCell className="text-right">{formatCurrency(provider.totalCost)}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(provider.imageCount ? provider.totalCost / provider.imageCount : 0)}
                    </TableCell>
                  </TableRow>
                  {/* Model sub-rows */}
                  {Array.from(provider.models.entries()).map(([model, stats]) => (
                    <TableRow key={`${provider.provider}-${model}`} className="text-muted-foreground">
                      <TableCell className="pl-8 text-sm">{model}</TableCell>
                      <TableCell className="text-right text-sm">{stats.count}</TableCell>
                      <TableCell className="text-right text-sm">{formatCurrency(stats.cost)}</TableCell>
                      <TableCell className="text-right text-sm">
                        {formatCurrency(stats.count ? stats.cost / stats.count : 0)}
                      </TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            size="row"
            icon={Image}
            title="No image generation data yet"
            description="Image costs appear here after generating posts with images enabled."
            primaryAction={{ label: "Open Article Settings", href: "/control/article-settings?section=images" }}
          />
        )}
      </div>
    </BywordCard>
  );
}
