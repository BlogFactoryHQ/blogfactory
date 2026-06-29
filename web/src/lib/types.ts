export interface User {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
}

export interface ImageModelConstraints {
  resolutions: ("Web" | "1K" | "2K" | "4K")[];
  aspectRatios: string[];
  maxDimensionPx?: number;
}

export interface Feed {
  id: string;
  user_id: string;
  name: string;
  source_url: string;
  platform: string;
  platform_config: any;
  model_id: string;
  persona_id: string | null;
  frequency: string;
  filter_type: string;
  filter_value: number | null;
  filter_old_posts_days: number | null;
  keywords: string[] | null;
  posts_per_run: number | null;
  is_active: boolean;
  auto_continue: boolean;
  blur_nsfw: boolean;
  include_content: boolean;
  include_summary: boolean;
  include_comments: number | null;
  extract_full_content: boolean;
  last_run_at: string | null;
  total_articles: number | null;
  created_at: string;
  updated_at: string;
}

export interface Persona {
  id: string;
  user_id: string;
  name: string;
  base_model: string;
  system_prompt: string;
  status: string;
  language: string | null;
  category: string | null;
  response_format: string | null;
  response_schema: any;
  tools_config: any;
  parallel_tool_calls: boolean | null;
  tool_choice: string | null;
  plugins_config: any;
  validation_rules: any;
  created_at: string;
  updated_at: string;
}

export interface Post {
  id: string;
  user_id: string;
  title: string;
  content: string;
  summary: string | null;
  status: string;
  source_type: string;
  source_ref_id: string | null;
  source_content_hash: string | null;
  job_id: string | null;
  persona_id: string | null;
  model_id: string;
  cover_image_url: string | null;
  inline_images: string[] | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  personaName?: string | null;
}

export interface Job {
  id: string;
  user_id: string;
  source_type: string;
  source_value: string;
  model_id: string;
  persona_id: string | null;
  status: string;
  current_step: string;
  error_message: string | null;
  generation_error: string | null;
  generation_plan: any;
  result_post_ids: string[] | null;
  summary_result: string | null;
  summary_completed_at: string | null;
  token_cost: number | null;
  total_cost: number | null;
  created_at: string;
  completed_at: string | null;
  // Joined fields
  personaName?: string | null;
}

export interface GenerationLog {
  id: string;
  user_id: string;
  post_id: string | null;
  usage_type: string | null;
  model_id: string | null;
  provider: string | null;
  status: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  cost: number | null;
  latency_ms: number | null;
  trace_id: string | null;
  session_id: string | null;
  raw_trace: any;
  request_data: any;
  response_data: any;
  generation_id?: string | null;
  created_at: string;
}

export interface ImageAsset {
  id: string;
  user_id: string;
  storage_path: string;
  type: string;
  status: string;
  prompt: string | null;
  alt_text: string | null;
  model_id: string | null;
  provider: string | null;
  aspect_ratio: string | null;
  resolution: string | null;
  position: number | null;
  cost: number | null;
  file_size_bytes: number | null;
  source_url?: string | null;
  credit?: string | null;
  license_label?: string | null;
  attribution_url?: string | null;
  source_kind?: string | null;
  job_id: string | null;
  post_id: string | null;
  created_at: string;
  // Joined fields
  postTitle?: string | null;
  postStatus?: string | null;
}

export interface ImageGenerationRequest {
  id: string;
  post_id: string | null;
  job_id: string | null;
  provider: string;
  prompt: string;
  alt_text: string | null;
  model_id: string | null;
  type: string;
  position: number | null;
  aspect_ratio: string | null;
  resolution: string | null;
  status: string;
  retry_count: number | null;
  available_at: string | null;
  source_url?: string | null;
  credit?: string | null;
  license_label?: string | null;
  attribution_url?: string | null;
  imported_asset_id: string | null;
  fallback_policy?: string | null;
  last_error?: string | null;
  completed_via?: string | null;
  created_at: string;
  updated_at: string;
  post_title?: string | null;
}

export interface UserSettings {
  id?: string;
  user_id?: string;
  image_model: string | null;
  inline_image_model?: string | null;
  image_advanced_options?: Record<string, unknown> | null;
  image_style_prompt: string | null;
  image_placement: string | null;
  image_compression_enabled: boolean | null;
  source_image_allowed: boolean | null;
  ai_fallback_enabled: boolean | null;
  max_ai_images_per_day: number | null;
  min_minutes_between_ai_images: number | null;
  cover_enabled: boolean | null;
  cover_image_count: number | null;
  cover_resolution: string | null;
  cover_aspect_ratio: string | null;
  inline_enabled: boolean | null;
  inline_count: number | null;
  inline_resolution: string | null;
  inline_aspect_ratio: string | null;
  monthly_budget: number | null;
  budget_paused: boolean | null;
  budget_alert_threshold: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface SchedulerLog {
  id: string;
  user_id: string;
  feeds_checked: number;
  feeds_triggered: number;
  feeds_skipped: number;
  feeds_errored: number;
  results: any;
  triggered_at: string;
}

export interface DashboardStats {
  totalPosts: number;
  drafts: number;
  published: number;
  totalJobs: number;
  activeFeeds: number;
  monthCost: number;
}
