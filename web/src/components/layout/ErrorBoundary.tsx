import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export function isChunkLoadError(error: Error | null) {
  const message = error?.message || "";
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(message);
}

export function cacheBustUrl(current: string, now = Date.now()) {
  const url = new URL(current);
  url.searchParams.set("__bf_reload", String(now));
  return url.toString();
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
    if (isChunkLoadError(error)) {
      const key = "blogfactory:last-chunk-error";
      const message = error.message || "chunk-load-error";
      if (window.sessionStorage.getItem(key) !== message) {
        window.sessionStorage.setItem(key, message);
        window.location.replace(cacheBustUrl(window.location.href));
      }
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex items-center justify-center min-h-[400px] p-8">
          <div className="text-center max-w-md">
            <p className="text-sm font-medium text-foreground mb-1">Something went wrong</p>
            <p className="text-xs text-muted-foreground mb-4">{this.state.error?.message}</p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="text-xs text-foreground underline underline-offset-4 hover:text-foreground/70"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
