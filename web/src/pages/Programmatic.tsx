import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  Database,
  Eye,
  FileText,
  Grid2X2,
  Link as LinkIcon,
  Loader2,
  Play,
  Plus,
  Save,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { LiveTextModelSelect, isUnavailableModel } from "@/components/content/LiveTextModelSelect";
import { useTextModels } from "@/hooks/useTextModels";
import { estimateGenerationCost, shouldWarnForCost } from "@/lib/cost-estimator";
import {
  MAX_PROGRAMMATIC_ROWS,
  buildCombinations,
  parseCsv,
  renderTemplate,
  scoreProgrammaticTemplate,
  templateVariables,
  validateRows,
  type ProgrammaticDataMode,
  type ProgrammaticRow,
  type ProgrammaticSection,
  type ProgrammaticTemplate,
} from "@/lib/programmatic";
import type { SplitImageConfig } from "@/components/content/ImageGenerationSettings";

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
  cover: { enabled: false, resolution: "1K", aspectRatio: "16:9" },
  inline: { enabled: false, count: 0, resolution: "Web", aspectRatio: "3:2" },
  imagePlacement: "auto",
  compressionEnabled: true,
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

function newSection(): ProgrammaticSection {
  return {
    id: `section-${Date.now()}`,
    type: "text",
    heading: "New Section",
    instructions: "Explain the key details readers need in this section.",
    minWords: 120,
    maxWords: 180,
  };
}

export default function Programmatic() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
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
    const fallback = textModels[0]?.id;
    if (fallback && selectedModelUnavailable) setModelId(fallback);
  }, [selectedModelUnavailable, textModels]);

  const liveTemplate = useMemo(() => ({
    ...draftTemplate,
    requiredVariables: templateVariables({ ...draftTemplate, requiredVariables: [] }),
    wordRange: wordRange(draftTemplate),
  }), [draftTemplate]);
  const variables = useMemo(() => templateVariables(liveTemplate), [liveTemplate]);
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);
  const score = useMemo(() => scoreProgrammaticTemplate(liveTemplate), [liveTemplate]);
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
  const validationErrors = useMemo(() => [
    ...(materialized.error ? [materialized.error] : []),
    ...validateRows(liveTemplate, materialized.rows),
  ], [liveTemplate, materialized]);
  const previewRow = materialized.rows[previewIndex] || Object.fromEntries(variables.map((variable) => [variable, `{{${variable}}}`]));
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

  function applyRows(nextRows: ProgrammaticRow[]) {
    setRows(nextRows.length ? nextRows : [{}]);
    setDataMode("match_rows");
    setPreviewIndex(0);
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
    const parsed = parseCsv(await file.text());
    applyRows(parsed.rows);
  }

  function handlePasteImport() {
    const parsed = parseCsv(pasteText);
    applyRows(parsed.rows);
  }

  function handleDatasetLoad(id: string) {
    const dataset = datasets.find((item) => item.id === id);
    if (dataset) applyRows(dataset.rows);
  }

  function handleCreate() {
    if (!canCreate) return;
    if (shouldWarnForCost({ estimate }) && !window.confirm(`Generate ${materialized.rows.length} drafts? High estimate is ${formatCost(estimate.totalHigh)}.`)) return;
    createCampaign.mutate();
  }

  return (
    <BywordPageShell className="max-w-7xl">
      <PageHeader
        title="Programmatic SEO"
        description="Build templates, feed structured data, and generate many article drafts from one repeatable pattern."
      />

      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <BywordCard>
            <SectionHeader icon={Grid2X2} title="Templates" />
            <div className="space-y-2 p-4">
              {templatesLoading && <p className="text-sm text-muted-foreground">Loading templates...</p>}
              {templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setSelectedTemplateId(template.id)}
                  className={`w-full rounded-lg border p-3 text-left transition-calm ${selectedTemplateId === template.id ? "border-byword-blue bg-byword-blue-soft" : "border-byword-border bg-card hover:border-byword-blue/40"}`}
                >
                  <div className="flex items-start gap-3">
                    <IconTile icon={FileText} className="h-9 w-9" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{template.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{template.category}</p>
                    </div>
                  </div>
                </button>
              ))}
              <Button variant="outline" className="w-full justify-start" onClick={() => { setSelectedTemplateId("new"); setDraftTemplate(cloneTemplate(emptyTemplate)); }}>
                <Plus className="mr-2 h-4 w-4" />New Template
              </Button>
            </div>
          </BywordCard>

          <BywordCard>
            <SectionHeader icon={Database} title="Saved Data" />
            <div className="space-y-3 p-4">
              <Select onValueChange={handleDatasetLoad}>
                <SelectTrigger><SelectValue placeholder="Load dataset..." /></SelectTrigger>
                <SelectContent>
                  {datasets.map((dataset) => (
                    <SelectItem key={dataset.id} value={dataset.id}>{dataset.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Input value={datasetName} onChange={(event) => setDatasetName(event.target.value)} placeholder="Dataset name" />
                <Button variant="outline" size="icon" onClick={() => saveDataset.mutate()} disabled={!datasetName.trim() || !materialized.rows.length || saveDataset.isPending}>
                  <Save className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </BywordCard>
        </div>

        <div className="space-y-6">
          <BywordCard>
            <SectionHeader
              icon={FileText}
              title="Template Editor"
              description={`${variables.length} variable${variables.length === 1 ? "" : "s"} · ${liveTemplate.sections.length} sections`}
              action={
                <div className="flex gap-2">
                  {!selectedTemplate?.builtIn && selectedTemplateId && (
                    <Button variant="ghost" size="icon" onClick={() => deleteTemplate.mutate(selectedTemplateId)} disabled={deleteTemplate.isPending}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => saveTemplate.mutate()} disabled={saveTemplate.isPending}>
                    {saveTemplate.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Copy className="mr-2 h-4 w-4" />}
                    {selectedTemplate?.builtIn ? "Customize" : "Save"}
                  </Button>
                </div>
              }
            />
            <div className="space-y-5 p-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={draftTemplate.name} onChange={(event) => updateTemplate({ name: event.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Input value={draftTemplate.category} onChange={(event) => updateTemplate({ category: event.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={draftTemplate.description} onChange={(event) => updateTemplate({ description: event.target.value })} className="min-h-20" />
              </div>
              <div className="space-y-2">
                <Label>Title Template</Label>
                <Input value={draftTemplate.titleTemplate} onChange={(event) => updateTemplate({ titleTemplate: event.target.value })} />
                <div className="flex flex-wrap gap-2">
                  {variables.map((variable) => (
                    <span key={variable} className="rounded bg-byword-blue-soft px-2 py-1 text-xs font-semibold text-byword-blue">{`{{${variable}}}`}</span>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                {draftTemplate.sections.map((section, index) => (
                  <div key={section.id} className="rounded-lg border border-byword-border bg-muted/10 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold">Section {index + 1}</p>
                      {draftTemplate.sections.length > 1 && (
                        <Button variant="ghost" size="icon" onClick={() => updateTemplate({ sections: draftTemplate.sections.filter((_, sectionIndex) => sectionIndex !== index) })}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <div className="grid gap-3 md:grid-cols-[160px_1fr_120px_120px]">
                      <Select value={section.type} onValueChange={(value) => updateSection(index, { type: value })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["title", "introduction", "tldr", "text", "table", "faq", "how-to", "conclusion", "cta"].map((type) => (
                            <SelectItem key={type} value={type}>{type}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input value={section.heading} onChange={(event) => updateSection(index, { heading: event.target.value })} placeholder="Heading" />
                      <Input type="number" value={section.minWords || ""} onChange={(event) => updateSection(index, { minWords: Number(event.target.value) || undefined })} placeholder="Min" />
                      <Input type="number" value={section.maxWords || ""} onChange={(event) => updateSection(index, { maxWords: Number(event.target.value) || undefined })} placeholder="Max" />
                    </div>
                    <Textarea value={section.instructions} onChange={(event) => updateSection(index, { instructions: event.target.value })} className="mt-3 min-h-20" placeholder="Instructions" />
                    <label className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                      <Checkbox checked={Boolean(section.snippable)} onCheckedChange={(checked) => updateSection(index, { snippable: Boolean(checked) })} />
                      Snippable section
                    </label>
                  </div>
                ))}
                <Button variant="outline" onClick={() => updateTemplate({ sections: [...draftTemplate.sections, newSection()] })}>
                  <Plus className="mr-2 h-4 w-4" />Add Section
                </Button>
              </div>
            </div>
          </BywordCard>

          <BywordCard>
            <SectionHeader icon={Database} title="Your Data" description={`Needs: ${variables.map((variable) => `{{${variable}}}`).join(", ")}`} />
            <div className="space-y-5 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="grid grid-cols-2 rounded-lg bg-muted p-1">
                  <Button variant={dataMode === "all_combinations" ? "secondary" : "ghost"} onClick={() => setDataMode("all_combinations")}>All combinations</Button>
                  <Button variant={dataMode === "match_rows" ? "secondary" : "ghost"} onClick={() => setDataMode("match_rows")}>Match rows</Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => event.target.files?.[0] && handleFile(event.target.files[0])} />
                  <Button variant="outline" onClick={() => fileInputRef.current?.click()}><Upload className="mr-2 h-4 w-4" />CSV</Button>
                  <Button variant="outline" onClick={() => navigator.clipboard.readText().then((text) => { setPasteText(text); applyRows(parseCsv(text).rows); }).catch(() => toast.error("Clipboard is not available"))}>
                    <Copy className="mr-2 h-4 w-4" />Paste
                  </Button>
                </div>
              </div>

              <div className="flex gap-2">
                <Input value={csvUrl} onChange={(event) => setCsvUrl(event.target.value)} placeholder="Public CSV URL" />
                <Button variant="outline" onClick={() => importCsvUrl.mutate()} disabled={!csvUrl.trim() || importCsvUrl.isPending}>
                  {importCsvUrl.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LinkIcon className="mr-2 h-4 w-4" />}
                  Import
                </Button>
              </div>

              {dataMode === "all_combinations" ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {variables.map((variable) => (
                    <div key={variable} className="rounded-lg border border-byword-border bg-card p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <Label>{variable}</Label>
                        <span className="text-xs text-muted-foreground">{valuesFromText(variableValues[variable] || "").length} values</span>
                      </div>
                      <Textarea
                        value={variableValues[variable] || ""}
                        onChange={(event) => setVariableValues((current) => ({ ...current, [variable]: event.target.value }))}
                        placeholder="One value per line"
                        className="min-h-32"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-byword-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-14">#</TableHead>
                        {variables.map((variable) => <TableHead key={variable}>{variable}</TableHead>)}
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(rows.length ? rows : [{}]).map((row, index) => (
                        <TableRow key={index}>
                          <TableCell>{index + 1}</TableCell>
                          {variables.map((variable) => (
                            <TableCell key={variable} className="min-w-48">
                              <Input value={row[variable] || ""} onChange={(event) => updateCell(index, variable, event.target.value)} placeholder={variable} />
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
                  <div className="border-t border-byword-border p-3">
                    <Button variant="outline" onClick={() => setRows((current) => [...(current.length ? current : []), {}])}>
                      <Plus className="mr-2 h-4 w-4" />Add row
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Paste data</Label>
                <Textarea value={pasteText} onChange={(event) => setPasteText(event.target.value)} placeholder={"city,state,service\nAustin,Texas,Plumbers"} className="min-h-24 font-mono text-sm" />
                <Button variant="outline" onClick={handlePasteImport} disabled={!pasteText.trim()}>Parse pasted data</Button>
              </div>
            </div>
          </BywordCard>
        </div>

        <div className="space-y-6">
          <BywordCard>
            <SectionHeader icon={Zap} title="Template Score" />
            <div className="p-6">
              <div className="flex items-end justify-between">
                <p className="text-5xl font-semibold text-byword-blue">{score.score}</p>
                <p className="text-sm text-muted-foreground">{score.score >= 80 ? "Strong" : score.score >= 55 ? "Getting There" : "Needs Work"}</p>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded bg-muted">
                <div className="h-full bg-byword-blue" style={{ width: `${score.score}%` }} />
              </div>
              <div className="mt-5 space-y-2 text-sm text-muted-foreground">
                <p>{liveTemplate.sections.length} sections</p>
                <p>{variables.length} data columns</p>
                <p>~{liveTemplate.wordRange[0]}-{liveTemplate.wordRange[1]} words</p>
              </div>
              {score.quickWins.length > 0 && (
                <div className="mt-5 border-t border-byword-border pt-4">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Quick Wins</p>
                  <div className="space-y-2 text-sm">
                    {score.quickWins.map((win) => <p key={win}>{win}</p>)}
                  </div>
                </div>
              )}
            </div>
          </BywordCard>

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
              <div className="rounded-lg border border-byword-border bg-muted/20 p-4">
                <h2 className="text-lg font-semibold">{renderedPreview.title}</h2>
                <div className="mt-4 space-y-3">
                  {renderedPreview.sections.filter((section) => section.type !== "title").slice(0, 5).map((section) => (
                    <div key={section.id}>
                      <p className="text-sm font-semibold">{section.heading}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{section.instructions}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </BywordCard>

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
                <Label>AI Model</Label>
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
        </div>
      </div>
    </BywordPageShell>
  );
}
