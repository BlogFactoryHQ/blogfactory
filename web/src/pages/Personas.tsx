import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useAdvancedMode } from "@/hooks/useAdvancedMode";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Plus,
  Save,
  Loader2,
  Bot,
  Wrench,
  Plug,
  FlaskConical,
  Copy,
  Settings2,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SimplePromptView } from "@/components/personas/SimplePromptView";
import { PromptBuilder } from "@/components/personas/PromptBuilder";
import { SEOGuardrails } from "@/components/personas/SEOGuardrails";
import { PersonaToolsTab } from "@/components/personas/PersonaToolsTab";
import { PersonaPluginsTab } from "@/components/personas/PersonaPluginsTab";
import { PersonaTestTab } from "@/components/personas/PersonaTestTab";
import { MODELS } from "@/lib/mock-data";

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

interface PluginsConfig {
  web?: { enabled: boolean; engine?: "native" | "exa"; max_results?: number };
  pdf?: { enabled: boolean };
  responseHealing?: { enabled: boolean };
}

interface ValidationRules {
  requireMetaTitle?: boolean;
  requireMetaDescription?: boolean;
  minWordCount?: number;
  maxWordCount?: number;
  blockedPhrases?: string[];
  failAction?: "retry" | "fail";
}

interface Persona {
  id: string;
  name: string;
  base_model: string;
  system_prompt: string;
  language: string | null;
  category: string | null;
  status: string;
  created_at: string;
  tools_config: ToolDefinition[];
  tool_choice: string;
  parallel_tool_calls: boolean;
  plugins_config: PluginsConfig;
  response_format: string;
  response_schema: Record<string, unknown> | null;
  validation_rules: ValidationRules;
}

export default function Personas() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { isAdvanced, toggleAdvanced } = useAdvancedMode();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [editedPersona, setEditedPersona] = useState<Persona | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("tools");
  const [newPersona, setNewPersona] = useState({
    name: "",
    base_model: "google/gemini-2.5-flash-preview",
    system_prompt: "",
  });

  // Fetch personas
  const { data: personas = [], isLoading } = useQuery({
    queryKey: ["personas"],
    queryFn: async () => {
      const data = await api.get<any[]>("/personas");
      return (data || []).map((p) => ({
        ...p,
        tools_config: (Array.isArray(p.tools_config) ? p.tools_config : []) as unknown as ToolDefinition[],
        tool_choice: p.tool_choice || "auto",
        parallel_tool_calls: p.parallel_tool_calls ?? true,
        plugins_config: (typeof p.plugins_config === "object" && p.plugins_config !== null && !Array.isArray(p.plugins_config) ? p.plugins_config : {}) as PluginsConfig,
        response_format: p.response_format || "markdown",
        response_schema: p.response_schema as Record<string, unknown> | null,
        validation_rules: (p.validation_rules as ValidationRules) || {},
      })) as Persona[];
    },
  });

  // Create persona mutation
  const createMutation = useMutation({
    mutationFn: async (data: typeof newPersona) => {
      const created = await api.post<any>("/personas", {
        name: data.name,
        base_model: data.base_model,
        system_prompt: data.system_prompt,
        status: "active",
      });
      return created;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["personas"] });
      const persona: Persona = {
        ...created,
        tools_config: [],
        tool_choice: "auto",
        parallel_tool_calls: true,
        plugins_config: {},
        response_format: "markdown",
        response_schema: null,
        validation_rules: {},
      };
      setSelectedPersona(persona);
      setEditedPersona(persona);
      setNewPersona({ name: "", base_model: "google/gemini-2.5-flash-preview", system_prompt: "" });
      setIsCreateOpen(false);
      toast.success("Agent created successfully.");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to create agent");
    },
  });

  // Update persona mutation
  const updateMutation = useMutation({
    mutationFn: async (data: Persona) => {
      await api.put(`/personas/${data.id}`, {
        name: data.name,
        base_model: data.base_model,
        system_prompt: data.system_prompt,
        status: data.status,
        language: data.language,
        category: data.category,
        tools_config: JSON.parse(JSON.stringify(data.tools_config)),
        tool_choice: data.tool_choice,
        parallel_tool_calls: data.parallel_tool_calls,
        plugins_config: JSON.parse(JSON.stringify(data.plugins_config)),
        response_format: data.response_format,
        response_schema: data.response_schema ? JSON.parse(JSON.stringify(data.response_schema)) : null,
        validation_rules: JSON.parse(JSON.stringify(data.validation_rules)),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["personas"] });
      toast.success("Agent saved successfully.");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to save agent");
    },
  });

  // Delete persona mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/personas/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["personas"] });
      const remaining = personas.filter((p) => p.id !== selectedPersona?.id);
      setSelectedPersona(remaining[0] || null);
      setEditedPersona(remaining[0] || null);
      setIsDeleteOpen(false);
      toast.success("Agent deleted.");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to delete agent");
    },
  });

  // Duplicate persona mutation
  const duplicateMutation = useMutation({
    mutationFn: async (persona: Persona) => {
      const created = await api.post<any>(`/personas/${persona.id}/duplicate`);
      return created;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["personas"] });
      const persona: Persona = {
        ...created,
        tools_config: (Array.isArray(created.tools_config) ? created.tools_config : []) as unknown as ToolDefinition[],
        tool_choice: created.tool_choice || "auto",
        parallel_tool_calls: created.parallel_tool_calls ?? true,
        plugins_config: (typeof created.plugins_config === "object" && created.plugins_config !== null && !Array.isArray(created.plugins_config) ? created.plugins_config : {}) as PluginsConfig,
        response_format: created.response_format || "markdown",
        response_schema: created.response_schema as Record<string, unknown> | null,
        validation_rules: (created.validation_rules as ValidationRules) || {},
      };
      setSelectedPersona(persona);
      setEditedPersona(persona);
      toast.success("Agent duplicated successfully.");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to duplicate agent");
    },
  });

  const filteredPersonas = personas.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectPersona = (persona: Persona) => {
    setSelectedPersona(persona);
    setEditedPersona({ ...persona });
  };

  const handleSave = () => {
    if (!editedPersona) return;
    updateMutation.mutate(editedPersona);
  };

  const handleCreate = () => {
    if (!newPersona.name || !newPersona.system_prompt) {
      toast.error("Please fill in all required fields.");
      return;
    }
    createMutation.mutate(newPersona);
  };

  const handleDelete = () => {
    if (!selectedPersona) return;
    deleteMutation.mutate(selectedPersona.id);
  };

  // Auto-select first persona
  useEffect(() => {
    if (personas.length > 0 && !selectedPersona && !isLoading) {
      handleSelectPersona(personas[0]);
    }
  }, [personas, selectedPersona, isLoading]);

  const updateEditedPersona = (updates: Partial<Persona>) => {
    if (!editedPersona) return;
    setEditedPersona({ ...editedPersona, ...updates });
  };

  // Count configured tools and plugins for badges
  const toolCount = editedPersona?.tools_config?.filter((t) => t.enabled).length || 0;
  const pluginCount = Object.values(editedPersona?.plugins_config || {}).filter(
    (p) => p?.enabled
  ).length;
  const hasAdvancedConfig = toolCount > 0 || pluginCount > 0 ||
    (editedPersona?.validation_rules && Object.keys(editedPersona.validation_rules).length > 0);

  return (
    <div className="p-8 h-[calc(100vh-2rem)] max-w-7xl">
      <div className="flex h-full gap-6">
        {/* Left Panel - List */}
        <div className="w-80 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Agent Profiles</p>
            <Button size="icon" variant="ghost" onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter agents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex-1 space-y-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredPersonas.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {searchQuery ? "No agents found" : "No agents yet. Create one!"}
              </div>
            ) : (
              filteredPersonas.map((persona) => (
                <button
                  key={persona.id}
                  onClick={() => handleSelectPersona(persona)}
                  className={cn(
                    "w-full text-left p-3 rounded-lg transition-calm",
                    selectedPersona?.id === persona.id
                      ? "bg-accent"
                      : "hover:bg-muted"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p
                        className={cn(
                          "font-medium truncate",
                          selectedPersona?.id === persona.id && "text-primary"
                        )}
                      >
                        {persona.name}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {persona.tools_config?.length > 0 && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground flex items-center gap-1">
                            <Wrench className="h-3 w-3" />
                            {persona.tools_config.filter((t) => t.enabled).length}
                          </span>
                        )}
                        {Object.values(persona.plugins_config || {}).some((p) => p?.enabled) && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground flex items-center gap-1">
                            <Plug className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                    </div>
                    <div
                      className={cn(
                        "h-2 w-2 rounded-full mt-2 shrink-0",
                        persona.status === "active" ? "bg-status-success" : "bg-muted-foreground/30"
                      )}
                    />
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right Panel - Editor */}
        <div className="flex-1 calm-card overflow-hidden flex flex-col">
          {editedPersona ? (
            <>
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-border">
                <div className="flex items-center gap-3">
                  <Bot className="h-6 w-6 text-primary" />
                  <h2 className="text-xl font-semibold">{editedPersona.name}</h2>
                  <div
                    className={cn(
                      "px-2 py-0.5 rounded text-xs font-medium",
                      editedPersona.status === "active"
                        ? "bg-status-success/20 text-status-success"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {editedPersona.status === "active" ? "Active" : "Inactive"}
                  </div>
                  {hasAdvancedConfig && (
                    <div className="px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
                      Advanced
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setIsDeleteOpen(true)}
                  >
                    Delete
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => selectedPersona && duplicateMutation.mutate(selectedPersona)}
                    disabled={duplicateMutation.isPending}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    {duplicateMutation.isPending ? "Duplicating..." : "Duplicate"}
                  </Button>
                  <Button onClick={handleSave} disabled={updateMutation.isPending}>
                    <Save className="h-4 w-4 mr-2" />
                    {updateMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </div>

              {/* Content Area */}
              <div className="flex-1 overflow-y-auto p-6">
                {/* Simple Mode - Always Visible */}
                <div className="space-y-6">
                  {/* Prompt Builder - Advanced Only */}
                  {isAdvanced && (
                    <PromptBuilder
                      onApply={(prompt) =>
                        updateEditedPersona({ system_prompt: prompt })
                      }
                    />
                  )}

                  {/* Core Simple View */}
                  <SimplePromptView
                    persona={editedPersona}
                    onChange={updateEditedPersona}
                  />

                  {/* Advanced Toggle */}
                  <button
                    onClick={toggleAdvanced}
                    className={cn(
                      "w-full flex items-center justify-between p-4 rounded-lg border transition-colors",
                      isAdvanced
                        ? "border-primary/30 bg-primary/5"
                        : "border-border hover:border-primary/30 hover:bg-muted/50"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Settings2 className={cn("h-5 w-5", isAdvanced ? "text-primary" : "text-muted-foreground")} />
                      <div className="text-left">
                        <p className="font-medium">Advanced Settings</p>
                        <p className="text-sm text-muted-foreground">
                          Tools, plugins, guardrails, and testing
                        </p>
                      </div>
                    </div>
                    <ChevronRight
                      className={cn(
                        "h-5 w-5 transition-transform",
                        isAdvanced ? "rotate-90 text-primary" : "text-muted-foreground"
                      )}
                    />
                  </button>

                  {/* Advanced Mode Content */}
                  {isAdvanced && (
                    <div className="space-y-6 animate-in slide-in-from-top-2 duration-200">
                      {/* SEO Guardrails */}
                      <SEOGuardrails
                        responseFormat={editedPersona.response_format}
                        responseSchema={editedPersona.response_schema}
                        validationRules={editedPersona.validation_rules}
                        onChange={(updates) =>
                          updateEditedPersona({
                            response_format: updates.response_format ?? editedPersona.response_format,
                            response_schema: updates.response_schema !== undefined ? updates.response_schema : editedPersona.response_schema,
                            validation_rules: updates.validation_rules ?? editedPersona.validation_rules,
                          })
                        }
                      />

                      {/* Tabs for Tools / Plugins / Test */}
                      <Tabs
                        value={activeTab}
                        onValueChange={setActiveTab}
                        className="border border-border rounded-lg overflow-hidden"
                      >
                        <div className="border-b border-border bg-muted/30 px-4">
                          <TabsList className="h-12 bg-transparent gap-1">
                            <TabsTrigger value="tools" className="gap-2">
                              <Wrench className="h-4 w-4" />
                              Tools
                              {toolCount > 0 && (
                                <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-primary/20 text-primary">
                                  {toolCount}
                                </span>
                              )}
                            </TabsTrigger>
                            <TabsTrigger value="plugins" className="gap-2">
                              <Plug className="h-4 w-4" />
                              Plugins
                              {pluginCount > 0 && (
                                <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-primary/20 text-primary">
                                  {pluginCount}
                                </span>
                              )}
                            </TabsTrigger>
                            <TabsTrigger value="test" className="gap-2">
                              <FlaskConical className="h-4 w-4" />
                              Test
                            </TabsTrigger>
                          </TabsList>
                        </div>

                        <div className="p-6">
                          <TabsContent value="tools" className="mt-0">
                            <PersonaToolsTab
                              toolsConfig={editedPersona.tools_config || []}
                              toolChoice={editedPersona.tool_choice || "auto"}
                              parallelToolCalls={editedPersona.parallel_tool_calls ?? true}
                              onChange={(updates) =>
                                updateEditedPersona({
                                  tools_config: updates.tools_config ?? editedPersona.tools_config,
                                  tool_choice: updates.tool_choice ?? editedPersona.tool_choice,
                                  parallel_tool_calls:
                                    updates.parallel_tool_calls ?? editedPersona.parallel_tool_calls,
                                })
                              }
                            />
                          </TabsContent>

                          <TabsContent value="plugins" className="mt-0">
                            <PersonaPluginsTab
                              pluginsConfig={editedPersona.plugins_config || {}}
                              onChange={(config) => updateEditedPersona({ plugins_config: config })}
                            />
                          </TabsContent>

                          <TabsContent value="test" className="mt-0">
                            <PersonaTestTab
                              personaId={editedPersona.id}
                              personaName={editedPersona.name}
                            />
                          </TabsContent>
                        </div>
                      </Tabs>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              {isLoading ? (
                <Loader2 className="h-8 w-8 animate-spin" />
              ) : (
                "Select an agent to edit or create a new one."
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create Agent Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create New Agent</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Agent Name</Label>
              <Input
                placeholder="e.g., Senior Technical Writer, Brand Voice Lead"
                value={newPersona.name}
                onChange={(e) => setNewPersona({ ...newPersona, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Base Model</Label>
              <Select
                value={newPersona.base_model}
                onValueChange={(v) => setNewPersona({ ...newPersona, base_model: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODELS.map((model) => {
                    const priceIcon = model.pricing === "low" ? "$" : model.pricing === "medium" ? "$$" : "$$$";
                    const priceColor = model.pricing === "low" ? "text-green-600" : model.pricing === "medium" ? "text-amber-600" : "text-red-500";
                    return (
                      <SelectItem key={model.id} value={model.id}>
                        <div className="flex items-center justify-between w-full gap-2">
                          <span>{model.name}</span>
                          <span className={`text-xs font-medium ${priceColor}`}>{priceIcon}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Different models have varying strengths in reasoning and creativity.
              </p>
            </div>
            <div className="space-y-2">
              <Label>System Prompt</Label>
              <Textarea
                placeholder="You are an expert technical writer specializing in API documentation. Your tone is precise, neutral, and helpful..."
                value={newPersona.system_prompt}
                onChange={(e) =>
                  setNewPersona({ ...newPersona, system_prompt: e.target.value })
                }
                className="min-h-[150px]"
              />
              <p className="text-xs text-muted-foreground">
                Define the agent's tone, style constraints, and knowledge base.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Agent"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Agent</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedPersona?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
