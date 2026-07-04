import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-sm border font-mono text-[13px] font-semibold ring-offset-background transition-calm active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border-[#D43A14] bg-primary text-primary-foreground shadow-[inset_0_1px_0_hsl(0_0%_100%/0.32),inset_0_-2px_0_hsl(210_5%_13%/0.18),0_1px_0_hsl(210_5%_13%/0.22)] hover:bg-[#F04416]",
        destructive:
          "border-destructive bg-destructive text-destructive-foreground shadow-[inset_0_1px_0_hsl(0_0%_100%/0.28),inset_0_-2px_0_hsl(210_5%_13%/0.18),0_1px_0_hsl(210_5%_13%/0.22)] hover:bg-destructive/90",
        outline:
          "border-input bg-card text-foreground shadow-[inset_0_1px_0_hsl(0_0%_100%),0_1px_0_hsl(210_5%_20%/0.10)] hover:border-byword-blue/55 hover:bg-byword-blue-soft/45",
        secondary:
          "border-secondary bg-secondary text-secondary-foreground shadow-[inset_0_1px_0_hsl(0_0%_100%/0.12),inset_0_-2px_0_hsl(0_0%_0%/0.35),0_1px_0_hsl(210_5%_13%/0.28)] hover:bg-secondary/90",
        ghost: "border-transparent text-muted-foreground hover:bg-byword-blue-soft/80 hover:text-byword-blue",
        link: "border-transparent text-byword-blue underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-6",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
