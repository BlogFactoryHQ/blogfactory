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

const Auth = lazy(() => import("@/pages/Auth"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Posts = lazy(() => import("@/pages/Posts"));
const PostEditorPage = lazy(() => import("@/pages/PostEditorPage"));
const News = lazy(() => import("@/pages/News"));
const RSSFeeds = lazy(() => import("@/pages/RSSFeeds"));
const RSSFeedNew = lazy(() => import("@/pages/RSSFeedNew"));
const ContentCreator = lazy(() => import("@/pages/ContentCreator"));
const Programmatic = lazy(() => import("@/pages/Programmatic"));
const Campaigns = lazy(() => import("@/pages/Campaigns"));
const BatchImport = lazy(() => import("@/pages/BatchImport"));
const Jobs = lazy(() => import("@/pages/Jobs"));
const Personas = lazy(() => import("@/pages/Personas"));
const Settings = lazy(() => import("@/pages/Settings"));
const Integrations = lazy(() => import("@/pages/Integrations"));
const Indexing = lazy(() => import("@/pages/Indexing"));
const Optimize = lazy(() => import("@/pages/Optimize"));
const UsageAnalytics = lazy(() => import("@/pages/UsageAnalytics"));
const ImageGallery = lazy(() => import("@/pages/ImageGallery"));
const AdminUsers = lazy(() => import("@/pages/AdminUsers"));
const Onboarding = lazy(() => import("@/pages/Onboarding"));
const Sites = lazy(() => import("@/pages/Sites"));
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
                    <Route path="/onboarding" element={<Onboarding />} />
                    <Route element={<RequireSites />}>
                      <Route element={<AppLayout />}>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/posts" element={<Posts />} />
                        <Route path="/posts/:id/edit" element={<PostEditorPage />} />
                        <Route path="/news" element={<News />} />
                        <Route path="/rss-feeds" element={<RSSFeeds />} />
                        <Route path="/rss-feeds/new" element={<RSSFeedNew />} />
                        <Route path="/content-creator" element={<ContentCreator />} />
                        <Route path="/programmatic" element={<Programmatic />} />
                        <Route path="/campaigns" element={<Campaigns />} />
                        <Route path="/campaigns/new" element={<Navigate to="/content-creator?mode=campaign" replace />} />
                        <Route path="/campaigns/:id" element={<Campaigns />} />
                        <Route path="/batch-import" element={<BatchImport />} />
                        <Route path="/jobs" element={<Jobs />} />
                        <Route path="/brand-voice" element={<Personas />} />
                        <Route path="/personas" element={<Personas />} />
                        <Route path="/settings" element={<Settings />} />
                        <Route path="/sites" element={<Sites />} />
                        <Route path="/integrations" element={<Integrations />} />
                        <Route path="/indexing" element={<Indexing />} />
                        <Route path="/optimize" element={<Optimize />} />
                        <Route path="/usage" element={<ErrorBoundary><UsageAnalytics /></ErrorBoundary>} />
                        <Route path="/gallery" element={<ImageGallery />} />
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
