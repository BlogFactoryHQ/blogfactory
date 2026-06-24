import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useAdvancedMode } from "@/hooks/useAdvancedMode";
import { useSites } from "@/hooks/useSites";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Search,
  Plus,
  Save,
  Loader2,
  Bot,
  Building2,
  MessageSquare,
  Globe2,
  FileText,
  FileUp,
  Link2,
  Wand2,
  Wrench,
  Plug,
  FlaskConical,
  Copy,
  Settings2,
  ChevronRight,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { createKnowledgeDocument, extractDocxText, knowledgeChunkCount, knowledgeStatus, limitKnowledgeContent, type KnowledgeDocument } from "@/lib/knowledge";
import { SimplePromptView } from "@/components/personas/SimplePromptView";
import { LiveTextModelSelect, isUnavailableModel } from "@/components/content/LiveTextModelSelect";
import type { LiveTextModel } from "@/hooks/useTextModels";
import { SEOGuardrails } from "@/components/personas/SEOGuardrails";
import { PersonaToolsTab } from "@/components/personas/PersonaToolsTab";
import { PersonaPluginsTab } from "@/components/personas/PersonaPluginsTab";
import { PersonaTestTab } from "@/components/personas/PersonaTestTab";
import { Switch } from "@/components/ui/switch";
import { useTextModels } from "@/hooks/useTextModels";

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

interface BrandCta {
  id: string;
  label: string;
  url: string;
  description: string;
}

interface VoiceTrainingSample {
  id: string;
  title: string;
  sourceType: "paste" | "url" | "file";
  sourceUrl?: string;
  content: string;
  createdAt: string;
}

interface CustomVoiceProfile {
  summary?: string;
  styleTraits?: string[];
  doRules?: string[];
  dontRules?: string[];
  vocabularyGuidance?: string;
  finalPromptInstructions?: string;
}

interface PreferredTerm {
  from: string;
  to: string;
}

interface ContentRules {
  bannedWords: string[];
  bannedPhrases: string[];
  preferredTerms: PreferredTerm[];
  competitorAvoidance: boolean;
  competitors: string[];
  avoidAiPhrases: boolean;
}

interface UserSettings {
  article_word_count?: number | null;
  article_language?: string | null;
  article_voice?: string | null;
  voice_mode?: "preset" | "custom" | null;
  custom_voice_profile?: CustomVoiceProfile | null;
  voice_training_samples?: VoiceTrainingSample[] | null;
  content_rules?: Partial<ContentRules> | null;
  custom_article_instructions?: string | null;
  include_table_of_contents?: boolean | null;
  enable_research?: boolean | null;
  enable_internal_links?: boolean | null;
  internal_link_density?: string | null;
  brand_company_name?: string | null;
  brand_description?: string | null;
  brand_target_audience?: string | null;
  brand_mentions?: string | null;
  brand_value_props?: string[] | null;
  brand_ctas?: BrandCta[] | null;
  knowledge_base_enabled?: boolean | null;
  knowledge_documents?: KnowledgeDocument[] | null;
}

const voiceOptions = [
  { name: "Natural", description: "Balanced and human-sounding. Not too formal, not too casual." },
  { name: "Professional", description: "Polished and business-appropriate for B2B and industry content." },
  { name: "Conversational", description: "Relaxed, approachable, and direct to the reader." },
  { name: "Technical", description: "Precise, detail-oriented, and comfortable with jargon." },
  { name: "Friendly", description: "Warm, encouraging, and practical." },
  { name: "Authoritative", description: "Expert, confident, and decisive." },
];

const defaultContentRules: ContentRules = {
  bannedWords: [],
  bannedPhrases: [],
  preferredTerms: [],
  competitorAvoidance: false,
  competitors: [],
  avoidAiPhrases: true,
};

const brandMentionOptions = [
  { value: "subtle", label: "Subtle", description: "Mention once if relevant" },
  { value: "moderate", label: "Moderate", description: "Use in examples naturally" },
  { value: "prominent", label: "Prominent", description: "Feature throughout" },
];

function titleCaseDomain(value: string) {
  const first = value.replace(/^www\./, "").split(".")[0] || value;
  return first
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function siteLanguageToArticleLanguage(language?: string | null) {
  if (!language) return "";
  const value = language.toLowerCase();
  if (value.startsWith("tr")) return "Turkish";
  if (value.startsWith("de")) return "German";
  if (value.startsWith("fr")) return "French";
  if (value.startsWith("es")) return "Spanish";
  if (value.startsWith("en-gb") || value === "uk") return "UK English";
  if (value.startsWith("en")) return "US English";
  return "";
}

export default function Personas() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { isAdvanced, toggleAdvanced } = useAdvancedMode();
  const { activeSite } = useSites();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [editedPersona, setEditedPersona] = useState<Persona | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState("overview");
  const [activeTab, setActiveTab] = useState("tools");
  const [newPersona, setNewPersona] = useState({
    name: "",
    base_model: "",
    system_prompt: "",
  });
  const [articleWordCount, setArticleWordCount] = useState(1500);
  const [articleLanguage, setArticleLanguage] = useState("US English");
  const [articleVoice, setArticleVoice] = useState("Natural");
  const [voiceMode, setVoiceMode] = useState<"preset" | "custom">("preset");
  const [customVoiceProfile, setCustomVoiceProfile] = useState<CustomVoiceProfile | null>(null);
  const [voiceTrainingSamples, setVoiceTrainingSamples] = useState<VoiceTrainingSample[]>([]);
  const [sampleTitle, setSampleTitle] = useState("");
  const [sampleContent, setSampleContent] = useState("");
  const [sampleUrl, setSampleUrl] = useState("");
  const [isImportingVoiceSample, setIsImportingVoiceSample] = useState(false);
  const [includeTableOfContents, setIncludeTableOfContents] = useState(false);
  const [enableResearch, setEnableResearch] = useState(false);
  const [contentRules, setContentRules] = useState<ContentRules>(defaultContentRules);
  const [customArticleInstructions, setCustomArticleInstructions] = useState("");
  const [newBannedWord, setNewBannedWord] = useState("");
  const [newBannedPhrase, setNewBannedPhrase] = useState("");
  const [newPreferredFrom, setNewPreferredFrom] = useState("");
  const [newPreferredTo, setNewPreferredTo] = useState("");
  const [newCompetitor, setNewCompetitor] = useState("");
  const [brandCompanyName, setBrandCompanyName] = useState("");
  const [brandDescription, setBrandDescription] = useState("");
  const [brandTargetAudience, setBrandTargetAudience] = useState("");
  const [brandMentions, setBrandMentions] = useState("moderate");
  const [brandValueProps, setBrandValueProps] = useState<string[]>([]);
  const [newValueProp, setNewValueProp] = useState("");
  const [knowledgeBaseEnabled, setKnowledgeBaseEnabled] = useState(false);
  const [knowledgeDocuments, setKnowledgeDocuments] = useState<KnowledgeDocument[]>([]);
  const [knowledgeTitle, setKnowledgeTitle] = useState("");
  const [knowledgeContent, setKnowledgeContent] = useState("");
  const [isImportingKnowledge, setIsImportingKnowledge] = useState(false);
  const [brandCtas, setBrandCtas] = useState<BrandCta[]>([]);
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [ctaDescription, setCtaDescription] = useState("");

  // Fetch personas
  const { data: personas = [], isLoading } = useQuery({
    queryKey: ["personas"],
    queryFn: async () => {
      const data = await api.get<Persona[]>("/personas");
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
  const { data: textModelsData = [] } = useTextModels();
  const textModels: LiveTextModel[] = Array.isArray(textModelsData) ? textModelsData : [];

  const { data: userSettings } = useQuery({
    queryKey: ["user-settings"],
    queryFn: () => api.get<UserSettings>("/settings"),
    enabled: !!user,
  });

  useEffect(() => {
    if (!userSettings) return;
    setArticleWordCount(userSettings.article_word_count ?? 1500);
    setArticleLanguage(userSettings.article_language || "US English");
    setArticleVoice(userSettings.article_voice || "Natural");
    setVoiceMode(userSettings.voice_mode === "custom" ? "custom" : "preset");
    setCustomVoiceProfile(userSettings.custom_voice_profile || null);
    setVoiceTrainingSamples(userSettings.voice_training_samples || []);
    setContentRules({ ...defaultContentRules, ...(userSettings.content_rules || {}) });
    setCustomArticleInstructions(userSettings.custom_article_instructions || "");
    setIncludeTableOfContents(userSettings.include_table_of_contents ?? false);
    setEnableResearch(userSettings.enable_research ?? false);
    setBrandCompanyName(userSettings.brand_company_name || "");
    setBrandDescription(userSettings.brand_description || "");
    setBrandTargetAudience(userSettings.brand_target_audience || "");
    setBrandMentions(userSettings.brand_mentions || "moderate");
    setBrandValueProps(userSettings.brand_value_props || []);
    setBrandCtas(userSettings.brand_ctas || []);
    setKnowledgeBaseEnabled(userSettings.knowledge_base_enabled ?? false);
    setKnowledgeDocuments(userSettings.knowledge_documents || []);
  }, [userSettings]);

  // Create persona mutation
  const createMutation = useMutation({
    mutationFn: async (data: typeof newPersona) => {
      const created = await api.post<Persona>("/personas", {
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
      setNewPersona({ name: "", base_model: "", system_prompt: "" });
      setIsCreateOpen(false);
      toast.success("Brand voice profile created.");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to create profile");
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
      toast.success("Brand voice profile saved.");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to save profile");
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
      toast.success("Brand voice profile deleted.");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to delete profile");
    },
  });

  // Duplicate persona mutation
  const duplicateMutation = useMutation({
    mutationFn: async (persona: Persona) => {
      const created = await api.post<Persona>(`/personas/${persona.id}/duplicate`);
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
      toast.success("Brand voice profile duplicated.");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to duplicate agent");
    },
  });

  const saveBrandVoiceMutation = useMutation({
    mutationFn: async (nextKnowledgeDocuments?: KnowledgeDocument[]) => {
      await api.put("/settings", {
        article_voice: articleVoice,
        voice_mode: voiceMode,
        custom_voice_profile: customVoiceProfile,
        voice_training_samples: voiceTrainingSamples,
        content_rules: contentRules,
        custom_article_instructions: customArticleInstructions,
        brand_company_name: brandCompanyName,
        brand_description: brandDescription,
        brand_target_audience: brandTargetAudience,
        brand_mentions: brandMentions,
        brand_value_props: brandValueProps,
        brand_ctas: brandCtas,
        knowledge_base_enabled: knowledgeBaseEnabled || Boolean(nextKnowledgeDocuments?.length),
        knowledge_documents: nextKnowledgeDocuments || knowledgeDocuments,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
      toast.success("Brand voice settings saved.");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to save brand voice settings"),
  });

  const analyzeVoiceMutation = useMutation({
    mutationFn: () => api.post<UserSettings>("/settings/voice-profile/analyze", {
      samples: voiceTrainingSamples,
      modelId: editedPersona?.base_model,
    }),
    onSuccess: (settings) => {
      setVoiceMode("custom");
      setCustomVoiceProfile(settings.custom_voice_profile || null);
      setVoiceTrainingSamples(settings.voice_training_samples || voiceTrainingSamples);
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
      toast.success("Custom voice profile generated.");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to generate voice profile"),
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
    if (isUnavailableModel(editedPersona.base_model, textModels)) {
      toast.error("Selected model is no longer available on OpenRouter.");
      return;
    }
    updateMutation.mutate(editedPersona);
  };

  const handleCreate = () => {
    if (!newPersona.name || !newPersona.base_model || !newPersona.system_prompt) {
      toast.error("Please fill in all required fields.");
      return;
    }
    if (isUnavailableModel(newPersona.base_model, textModels)) {
      toast.error("Selected model is no longer available on OpenRouter.");
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

  const addValueProp = () => {
    const value = newValueProp.trim();
    if (!value) return;
    if (brandValueProps.length >= 5) {
      toast.error("You can add up to 5 value props");
      return;
    }
    setBrandValueProps((current) => [...current, value]);
    setNewValueProp("");
  };

  const addKnowledgeDocument = () => {
    const title = knowledgeTitle.trim();
    const content = knowledgeContent.trim();
    if (!title || !content) {
      toast.error("Add a title and content for the knowledge document");
      return;
    }
    setKnowledgeDocuments((current) => [...current, createKnowledgeDocument(title, content)]);
    setKnowledgeBaseEnabled(true);
    setKnowledgeTitle("");
    setKnowledgeContent("");
  };

  const updateContentRules = (updates: Partial<ContentRules>) => {
    setContentRules((current) => ({ ...current, ...updates }));
  };

  const addRuleItem = (key: "bannedWords" | "bannedPhrases" | "competitors", value: string, clear: () => void) => {
    const item = value.trim();
    if (!item) return;
    updateContentRules({ [key]: Array.from(new Set([...contentRules[key], item])) } as Partial<ContentRules>);
    clear();
  };

  const addPreferredTerm = () => {
    const from = newPreferredFrom.trim();
    const to = newPreferredTo.trim();
    if (!from || !to) return;
    updateContentRules({ preferredTerms: [...contentRules.preferredTerms, { from, to }] });
    setNewPreferredFrom("");
    setNewPreferredTo("");
  };

  const addVoiceSample = (sample: Omit<VoiceTrainingSample, "id" | "createdAt">) => {
    if (voiceTrainingSamples.length >= 10) {
      toast.error("You can add up to 10 training samples");
      return;
    }
    setVoiceTrainingSamples((current) => [...current, {
      ...sample,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    }]);
  };

  const addPastedVoiceSample = () => {
    const content = sampleContent.trim();
    if (!content) {
      toast.error("Paste a writing sample first");
      return;
    }
    addVoiceSample({ title: sampleTitle.trim() || "Pasted sample", sourceType: "paste", content });
    setSampleTitle("");
    setSampleContent("");
  };

  const importVoiceSampleUrl = async () => {
    const url = sampleUrl.trim();
    if (!url) return;
    setIsImportingVoiceSample(true);
    try {
      const extracted = await api.post<{ title?: string; content: string }>("/content/extract", {
        sourceType: "url",
        sourceValue: url,
      });
      addVoiceSample({
        title: extracted.title || titleCaseDomain(new URL(url).hostname),
        sourceType: "url",
        sourceUrl: url,
        content: extracted.content,
      });
      setSampleUrl("");
      toast.success("URL sample imported");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to import URL");
    } finally {
      setIsImportingVoiceSample(false);
    }
  };

  const autofillFromActiveSite = () => {
    if (!activeSite) {
      toast.error("Connect a site first.");
      return;
    }

    let changed = false;
    const siteName = activeSite.name || titleCaseDomain(activeSite.domain);
    const pages = activeSite.internalLinkIndex?.pages || [];
    const siteDescription = pages.find((page) => page.description)?.description?.trim() || "";
    const siteLanguage = siteLanguageToArticleLanguage(activeSite.language);

    if (!brandCompanyName.trim() && siteName) {
      setBrandCompanyName(siteName);
      changed = true;
    }
    if (!brandDescription.trim() && siteDescription) {
      setBrandDescription(siteDescription);
      changed = true;
    }
    if (brandValueProps.length === 0 && activeSite.topics?.length) {
      setBrandValueProps(activeSite.topics.slice(0, 5));
      changed = true;
    }
    if (!userSettings?.article_language && siteLanguage) {
      setArticleLanguage(siteLanguage);
      changed = true;
    }

    toast[changed ? "success" : "info"](changed ? "Autofilled blank brand fields. Review and save." : "No blank site-backed fields to autofill.");
  };

  const importKnowledgeFile = async (file: File) => {
    const extension = file.name.split(".").pop()?.toLowerCase();
    let content = "";

    if (extension === "txt" || file.type === "text/plain") {
      content = await file.text();
    } else if (extension === "docx") {
      content = await extractDocxText(file);
    } else if (extension === "pdf" || file.type === "application/pdf") {
      const formData = new FormData();
      formData.append("file", file);
      const imported = await api.upload<Pick<KnowledgeDocument, "title" | "content" | "status" | "chunks" | "error">>("/settings/knowledge/import", formData);
      content = imported.content;
    } else {
      throw new Error("Upload a PDF, DOCX, or TXT file");
    }

    const document = createKnowledgeDocument(file.name.replace(/\.[^.]+$/, ""), content);
    const nextDocuments = [...knowledgeDocuments, document];
    setKnowledgeDocuments(nextDocuments);
    setKnowledgeBaseEnabled(true);
    saveBrandVoiceMutation.mutate(nextDocuments);
    toast.success("Knowledge file imported");
  };

  const importVoiceSampleFile = async (file: File) => {
    const extension = file.name.split(".").pop()?.toLowerCase();
    let content = "";

    if (extension === "txt" || file.type === "text/plain") {
      content = await file.text();
    } else if (extension === "docx") {
      content = await extractDocxText(file);
    } else if (extension === "pdf" || file.type === "application/pdf") {
      const formData = new FormData();
      formData.append("file", file);
      const imported = await api.upload<{ content: string }>("/settings/knowledge/import", formData);
      content = imported.content;
    } else {
      throw new Error("Upload a PDF, DOCX, or TXT file");
    }

    const trimmed = content.trim();
    if (!trimmed) throw new Error("No readable text found in that file");
    addVoiceSample({
      title: file.name.replace(/\.[^.]+$/, ""),
      sourceType: "file",
      content: limitKnowledgeContent(trimmed),
    });
    toast.success("Training sample imported");
  };

  const handleKnowledgeFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setIsImportingKnowledge(true);
    try {
      await importKnowledgeFile(file);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to import knowledge file");
    } finally {
      setIsImportingKnowledge(false);
    }
  };

  const handleVoiceSampleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setIsImportingVoiceSample(true);
    try {
      await importVoiceSampleFile(file);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to import training sample");
    } finally {
      setIsImportingVoiceSample(false);
    }
  };

  const addCta = () => {
    const label = ctaLabel.trim();
    const description = ctaDescription.trim();
    if (!label || !description) {
      toast.error("Add at least a CTA label and description");
      return;
    }
    setBrandCtas((current) => [...current, { id: crypto.randomUUID(), label, url: ctaUrl.trim(), description }]);
    setCtaLabel("");
    setCtaUrl("");
    setCtaDescription("");
  };

  // Count configured tools and plugins for badges
  const toolCount = editedPersona?.tools_config?.filter((t) => t.enabled).length || 0;
  const pluginCount = Object.values(editedPersona?.plugins_config || {}).filter(
    (p) => p?.enabled
  ).length;
  const hasAdvancedConfig = toolCount > 0 || pluginCount > 0 ||
    (editedPersona?.validation_rules && Object.keys(editedPersona.validation_rules).length > 0);
  const trainingWordCount = voiceTrainingSamples.reduce((total, sample) => total + sample.content.split(/\s+/).filter(Boolean).length, 0);
  const trainingQuality =
    trainingWordCount >= 10000 ? "Excellent" :
    trainingWordCount >= 5000 ? "Great coverage" :
    trainingWordCount >= 2000 ? "Good coverage" :
    trainingWordCount >= 500 ? "Good start" :
    "Minimal";
  const knowledgeChunkTotal = knowledgeDocuments.reduce((total, document) => total + knowledgeChunkCount(document), 0);
  const readyKnowledgeCount = knowledgeDocuments.filter((document) => knowledgeStatus(document) === "ready").length;
  const canAddKnowledge = Boolean(knowledgeTitle.trim() && knowledgeContent.trim());
  const activeProfileCount = personas.filter((persona) => persona.status === "active").length;
  const wordRange = articleWordCount > 0
    ? `${Math.round(articleWordCount * 0.8).toLocaleString()}-${Math.round(articleWordCount * 1.2).toLocaleString()} words`
    : "Smart length";
  const linkDensityLabels: Record<string, string> = {
    minimal: "Up to 1-2 relevant links",
    light: "Up to 3-4 relevant links",
    balanced: "Up to 5-7 relevant links",
    rich: "Up to 8-12 relevant links",
  };
  const outputDefaults = [
    { label: "Length", value: articleWordCount > 0 ? `${articleWordCount.toLocaleString()} target · ${wordRange}` : wordRange },
    { label: "Language", value: articleLanguage },
    { label: "FAQ", value: "3-5 questions" },
    { label: "Internal links", value: userSettings?.enable_internal_links ? linkDensityLabels[userSettings.internal_link_density || "balanced"] || "Up to 5-7 relevant links" : "Off" },
    { label: "Research", value: enableResearch ? "On" : "Off" },
    { label: "TOC", value: includeTableOfContents ? "On" : "Off" },
  ];

  return (
    <div className="p-8 h-[calc(100vh-2rem)] max-w-7xl">
      <div className="flex h-full gap-6">
        {/* Left Panel - List */}
        <div className="w-80 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Writer Profiles</p>
            <Button size="icon" variant="ghost" onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter profiles..."
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
                {searchQuery ? "No profiles found" : "No profiles yet. Create one."}
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

        {/* Right Panel - Brand Workspace */}
        <div className="flex-1 calm-card overflow-hidden flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-6">
            <div className="flex items-center gap-3">
              <Building2 className="h-6 w-6 text-primary" />
              <div>
                <h2 className="text-xl font-semibold">Brand Voice</h2>
                <p className="text-sm text-muted-foreground">Voice rules, brand context, knowledge, and writer profiles.</p>
              </div>
            </div>
            <Button onClick={() => saveBrandVoiceMutation.mutate(undefined)} disabled={saveBrandVoiceMutation.isPending}>
              <Save className="mr-2 h-4 w-4" />
              {saveBrandVoiceMutation.isPending ? "Saving..." : "Save Brand Voice"}
            </Button>
          </div>

          <Tabs value={activeWorkspaceTab} onValueChange={setActiveWorkspaceTab} className="flex min-h-0 flex-1 flex-col">
            <div className="border-b border-border px-6 py-3">
              <TabsList className="grid h-auto w-full grid-cols-4 gap-1 bg-muted/50 p-1">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="voice">Voice Rules</TabsTrigger>
                <TabsTrigger value="brand">Brand Context</TabsTrigger>
                <TabsTrigger value="profiles">Writer Profiles</TabsTrigger>
              </TabsList>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              <TabsContent value="overview" className="mt-0 space-y-6">
                <div className="grid gap-3 md:grid-cols-4">
                  {[
                    { label: "Voice", value: voiceMode === "custom" ? "Custom profile" : articleVoice, icon: MessageSquare },
                    { label: "Brand", value: brandCompanyName || "Not set", icon: Building2 },
                    { label: "Knowledge", value: `${readyKnowledgeCount}/${knowledgeDocuments.length} ready`, icon: FileText },
                    { label: "Profiles", value: `${activeProfileCount} active`, icon: Bot },
                  ].map((item) => (
                    <div key={item.label} className="rounded-lg border border-border bg-muted/20 p-4">
                      <item.icon className="mb-3 h-4 w-4 text-primary" />
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{item.label}</p>
                      <p className="mt-1 truncate font-semibold">{item.value}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-lg border border-border">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
                    <div>
                      <h3 className="font-semibold">Output defaults</h3>
                      <p className="text-sm text-muted-foreground">Article mechanics live in Settings, not Brand Voice.</p>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <a href="/settings">Open Settings</a>
                    </Button>
                  </div>
                  <div className="grid gap-3 p-4 md:grid-cols-3">
                    {outputDefaults.map((item) => (
                      <div key={item.label} className="rounded-lg border border-border bg-background p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{item.label}</p>
                        <p className="mt-1 text-sm font-medium">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-border p-4">
                  <h3 className="font-semibold">Selected writer profile</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {editedPersona ? `${editedPersona.name} · ${editedPersona.base_model}` : "Create a writer profile when you need a specific prompt or model."}
                  </p>
                  {!editedPersona && (
                    <Button type="button" className="mt-4" onClick={() => setIsCreateOpen(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create Profile
                    </Button>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="voice" className="mt-0 space-y-6">
                <div className="grid rounded-lg border border-border bg-muted/30 p-1 sm:inline-grid sm:grid-cols-2">
                  {(["preset", "custom"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setVoiceMode(mode)}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-sm font-medium",
                        voiceMode === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {mode === "preset" ? "Preset tones" : "Custom training"}
                    </button>
                  ))}
                </div>

                {voiceMode === "preset" ? (
                  <div className="grid gap-3 md:grid-cols-3">
                    {voiceOptions.map((voice) => (
                      <button
                        key={voice.name}
                        type="button"
                        onClick={() => setArticleVoice(voice.name)}
                        className={cn(
                          "rounded-lg border p-3 text-left transition-calm",
                          articleVoice === voice.name ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40"
                        )}
                      >
                        <p className="text-sm font-medium">{voice.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{voice.description}</p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">Custom training</p>
                        <p className="text-sm text-muted-foreground">{trainingWordCount.toLocaleString()} words · {trainingQuality}</p>
                      </div>
                      <Button type="button" onClick={() => analyzeVoiceMutation.mutate()} disabled={analyzeVoiceMutation.isPending || voiceTrainingSamples.length === 0}>
                        {analyzeVoiceMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                        Generate profile
                      </Button>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <Input value={sampleTitle} onChange={(event) => setSampleTitle(event.target.value)} placeholder="Sample title, optional" />
                        <Textarea value={sampleContent} onChange={(event) => setSampleContent(event.target.value)} placeholder="Paste writing sample" className="min-h-[120px]" />
                        <Button type="button" variant="outline" onClick={addPastedVoiceSample}>Add pasted sample</Button>
                      </div>
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <Input value={sampleUrl} onChange={(event) => setSampleUrl(event.target.value)} placeholder="https://example.com/article" />
                          <Button type="button" variant="outline" onClick={importVoiceSampleUrl} disabled={isImportingVoiceSample} aria-label="Import URL sample">
                            <Link2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <Button type="button" variant="outline" className="w-full justify-start" disabled={isImportingVoiceSample} asChild>
                          <label>
                            {isImportingVoiceSample ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
                            Import PDF, DOCX, or TXT
                            <input type="file" accept=".pdf,.docx,.txt,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={handleVoiceSampleFileChange} />
                          </label>
                        </Button>
                        {customVoiceProfile?.summary && <p className="rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground">{customVoiceProfile.summary}</p>}
                      </div>
                    </div>
                    {voiceTrainingSamples.map((sample) => (
                      <div key={sample.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{sample.title}</p>
                          <p className="text-xs text-muted-foreground">{sample.sourceType} · {sample.content.split(/\s+/).filter(Boolean).length.toLocaleString()} words</p>
                        </div>
                        <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${sample.title}`} onClick={() => setVoiceTrainingSamples((current) => current.filter((item) => item.id !== sample.id))}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid gap-4 lg:grid-cols-3">
                  <div className="space-y-3 rounded-lg border border-border p-4">
                    <h3 className="font-semibold">Banned language</h3>
                    <div className="flex gap-2">
                      <Input value={newBannedWord} onChange={(event) => setNewBannedWord(event.target.value)} placeholder="Banned word" />
                      <Button type="button" variant="outline" onClick={() => addRuleItem("bannedWords", newBannedWord, () => setNewBannedWord(""))}>Add</Button>
                    </div>
                    <div className="flex gap-2">
                      <Input value={newBannedPhrase} onChange={(event) => setNewBannedPhrase(event.target.value)} placeholder="Banned phrase" />
                      <Button type="button" variant="outline" onClick={() => addRuleItem("bannedPhrases", newBannedPhrase, () => setNewBannedPhrase(""))}>Add</Button>
                    </div>
                    <div className="flex min-h-8 flex-wrap gap-2">
                      {[...contentRules.bannedWords, ...contentRules.bannedPhrases].map((item) => (
                        <Badge key={item} variant="outline">{item}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-3 rounded-lg border border-border p-4">
                    <h3 className="font-semibold">Preferred terms</h3>
                    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                      <Input value={newPreferredFrom} onChange={(event) => setNewPreferredFrom(event.target.value)} placeholder="Avoid" />
                      <Input value={newPreferredTo} onChange={(event) => setNewPreferredTo(event.target.value)} placeholder="Use instead" />
                      <Button type="button" variant="outline" onClick={addPreferredTerm}>Add</Button>
                    </div>
                    {contentRules.preferredTerms.map((term) => (
                      <div key={`${term.from}-${term.to}`} className="flex items-center justify-between gap-3 rounded-lg border border-border p-2 text-sm">
                        <span>{term.from} → {term.to}</span>
                        <Button type="button" variant="ghost" size="icon" onClick={() => updateContentRules({ preferredTerms: contentRules.preferredTerms.filter((item) => item !== term) })}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <label className="flex items-center justify-between rounded-lg border border-border p-3 text-sm font-medium">
                      Avoid AI-sounding phrases
                      <Switch checked={contentRules.avoidAiPhrases} onCheckedChange={(checked) => updateContentRules({ avoidAiPhrases: checked })} />
                    </label>
                  </div>
                  <div className="space-y-3 rounded-lg border border-border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-semibold">Competitor avoidance</h3>
                      <Switch checked={contentRules.competitorAvoidance} onCheckedChange={(checked) => updateContentRules({ competitorAvoidance: checked })} />
                    </div>
                    <div className="flex gap-2">
                      <Input value={newCompetitor} onChange={(event) => setNewCompetitor(event.target.value)} placeholder="Competitor name" />
                      <Button type="button" variant="outline" onClick={() => addRuleItem("competitors", newCompetitor, () => setNewCompetitor(""))}>Add</Button>
                    </div>
                    <div className="flex min-h-8 flex-wrap gap-2">
                      {contentRules.competitors.map((competitor) => (
                        <Badge key={competitor} variant="outline" className="gap-1">
                          {competitor}
                          <button type="button" onClick={() => updateContentRules({ competitors: contentRules.competitors.filter((item) => item !== competitor) })} aria-label={`Remove ${competitor}`}>
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Custom article instructions</Label>
                  <Textarea value={customArticleInstructions} onChange={(event) => setCustomArticleInstructions(event.target.value)} placeholder="Always include a practical example in how-to sections." className="min-h-[90px]" />
                </div>
              </TabsContent>

              <TabsContent value="brand" className="mt-0 space-y-6">
                <div className="space-y-4 rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="font-semibold">Brand profile</h3>
                    <Button type="button" variant="outline" size="sm" onClick={autofillFromActiveSite}>
                      <Globe2 className="mr-2 h-4 w-4" />
                      Autofill from active site
                    </Button>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Input value={brandCompanyName} onChange={(event) => setBrandCompanyName(event.target.value)} placeholder="Company name" />
                    <Input value={brandTargetAudience} onChange={(event) => setBrandTargetAudience(event.target.value)} placeholder="Target audience" />
                  </div>
                  <Textarea value={brandDescription} onChange={(event) => setBrandDescription(event.target.value)} placeholder="What your company does" className="min-h-[100px]" />
                  <div className="grid gap-3 md:grid-cols-3">
                    {brandMentionOptions.map((option) => (
                      <button key={option.value} type="button" onClick={() => setBrandMentions(option.value)} className={cn("rounded-lg border p-3 text-left transition-calm", brandMentions === option.value ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40")}>
                        <p className="text-sm font-medium">{option.label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input value={newValueProp} onChange={(event) => setNewValueProp(event.target.value)} placeholder="Add value proposition" />
                    <Button type="button" variant="outline" onClick={addValueProp}>Add</Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {brandValueProps.map((prop) => (
                      <span key={prop} className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-sm">
                        {prop}
                        <button type="button" onClick={() => setBrandValueProps((current) => current.filter((item) => item !== prop))} aria-label={`Remove ${prop}`}>
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="space-y-3 rounded-lg border border-border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-semibold">Knowledge documents</h3>
                      <Switch checked={knowledgeBaseEnabled} onCheckedChange={setKnowledgeBaseEnabled} />
                    </div>
                    <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-border text-sm">
                      <div className="p-3"><p className="font-semibold">{knowledgeDocuments.length}</p><p className="text-muted-foreground">Docs</p></div>
                      <div className="border-l border-border p-3"><p className="font-semibold">{readyKnowledgeCount}</p><p className="text-muted-foreground">Ready</p></div>
                      <div className="border-l border-border p-3"><p className="font-semibold">{knowledgeChunkTotal}</p><p className="text-muted-foreground">Chunks</p></div>
                    </div>
                    <Input value={knowledgeTitle} onChange={(event) => setKnowledgeTitle(event.target.value)} placeholder="Document title" />
                    <Textarea value={knowledgeContent} onChange={(event) => setKnowledgeContent(event.target.value)} placeholder="Paste product facts, FAQs, or brand context" className="min-h-[100px]" />
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" onClick={addKnowledgeDocument} disabled={!canAddKnowledge}>Add Knowledge</Button>
                      <Button type="button" variant="outline" disabled={isImportingKnowledge} asChild>
                        <label>
                          {isImportingKnowledge ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
                          Import File
                          <input type="file" accept=".pdf,.docx,.txt,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={handleKnowledgeFileChange} />
                        </label>
                      </Button>
                    </div>
                    {knowledgeDocuments.map((document) => (
                      <div key={document.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{document.title}</p>
                          <p className="line-clamp-2 text-sm text-muted-foreground">{document.content}</p>
                        </div>
                        <Button type="button" variant="ghost" size="icon" onClick={() => setKnowledgeDocuments((current) => current.filter((item) => item.id !== document.id))} aria-label={`Remove ${document.title}`}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-3 rounded-lg border border-border p-4">
                    <h3 className="font-semibold">Calls to action</h3>
                    <Input value={ctaLabel} onChange={(event) => setCtaLabel(event.target.value)} placeholder="CTA label" />
                    <Input value={ctaUrl} onChange={(event) => setCtaUrl(event.target.value)} placeholder="URL, optional" />
                    <Textarea value={ctaDescription} onChange={(event) => setCtaDescription(event.target.value)} placeholder="How to use it" className="min-h-[90px]" />
                    <Button type="button" variant="outline" onClick={addCta}>Add CTA</Button>
                    {brandCtas.map((cta) => (
                      <div key={cta.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                        <div className="min-w-0">
                          <p className="font-medium">{cta.label}</p>
                          <p className="text-sm text-muted-foreground">{cta.description}</p>
                          {cta.url && <p className="truncate text-xs text-primary">{cta.url}</p>}
                        </div>
                        <Button type="button" variant="ghost" size="icon" onClick={() => setBrandCtas((current) => current.filter((item) => item.id !== cta.id))}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="profiles" className="mt-0 space-y-6">
                {editedPersona ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4">
                      <div className="flex items-center gap-3">
                        <Bot className="h-5 w-5 text-primary" />
                        <div>
                          <h3 className="font-semibold">{editedPersona.name}</h3>
                          <p className="text-sm text-muted-foreground">{editedPersona.status === "active" ? "Active" : "Inactive"} · {editedPersona.base_model}</p>
                        </div>
                        {hasAdvancedConfig && <Badge variant="secondary">Advanced</Badge>}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setIsDeleteOpen(true)}>Delete</Button>
                        <Button variant="outline" onClick={() => selectedPersona && duplicateMutation.mutate(selectedPersona)} disabled={duplicateMutation.isPending}>
                          <Copy className="mr-2 h-4 w-4" />
                          {duplicateMutation.isPending ? "Duplicating..." : "Duplicate"}
                        </Button>
                        <Button onClick={handleSave} disabled={updateMutation.isPending || isUnavailableModel(editedPersona?.base_model, textModels)}>
                          <Save className="mr-2 h-4 w-4" />
                          {updateMutation.isPending ? "Saving..." : "Save Profile"}
                        </Button>
                      </div>
                    </div>

                    <SimplePromptView persona={editedPersona} onChange={updateEditedPersona} />

                    <button
                      onClick={toggleAdvanced}
                      className={cn("flex w-full items-center justify-between rounded-lg border p-4 transition-colors", isAdvanced ? "border-primary/30 bg-primary/5" : "border-border hover:border-primary/30 hover:bg-muted/50")}
                    >
                      <div className="flex items-center gap-3">
                        <Settings2 className={cn("h-5 w-5", isAdvanced ? "text-primary" : "text-muted-foreground")} />
                        <div className="text-left">
                          <p className="font-medium">Advanced lab</p>
                          <p className="text-sm text-muted-foreground">Tools, plugins, output guardrails, and profile testing.</p>
                        </div>
                      </div>
                      <ChevronRight className={cn("h-5 w-5 transition-transform", isAdvanced ? "rotate-90 text-primary" : "text-muted-foreground")} />
                    </button>

                    {isAdvanced && (
                      <div className="space-y-6 animate-in slide-in-from-top-2 duration-200">
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
                        <Tabs value={activeTab} onValueChange={setActiveTab} className="overflow-hidden rounded-lg border border-border">
                          <div className="border-b border-border bg-muted/30 px-4">
                            <TabsList className="h-12 gap-1 bg-transparent">
                              <TabsTrigger value="tools" className="gap-2"><Wrench className="h-4 w-4" />Tools</TabsTrigger>
                              <TabsTrigger value="plugins" className="gap-2"><Plug className="h-4 w-4" />Plugins</TabsTrigger>
                              <TabsTrigger value="test" className="gap-2"><FlaskConical className="h-4 w-4" />Test</TabsTrigger>
                            </TabsList>
                          </div>
                          <div className="p-6">
                            <TabsContent value="tools" className="mt-0">
                              <PersonaToolsTab
                                toolsConfig={editedPersona.tools_config || []}
                                toolChoice={editedPersona.tool_choice || "auto"}
                                parallelToolCalls={editedPersona.parallel_tool_calls ?? true}
                                onChange={(updates) => updateEditedPersona({
                                  tools_config: updates.tools_config ?? editedPersona.tools_config,
                                  tool_choice: updates.tool_choice ?? editedPersona.tool_choice,
                                  parallel_tool_calls: updates.parallel_tool_calls ?? editedPersona.parallel_tool_calls,
                                })}
                              />
                            </TabsContent>
                            <TabsContent value="plugins" className="mt-0">
                              <PersonaPluginsTab pluginsConfig={editedPersona.plugins_config || {}} onChange={(config) => updateEditedPersona({ plugins_config: config })} />
                            </TabsContent>
                            <TabsContent value="test" className="mt-0">
                              <PersonaTestTab personaId={editedPersona.id} personaName={editedPersona.name} />
                            </TabsContent>
                          </div>
                        </Tabs>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="rounded-lg border border-dashed border-border p-8 text-center">
                    {isLoading ? <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" /> : (
                      <>
                        <Bot className="mx-auto h-8 w-8 text-muted-foreground" />
                        <p className="mt-3 font-medium">No writer profiles yet</p>
                        <p className="mt-1 text-sm text-muted-foreground">Create one when you need a specific prompt or model.</p>
                        <Button type="button" className="mt-4" onClick={() => setIsCreateOpen(true)}>
                          <Plus className="mr-2 h-4 w-4" />
                          Create Profile
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>

      {/* Create Profile Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create Brand Voice Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Profile Name</Label>
              <Input
                placeholder="e.g., Senior Technical Writer, Brand Voice Lead"
                value={newPersona.name}
                onChange={(e) => setNewPersona({ ...newPersona, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Base Model</Label>
              <LiveTextModelSelect
                value={newPersona.base_model}
                onValueChange={(v) => setNewPersona({ ...newPersona, base_model: v })}
              />
              {isUnavailableModel(newPersona.base_model, textModels) && (
                <p className="text-xs text-destructive">Unavailable: {newPersona.base_model}. Pick a live OpenRouter model.</p>
              )}
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
                Define the profile's tone, style constraints, and knowledge base.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending || !newPersona.base_model || isUnavailableModel(newPersona.base_model, textModels)}
            >
              {createMutation.isPending ? "Creating..." : "Create Profile"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Brand Voice Profile</AlertDialogTitle>
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
