import { useCallback, useRef, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Link as LinkIcon,
  Image as ImageIcon,
  Minus,
  Table,
  CheckSquare,
  Undo2,
  Redo2,
  Columns2,
  Eye,
  Edit3,
  Copy,
  Maximize2,
  Minimize2,
  Eraser,
} from "lucide-react";
import { toast } from "sonner";
import { cleanGeneratedPostContent } from "@/lib/post-cleanup";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

type ViewMode = "edit" | "preview" | "split";

interface ToolbarAction {
  icon: typeof Bold;
  label: string;
  shortcut?: string;
  action: (textarea: HTMLTextAreaElement, value: string, onChange: (v: string) => void) => void;
  separator?: boolean;
}

// Helper to wrap selected text or insert at cursor
function wrapSelection(
  textarea: HTMLTextAreaElement,
  value: string,
  onChange: (v: string) => void,
  before: string,
  after: string = "",
  placeholder: string = ""
) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = value.substring(start, end);
  const replacement = selected || placeholder;
  const newText = value.substring(0, start) + before + replacement + after + value.substring(end);
  onChange(newText);
  
  // Set cursor position after update
  requestAnimationFrame(() => {
    textarea.focus();
    if (selected) {
      textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
    } else {
      textarea.setSelectionRange(start + before.length, start + before.length + placeholder.length);
    }
  });
}

// Insert at line start
function insertAtLineStart(
  textarea: HTMLTextAreaElement,
  value: string,
  onChange: (v: string) => void,
  prefix: string
) {
  const start = textarea.selectionStart;
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const newText = value.substring(0, lineStart) + prefix + value.substring(lineStart);
  onChange(newText);
  
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(start + prefix.length, start + prefix.length);
  });
}

// Insert text block
function insertBlock(
  textarea: HTMLTextAreaElement,
  value: string,
  onChange: (v: string) => void,
  block: string,
  cursorOffset: number = 0
) {
  const start = textarea.selectionStart;
  const newText = value.substring(0, start) + block + value.substring(start);
  onChange(newText);
  
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(start + cursorOffset, start + cursorOffset);
  });
}

const toolbarActions: ToolbarAction[] = [
  {
    icon: Bold,
    label: "Bold",
    shortcut: "Ctrl+B",
    action: (t, v, o) => wrapSelection(t, v, o, "**", "**", "bold text"),
  },
  {
    icon: Italic,
    label: "Italic",
    shortcut: "Ctrl+I",
    action: (t, v, o) => wrapSelection(t, v, o, "_", "_", "italic text"),
  },
  {
    icon: Strikethrough,
    label: "Strikethrough",
    action: (t, v, o) => wrapSelection(t, v, o, "~~", "~~", "strikethrough"),
  },
  {
    icon: Code,
    label: "Inline Code",
    shortcut: "Ctrl+`",
    action: (t, v, o) => wrapSelection(t, v, o, "`", "`", "code"),
    separator: true,
  },
  {
    icon: Heading1,
    label: "Heading 1",
    action: (t, v, o) => insertAtLineStart(t, v, o, "# "),
  },
  {
    icon: Heading2,
    label: "Heading 2",
    action: (t, v, o) => insertAtLineStart(t, v, o, "## "),
  },
  {
    icon: Heading3,
    label: "Heading 3",
    action: (t, v, o) => insertAtLineStart(t, v, o, "### "),
    separator: true,
  },
  {
    icon: List,
    label: "Bullet List",
    action: (t, v, o) => insertAtLineStart(t, v, o, "- "),
  },
  {
    icon: ListOrdered,
    label: "Numbered List",
    action: (t, v, o) => insertAtLineStart(t, v, o, "1. "),
  },
  {
    icon: CheckSquare,
    label: "Task List",
    action: (t, v, o) => insertAtLineStart(t, v, o, "- [ ] "),
  },
  {
    icon: Quote,
    label: "Blockquote",
    action: (t, v, o) => insertAtLineStart(t, v, o, "> "),
    separator: true,
  },
  {
    icon: LinkIcon,
    label: "Link",
    shortcut: "Ctrl+K",
    action: (t, v, o) => wrapSelection(t, v, o, "[", "](url)", "link text"),
  },
  {
    icon: ImageIcon,
    label: "Image",
    action: (t, v, o) => insertBlock(t, v, o, "![alt text](image-url)", 2),
  },
  {
    icon: Minus,
    label: "Horizontal Rule",
    action: (t, v, o) => insertBlock(t, v, o, "\n---\n", 5),
    separator: true,
  },
  {
    icon: Table,
    label: "Table",
    action: (t, v, o) => insertBlock(
      t, v, o,
      "\n| Header | Header |\n|--------|--------|\n| Cell   | Cell   |\n",
      10
    ),
  },
];

export function MarkdownEditor({
  value,
  onChange,
  placeholder = "Write your content in Markdown...",
  className,
}: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [history, setHistory] = useState<string[]>([value]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const editorRef = useRef<HTMLDivElement>(null);

  // Sync scroll between editor and preview
  const previewRef = useRef<HTMLDivElement>(null);
  
  const handleScroll = useCallback((e: React.UIEvent<HTMLTextAreaElement>) => {
    if (previewRef.current && viewMode === "split") {
      const textarea = e.currentTarget;
      const scrollRatio = textarea.scrollTop / (textarea.scrollHeight - textarea.clientHeight);
      const previewScrollTop = scrollRatio * (previewRef.current.scrollHeight - previewRef.current.clientHeight);
      previewRef.current.scrollTop = previewScrollTop;
    }
  }, [viewMode]);

  // Track history for undo/redo
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (value !== history[historyIndex]) {
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(value);
        if (newHistory.length > 50) newHistory.shift();
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
      }
    }, 500);
    return () => clearTimeout(timeout);
  }, [value]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      onChange(history[historyIndex - 1]);
    }
  }, [historyIndex, history, onChange]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      onChange(history[historyIndex + 1]);
    }
  }, [historyIndex, history, onChange]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!textareaRef.current) return;
      
      if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        e.preventDefault();
        toolbarActions.find(a => a.label === "Bold")?.action(textareaRef.current, value, onChange);
      } else if ((e.ctrlKey || e.metaKey) && e.key === "i") {
        e.preventDefault();
        toolbarActions.find(a => a.label === "Italic")?.action(textareaRef.current, value, onChange);
      } else if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        toolbarActions.find(a => a.label === "Link")?.action(textareaRef.current, value, onChange);
      } else if ((e.ctrlKey || e.metaKey) && e.key === "`") {
        e.preventDefault();
        toolbarActions.find(a => a.label === "Inline Code")?.action(textareaRef.current, value, onChange);
      } else if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        if (e.shiftKey) {
          e.preventDefault();
          redo();
        } else {
          e.preventDefault();
          undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault();
        redo();
      }
    };

    const editor = editorRef.current;
    if (editor) {
      editor.addEventListener("keydown", handleKeyDown);
      return () => editor.removeEventListener("keydown", handleKeyDown);
    }
  }, [value, onChange, undo, redo]);

  // Handle tab key for indentation
  const handleKeyDownTextarea = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;
      
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      
      if (e.shiftKey) {
        // Outdent
        const lineStart = value.lastIndexOf("\n", start - 1) + 1;
        if (value.substring(lineStart, lineStart + 2) === "  ") {
          const newText = value.substring(0, lineStart) + value.substring(lineStart + 2);
          onChange(newText);
          requestAnimationFrame(() => {
            textarea.setSelectionRange(Math.max(start - 2, lineStart), Math.max(end - 2, lineStart));
          });
        }
      } else {
        // Indent
        const newText = value.substring(0, start) + "  " + value.substring(end);
        onChange(newText);
        requestAnimationFrame(() => {
          textarea.setSelectionRange(start + 2, start + 2);
        });
      }
    }
  };

  const copyContent = () => {
    navigator.clipboard.writeText(value);
    toast.success("Content copied to clipboard");
  };

  const cleanContent = () => {
    const cleaned = cleanGeneratedPostContent(value);
    if (cleaned === value) return toast.info("No AI notes found");
    onChange(cleaned);
    toast.success("AI notes removed");
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  return (
    <div
      ref={editorRef}
      className={cn(
        "flex flex-col rounded-lg border border-border bg-background overflow-hidden",
        isFullscreen && "fixed inset-4 z-50 shadow-2xl",
        className
      )}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 p-2 border-b border-border bg-muted/30 flex-wrap">
        {/* Undo/Redo */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={undo}
              disabled={historyIndex <= 0}
            >
              <Undo2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Undo (Ctrl+Z)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={redo}
              disabled={historyIndex >= history.length - 1}
            >
              <Redo2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Redo (Ctrl+Y)</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* Formatting Actions */}
        {toolbarActions.map((action, index) => (
          <div key={action.label} className="contents">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    if (textareaRef.current) {
                      action.action(textareaRef.current, value, onChange);
                    }
                  }}
                >
                  <action.icon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {action.label}
                {action.shortcut && (
                  <span className="ml-2 text-muted-foreground text-xs">
                    {action.shortcut}
                  </span>
                )}
              </TooltipContent>
            </Tooltip>
            {action.separator && index < toolbarActions.length - 1 && (
              <Separator orientation="vertical" className="h-6 mx-1" />
            )}
          </div>
        ))}

        <div className="flex-1" />

        {/* View Mode Toggle */}
        <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={viewMode === "edit" ? "secondary" : "ghost"}
                size="icon"
                className="h-7 w-7"
                onClick={() => setViewMode("edit")}
              >
                <Edit3 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Edit Only</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={viewMode === "split" ? "secondary" : "ghost"}
                size="icon"
                className="h-7 w-7"
                onClick={() => setViewMode("split")}
              >
                <Columns2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Split View</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={viewMode === "preview" ? "secondary" : "ghost"}
                size="icon"
                className="h-7 w-7"
                onClick={() => setViewMode("preview")}
              >
                <Eye className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Preview Only</TooltipContent>
          </Tooltip>
        </div>

        <Separator orientation="vertical" className="h-6 mx-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={copyContent}>
              <Copy className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Copy Content</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={cleanContent}>
              <Eraser className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Remove AI Notes</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleFullscreen}>
              {isFullscreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Editor Area */}
      <div className="flex-1 flex min-h-0">
        {/* Editor */}
        {viewMode !== "preview" && (
          <div className={cn("flex-1 flex flex-col min-w-0", viewMode === "split" && "border-r border-border")}>
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDownTextarea}
              onScroll={handleScroll}
              placeholder={placeholder}
              spellCheck={false}
              className={cn(
                "flex-1 w-full resize-none border-0 bg-transparent p-4",
                "font-mono text-sm leading-relaxed",
                "focus:outline-none focus:ring-0",
                "placeholder:text-muted-foreground/50"
              )}
            />
          </div>
        )}

        {/* Preview */}
        {viewMode !== "edit" && (
          <div
            ref={previewRef}
            className={cn(
              "flex-1 overflow-auto p-4 min-w-0",
              viewMode === "split" && "bg-muted/20"
            )}
          >
            <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-p:leading-relaxed prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-pre:bg-muted prose-pre:border prose-pre:border-border">
              {value ? (
                <ReactMarkdown
                  skipHtml={true}
                  disallowedElements={['script', 'iframe', 'object', 'embed', 'form', 'input', 'button']}
                  unwrapDisallowed={true}
                >
                  {value}
                </ReactMarkdown>
              ) : (
                <p className="text-muted-foreground italic">Nothing to preview yet...</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border bg-muted/30 text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <span>{value.length} characters</span>
          <span>{value.split(/\s+/).filter(Boolean).length} words</span>
          <span>{value.split("\n").length} lines</span>
        </div>
        <div className="flex items-center gap-2">
          <span>Markdown</span>
        </div>
      </div>
    </div>
  );
}
