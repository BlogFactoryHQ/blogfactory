// Mock data for AI Content Studio

export interface Persona {
  id: string;
  name: string;
  baseModel: string;
  systemPrompt: string;
  status: "active" | "inactive";
  language?: string;
  category?: string;
  createdAt: string;
}

export interface Feed {
  id: string;
  name: string;
  sourceUrl: string;
  keywords: string[];
  personaId: string;
  modelId: string;
  frequency: "hourly" | "every_4_hours" | "every_12_hours" | "daily";
  isActive: boolean;
  createdAt: string;
  lastRun?: string;
  totalArticles?: number;
}

export interface Job {
  id: string;
  sourceType: "rss_feed" | "url" | "pdf" | "raw_text" | "youtube";
  sourceValue: string;
  personaId: string;
  modelId: string;
  status: "pending" | "running" | "completed" | "failed";
  errorMessage?: string;
  resultPostIds: string[];
  createdAt: string;
  completedAt?: string;
  tokenCost?: number;
}

export interface Post {
  id: string;
  title: string;
  content: string;
  status: "draft" | "published";
  sourceType: "rss_feed" | "url" | "pdf" | "raw_text" | "youtube" | "manual";
  sourceRefId?: string;
  personaId: string;
  modelId: string;
  createdAt: string;
  jobId?: string;
}

// OpenRouter models (all AI generation uses OpenRouter)
// Pricing: cost per 1M tokens (input/output) - "low" < $1, "medium" $1-$10, "high" > $10
export type ModelPricing = "free" | "low" | "medium" | "high";

export interface Model {
  id: string;
  name: string;
  provider: string;
  pricing: ModelPricing;
  costPer1M?: string; // Approximate cost per 1M tokens (input/output)
}

export interface ImageModelConstraints {
  resolutions: ("Web" | "1K" | "2K" | "4K")[];
  aspectRatios: string[];
  maxDimensionPx?: number;
}

export interface ImageModel {
  id: string;
  name: string;
  provider: string;
  pricing: ModelPricing;
  costInfo: string;
  description: string;
  apiProvider?: "openrouter" | "google-ai-studio";
  constraints?: ImageModelConstraints;
  isFree?: boolean;
  limits?: string; // Rate limits or usage limits for free models
}

// IMAGE_MODELS are now fetched live from OpenRouter API via the useImageModels hook.
// The IMAGE_MODELS constant below is kept ONLY as a fallback for offline/error states.
export const IMAGE_MODELS: ImageModel[] = [
  { id: "google/gemini-2.5-flash-image", name: "Nano Banana (Gemini 2.5 Flash Image)", provider: "Google", pricing: "low", costInfo: "$0.30/$2.50 per 1M tokens", description: "Fast, affordable image generation via OpenRouter", apiProvider: "openrouter" },
  { id: "google-ai-studio/gemini-2.5-flash-image", name: "Gemini 2.5 Flash (Google AI Studio)", provider: "Google AI Studio", pricing: "low", costInfo: "~$0.04 per image", description: "Direct Google AI Studio — lower latency, uses your own API key. Max ~1024px.", apiProvider: "google-ai-studio", constraints: { resolutions: ["Web", "1K"], aspectRatios: ["1:1", "3:2", "4:3", "16:9", "9:16", "21:9", "2:3", "3:4", "4:5", "5:4"], maxDimensionPx: 1024 } },
  { id: "google/gemini-3-pro-image-preview", name: "Nano Banana Pro (Gemini 3 Pro Image)", provider: "Google", pricing: "medium", costInfo: "$2/$12 per 1M tokens", description: "Advanced image gen with 2K/4K output, text rendering", apiProvider: "openrouter" },
  { id: "openai/gpt-5-image-mini", name: "GPT-5 Image Mini", provider: "OpenAI", pricing: "medium", costInfo: "$2.50/$2 per 1M tokens", description: "Efficient image generation with text understanding", apiProvider: "openrouter" },
  { id: "openai/gpt-5-image", name: "GPT-5 Image", provider: "OpenAI", pricing: "high", costInfo: "$10/$10 per 1M tokens", description: "Top-tier reasoning + image gen", apiProvider: "openrouter" },
];

export const MODELS: Model[] = [
  // Anthropic
  { id: "anthropic/claude-opus-4.5", name: "Claude Opus 4.5", provider: "Anthropic", pricing: "high", costPer1M: "$5/$25" },
  { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet", provider: "Anthropic", pricing: "medium", costPer1M: "$3/$15" },
  { id: "anthropic/claude-3-haiku", name: "Claude 3 Haiku", provider: "Anthropic", pricing: "low", costPer1M: "$0.25/$1.25" },
  
  // OpenAI
  { id: "openai/gpt-5.2", name: "GPT-5.2", provider: "OpenAI", pricing: "medium", costPer1M: "$1.75/$14" },
  { id: "openai/gpt-5.2-pro", name: "GPT-5.2 Pro", provider: "OpenAI", pricing: "high", costPer1M: "$21/$168" },
  { id: "openai/gpt-5.1", name: "GPT-5.1", provider: "OpenAI", pricing: "medium", costPer1M: "$1.25/$10" },
  { id: "openai/gpt-4o", name: "GPT-4o", provider: "OpenAI", pricing: "medium", costPer1M: "$2.50/$10" },
  { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", provider: "OpenAI", pricing: "low", costPer1M: "$0.15/$0.60" },
  
  // Google
  { id: "google/gemini-3-pro-preview", name: "Gemini 3 Pro", provider: "Google", pricing: "medium", costPer1M: "$2/$12" },
  { id: "google/gemini-3-flash-preview", name: "Gemini 3 Flash", provider: "Google", pricing: "low", costPer1M: "$0.50/$3" },
  { id: "google/gemini-pro-1.5", name: "Gemini Pro 1.5", provider: "Google", pricing: "medium", costPer1M: "$1.25/$5" },
  { id: "google/gemini-flash-1.5", name: "Gemini Flash 1.5", provider: "Google", pricing: "low", costPer1M: "$0.075/$0.30" },
  
  // DeepSeek
  { id: "deepseek/deepseek-v3.2", name: "DeepSeek V3.2", provider: "DeepSeek", pricing: "low", costPer1M: "$0.25/$0.38" },
  { id: "deepseek/deepseek-v3.2-speciale", name: "DeepSeek V3.2 Speciale", provider: "DeepSeek", pricing: "low", costPer1M: "$0.27/$0.41" },
  
  // xAI
  { id: "x-ai/grok-4.1-fast", name: "Grok 4.1 Fast", provider: "xAI", pricing: "low", costPer1M: "$0.20/$0.50" },
  
  // Meta
  { id: "meta-llama/llama-3.1-70b-instruct", name: "Llama 3.1 70B", provider: "Meta", pricing: "low", costPer1M: "$0.52/$0.75" },
  { id: "meta-llama/llama-3.1-8b-instruct", name: "Llama 3.1 8B", provider: "Meta", pricing: "low", costPer1M: "$0.06/$0.06" },
  
  // Mistral
  { id: "mistralai/mistral-large-2512", name: "Mistral Large 3", provider: "Mistral", pricing: "low", costPer1M: "$0.50/$1.50" },
  { id: "mistralai/devstral-2512", name: "Devstral 2", provider: "Mistral", pricing: "low", costPer1M: "$0.05/$0.22" },
  { id: "mistralai/mistral-small-creative", name: "Mistral Small Creative", provider: "Mistral", pricing: "low", costPer1M: "$0.10/$0.30" },
  
  // Other
  { id: "moonshotai/kimi-k2.5", name: "Kimi K2.5", provider: "MoonshotAI", pricing: "low", costPer1M: "$0.50/$2.80" },
  { id: "minimax/minimax-m2.1", name: "MiniMax M2.1", provider: "MiniMax", pricing: "low", costPer1M: "$0.27/$1.10" },
];

export const FREQUENCIES = [
  { id: "hourly", name: "Hourly" },
  { id: "every_4_hours", name: "Every 4 hours" },
  { id: "every_12_hours", name: "Every 12 hours" },
  { id: "daily", name: "Daily" },
  { id: "weekly", name: "Weekly" },
];

// Platforms for upvote-rss style sources
export const PLATFORMS = [
  { id: "rss", name: "RSS Feed", description: "Standard RSS/Atom feed" },
  { id: "youtube", name: "YouTube Channel", description: "Monitor channel for new videos" },
  { id: "reddit", name: "Reddit", description: "Subreddit posts with score filtering" },
  { id: "hackernews", name: "Hacker News", description: "Tech news from Y Combinator" },
  { id: "github", name: "GitHub Trending", description: "Trending repositories by language" },
  { id: "lemmy", name: "Lemmy", description: "Fediverse communities" },
  { id: "lobsters", name: "Lobsters", description: "Computing-focused link aggregator" },
];

export const FILTER_TYPES = [
  { id: "none", name: "No Filter", description: "Include all posts" },
  { id: "score", name: "Minimum Score", description: "Filter by minimum upvote score" },
  { id: "threshold", name: "Score Threshold %", description: "Filter by percentage of average score" },
  { id: "posts_per_day", name: "Posts Per Day", description: "Target average posts per day" },
];

export const HN_TYPES = [
  { id: "front_page", name: "Front Page" },
  { id: "best", name: "Best" },
  { id: "new", name: "New" },
  { id: "ask", name: "Ask HN" },
  { id: "show", name: "Show HN" },
];

export const GITHUB_PERIODS = [
  { id: "daily", name: "Today" },
  { id: "weekly", name: "This Week" },
  { id: "monthly", name: "This Month" },
];

export const mockPersonas: Persona[] = [
  {
    id: "p1",
    name: "Tech Blog Writer",
    baseModel: "gpt-4-turbo",
    systemPrompt: `You are an expert technical writer specializing in Artificial Intelligence and Machine Learning. Your goal is to explain complex concepts in a clear, concise, and professional manner.

## Core Guidelines
- Use active voice and strong verbs.
- Avoid marketing fluff; focus on technical accuracy.
- Structure content with clear headings (H2, H3) and bullet points.
- Maintain a neutral, objective tone suitable for enterprise documentation.
- When referencing code, ensure syntax correctness.

## Forbidden Content
- Do not use phrases like "In today's fast-paced world".
- Do not use emoji unless explicitly requested.
- Do not make up API endpoints; stick to provided context.`,
    status: "active",
    language: "EN-US",
    category: "Drafts v4.2",
    createdAt: "2024-01-15",
  },
  {
    id: "p2",
    name: "LinkedIn Influencer",
    baseModel: "gpt-4o",
    systemPrompt: "You are a thought leader on LinkedIn, creating engaging posts that spark discussion and provide actionable insights for professionals in marketing and growth.",
    status: "active",
    language: "ES",
    category: "Marketing",
    createdAt: "2024-02-01",
  },
  {
    id: "p3",
    name: "Customer Support Bot",
    baseModel: "gpt-3.5-turbo",
    systemPrompt: "You are a helpful customer support assistant. Answer questions clearly and empathetically. Always offer to escalate if the customer seems frustrated.",
    status: "active",
    language: "FR",
    category: "Support",
    createdAt: "2024-02-10",
  },
  {
    id: "p4",
    name: "Technical Docs",
    baseModel: "claude-3-opus",
    systemPrompt: "You are a technical documentation specialist. Write clear, structured documentation with code examples and proper formatting.",
    status: "active",
    language: "EN-UK",
    category: "Documentation",
    createdAt: "2024-02-20",
  },
];

export const mockFeeds: Feed[] = [
  {
    id: "f1",
    name: "TechCrunch AI",
    sourceUrl: "https://techcrunch.com/category/artificial-intelligence/feed",
    keywords: ["AI", "Machine Learning"],
    personaId: "p1",
    modelId: "gpt-4-turbo",
    frequency: "hourly",
    isActive: true,
    createdAt: "2023-10-24",
    lastRun: "2 mins ago",
    totalArticles: 1240,
  },
  {
    id: "f2",
    name: "The Verge Science",
    sourceUrl: "https://theverge.com/rss/science/index.xml",
    keywords: [],
    personaId: "p4",
    modelId: "claude-3-opus",
    frequency: "daily",
    isActive: true,
    createdAt: "2023-11-01",
    lastRun: "1 hour ago",
    totalArticles: 856,
  },
  {
    id: "f3",
    name: "Wired Business",
    sourceUrl: "https://wired.com/feed/business/rss",
    keywords: ["startups", "funding"],
    personaId: "p2",
    modelId: "gpt-4o",
    frequency: "every_4_hours",
    isActive: true,
    createdAt: "2023-11-15",
    lastRun: "30 mins ago",
    totalArticles: 542,
  },
  {
    id: "f4",
    name: "Ars Technica",
    sourceUrl: "https://arstechnica.com/feed",
    keywords: ["security"],
    personaId: "p1",
    modelId: "gpt-4-turbo",
    frequency: "every_12_hours",
    isActive: false,
    createdAt: "2023-12-01",
    totalArticles: 320,
  },
  {
    id: "f5",
    name: "Engadget",
    sourceUrl: "https://engadget.com/rss.xml",
    keywords: ["gadgets", "reviews"],
    personaId: "p4",
    modelId: "claude-3-sonnet",
    frequency: "daily",
    isActive: true,
    createdAt: "2023-12-10",
    lastRun: "5 hours ago",
    totalArticles: 210,
  },
];

export const mockJobs: Job[] = [
  {
    id: "job-8832",
    sourceType: "rss_feed",
    sourceValue: "TechCrunch AI",
    personaId: "p1",
    modelId: "gpt-4o",
    status: "running",
    resultPostIds: [],
    createdAt: "2024-01-20T10:05:00Z",
    tokenCost: 2100,
  },
  {
    id: "job-8831",
    sourceType: "raw_text",
    sourceValue: "Direct Input",
    personaId: "p2",
    modelId: "claude-3-opus",
    status: "completed",
    resultPostIds: ["post-1"],
    createdAt: "2024-01-20T10:00:01Z",
    completedAt: "2024-01-20T10:05:22Z",
    tokenCost: 4200,
  },
  {
    id: "job-8830",
    sourceType: "rss_feed",
    sourceValue: "TechCrunch AI",
    personaId: "p1",
    modelId: "gpt-4o",
    status: "completed",
    resultPostIds: ["post-2", "post-3"],
    createdAt: "2024-01-20T09:30:00Z",
    completedAt: "2024-01-20T09:35:15Z",
    tokenCost: 6800,
  },
  {
    id: "job-8829",
    sourceType: "youtube",
    sourceValue: "https://youtube.com/watch?v=abc123",
    personaId: "p2",
    modelId: "gpt-3.5-turbo",
    status: "completed",
    resultPostIds: ["post-4"],
    createdAt: "2024-01-20T09:00:00Z",
    completedAt: "2024-01-20T09:08:00Z",
    tokenCost: 3500,
  },
  {
    id: "job-8828",
    sourceType: "raw_text",
    sourceValue: "Direct Input",
    personaId: "p2",
    modelId: "claude-3-sonnet",
    status: "failed",
    errorMessage: "Rate limit exceeded. Please try again in 60 seconds.",
    resultPostIds: [],
    createdAt: "2024-01-20T08:45:00Z",
    tokenCost: 0,
  },
];

export const mockPosts: Post[] = [
  {
    id: "post-1",
    title: "Startups in 2024: A Comprehensive Analysis of Emerging Trends",
    content: `# Startups in 2024: A Comprehensive Analysis

The startup landscape in 2024 continues to evolve rapidly, driven by advances in artificial intelligence, sustainability initiatives, and the continued shift toward remote work.

## Key Trends

### 1. AI Integration
Every startup now incorporates AI in some form. From customer service chatbots to predictive analytics, AI has become table stakes.

### 2. Sustainability Focus
Investors increasingly prioritize companies with clear environmental impact strategies.

### 3. Remote-First Operations
The hybrid model has largely given way to fully remote operations for many tech startups.

## Conclusion
The most successful startups of 2024 will be those that can effectively combine these trends while maintaining operational efficiency.`,
    status: "draft",
    sourceType: "raw_text",
    personaId: "p2",
    modelId: "claude-3-opus",
    createdAt: "2024-01-20T10:05:22Z",
    jobId: "job-8831",
  },
  {
    id: "post-2",
    title: "The Future of Generative AI in 2024",
    content: `# The Future of Generative AI

Generative AI continues to transform how we create content, write code, and interact with technology...`,
    status: "draft",
    sourceType: "url",
    personaId: "p1",
    modelId: "gpt-4o",
    createdAt: "2024-01-19T14:30:00Z",
    jobId: "job-8830",
  },
  {
    id: "post-3",
    title: "Understanding Large Language Models: A Technical Deep Dive",
    content: `# Understanding Large Language Models

This article provides a technical overview of how LLMs work...`,
    status: "published",
    sourceType: "rss_feed",
    personaId: "p1",
    modelId: "gpt-4-turbo",
    createdAt: "2024-01-18T09:00:00Z",
    jobId: "job-8830",
  },
  {
    id: "post-4",
    title: "Quarterly Earnings Report Analysis",
    content: `# Q4 2023 Earnings Analysis

Major tech companies reported strong earnings this quarter...`,
    status: "draft",
    sourceType: "pdf",
    personaId: "p2",
    modelId: "gpt-3.5-turbo",
    createdAt: "2024-01-17T16:20:00Z",
    jobId: "job-8829",
  },
];

export function getPersonaById(id: string): Persona | undefined {
  return mockPersonas.find((p) => p.id === id);
}

export function getModelById(id: string) {
  return MODELS.find((m) => m.id === id);
}
