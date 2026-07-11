import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  createKnowledgeDocument,
  extractDocxText,
  knowledgeChunkCount,
  knowledgeStatus,
  type KnowledgeDocument,
} from "@/lib/knowledge";
import { normalizeHttpUrl } from "@/lib/url-validation";

export interface BrandCta {
  id: string;
  label: string;
  url: string;
  description: string;
}

export interface BrandKnowledgeSettings {
  brand_company_name?: string | null;
  brand_description?: string | null;
  brand_target_audience?: string | null;
  brand_mentions?: string | null;
  brand_value_props?: string[] | null;
  brand_ctas?: BrandCta[] | null;
  knowledge_base_enabled?: boolean | null;
  knowledge_documents?: KnowledgeDocument[] | null;
}

export interface BrandKnowledgeSaveArgs {
  knowledgeDocuments?: KnowledgeDocument[];
  successMessage?: string;
  suppressErrorToast?: boolean;
  silent?: boolean;
}

interface UseBrandKnowledgeEditorOptions<T extends BrandKnowledgeSettings> {
  siteId?: string | null;
  settings?: T;
  additionalPayload?: () => Record<string, unknown>;
  successMessage: string;
  setSettingsCache: (settings: T) => void;
  invalidateSettings: () => Promise<unknown>;
}

const emptyBrandSettings = {
  brandCompanyName: "",
  brandDescription: "",
  brandTargetAudience: "",
  brandMentions: "moderate",
  brandValueProps: [] as string[],
  brandCtas: [] as BrandCta[],
  knowledgeBaseEnabled: false,
  knowledgeDocuments: [] as KnowledgeDocument[],
};

function draftFromSettings(settings?: BrandKnowledgeSettings) {
  if (!settings) return emptyBrandSettings;
  return {
    brandCompanyName: settings.brand_company_name || "",
    brandDescription: settings.brand_description || "",
    brandTargetAudience: settings.brand_target_audience || "",
    brandMentions: settings.brand_mentions || "moderate",
    brandValueProps: settings.brand_value_props || [],
    brandCtas: settings.brand_ctas || [],
    knowledgeBaseEnabled: settings.knowledge_base_enabled ?? false,
    knowledgeDocuments: settings.knowledge_documents || [],
  };
}

export function useBrandKnowledgeEditor<T extends BrandKnowledgeSettings>({
  siteId,
  settings,
  additionalPayload,
  successMessage,
  setSettingsCache,
  invalidateSettings,
}: UseBrandKnowledgeEditorOptions<T>) {
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

  useEffect(() => {
    const draft = draftFromSettings(settings);
    setBrandCompanyName(draft.brandCompanyName);
    setBrandDescription(draft.brandDescription);
    setBrandTargetAudience(draft.brandTargetAudience);
    setBrandMentions(draft.brandMentions);
    setBrandValueProps(draft.brandValueProps);
    setBrandCtas(draft.brandCtas);
    setKnowledgeBaseEnabled(draft.knowledgeBaseEnabled);
    setKnowledgeDocuments(draft.knowledgeDocuments);
    setNewValueProp("");
    setKnowledgeTitle("");
    setKnowledgeContent("");
    setCtaLabel("");
    setCtaUrl("");
    setCtaDescription("");
  }, [siteId, settings]);

  const saveMutation = useMutation({
    mutationFn: async (args?: BrandKnowledgeSaveArgs) => {
      const nextKnowledgeDocuments = args?.knowledgeDocuments || knowledgeDocuments;
      return api.put<T>("/settings", {
        siteId,
        ...additionalPayload?.(),
        brand_company_name: brandCompanyName,
        brand_description: brandDescription,
        brand_target_audience: brandTargetAudience,
        brand_mentions: brandMentions,
        brand_value_props: brandValueProps,
        brand_ctas: brandCtas,
        knowledge_base_enabled: knowledgeBaseEnabled || Boolean(nextKnowledgeDocuments.length),
        knowledge_documents: nextKnowledgeDocuments,
      });
    },
    onSuccess: (nextSettings, args) => {
      setSettingsCache(nextSettings);
      void invalidateSettings();
      if (!args?.silent) toast.success(args?.successMessage || successMessage);
    },
    onError: (error: Error, args) => {
      if (!args?.suppressErrorToast) toast.error(error.message || `Failed to save ${successMessage.toLowerCase()}`);
    },
  });

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

  const removeKnowledgeDocument = (id: string) => {
    setKnowledgeDocuments((current) => current.filter((document) => document.id !== id));
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
      const imported = await api.upload<Pick<KnowledgeDocument, "content">>("/settings/knowledge/import", formData);
      content = imported.content;
    } else {
      throw new Error("Upload a PDF, DOCX, or TXT file");
    }

    const document = createKnowledgeDocument(file.name.replace(/\.[^.]+$/, ""), content);
    const nextDocuments = [...knowledgeDocuments, document];
    setKnowledgeDocuments(nextDocuments);
    setKnowledgeBaseEnabled(true);
    await saveMutation.mutateAsync({
      knowledgeDocuments: nextDocuments,
      successMessage: "Knowledge file imported",
      suppressErrorToast: true,
    });
  };

  const handleKnowledgeFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setIsImportingKnowledge(true);
    try {
      await importKnowledgeFile(file);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to import knowledge file");
    } finally {
      setIsImportingKnowledge(false);
    }
  };

  const addCta = () => {
    const label = ctaLabel.trim();
    const description = ctaDescription.trim();
    if (!label || !description) {
      toast.error("Add at least a CTA label and description");
      return;
    }
    const url = ctaUrl.trim() ? normalizeHttpUrl(ctaUrl.trim()) : "";
    if (url) {
      try {
        new URL(url);
      } catch {
        toast.error("Add a valid CTA URL");
        return;
      }
    }
    setBrandCtas((current) => [...current, { id: crypto.randomUUID(), label, url, description }]);
    setCtaLabel("");
    setCtaUrl("");
    setCtaDescription("");
  };

  const removeCta = (id: string) => {
    setBrandCtas((current) => current.filter((cta) => cta.id !== id));
  };

  const savedDraft = draftFromSettings(settings);
  const isDirty = Boolean(settings) && (
    brandCompanyName !== savedDraft.brandCompanyName
    || brandDescription !== savedDraft.brandDescription
    || brandTargetAudience !== savedDraft.brandTargetAudience
    || brandMentions !== savedDraft.brandMentions
    || knowledgeBaseEnabled !== savedDraft.knowledgeBaseEnabled
    || JSON.stringify(brandValueProps) !== JSON.stringify(savedDraft.brandValueProps)
    || JSON.stringify(brandCtas) !== JSON.stringify(savedDraft.brandCtas)
    || JSON.stringify(knowledgeDocuments) !== JSON.stringify(savedDraft.knowledgeDocuments)
  );

  const metrics = useMemo(() => ({
    knowledgeChunkTotal: knowledgeDocuments.reduce((total, document) => total + knowledgeChunkCount(document), 0),
    readyKnowledgeCount: knowledgeDocuments.filter((document) => knowledgeStatus(document) === "ready").length,
  }), [knowledgeDocuments]);

  return {
    brandCompanyName, setBrandCompanyName,
    brandDescription, setBrandDescription,
    brandTargetAudience, setBrandTargetAudience,
    brandMentions, setBrandMentions,
    brandValueProps, setBrandValueProps,
    newValueProp, setNewValueProp,
    knowledgeBaseEnabled, setKnowledgeBaseEnabled,
    knowledgeDocuments, setKnowledgeDocuments,
    knowledgeTitle, setKnowledgeTitle,
    knowledgeContent, setKnowledgeContent,
    isImportingKnowledge,
    brandCtas, setBrandCtas,
    ctaLabel, setCtaLabel,
    ctaUrl, setCtaUrl,
    ctaDescription, setCtaDescription,
    addValueProp,
    addKnowledgeDocument,
    removeKnowledgeDocument,
    handleKnowledgeFileChange,
    addCta,
    removeCta,
    saveMutation,
    isDirty,
    canAddKnowledge: Boolean(knowledgeTitle.trim() && knowledgeContent.trim()),
    canAddCta: Boolean(ctaLabel.trim() && ctaDescription.trim()),
    ...metrics,
  };
}
