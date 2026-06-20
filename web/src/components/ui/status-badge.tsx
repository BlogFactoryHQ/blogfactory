import { cn } from "@/lib/utils";
import { CheckCircle, Clock, AlertCircle, Loader2, Circle } from "lucide-react";

type StatusType = "success" | "warning" | "error" | "pending" | "running" | "draft" | "active" | "paused";

interface StatusBadgeProps {
  status: StatusType;
  label?: string;
  showIcon?: boolean;
  className?: string;
}

const statusConfig: Record<StatusType, { 
  className: string; 
  icon: typeof CheckCircle;
  defaultLabel: string;
}> = {
  success: {
    className: "status-badge-success",
    icon: CheckCircle,
    defaultLabel: "Completed",
  },
  warning: {
    className: "status-badge-warning",
    icon: AlertCircle,
    defaultLabel: "Warning",
  },
  error: {
    className: "status-badge-error",
    icon: AlertCircle,
    defaultLabel: "Failed",
  },
  pending: {
    className: "status-badge-pending",
    icon: Clock,
    defaultLabel: "Pending",
  },
  running: {
    className: "status-badge-running",
    icon: Loader2,
    defaultLabel: "Running",
  },
  draft: {
    className: "status-badge-pending",
    icon: Circle,
    defaultLabel: "Draft",
  },
  active: {
    className: "status-badge-success",
    icon: CheckCircle,
    defaultLabel: "Active",
  },
  paused: {
    className: "status-badge-warning",
    icon: Clock,
    defaultLabel: "Paused",
  },
};

export function StatusBadge({ status, label, showIcon = true, className }: StatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;
  const displayLabel = label || config.defaultLabel;

  return (
    <span className={cn("status-badge", config.className, className)}>
      {showIcon && (
        <Icon 
          className={cn(
            "h-3.5 w-3.5",
            status === "running" && "animate-spin"
          )} 
        />
      )}
      {displayLabel}
    </span>
  );
}
