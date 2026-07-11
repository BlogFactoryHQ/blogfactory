import { Fragment } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Image className="h-4 w-4" />
          Image Generation Costs
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-muted/50 border border-border">
            <div className="flex items-center gap-2 mb-1">
              <Image className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Images</span>
            </div>
            <p className="text-2xl font-bold">{totalImageCount}</p>
            <p className="text-xs text-muted-foreground">Last {days} days</p>
          </div>
          <div className="p-4 rounded-lg bg-muted/50 border border-border">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Image Cost</span>
            </div>
            <p className="text-2xl font-bold">{formatCurrency(totalImageCost)}</p>
            <p className="text-xs text-muted-foreground">
              Avg {formatCurrency(totalImageCount ? totalImageCost / totalImageCount : 0)}/image
            </p>
          </div>
          <div className="p-4 rounded-lg bg-muted/50 border border-border">
            <div className="flex items-center gap-2 mb-1">
              <Layers className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Providers Used</span>
            </div>
            <p className="text-2xl font-bold">{providerSummaries.length}</p>
            <div className="flex gap-1 mt-1 flex-wrap">
              {providerSummaries.map((p) => (
                <Badge key={p.provider} variant="outline" className="text-xs">
                  {p.label}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        {/* Breakdown table */}
        {providerSummaries.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider / Model</TableHead>
                <TableHead className="text-right">Images</TableHead>
                <TableHead className="text-right">Total Cost</TableHead>
                <TableHead className="text-right">Avg Cost / Image</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {providerSummaries.map((provider) => (
                <Fragment key={provider.provider}>
                  {/* Provider row */}
                  <TableRow key={provider.provider} className="font-medium bg-muted/30">
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
          <div className="text-center py-8 text-muted-foreground">
            <Image className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No image generation data yet</p>
            <p className="text-xs">Image costs will appear here after generating posts with images enabled</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
