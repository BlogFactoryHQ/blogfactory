import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Plus, Trash2, Wrench, Code } from "lucide-react";
import { toast } from "sonner";

interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
  enabled: boolean;
}

interface PersonaToolsTabProps {
  toolsConfig: ToolDefinition[];
  toolChoice: string;
  parallelToolCalls: boolean;
  onChange: (updates: {
    tools_config?: ToolDefinition[];
    tool_choice?: string;
    parallel_tool_calls?: boolean;
  }) => void;
}

const DEFAULT_TOOL: Omit<ToolDefinition, "id"> = {
  name: "",
  description: "",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
  enabled: true,
};

export function PersonaToolsTab({
  toolsConfig,
  toolChoice,
  parallelToolCalls,
  onChange,
}: PersonaToolsTabProps) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingTool, setEditingTool] = useState<ToolDefinition | null>(null);
  const [newTool, setNewTool] = useState<Omit<ToolDefinition, "id">>({ ...DEFAULT_TOOL });
  const [parametersJson, setParametersJson] = useState("{}");

  const handleAddTool = () => {
    if (!newTool.name.trim()) {
      toast.error("Tool name is required");
      return;
    }

    try {
      const parsedParams = JSON.parse(parametersJson);
      const tool: ToolDefinition = {
        id: crypto.randomUUID(),
        ...newTool,
        parameters: {
          type: "object",
          properties: parsedParams.properties || parsedParams || {},
          required: parsedParams.required || [],
        },
      };

      onChange({ tools_config: [...toolsConfig, tool] });
      setNewTool({ ...DEFAULT_TOOL });
      setParametersJson("{}");
      setIsAddOpen(false);
      toast.success("Tool added");
    } catch {
      toast.error("Invalid JSON in parameters schema");
    }
  };

  const handleUpdateTool = () => {
    if (!editingTool) return;

    try {
      const parsedParams = JSON.parse(parametersJson);
      const updated: ToolDefinition = {
        ...editingTool,
        parameters: {
          type: "object",
          properties: parsedParams.properties || parsedParams || {},
          required: parsedParams.required || [],
        },
      };

      onChange({
        tools_config: toolsConfig.map((t) => (t.id === updated.id ? updated : t)),
      });
      setEditingTool(null);
      setParametersJson("{}");
      toast.success("Tool updated");
    } catch {
      toast.error("Invalid JSON in parameters schema");
    }
  };

  const handleDeleteTool = (id: string) => {
    onChange({ tools_config: toolsConfig.filter((t) => t.id !== id) });
    toast.success("Tool removed");
  };

  const handleToggleTool = (id: string, enabled: boolean) => {
    onChange({
      tools_config: toolsConfig.map((t) =>
        t.id === id ? { ...t, enabled } : t
      ),
    });
  };

  const openEditDialog = (tool: ToolDefinition) => {
    setEditingTool(tool);
    setParametersJson(JSON.stringify(tool.parameters.properties, null, 2));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Function Calling Tools</h3>
          <p className="text-sm text-muted-foreground">
            Define tools the LLM can call during generation
          </p>
        </div>
        <Button onClick={() => setIsAddOpen(true)} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add Tool
        </Button>
      </div>

      {/* Tool Policy Settings */}
      <div className="grid grid-cols-2 gap-6 p-4 rounded-lg border border-border bg-muted/30">
        <div className="space-y-2">
          <Label className="section-label">Tool Choice Policy</Label>
          <Select value={toolChoice} onValueChange={(v) => onChange({ tool_choice: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto (model decides)</SelectItem>
              <SelectItem value="none">None (disable tools)</SelectItem>
              <SelectItem value="required">Required (must use a tool)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Controls when the model uses tools
          </p>
        </div>

        <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-background">
          <div>
            <p className="font-medium">Parallel Tool Calls</p>
            <p className="text-sm text-muted-foreground">
              Allow multiple tools to run simultaneously
            </p>
          </div>
          <Switch
            checked={parallelToolCalls}
            onCheckedChange={(v) => onChange({ parallel_tool_calls: v })}
          />
        </div>
      </div>

      {/* Tools List */}
      {toolsConfig.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-lg">
          <Wrench className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p>No tools configured yet</p>
          <p className="text-sm">Add a tool to enable function calling</p>
        </div>
      ) : (
        <Accordion type="multiple" className="space-y-2">
          {toolsConfig.map((tool) => (
            <AccordionItem
              key={tool.id}
              value={tool.id}
              className="border border-border rounded-lg px-4"
            >
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={tool.enabled}
                    onCheckedChange={(v) => handleToggleTool(tool.id, v)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <Code className="h-4 w-4 text-muted-foreground" />
                  <span className={!tool.enabled ? "text-muted-foreground" : ""}>
                    {tool.name}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-2 pb-4">
                <p className="text-sm text-muted-foreground mb-3">{tool.description}</p>
                <div className="bg-muted rounded-md p-3">
                  <p className="text-xs font-medium mb-1">Parameters Schema:</p>
                  <pre className="text-xs overflow-auto max-h-32">
                    {JSON.stringify(tool.parameters, null, 2)}
                  </pre>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditDialog(tool)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDeleteTool(tool.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      {/* Add Tool Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Tool Definition</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Function Name</Label>
              <Input
                value={newTool.name}
                onChange={(e) => setNewTool({ ...newTool, name: e.target.value })}
                placeholder="search_documents"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={newTool.description}
                onChange={(e) => setNewTool({ ...newTool, description: e.target.value })}
                placeholder="Search through documents to find relevant information"
                className="min-h-[80px]"
              />
            </div>
            <div className="space-y-2">
              <Label>Parameters Schema (JSON)</Label>
              <Textarea
                value={parametersJson}
                onChange={(e) => setParametersJson(e.target.value)}
                className="font-mono text-sm min-h-[120px]"
                placeholder='{"query": {"type": "string", "description": "Search query"}}'
              />
              <p className="text-xs text-muted-foreground">
                Define parameter properties in JSON Schema format
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddTool}>Add Tool</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Tool Dialog */}
      <Dialog open={!!editingTool} onOpenChange={(open) => !open && setEditingTool(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Tool</DialogTitle>
          </DialogHeader>
          {editingTool && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Function Name</Label>
                <Input
                  value={editingTool.name}
                  onChange={(e) =>
                    setEditingTool({ ...editingTool, name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={editingTool.description}
                  onChange={(e) =>
                    setEditingTool({ ...editingTool, description: e.target.value })
                  }
                  className="min-h-[80px]"
                />
              </div>
              <div className="space-y-2">
                <Label>Parameters Schema (JSON)</Label>
                <Textarea
                  value={parametersJson}
                  onChange={(e) => setParametersJson(e.target.value)}
                  className="font-mono text-sm min-h-[120px]"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTool(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateTool}>Update Tool</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
