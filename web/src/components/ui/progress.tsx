import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "@/lib/utils";

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn("relative h-2.5 w-full overflow-hidden rounded-sm border border-border bg-muted shadow-[inset_0_1px_2px_hsl(210_5%_20%/0.12)]", className)}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className="h-full w-full flex-1 bg-primary shadow-[inset_0_1px_0_hsl(0_0%_100%/0.24)] transition-all"
      style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
    />
  </ProgressPrimitive.Root>
));
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
