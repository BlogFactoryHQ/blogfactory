import { Suspense, lazy } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { SiteProvider } from "@/hooks/useSites";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { RequireSites } from "@/components/layout/RequireSites";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { SectionTabs } from "@/components/layout/SectionTabs";

const Auth = lazy(() => import("@/pages/Auth"));
const Overview = lazy(() => import("@/pages/Overview"));
const ReviewQueue = lazy(() => import("@/pages/ReviewQueue"));
const Posts = lazy(() => import("@/pages/Posts"));
const PostEditorPage = lazy(() => import("@/pages/PostEditorPage"));
const PostPreviewPage = lazy(() => import("@/pages/PostPreviewPage"));
const RSSFeeds = lazy(() => import("@/pages/RSSFeeds"));
const RSSFeedNew = lazy(() => import("@/pages/RSSFeedNew"));
const ContentCreator = lazy(() => import("@/pages/ContentCreator"));
const Campaigns = lazy(() => import("@/pages/Campaigns"));
const BatchImport = lazy(() => import("@/pages/BatchImport"));
const Jobs = lazy(() => import("@/pages/Jobs"));
const Personas = lazy(() => import("@/pages/Personas"));
const Settings = lazy(() => import("@/pages/Settings"));
const ControlConnections = lazy(() => import("@/pages/ControlConnections"));
const Integrations = lazy(() => import("@/pages/Integrations"));
const SearchGrowth = lazy(() => import("@/pages/SearchGrowth"));
const UsageAnalytics = lazy(() => import("@/pages/UsageAnalytics"));
const ImageGallery = lazy(() => import("@/pages/ImageGallery"));
const AdminUsers = lazy(() => import("@/pages/AdminUsers"));
const Onboarding = lazy(() => import("@/pages/Onboarding"));
const Sites = lazy(() => import("@/pages/Sites"));
const McpOAuthLogin = lazy(() => import("@/pages/McpOAuthLogin"));
const NotFound = lazy(() => import("@/pages/NotFound"));

const queryClient = new QueryClient();

const PageFallback = () => <div className="min-h-screen bg-background" />;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <SiteProvider>
        <TooltipProvider>
          <Sonner />
          <BrowserRouter>
            <ErrorBoundary>
              <Suspense fallback={<PageFallback />}>
                <Routes>
                  <Route path="/auth" element={<Auth />} />
                  <Route element={<ProtectedRoute />}>
                    <Route path="/mcp/oauth" element={<McpOAuthLogin />} />
                    <Route path="/onboarding" element={<Onboarding />} />
                    <Route element={<RequireSites />}>
                      <Route path="/library/posts/:id/preview" element={<PostPreviewPage />} />
                      <Route element={<AppLayout />}>
                        <Route path="/" element={<Overview />} />
                        <Route path="/review" element={<ReviewQueue />} />
                        <Route path="/runs" element={<Jobs />} />
                        <Route path="/create" element={<ContentCreator />} />
                        <Route path="/overview/growth" element={<SearchGrowth />} />
                        <Route path="/library/posts/:id/edit" element={<PostEditorPage />} />
                        <Route path="/sources" element={<SectionTabs label="Sources" items={[
                          { label: "RSS", to: "/sources/rss" }, { label: "Campaigns", to: "/sources/campaigns" }, { label: "Batch Import", to: "/sources/batch-import" },
                        ]} />}>
                          <Route index element={<Navigate to="/sources/rss" replace />} />
                          <Route path="rss" element={<RSSFeeds />} />
                          <Route path="rss/new" element={<RSSFeedNew />} />
                          <Route path="campaigns" element={<Campaigns />} />
                          <Route path="campaigns/:id" element={<Campaigns />} />
                          <Route path="batch-import" element={<BatchImport />} />
                        </Route>
                        <Route path="/library" element={<SectionTabs label="Content" items={[{ label: "Content", to: "/library/content" }, { label: "Image Gallery", to: "/library/images" }]} />}>
                          <Route index element={<Navigate to="/library/content" replace />} />
                          <Route path="content" element={<Posts />} />
                          <Route path="images" element={<ImageGallery />} />
                        </Route>
                        <Route path="/control" element={<SectionTabs label="Control" items={[
                          { label: "MCP Connections", to: "/control/connections" }, { label: "Integrations", to: "/control/integrations" }, { label: "Sites", to: "/control/sites" }, { label: "Brand Voice", to: "/control/brand-voice" }, { label: "Article Settings", to: "/control/article-settings" }, { label: "Usage", to: "/control/usage" },
                        ]} />}>
                          <Route index element={<Navigate to="/control/connections" replace />} />
                          <Route path="connections" element={<ControlConnections />} />
                          <Route path="integrations" element={<Integrations />} />
                          <Route path="sites" element={<Sites />} />
                          <Route path="brand-voice" element={<Personas />} />
                          <Route path="article-settings" element={<Settings />} />
                          <Route path="usage" element={<ErrorBoundary><UsageAnalytics /></ErrorBoundary>} />
                        </Route>
                        <Route path="/admin/users" element={<AdminUsers />} />
                      </Route>
                    </Route>
                  </Route>
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </ErrorBoundary>
          </BrowserRouter>
        </TooltipProvider>
      </SiteProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
