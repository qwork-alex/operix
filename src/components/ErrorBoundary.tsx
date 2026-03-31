import { Component, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

const errorSuggestions: Record<string, string> = {
  "Failed to fetch": "Check your internet connection and try again.",
  "NetworkError": "The server is unreachable. Please check your connection.",
  "TypeError": "A data format issue occurred. Try refreshing the page.",
  "ChunkLoadError": "The app was updated. Please refresh your browser.",
  "Loading chunk": "The app was updated. Please refresh your browser.",
  "PGRST": "A database query failed. Please retry or contact support.",
  "JWT": "Your session expired. Please sign in again.",
  "auth": "Authentication error. Please sign in again.",
};

function getSuggestion(error: Error | null): string {
  if (!error) return "Try refreshing the page.";
  const msg = error.message || error.name || "";
  for (const [key, suggestion] of Object.entries(errorSuggestions)) {
    if (msg.includes(key)) return suggestion;
  }
  return "Try refreshing the page or navigating back to the dashboard.";
}

function getCategory(error: Error | null): string {
  if (!error) return "Unknown Error";
  const msg = error.message || "";
  if (msg.includes("fetch") || msg.includes("Network")) return "Network Error";
  if (msg.includes("JWT") || msg.includes("auth") || msg.includes("session")) return "Authentication Error";
  if (msg.includes("PGRST") || msg.includes("database")) return "Database Error";
  if (msg.includes("Chunk") || msg.includes("Loading chunk")) return "Update Required";
  return "Application Error";
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
    console.error("[ErrorBoundary] Error:", error.message);
    console.error("[ErrorBoundary] Stack:", error.stack);
    console.error("[ErrorBoundary] Component Stack:", info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      const category = getCategory(this.state.error);
      const suggestion = getSuggestion(this.state.error);
      const details = this.state.error?.message || "No details available";
      return (
        <div className="min-h-[300px] flex flex-col items-center justify-center gap-5 p-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-7 w-7 text-destructive" />
          </div>
          <div className="text-center space-y-2">
            <h2 className="text-lg font-semibold text-foreground">{category}</h2>
            <p className="text-sm text-muted-foreground max-w-md">{suggestion}</p>
            <p className="text-xs text-muted-foreground/60 max-w-md font-mono bg-muted/50 rounded px-3 py-1.5 mt-2">
              {details}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Try again
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.location.assign("/")}
            >
              <Home className="h-4 w-4 mr-2" />
              Go to Dashboard
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(`${category}: ${details}`);
              }}
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy error
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
