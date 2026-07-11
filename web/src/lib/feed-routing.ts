import type { SiteIntegration } from "@/hooks/useIntegrations";

export interface FeedEditorialDefaults {
  profile: "ortak_alan_news" | "generic";
  postType: "post" | "page";
  contentType: string;
  defaultTopicTags: string[];
  defaultTags: string[];
  defaultCategories: string[];
  aiTopicsEnabled: boolean;
}

export interface FeedRouteValue {
  siteId: string;
  integrationId: string;
  editorialDefaults: FeedEditorialDefaults;
}

export const EMPTY_FEED_DEFAULTS: FeedEditorialDefaults = {
  profile: "generic", postType: "post", contentType: "", defaultTopicTags: [], defaultTags: [], defaultCategories: [], aiTopicsEnabled: true,
};

export function routeReady(value: FeedRouteValue, integration?: SiteIntegration) {
  if (!value.siteId || !value.integrationId || !integration || integration.status !== "connected") return false;
  if (integration.config?.profile !== "ortak_alan_news") return true;
  const author = integration.config?.defaultAuthor as { id?: string } | undefined;
  return Boolean(value.editorialDefaults.contentType && author?.id && integration.config?.editorialOwner);
}
