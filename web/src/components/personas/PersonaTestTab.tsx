import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Wrench,
  Globe,
  FileText,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
}

interface ExecutionTrace {
  timestamp: string;
  type: "input" | "tool_call" | "tool_result" | "plugin" | "output" | "error";
  content: string;
  metadata?: Record<string, unknown>;
}

interface TestResult {
  success: boolean;
  output: string;
  toolCalls: ToolCall[];
  pluginsUsed: string[];
  executionTime: number;
  tokenUsage?: { prompt: number; completion: number; total: number };
  trace: ExecutionTrace[];
  validationErrors?: string[];
}

interface PersonaTestTabProps {
  personaId: string;
}

export function PersonaTestTab({ personaId }: PersonaTestTabProps) {
  const [testInput, setTestInput] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  const runTest = async () => {
    if (!testInput.trim()) {
      toast.error("Please enter a test prompt");
      return;
    }

    setIsRunning(true);
    setResult(null);

    try {
      const data = await api.post<TestResult>(`/personas/${personaId}/test`, {
        prompt: testInput,
        sourceUrl: sourceUrl || undefined,
      });

      setResult(data);

      if (data.success) {
        toast.success("Test completed successfully");
      } else {
        toast.warning("Test completed with validation errors");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Test failed";
      toast.error(message);
      setResult({
        success: false,
        output: "",
        toolCalls: [],
        pluginsUsed: [],
        executionTime: 0,
        trace: [
          {
            timestamp: new Date().toISOString(),
            type: "error",
            content: message,
          },
        ],
      });
    } finally {
      setIsRunning(false);
    }
  };

  const getTraceIcon = (type: ExecutionTrace["type"]) => {
    switch (type) {
      case "tool_call":
        return <Wrench className="h-4 w-4 text-blue-500" />;
      case "tool_result":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "plugin":
        return <Globe className="h-4 w-4 text-purple-500" />;
      case "error":
        return <XCircle className="h-4 w-4 text-destructive" />;
      case "input":
        return <FileText className="h-4 w-4 text-muted-foreground" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Test Harness</h3>
        <p className="text-sm text-muted-foreground">
          Test your agent configuration before using it in production
        </p>
      </div>

      {/* Test Input */}
      <div className="grid grid-cols-1 gap-4">
        <div className="space-y-2">
          <Label className="section-label">Test Prompt</Label>
          <Textarea
            value={testInput}
            onChange={(e) => setTestInput(e.target.value)}
            placeholder="Enter a test message for the agent..."
            className="min-h-[100px]"
          />
        </div>

        <div className="space-y-2">
          <Label className="section-label">Source URL (optional)</Label>
          <Input
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://example.com/article-to-summarize"
          />
          <p className="text-xs text-muted-foreground">
            Provide a URL for content extraction testing
          </p>
        </div>
      </div>

      <Button onClick={runTest} disabled={isRunning} className="w-full">
        {isRunning ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Running Test...
          </>
        ) : (
          <>
            <Play className="h-4 w-4 mr-2" />
            Run Test
          </>
        )}
      </Button>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Status Banner */}
          <div
            className={`p-4 rounded-lg border ${
              result.success
                ? "bg-green-500/10 border-green-500/30"
                : "bg-destructive/10 border-destructive/30"
            }`}
          >
            <div className="flex items-center gap-3">
              {result.success ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-destructive" />
              )}
              <div>
                <p className="font-medium">
                  {result.success ? "Test Passed" : "Test Failed"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Execution time: {result.executionTime}ms
                  {result.tokenUsage && (
                    <> | Tokens: {result.tokenUsage.total}</>
                  )}
                </p>
              </div>
            </div>

            {result.validationErrors && result.validationErrors.length > 0 && (
              <div className="mt-3 space-y-1">
                {result.validationErrors.map((err, i) => (
                  <p key={i} className="text-sm text-destructive">
                    • {err}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Execution Trace */}
          <div className="border border-border rounded-lg">
            <div className="p-3 border-b border-border bg-muted/30">
              <h4 className="font-medium">Execution Trace</h4>
            </div>
            <ScrollArea className="h-48">
              <div className="p-3 space-y-2">
                {result.trace.map((step, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    {getTraceIcon(step.type)}
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-xs text-muted-foreground">
                        {new Date(step.timestamp).toLocaleTimeString()}
                      </p>
                      <p className="truncate">{step.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Tools & Plugins Used */}
          {(result.toolCalls.length > 0 || result.pluginsUsed.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {result.toolCalls.map((tool) => (
                <Badge key={tool.id} variant="secondary">
                  <Wrench className="h-3 w-3 mr-1" />
                  {tool.name}
                </Badge>
              ))}
              {result.pluginsUsed.map((plugin) => (
                <Badge key={plugin} variant="outline">
                  <Globe className="h-3 w-3 mr-1" />
                  {plugin}
                </Badge>
              ))}
            </div>
          )}

          {/* Output Preview */}
          {result.output && (
            <div className="rounded-md border border-border bg-card factory-panel">
              <div className="p-3 border-b border-border bg-muted/30">
                <h4 className="font-medium">Generated Output</h4>
              </div>
              <ScrollArea className="h-64">
                <div className="prose prose-sm max-w-none p-4">
                  <ReactMarkdown>{result.output}</ReactMarkdown>
                </div>
              </ScrollArea>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
