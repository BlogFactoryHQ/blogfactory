import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Activity, Search, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { CUSTOMER_FILTERS, accessStatus, formatDate, formatDateTime, planLabel, type CustomerFilter, type CustomerSummary } from "@/lib/admin-customers";
import { cn } from "@/lib/utils";

export default function AdminCustomers() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CustomerFilter>("all");

  const params = new URLSearchParams({ filter });
  if (query.trim()) params.set("q", query.trim());
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-customers", filter, query.trim()],
    queryFn: () => api.get<{ customers: CustomerSummary[]; total: number }>(`/admin/customers?${params}`),
    placeholderData: (previous) => previous,
  });
  const customers = data?.customers || [];

  return (
    <div className="p-6">
      <PageHeader title="Customers" description="Look up an account, see its plan, sites and recent jobs, and suspend abusive accounts.">
        <Button variant="outline" size="sm" asChild>
          <Link to="/admin/status"><Activity className="mr-1.5 h-3.5 w-3.5" />System status</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to="/admin/users"><Users className="mr-1.5 h-3.5 w-3.5" />Approvals &amp; roles</Link>
        </Button>
      </PageHeader>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by email or name"
            className="pl-8"
            aria-label="Search customers"
            autoFocus
          />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter customers">
          {CUSTOMER_FILTERS.map((option) => (
            <Button
              key={option.value}
              size="sm"
              variant={filter === option.value ? "default" : "outline"}
              aria-pressed={filter === option.value}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Access</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="text-right">Sites</TableHead>
                <TableHead className="text-right">Posts</TableHead>
                <TableHead className="text-right">Drafts this month</TableHead>
                <TableHead>Last login</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="h-24 text-center text-muted-foreground">Loading customers…</TableCell></TableRow>
              ) : error ? (
                <TableRow><TableCell colSpan={8} className="h-24 text-center text-destructive">{(error as Error).message}</TableCell></TableRow>
              ) : customers.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="h-24 text-center text-muted-foreground">No customers match.</TableCell></TableRow>
              ) : customers.map((row) => {
                const access = accessStatus(row);
                return (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/admin/customers/${row.id}`)}
                  >
                    <TableCell>
                      <Link to={`/admin/customers/${row.id}`} className="font-medium hover:underline" onClick={(event) => event.stopPropagation()}>
                        {row.email}
                      </Link>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {row.displayName && <span>{row.displayName}</span>}
                        {row.role === "admin" && <Badge variant="outline" className="px-1.5 py-0 text-[10px]">admin</Badge>}
                      </div>
                    </TableCell>
                    <TableCell><StatusBadge status={access.status} label={access.label} /></TableCell>
                    <TableCell>
                      <div className="text-sm">{planLabel(row.plan)}</div>
                      {row.entitlementSource && (
                        <div className="text-xs text-muted-foreground">
                          {row.entitlementSource}{row.entitlementExpiresAt ? ` · until ${formatDate(row.entitlementExpiresAt)}` : ""}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.sites}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", row.posts === 0 && "text-muted-foreground")}>{row.posts}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.draftsThisMonth}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDateTime(row.lastLoginAt)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(row.createdAt)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {data && <p className="mt-3 text-xs text-muted-foreground">Showing {customers.length} of {data.total} accounts.</p>}
    </div>
  );
}
