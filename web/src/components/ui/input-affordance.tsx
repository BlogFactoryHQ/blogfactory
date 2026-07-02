import * as React from "react";
import { HelpCircle, X, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export interface InputAffordanceProps extends Omit<React.ComponentProps<"input">, "prefix"> {
  prefix?: string;
  help?: React.ReactNode;
  icon?: LucideIcon;
  onClear?: () => void;
  clearLabel?: string;
}

const InputAffordance = React.forwardRef<HTMLInputElement, InputAffordanceProps>(
  ({ className, prefix, help, icon: Icon, onClear, clearLabel = "Clear input", disabled, value, ...props }, ref) => {
    const showClear = Boolean(onClear && value);

    return (
      <div
        className={cn(
          "flex h-9 w-full items-center rounded-sm border border-input bg-card text-base shadow-[inset_0_1px_2px_hsl(210_5%_20%/0.07)] ring-offset-background focus-within:border-primary focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 md:text-sm",
          disabled && "cursor-not-allowed opacity-50",
          className,
        )}
      >
        {prefix && (
          <span className="flex h-full shrink-0 items-center border-r border-input bg-muted px-3 font-mono text-[12px] text-muted-foreground">
            {prefix}
          </span>
        )}
        {Icon && <Icon className="ml-3 h-4 w-4 shrink-0 text-muted-foreground" />}
        <input
          ref={ref}
          disabled={disabled}
          value={value}
          className="min-w-0 flex-1 bg-transparent px-3 py-2 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          {...props}
        />
        {help && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Input help"
                tabIndex={0}
              >
                <HelpCircle className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs leading-5">{help}</TooltipContent>
          </Tooltip>
        )}
        {showClear && (
          <button
            type="button"
            onClick={onClear}
            className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={clearLabel}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  },
);
InputAffordance.displayName = "InputAffordance";

export { InputAffordance };
