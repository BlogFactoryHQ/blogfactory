import { Fragment } from "react";
import { type LucideIcon, MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type RowAction = {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
  shortcut?: string;
  /** Start a new visual group above this item. */
  separatorBefore?: boolean;
};

export interface RowActionsProps {
  actions: RowAction[];
  label?: string;
  /** Accessible name for the trigger, e.g. `Actions for "Draft title"`. */
  triggerLabel?: string;
  align?: "start" | "end";
  className?: string;
  size?: "sm" | "default";
}

/**
 * The single overflow menu for table rows and list items. Row-level destructive
 * operations belong here behind a deliberate second click, never as a bare icon
 * button next to the content.
 */
export function RowActions({
  actions,
  label,
  triggerLabel = "Row actions",
  align = "end",
  className,
  size = "sm",
}: RowActionsProps) {
  const visible = actions.filter(Boolean);
  if (!visible.length) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={triggerLabel}
          className={cn(size === "sm" && "h-8 w-8", className)}
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-52" onClick={(event) => event.stopPropagation()}>
        {label && <DropdownMenuLabel className="truncate">{label}</DropdownMenuLabel>}
        {visible.map((action, index) => (
          <Fragment key={action.label}>
            {(action.separatorBefore || (label && index === 0)) && <DropdownMenuSeparator />}
            <DropdownMenuItem
              variant={action.destructive ? "destructive" : "default"}
              disabled={action.disabled}
              className="cursor-pointer"
              onSelect={(event) => {
                event.preventDefault();
                action.onSelect();
              }}
            >
              {action.icon && <action.icon />}
              <span className="truncate">{action.label}</span>
              {action.shortcut && <DropdownMenuShortcut>{action.shortcut}</DropdownMenuShortcut>}
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
