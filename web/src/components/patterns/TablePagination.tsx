import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const PAGE_SIZES = [10, 25, 50, 100];

/**
 * Page numbers to render: always first and last, plus a window around the
 * current page, with `null` marking an elision.
 */
export function paginationWindow(page: number, pages: number, span = 1): Array<number | null> {
  if (pages <= 1) return pages === 1 ? [1] : [];
  const wanted = new Set<number>([1, pages]);
  for (let offset = -span; offset <= span; offset += 1) {
    const candidate = page + offset;
    if (candidate >= 1 && candidate <= pages) wanted.add(candidate);
  }
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: Array<number | null> = [];
  let previous = 0;
  for (const value of sorted) {
    if (previous && value - previous > 1) out.push(null);
    out.push(value);
    previous = value;
  }
  return out;
}

export interface TablePaginationProps {
  page: number;
  pages: number;
  total: number;
  /** Rows rendered on the current page, used for the "showing X to Y" range. */
  rendered: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  /** Plural noun for the range line, e.g. "posts", "runs", "images". */
  noun?: string;
  className?: string;
}

/** The single table footer: range, page size, and page controls. */
export function TablePagination({
  page,
  pages,
  total,
  rendered,
  pageSize,
  onPageChange,
  onPageSizeChange,
  noun = "rows",
  className,
}: TablePaginationProps) {
  if (total <= 0) return null;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = (page - 1) * pageSize + rendered;
  const lastPage = Math.max(pages, 1);

  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <p className="text-sm text-muted-foreground">
        Showing <span className="tabular-nums">{from}</span>–<span className="tabular-nums">{to}</span> of{" "}
        <span className="tabular-nums">{total}</span> {noun}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {onPageSizeChange && (
          <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
            <SelectTrigger className="h-8 w-28" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((count) => (
                <SelectItem key={count} value={String(count)}>
                  {count} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Pagination className="mx-0 w-auto">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious disabled={page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))} />
            </PaginationItem>
            {paginationWindow(page, lastPage).map((value, index) =>
              value === null ? (
                <PaginationItem key={`gap-${index}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={value}>
                  <PaginationLink
                    size="sm"
                    isActive={value === page}
                    onClick={() => onPageChange(value)}
                    aria-label={`Go to page ${value}`}
                  >
                    {value}
                  </PaginationLink>
                </PaginationItem>
              ),
            )}
            <PaginationItem>
              <PaginationNext disabled={page >= lastPage} onClick={() => onPageChange(Math.min(lastPage, page + 1))} />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}
