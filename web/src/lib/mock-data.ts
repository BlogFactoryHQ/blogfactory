export type ModelPricing = "free" | "low" | "medium" | "high";

export interface Model {
  id: string;
  name: string;
  provider: string;
  pricing: ModelPricing;
  costPer1M?: string;
}

export const MODELS: Model[] = [
  { id: "anthropic/claude-opus-4.5", name: "Claude Opus 4.5", provider: "Anthropic", pricing: "high", costPer1M: "$5/$25" },
  { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet", provider: "Anthropic", pricing: "medium", costPer1M: "$3/$15" },
  { id: "anthropic/claude-3-haiku", name: "Claude 3 Haiku", provider: "Anthropic", pricing: "low", costPer1M: "$0.25/$1.25" },
  { id: "openai/gpt-5.2", name: "GPT-5.2", provider: "OpenAI", pricing: "medium", costPer1M: "$1.75/$14" },
  { id: "openai/gpt-5.2-pro", name: "GPT-5.2 Pro", provider: "OpenAI", pricing: "high", costPer1M: "$21/$168" },
  { id: "openai/gpt-5.1", name: "GPT-5.1", provider: "OpenAI", pricing: "medium", costPer1M: "$1.25/$10" },
  { id: "openai/gpt-4o", name: "GPT-4o", provider: "OpenAI", pricing: "medium", costPer1M: "$2.50/$10" },
  { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", provider: "OpenAI", pricing: "low", costPer1M: "$0.15/$0.60" },
  { id: "google/gemini-3-pro-preview", name: "Gemini 3 Pro", provider: "Google", pricing: "medium", costPer1M: "$2/$12" },
  { id: "google/gemini-3-flash-preview", name: "Gemini 3 Flash", provider: "Google", pricing: "low", costPer1M: "$0.50/$3" },
  { id: "google/gemini-pro-1.5", name: "Gemini Pro 1.5", provider: "Google", pricing: "medium", costPer1M: "$1.25/$5" },
  { id: "google/gemini-flash-1.5", name: "Gemini Flash 1.5", provider: "Google", pricing: "low", costPer1M: "$0.075/$0.30" },
  { id: "deepseek/deepseek-v3.2", name: "DeepSeek V3.2", provider: "DeepSeek", pricing: "low", costPer1M: "$0.25/$0.38" },
  { id: "deepseek/deepseek-v3.2-speciale", name: "DeepSeek V3.2 Speciale", provider: "DeepSeek", pricing: "low", costPer1M: "$0.27/$0.41" },
  { id: "x-ai/grok-4.1-fast", name: "Grok 4.1 Fast", provider: "xAI", pricing: "low", costPer1M: "$0.20/$0.50" },
  { id: "meta-llama/llama-3.1-70b-instruct", name: "Llama 3.1 70B", provider: "Meta", pricing: "low", costPer1M: "$0.52/$0.75" },
  { id: "meta-llama/llama-3.1-8b-instruct", name: "Llama 3.1 8B", provider: "Meta", pricing: "low", costPer1M: "$0.06/$0.06" },
  { id: "mistralai/mistral-large-2512", name: "Mistral Large 3", provider: "Mistral", pricing: "low", costPer1M: "$0.50/$1.50" },
  { id: "mistralai/devstral-2512", name: "Devstral 2", provider: "Mistral", pricing: "low", costPer1M: "$0.05/$0.22" },
  { id: "mistralai/mistral-small-creative", name: "Mistral Small Creative", provider: "Mistral", pricing: "low", costPer1M: "$0.10/$0.30" },
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
