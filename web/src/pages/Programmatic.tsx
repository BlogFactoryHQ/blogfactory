import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronRight,
  Copy,
  Database,
  Eye,
  FileText,
  FolderOpen,
  Grid2X2,
  HelpCircle,
  Link as LinkIcon,
  ListChecks,
  Loader2,
  Play,
  Plus,
  Save,
  Search,
  Table2,
  Trash2,
  Upload,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { BywordCard, BywordPageShell, IconTile, SectionHeader } from "@/components/layout/BywordSurface";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { LiveTextModelSelect, isUnavailableModel, preferredTextModelId } from "@/components/content/LiveTextModelSelect";
import { useTextModels } from "@/hooks/useTextModels";
import { estimateGenerationCost, shouldWarnForCost } from "@/lib/cost-estimator";
import { analyzeProgrammaticFit, type TopicFitResult } from "@/lib/topic-fit";
import {
  MAX_PROGRAMMATIC_ROWS,
  buildCombinations,
  extractVariables,
  parseCsv,
  renderTemplate,
  scoreProgrammaticTemplate,
  summarizeDimensionMath,
  templateVariables,
  validateRows,
  type ProgrammaticDataMode,
  type ProgrammaticRow,
  type ProgrammaticSection,
  type ProgrammaticTemplate,
} from "@/lib/programmatic";
import { parseProgrammaticImportFile } from "@/lib/programmatic-import";
import type { SplitImageConfig } from "@/components/content/ImageGenerationSettings";

type ProgrammaticView = "home" | "library" | "campaign" | "editor";

interface PersonaOption {
  id: string;
  name: string;
  status: string;
  base_model: string;
}

interface ProgrammaticDataset {
  id: string;
  name: string;
  columns: string[];
  rows: ProgrammaticRow[];
}

const emptyTemplate: ProgrammaticTemplate = {
  id: "new",
  name: "Untitled template",
  description: "",
  category: "Custom",
  titleTemplate: "{{topic}} Guide",
  wordRange: [600, 900],
  requiredVariables: ["topic"],
  sections: [
    { id: "title", type: "title", heading: "{{topic}} Guide", instructions: "Use as the article H1 title." },
    { id: "intro", type: "introduction", heading: "What to Know About {{topic}}", instructions: "Introduce the topic and explain who this guide is for.", minWords: 120, maxWords: 180 },
  ],
};

const noImageConfig: SplitImageConfig = {
  cover: { enabled: false },
  inline: { enabled: false, count: 0 },
};

const sectionTypes = [
  { type: "introduction", label: "Introduction", description: "Opening paragraph that sets context" },
  { type: "tldr", label: "TL;DR", description: "Quick summary for scanners" },
  { type: "conclusion", label: "Conclusion", description: "Wrap up and next steps" },
  { type: "cta", label: "CTA", description: "Call to action block" },
  { type: "text", label: "Text Section", description: "Prose paragraphs under your heading" },
  { type: "table", label: "Table", description: "Structured comparison or details" },
  { type: "faq", label: "FAQ", description: "Question and answer section" },
  { type: "how-to", label: "How-To", description: "Numbered steps" },
];

const dimensionalStrategies = [
  { dimension: "0D", title: "Flat keyword list", description: "Hand-picked targets with no shared pattern.", action: "Use Campaigns", to: "/content-creator?mode=campaign", icon: ListChecks },
  { dimension: "1D", title: "One variable", description: "Example: how many calories in {{food}}.", action: "Use Programmatic", to: "/content-creator?mode=programmatic", icon: FileText },
  { dimension: "2D", title: "Two variables", description: "Example: how much {{nutrient}} in {{food}}.", action: "Use all-combinations", to: "/content-creator?mode=programmatic", icon: Grid2X2 },
];

const variableExamples: Record<string, string> = {
  food: "rice, chicken, banana",
  nutrient: "calories, protein, carbs",
  animal: "cats, dogs, rabbits",
  profession: "nurse, teacher, developer",
  state: "Texas, Florida, California",
  city: "Austin, Denver, Miami",
  service: "plumbers, roofers, dentists",
};

const formatCost = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 4 }).format(value);

function cloneTemplate(template: ProgrammaticTemplate) {
  return JSON.parse(JSON.stringify(template)) as ProgrammaticTemplate;
}

function wordRange(template: ProgrammaticTemplate): [number, number] {
  const min = template.sections.reduce((sum, section) => sum + (Number(section.minWords) || 0), 0);
  const max = template.sections.reduce((sum, section) => sum + (Number(section.maxWords || section.minWords) || 0), 0);
  return [min || template.wordRange[0] || 0, max || template.wordRange[1] || 0];
}

function valuesFromText(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function newSection(type = "text"): ProgrammaticSection {
  const details = sectionTypes.find((item) => item.type === type);
  return {
    id: `section-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type,
    heading: details?.label || "New Section",
    instructions: details?.description || "Explain the key details readers need in this section.",
    minWords: 120,
    maxWords: 180,
  };
}

function variableLabel(variable: string) {
  return `{{${variable}}}`;
}

function variableExample(variable: string) {
  return variableExamples[variable.toLowerCase()] || "one value per line";
}

function VariableBadge({ variable }: { variable: string }) {
  return <span className="rounded bg-byword-blue-soft px-2.5 py-1 text-xs font-semibold text-byword-blue">{variable}</span>;
}

function TemplateVariableBadge({ variable }: { variable: string }) {
  return <span className="rounded bg-byword-blue-soft px-2.5 py-1 text-xs font-semibold text-byword-blue">{variableLabel(variable)}</span>;
}

function BackButton({ onClick, label = "Back" }: { onClick: () => void; label?: string }) {
  return (
    <Button variant="outline" size="icon" onClick={onClick} aria-label={label}>
      <ArrowLeft className="h-4 w-4" />
    </Button>
  );
}

function FlowCard({
  icon,
  title,
  description,
  badge,
  onClick,
}: {
  icon: typeof Grid2X2;
  title: string;
  description: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative min-h-[175px] rounded-lg border border-byword-border bg-card p-7 text-left transition-calm hover:border-byword-blue/40 hover:shadow-[0_18px_45px_rgba(22,82,125,0.08)]"
    >
      {badge && <span className="absolute right-6 top-6 rounded bg-muted px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{badge}</span>}
      <IconTile icon={icon} className="h-12 w-12" />
      <h2 className="mt-7 text-xl font-semibold text-foreground">{title}</h2>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
      <ChevronRight className="absolute bottom-7 right-7 h-5 w-5 text-muted-foreground/50 transition-calm group-hover:text-byword-blue" />
    </button>
  );
}

function ScoreBar({ label, value, total }: { label: string; value: number; total: number }) {
  const percent = Math.min(100, Math.round((value / total) * 100));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold text-muted-foreground">{value}/{total}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded bg-muted">
        <div className="h-full bg-byword-blue" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function StrategyFitNote({ result }: { result: TopicFitResult }) {
  const toneClass = {
    good: "border-[hsl(var(--status-success)/0.28)] bg-[hsl(var(--status-success)/0.08)]",
    context: "border-[hsl(var(--status-warning)/0.32)] bg-[hsl(var(--status-warning)/0.1)]",
    scale: "border-byword-blue/25 bg-byword-blue-soft/35",
    neutral: "border-byword-border bg-muted/20 text-foreground",
  }[result.tone];

  return (
    <div className={`rounded-lg border border-l-4 px-4 py-3 text-sm text-foreground ${toneClass}`}>
      <p className="font-semibold">{result.title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{result.detail}</p>
    </div>
  );
}

function ProgrammaticShell({ embedded, className, children }: { embedded?: boolean; className?: string; children: ReactNode }) {
  if (embedded) return <div className={["space-y-8", className].filter(Boolean).join(" ")}>{children}</div>;
  return <BywordPageShell className={className}>{children}</BywordPageShell>;
}

export function ProgrammaticPanel({ embedded = true }: { embedded?: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<ProgrammaticView>("home");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [draftTemplate, setDraftTemplate] = useState<ProgrammaticTemplate>(emptyTemplate);
  const [dataMode, setDataMode] = useState<ProgrammaticDataMode>("all_combinations");
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<ProgrammaticRow[]>([]);
  const [pasteText, setPasteText] = useState("");
  const [csvUrl, setCsvUrl] = useState("");
  const [datasetName, setDatasetName] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [personaId, setPersonaId] = useState("none");
  const [modelId, setModelId] = useState("anthropic/claude-3.5-sonnet");
  const [customInstructions, setCustomInstructions] = useState("");
  const [startNow, setStartNow] = useState(true);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All Templates");
  const [showPreview, setShowPreview] = useState(false);

  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ["programmatic-templates"],
    queryFn: () => api.get<ProgrammaticTemplate[]>("/programmatic/templates"),
  });
  const { data: datasets = [] } = useQuery({
    queryKey: ["programmatic-datasets"],
    queryFn: () => api.get<ProgrammaticDataset[]>("/programmatic/datasets"),
  });
  const { data: personas = [] } = useQuery({
    queryKey: ["personas"],
    queryFn: () => api.get<PersonaOption[]>("/personas"),
  });
  const { data: textModels = [] } = useTextModels();
  const activePersonas = useMemo(() => personas.filter((persona) => persona.status === "active"), [personas]);
  const selectedTextModel = textModels.find((model) => model.id === modelId);
  const selectedModelUnavailable = isUnavailableModel(modelId, textModels);

  useEffect(() => {
    if (!templates.length || selectedTemplateId) return;
    setSelectedTemplateId(templates[0].id);
  }, [selectedTemplateId, templates]);

  useEffect(() => {
    if (selectedTemplateId === "new") return;
    const selected = templates.find((template) => template.id === selectedTemplateId);
    if (!selected) return;
    setDraftTemplate(cloneTemplate(selected));
    setCampaignName(`${selected.name} Campaign`);
    setDatasetName(`${selected.name} Dataset`);
    setPreviewIndex(0);
  }, [selectedTemplateId, templates]);

  useEffect(() => {
    const fallback = preferredTextModelId(textModels);
    if (fallback && selectedModelUnavailable) setModelId(fallback);
  }, [selectedModelUnavailable, textModels]);

  const liveTemplate = useMemo(() => ({
    ...draftTemplate,
    requiredVariables: templateVariables({ ...draftTemplate, requiredVariables: [] }),
    wordRange: wordRange(draftTemplate),
  }), [draftTemplate]);
  const variables = useMemo(() => templateVariables(liveTemplate), [liveTemplate]);
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);
  const customTemplates = templates.filter((template) => !template.builtIn);
  const categories = useMemo(() => ["All Templates", ...Array.from(new Set(templates.map((template) => template.category).filter(Boolean)))], [templates]);
  const filteredTemplates = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return templates.filter((template) => {
      const matchesCategory = category === "All Templates" || template.category === category;
      const haystack = [
        template.name,
        template.category,
        template.description,
        template.titleTemplate,
        ...templateVariables(template),
      ].join(" ").toLowerCase();
      return matchesCategory && (!needle || haystack.includes(needle));
    });
  }, [category, search, templates]);
  const score = useMemo(() => scoreProgrammaticTemplate(liveTemplate), [liveTemplate]);
  const programmaticFit = useMemo(
    () => analyzeProgrammaticFit(liveTemplate.titleTemplate, variables.length),
    [liveTemplate.titleTemplate, variables.length]
  );
  const scoreParts = useMemo(() => {
    const nonTitleSections = liveTemplate.sections.filter((section) => section.type !== "title");
    return {
      seo: Math.min(30, (extractVariables(liveTemplate.titleTemplate).length ? 16 : 0) + Math.min(14, variables.length * 3)),
      structure: Math.min(25, nonTitleSections.length * 3),
      content: Math.min(25, liveTemplate.sections.filter((section) => section.minWords || section.maxWords).length * 3),
      data: Math.min(20, variables.length * 4),
    };
  }, [liveTemplate, variables.length]);
  const materialized = useMemo(() => {
    try {
      const materializedRows = dataMode === "all_combinations"
        ? buildCombinations(Object.fromEntries(variables.map((variable) => [variable, valuesFromText(variableValues[variable] || "")])))
        : rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, String(value || "").trim()])));
      return { rows: materializedRows, error: "" };
    } catch (error) {
      return { rows: [] as ProgrammaticRow[], error: error instanceof Error ? error.message : "Invalid data" };
    }
  }, [dataMode, rows, variableValues, variables]);
  const dimensionMath = useMemo(() => summarizeDimensionMath(
    Object.fromEntries(variables.map((variable) => [variable, valuesFromText(variableValues[variable] || "").length]))
  ), [variableValues, variables]);
  const validationErrors = useMemo(() => [
    ...(materialized.error ? [materialized.error] : []),
    ...validateRows(liveTemplate, materialized.rows),
  ], [liveTemplate, materialized]);
  const previewRow = materialized.rows[Math.min(previewIndex, Math.max(0, materialized.rows.length - 1))]
    || Object.fromEntries(variables.map((variable) => [variable, variableLabel(variable)]));
  const renderedPreview = renderTemplate(liveTemplate, previewRow);
  const estimate = useMemo(() => estimateGenerationCost({
    postCount: Math.max(1, materialized.rows.length),
    articleWordCount: Math.round((liveTemplate.wordRange[0] + liveTemplate.wordRange[1]) / 2) || 1500,
    textModel: selectedTextModel,
    imageConfig: noImageConfig,
  }), [liveTemplate.wordRange, materialized.rows.length, selectedTextModel]);
  const createBlocker = !campaignName.trim()
    ? "Add a campaign name."
    : selectedModelUnavailable
      ? "Pick a live OpenRouter model."
      : validationErrors[0] || "";
  const canCreate = Boolean(campaignName.trim() && modelId && !selectedModelUnavailable && !validationErrors.length);

  const saveTemplate = useMutation({
    mutationFn: async () => {
      if (selectedTemplate && !selectedTemplate.builtIn) {
        return api.put<ProgrammaticTemplate>(`/programmatic/templates/${selectedTemplate.id}`, { template: liveTemplate });
      }
      return api.post<ProgrammaticTemplate>("/programmatic/templates", { template: { ...liveTemplate, name: selectedTemplate?.builtIn ? `${liveTemplate.name} (Copy)` : liveTemplate.name, builtIn: false } });
    },
    onSuccess: (template) => {
      queryClient.invalidateQueries({ queryKey: ["programmatic-templates"] });
      setSelectedTemplateId(template.id);
      toast.success("Template saved");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save template"),
  });

  const deleteTemplate = useMutation({
    mutationFn: (id: string) => api.delete(`/programmatic/templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["programmatic-templates"] });
      setSelectedTemplateId("");
      setView("home");
      toast.success("Template deleted");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not delete template"),
  });

  const saveDataset = useMutation({
    mutationFn: () => api.post<ProgrammaticDataset>("/programmatic/datasets", {
      name: datasetName,
      columns: variables,
      rows: materialized.rows,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["programmatic-datasets"] });
      toast.success("Dataset saved");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save dataset"),
  });

  const importCsvUrl = useMutation({
    mutationFn: () => api.post<{ columns: string[]; rows: ProgrammaticRow[] }>("/programmatic/import-csv-url", { url: csvUrl }),
    onSuccess: (data) => applyRows(data.rows),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not import CSV"),
  });

  const createCampaign = useMutation({
    mutationFn: async () => {
      const result = await api.post<{ campaign: { id: string } }>("/campaigns", {
        name: campaignName,
        mode: "programmatic",
        programmatic: {
          template: liveTemplate,
          dataMode,
          rows: materialized.rows,
        },
        personaId: personaId === "none" ? null : personaId,
        modelId,
        customInstructions,
        generateImages: false,
      });
      if (startNow) await api.post(`/campaigns/${result.campaign.id}/start`);
      return result;
    },
    onSuccess: ({ campaign }) => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success(startNow ? "Programmatic campaign started" : "Programmatic campaign created");
      navigate(`/campaigns/${campaign.id}`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not create campaign"),
  });

  function updateTemplate(patch: Partial<ProgrammaticTemplate>) {
    setDraftTemplate((template) => ({ ...template, ...patch }));
  }

  function updateSection(index: number, patch: Partial<ProgrammaticSection>) {
    setDraftTemplate((template) => ({
      ...template,
      sections: template.sections.map((section, sectionIndex) => sectionIndex === index ? { ...section, ...patch } : section),
    }));
  }

  function selectTemplate(template: ProgrammaticTemplate, nextView: ProgrammaticView) {
    setSelectedTemplateId(template.id);
    setDraftTemplate(cloneTemplate(template));
    setCampaignName(`${template.name} Campaign`);
    setDatasetName(`${template.name} Dataset`);
    setPreviewIndex(0);
    setView(nextView);
  }

  function createNewTemplate() {
    setSelectedTemplateId("new");
    setDraftTemplate(cloneTemplate(emptyTemplate));
    setCampaignName("Untitled template Campaign");
    setDatasetName("Untitled template Dataset");
    setView("editor");
  }

  function applyRows(nextRows: ProgrammaticRow[]) {
    setRows(nextRows.length ? nextRows : [{}]);
    setDataMode("match_rows");
    setPreviewIndex(0);
    setView("campaign");
    toast.success(`${nextRows.length} row${nextRows.length === 1 ? "" : "s"} imported`);
  }

  function updateCell(index: number, column: string, value: string) {
    setRows((current) => {
      const next = current.length ? [...current] : [{}];
      next[index] = { ...(next[index] || {}), [column]: value };
      return next;
    });
  }

  async function handleFile(file: File) {
    try {
      const imported = await parseProgrammaticImportFile(file);
      setSelectedTemplateId(imported.template.id);
      setDraftTemplate(imported.template);
      setRows(imported.rows.length ? imported.rows : [{}]);
      setDataMode("match_rows");
      setVariableValues({});
      setCampaignName(imported.campaignName);
      setDatasetName(imported.datasetName);
      setPreviewIndex(0);
      setShowPreview(true);
      setView("campaign");
      toast.success(`${imported.rows.length} row${imported.rows.length === 1 ? "" : "s"} imported; template prepared`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not import file");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handlePasteImport() {
    const parsed = parseCsv(pasteText);
    applyRows(parsed.rows);
  }

  function handleDatasetLoad(id: string) {
    const dataset = datasets.find((item) => item.id === id);
    if (dataset) applyRows(dataset.rows);
  }

  function addVariableValue(variable: string, value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    setVariableValues((current) => ({
      ...current,
      [variable]: [...valuesFromText(current[variable] || ""), trimmed].join("\n"),
    }));
  }

  function handleCreate() {
    if (!canCreate) return;
    if (shouldWarnForCost({ estimate }) && !window.confirm(`Generate ${materialized.rows.length} drafts? High estimate is ${formatCost(estimate.totalHigh)}.`)) return;
    createCampaign.mutate();
  }

  const renderPreviewCard = () => (
    <BywordCard>
      <SectionHeader icon={Eye} title="Preview" />
      <div className="space-y-4 p-6">
        <div className="flex items-center gap-2">
          <Label className="shrink-0">Row</Label>
          <Input
            type="number"
            min={1}
            max={Math.max(1, materialized.rows.length)}
            value={Math.min(previewIndex + 1, Math.max(1, materialized.rows.length))}
            onChange={(event) => setPreviewIndex(Math.max(0, Math.min(Number(event.target.value) - 1, materialized.rows.length - 1)))}
          />
        </div>
        <div className="rounded-lg border border-byword-border bg-muted/20 p-5">
          <h2 className="text-lg font-semibold leading-7">{renderedPreview.title}</h2>
          <div className="mt-5 space-y-4">
            {renderedPreview.sections.filter((section) => section.type !== "title").slice(0, 6).map((section) => (
              <div key={section.id}>
                <p className="text-sm font-semibold">{section.heading}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{section.instructions}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </BywordCard>
  );

  const renderGenerateCard = () => (
    <BywordCard>
      <SectionHeader icon={Play} title="Generate" />
      <div className="space-y-4 p-6">
        <div className="space-y-2">
          <Label>Campaign name</Label>
          <Input value={campaignName} onChange={(event) => setCampaignName(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Brand Voice</Label>
          <Select value={personaId} onValueChange={setPersonaId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Default</SelectItem>
              {activePersonas.map((persona) => <SelectItem key={persona.id} value={persona.id}>{persona.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>OpenRouter Text Model</Label>
          <LiveTextModelSelect value={modelId} onValueChange={setModelId} />
          {selectedModelUnavailable && <p className="text-xs text-destructive">Pick a live OpenRouter model.</p>}
        </div>
        <div className="space-y-2">
          <Label>Custom Instructions</Label>
          <Textarea value={customInstructions} onChange={(event) => setCustomInstructions(event.target.value)} className="min-h-20" />
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-byword-border bg-muted/20 p-3 text-sm">
          <Checkbox checked={startNow} onCheckedChange={(checked) => setStartNow(Boolean(checked))} />
          Start after create
        </label>
        <div className="rounded-lg border border-byword-border bg-muted/20 p-4 text-sm">
          <p className="font-semibold">{materialized.rows.length} article{materialized.rows.length === 1 ? "" : "s"}</p>
          <p className="mt-1 text-muted-foreground">Expected text cost {formatCost(estimate.totalExpected)} · high {formatCost(estimate.totalHigh)}</p>
        </div>
        {validationErrors.length > 0 && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {validationErrors.slice(0, 4).map((error) => <p key={error}>{error}</p>)}
            {validationErrors.length > 4 && <p>{validationErrors.length - 4} more issue{validationErrors.length - 4 === 1 ? "" : "s"}</p>}
          </div>
        )}
        {createBlocker && !validationErrors.length && <p className="text-sm text-destructive">{createBlocker}</p>}
        {materialized.rows.length > MAX_PROGRAMMATIC_ROWS && <p className="text-sm text-destructive">Too many rows.</p>}
        <Button className="h-11 w-full" onClick={handleCreate} disabled={!canCreate || createCampaign.isPending}>
          {createCampaign.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
          {startNow ? "Create & Start" : "Create Campaign"}
        </Button>
        <Button variant="outline" className="w-full" asChild>
          <Link to="/campaigns">View Campaigns</Link>
        </Button>
      </div>
    </BywordCard>
  );

  if (view === "library") {
    return (
      <ProgrammaticShell embedded={embedded} className="max-w-none px-8">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <BackButton onClick={() => setView("home")} />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Template Library</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">Pre-built templates for common content needs</p>
            </div>
          </div>
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search templates..." />
          </div>
        </div>

        <div className="mb-8 flex flex-wrap gap-2">
          {categories.map((item) => (
            <Button key={item} variant={category === item ? "secondary" : "outline"} onClick={() => setCategory(item)}>
              {item}
            </Button>
          ))}
        </div>

        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <span>{category === "All Templates" ? "Templates" : category}</span>
          <span className="text-muted-foreground/60">{filteredTemplates.length}</span>
        </div>

        <div className="grid gap-6 lg:grid-cols-2 2xl:grid-cols-3">
          {templatesLoading && <BywordCard className="p-6 text-sm text-muted-foreground">Loading templates...</BywordCard>}
          {filteredTemplates.map((template) => {
            const templateScore = scoreProgrammaticTemplate(template);
            return (
              <BywordCard key={template.id} className="overflow-hidden">
                <button type="button" onClick={() => selectTemplate(template, "campaign")} className="block w-full p-6 text-left">
                  <div className="flex gap-4">
                    <IconTile icon={template.category.toLowerCase().includes("comparison") ? Table2 : FileText} className="h-12 w-12" />
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-semibold">{template.name}</h2>
                      <p className="mt-1 truncate font-mono text-sm text-muted-foreground">"{template.titleTemplate}"</p>
                    </div>
                  </div>
                  <p className="mt-5 line-clamp-2 text-sm leading-6 text-muted-foreground">{template.description || "Reusable programmatic content template."}</p>
                  <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
                    <span>{template.sections.length} sections</span>
                    <span>{wordRange(template)[0]}-{wordRange(template)[1]} words</span>
                    <span>Score {templateScore.score}</span>
                  </div>
                </button>
                <div className="border-t border-byword-border px-6 py-4">
                  <div className="mb-4 flex flex-wrap gap-2">
                    {templateVariables(template).map((variable) => <VariableBadge key={variable} variable={variable} />)}
                  </div>
                  <div className="flex items-center justify-between">
                    <Button variant="ghost" onClick={() => selectTemplate(template, "editor")}>
                      <Eye className="mr-2 h-4 w-4" />Preview
                    </Button>
                    <Button variant="ghost" className="text-byword-blue" onClick={() => selectTemplate(template, "campaign")}>
                      Use template <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </BywordCard>
            );
          })}
        </div>
      </ProgrammaticShell>
    );
  }

  if (view === "campaign") {
    return (
      <ProgrammaticShell embedded={embedded} className="max-w-7xl">
        <div className="mb-10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <BackButton onClick={() => setView("home")} />
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">New Campaign</span>
          </div>
          <div className="grid grid-cols-2 rounded-lg bg-muted p-1">
            <Button variant={dataMode === "all_combinations" ? "secondary" : "ghost"} className="h-auto justify-start py-2" onClick={() => setDataMode("all_combinations")}>
              <Grid2X2 className="mr-2 h-4 w-4" />
              <span className="text-left">
                <span className="block">All combinations</span>
                <span className="block text-xs font-normal text-muted-foreground">6 nutrients x 100 foods = 600 articles</span>
              </span>
            </Button>
            <Button variant={dataMode === "match_rows" ? "secondary" : "ghost"} className="h-auto justify-start py-2" onClick={() => setDataMode("match_rows")}>
              <Table2 className="mr-2 h-4 w-4" />
              <span className="text-left">
                <span className="block">Match rows</span>
                <span className="block text-xs font-normal text-muted-foreground">Use when each row is already a complete target</span>
              </span>
            </Button>
          </div>
        </div>

        <div className="mx-auto max-w-6xl space-y-6">
          <h1 className="text-2xl font-semibold">{liveTemplate.name} Campaign</h1>

          <BywordCard className="p-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-5">
                <IconTile icon={FileText} className="h-12 w-12" />
                <div>
                  <p className="font-semibold">Template: {liveTemplate.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">~{liveTemplate.wordRange[0]}-{liveTemplate.wordRange[1]} words · {liveTemplate.sections.length} sections</p>
                </div>
              </div>
              <Button variant="outline" onClick={() => setView("editor")}>
                <Copy className="mr-2 h-4 w-4" />Customize
              </Button>
            </div>
          </BywordCard>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-4">
                <SectionHeader icon={Database} title="Your Data" description={`Needs: ${variables.map(variableLabel).join(", ")}`} />
                <div className="flex flex-wrap gap-2">
                  <input ref={fileInputRef} type="file" accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(event) => event.target.files?.[0] && handleFile(event.target.files[0])} />
                  <Button variant="outline" onClick={() => fileInputRef.current?.click()}><Upload className="mr-2 h-4 w-4" />Import</Button>
                  <Button variant="outline" onClick={() => navigator.clipboard.readText().then((text) => { setPasteText(text); applyRows(parseCsv(text).rows); }).catch(() => toast.error("Clipboard is not available"))}>
                    <Copy className="mr-2 h-4 w-4" />Paste
                  </Button>
                </div>
              </div>

              {dataMode === "all_combinations" ? (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    {variables.map((variable) => (
                      <BywordCard key={variable} className="overflow-hidden">
                        <div className="flex items-center justify-between border-b border-byword-border px-5 py-4">
                          <div className="flex items-center gap-3">
                            <IconTile icon={Grid2X2} className="h-8 w-8" />
                            <p className="font-semibold">{variable} <span className="text-byword-blue">*</span></p>
                          </div>
                          <span className="text-sm text-muted-foreground">{valuesFromText(variableValues[variable] || "").length} values</span>
                        </div>
                        <div className="flex min-h-28 items-center justify-center border-b border-byword-border p-5 text-sm italic text-muted-foreground">
                          {valuesFromText(variableValues[variable] || "").length ? valuesFromText(variableValues[variable] || "").slice(0, 4).join(", ") : "No values yet"}
                        </div>
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 p-5">
                          <Input
                            placeholder={`Add ${variable}...`}
                            onKeyDown={(event) => {
                              if (event.key !== "Enter") return;
                              addVariableValue(variable, event.currentTarget.value);
                              event.currentTarget.value = "";
                            }}
                          />
                          <Button variant="ghost" size="icon" onClick={() => navigator.clipboard.readText().then((text) => setVariableValues((current) => ({ ...current, [variable]: text })))}>
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                        <p className="px-5 pb-5 text-xs text-muted-foreground">Example: {variableExample(variable)}.</p>
                      </BywordCard>
                    ))}
                  </div>
                  <BywordCard className="flex flex-wrap items-center justify-between gap-5 p-6">
                    <div className="flex items-center gap-5">
                    <IconTile icon={FileText} className="h-12 w-12" />
                    <div>
                      <p className="text-4xl font-semibold text-byword-blue">{materialized.rows.length}</p>
                      <p className="text-sm text-muted-foreground">articles</p>
                    </div>
                    </div>
                    <div className="max-w-xl text-sm text-muted-foreground">
                      <p className="font-medium text-foreground">{dimensionMath.label}</p>
                      <p className="mt-1">Clean URLs work best when they mirror the template, like /nutrition/protein-in-rice.</p>
                      {dimensionMath.nearLimit && <p className="mt-1 text-amber-600">Close to the {MAX_PROGRAMMATIC_ROWS.toLocaleString()} article limit.</p>}
                      {dimensionMath.overLimit && <p className="mt-1 text-destructive">Over the {MAX_PROGRAMMATIC_ROWS.toLocaleString()} article limit.</p>}
                    </div>
                  </BywordCard>
                </>
              ) : (
                <BywordCard className="overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-14"></TableHead>
                        {variables.map((variable) => <TableHead key={variable}>{variable} <span className="text-byword-blue">*</span></TableHead>)}
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(rows.length ? rows : [{}]).map((row, index) => (
                        <TableRow key={index}>
                          <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                          {variables.map((variable) => (
                            <TableCell key={variable} className="min-w-52">
                              <Input value={row[variable] || ""} onChange={(event) => updateCell(index, variable, event.target.value)} placeholder="Click to start typing..." />
                            </TableCell>
                          ))}
                          <TableCell>
                            <Button variant="ghost" size="icon" onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-byword-border p-4">
                    <Button variant="ghost" onClick={() => setRows((current) => [...(current.length ? current : []), {}])}>
                      <Plus className="mr-2 h-4 w-4" />Add row
                    </Button>
                    <p className="text-sm text-muted-foreground">Paste data or import CSV/XLSX</p>
                  </div>
                </BywordCard>
              )}

              <BywordCard>
                <SectionHeader icon={LinkIcon} title="Import Data" />
                <div className="space-y-4 p-6">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                    <Input value={csvUrl} onChange={(event) => setCsvUrl(event.target.value)} placeholder="Public CSV URL" />
                    <Button variant="outline" onClick={() => importCsvUrl.mutate()} disabled={!csvUrl.trim() || importCsvUrl.isPending}>
                      {importCsvUrl.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LinkIcon className="mr-2 h-4 w-4" />}
                      Import
                    </Button>
                  </div>
                  <Textarea value={pasteText} onChange={(event) => setPasteText(event.target.value)} placeholder={"city,state,service\nAustin,Texas,Plumbers"} className="min-h-24 font-mono text-sm" />
                  <Button variant="outline" onClick={handlePasteImport} disabled={!pasteText.trim()}>Parse pasted data</Button>
                </div>
              </BywordCard>
            </div>

            <div className="space-y-6">
              <BywordCard>
                <SectionHeader icon={FolderOpen} title="Saved Data" />
                <div className="space-y-4 p-6">
                  <Select onValueChange={handleDatasetLoad} disabled={!datasets.length}>
                    <SelectTrigger>
                      <SelectValue placeholder={datasets.length ? "Load dataset..." : "No saved datasets"} />
                    </SelectTrigger>
                    <SelectContent>
                      {datasets.map((dataset) => <SelectItem key={dataset.id} value={dataset.id}>{dataset.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                    <Input value={datasetName} onChange={(event) => setDatasetName(event.target.value)} placeholder="Dataset name" />
                    <Button variant="outline" size="icon" onClick={() => saveDataset.mutate()} disabled={!datasetName.trim() || !materialized.rows.length || saveDataset.isPending}>
                      <Save className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </BywordCard>
              {renderPreviewCard()}
              {renderGenerateCard()}
            </div>
          </div>
        </div>
      </ProgrammaticShell>
    );
  }

  if (view === "editor") {
    return (
      <ProgrammaticShell embedded={embedded} className="max-w-none px-0 py-0">
        <div className="sticky top-0 z-30 border-b border-byword-border bg-background/95 backdrop-blur">
          <div className="flex min-h-16 items-center justify-between gap-4 px-6">
            <div className="flex items-center gap-4">
              <BackButton onClick={() => setView("campaign")} />
              <span className="text-sm text-muted-foreground">Templates</span>
              <span className="text-muted-foreground/50">/</span>
              <h1 className="text-lg font-semibold">{liveTemplate.name}{selectedTemplate?.builtIn ? " (Copy)" : ""}</h1>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost"><span className="mr-2 text-byword-blue">&lt;&gt;</span>Variables {variables.length}</Button>
              <Button variant={showPreview ? "secondary" : "ghost"} onClick={() => setShowPreview((value) => !value)}><Eye className="mr-2 h-4 w-4" />Preview</Button>
              <Button variant="secondary"><Zap className="mr-2 h-4 w-4" />Score</Button>
            </div>
          </div>
          <div className="flex items-center gap-4 border-t border-byword-border px-6 py-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
              <span className="text-byword-blue">T</span> Title Template
            </div>
            <Input className="max-w-xl" value={draftTemplate.titleTemplate} onChange={(event) => updateTemplate({ titleTemplate: event.target.value })} />
            <div className="flex flex-wrap gap-2">
              {variables.map((variable) => <TemplateVariableBadge key={variable} variable={variable} />)}
            </div>
            <p className="ml-auto hidden text-sm text-muted-foreground xl:block">Generates article titles from your dataset</p>
          </div>
        </div>

        <div className="grid min-h-[calc(100vh-132px)] grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="px-6 py-10">
            <div className="mx-auto max-w-3xl">
              <div className="mx-auto mb-10 flex h-9 w-24 items-center justify-center gap-2 rounded-md border border-byword-border bg-card text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />Start
              </div>
              <div className="space-y-6">
                {draftTemplate.sections.map((section, index) => (
                  <div key={section.id} className="relative">
                    <div className="absolute -left-10 top-6 hidden h-8 w-8 items-center justify-center rounded-full border border-byword-border bg-card text-sm text-muted-foreground lg:flex">{index + 1}</div>
                    <BywordCard className="p-6">
                      <div className="flex items-start gap-4">
                        <IconTile icon={section.type === "tldr" ? HelpCircle : section.type === "how-to" ? ListChecks : FileText} className="h-10 w-10" />
                        <div className="min-w-0 flex-1 space-y-3">
                          <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_92px_92px_auto]">
                            <Select value={section.type} onValueChange={(value) => updateSection(index, { type: value })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {["title", ...sectionTypes.map((item) => item.type)].map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <Input value={section.heading} onChange={(event) => updateSection(index, { heading: event.target.value })} placeholder="Heading" />
                            <Input type="number" value={section.minWords || ""} onChange={(event) => updateSection(index, { minWords: Number(event.target.value) || undefined })} placeholder="Min" />
                            <Input type="number" value={section.maxWords || ""} onChange={(event) => updateSection(index, { maxWords: Number(event.target.value) || undefined })} placeholder="Max" />
                            {draftTemplate.sections.length > 1 && (
                              <Button variant="ghost" size="icon" onClick={() => updateTemplate({ sections: draftTemplate.sections.filter((_, sectionIndex) => sectionIndex !== index) })}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                          <Textarea value={section.instructions} onChange={(event) => updateSection(index, { instructions: event.target.value })} className="min-h-24" placeholder="Instructions" />
                          <label className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Checkbox checked={Boolean(section.snippable)} onCheckedChange={(checked) => updateSection(index, { snippable: Boolean(checked) })} />
                            Snippable section
                          </label>
                        </div>
                      </div>
                    </BywordCard>
                    <div className="flex justify-center py-4">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="icon" className="rounded-full">
                            <Plus className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-72">
                          {sectionTypes.map((item) => (
                            <DropdownMenuItem
                              key={item.type}
                              className="block cursor-pointer p-3"
                              onClick={() => updateTemplate({
                                sections: [
                                  ...draftTemplate.sections.slice(0, index + 1),
                                  newSection(item.type),
                                  ...draftTemplate.sections.slice(index + 1),
                                ],
                              })}
                            >
                              <p className="font-medium">{item.label}</p>
                              <p className="text-xs text-muted-foreground">{item.description}</p>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mx-auto mt-3 flex h-9 w-20 items-center justify-center rounded-md border border-byword-border bg-card text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">End</div>
            </div>
          </div>

          <aside className="border-l border-byword-border bg-background p-6">
            <div className="sticky top-36 space-y-6">
              <BywordCard>
                <SectionHeader icon={Zap} title="Template Score" />
                <div className="space-y-5 p-6">
                  <div className="flex items-end justify-between">
                    <p className="text-5xl font-semibold text-byword-blue">{score.score}</p>
                    <p className="text-sm text-muted-foreground">{score.score >= 80 ? "Strong" : score.score >= 55 ? "Getting There" : "Needs Work"}</p>
                  </div>
                  <div className="h-2 overflow-hidden rounded bg-muted">
                    <div className="h-full bg-byword-blue" style={{ width: `${score.score}%` }} />
                  </div>
                  <ScoreBar label="SEO Readiness" value={scoreParts.seo} total={30} />
                  <ScoreBar label="Structure" value={scoreParts.structure} total={25} />
                  <ScoreBar label="Content Quality" value={scoreParts.content} total={25} />
                  <ScoreBar label="Data Integration" value={scoreParts.data} total={20} />
                </div>
              </BywordCard>

              <BywordCard>
                <SectionHeader icon={HelpCircle} title="Strategy Fit" />
                <div className="p-6">
                  <StrategyFitNote result={programmaticFit} />
                </div>
              </BywordCard>

              {score.quickWins.length > 0 && (
                <BywordCard>
                  <SectionHeader icon={HelpCircle} title="Quick Wins" />
                  <div className="divide-y divide-byword-border text-sm">
                    {score.quickWins.map((win) => <p key={win} className="px-6 py-3 text-muted-foreground">{win}</p>)}
                  </div>
                </BywordCard>
              )}

              {showPreview && renderPreviewCard()}

              <BywordCard>
                <div className="space-y-3 p-6">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Button variant="outline" onClick={() => setView("campaign")}>Data</Button>
                    <Button onClick={() => saveTemplate.mutate()} disabled={saveTemplate.isPending}>
                      {saveTemplate.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      {selectedTemplate?.builtIn ? "Customize" : "Save"}
                    </Button>
                  </div>
                  {!selectedTemplate?.builtIn && selectedTemplateId && selectedTemplateId !== "new" && (
                    <Button variant="ghost" className="w-full text-destructive" onClick={() => deleteTemplate.mutate(selectedTemplateId)} disabled={deleteTemplate.isPending}>
                      <Trash2 className="mr-2 h-4 w-4" />Delete template
                    </Button>
                  )}
                </div>
              </BywordCard>
            </div>
          </aside>
        </div>
      </ProgrammaticShell>
    );
  }

  return (
    <ProgrammaticShell embedded={embedded} className="max-w-7xl">
      {!embedded && <PageHeader title="Programmatic" description="Scale your content with templates and data" />}

      <div className="mx-auto max-w-6xl space-y-8">
        <BywordCard>
          <SectionHeader icon={Grid2X2} title="Dimensional Strategy" description="Choose the smallest workflow that fits the keyword pattern." />
          <div className="grid gap-0 divide-y divide-byword-border md:grid-cols-3 md:divide-x md:divide-y-0">
            {dimensionalStrategies.map((strategy) => (
              <div key={strategy.dimension} className="p-6">
                <div className="flex items-center gap-3">
                  <IconTile icon={strategy.icon} className="h-9 w-9" />
                  <span className="rounded bg-muted px-2 py-1 text-xs font-bold text-muted-foreground">{strategy.dimension}</span>
                </div>
                <h2 className="mt-5 font-semibold">{strategy.title}</h2>
                <p className="mt-2 min-h-12 text-sm leading-6 text-muted-foreground">{strategy.description}</p>
                {strategy.dimension === "0D" ? (
                  <Button variant="ghost" className="mt-4 px-0 text-byword-blue" asChild>
                    <Link to={strategy.to}>{strategy.action}<ChevronRight className="ml-2 h-4 w-4" /></Link>
                  </Button>
                ) : (
                  <Button variant="ghost" className="mt-4 px-0 text-byword-blue" onClick={() => setView("library")}>
                    {strategy.action}<ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </BywordCard>

        <div className="grid gap-6 lg:grid-cols-3">
          <FlowCard icon={Grid2X2} title="Browse Templates" description="Proven templates for location pages, comparisons, and more" badge="Recommended" onClick={() => setView("library")} />
          <FlowCard icon={Plus} title="Create New Template" description="Start from scratch with full control over your article structure" onClick={createNewTemplate} />
          <FlowCard icon={Database} title="Your Datasets" description="Manage saved data you can reuse across campaigns and templates" onClick={() => setView("campaign")} />
        </div>

        <BywordCard>
          <SectionHeader icon={FolderOpen} title="Your Templates" description={`${customTemplates.length}`} action={<Button variant="ghost" onClick={() => setView("library")}>View all <ChevronRight className="ml-2 h-4 w-4" /></Button>} />
          <div className="divide-y divide-byword-border">
            {customTemplates.length ? customTemplates.map((template) => (
              <div key={template.id} className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
                <div className="flex items-center gap-4">
                  <IconTile icon={FileText} className="h-12 w-12" />
                  <div>
                    <p className="font-semibold">{template.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{template.sections.length} sections · {wordRange(template)[0]}-{wordRange(template)[1]} words</p>
                  </div>
                </div>
                <Button variant="secondary" onClick={() => selectTemplate(template, "campaign")}>Use <ChevronRight className="ml-2 h-4 w-4" /></Button>
              </div>
            )) : (
              <div className="px-6 py-8 text-sm text-muted-foreground">No custom templates yet.</div>
            )}
          </div>
        </BywordCard>

        <BywordCard>
          <SectionHeader icon={Database} title="Saved Datasets" description={`${datasets.length}`} />
          <div className="divide-y divide-byword-border">
            {datasets.length ? datasets.map((dataset) => (
              <button key={dataset.id} type="button" onClick={() => handleDatasetLoad(dataset.id)} className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left transition-calm hover:bg-muted/30">
                <span>
                  <span className="block font-semibold">{dataset.name}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{dataset.rows.length} rows · {dataset.columns.length} columns</span>
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            )) : (
              <div className="px-6 py-8 text-sm text-muted-foreground">No saved datasets yet.</div>
            )}
          </div>
        </BywordCard>
      </div>
    </ProgrammaticShell>
  );
}

export default function Programmatic() {
  return <ProgrammaticPanel embedded={false} />;
}
