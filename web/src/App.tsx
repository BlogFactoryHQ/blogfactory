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
import Auth from "@/pages/Auth";
import Dashboard from "@/pages/Dashboard";
import Posts from "@/pages/Posts";
import PostEditorPage from "@/pages/PostEditorPage";
import RSSFeeds from "@/pages/RSSFeeds";
import RSSFeedNew from "@/pages/RSSFeedNew";
import ContentCreator from "@/pages/ContentCreator";
import Campaigns from "@/pages/Campaigns";
import BatchImport from "@/pages/BatchImport";
import Jobs from "@/pages/Jobs";
import Personas from "@/pages/Personas";
import Settings from "@/pages/Settings";
import Integrations from "@/pages/Integrations";
import Indexing from "@/pages/Indexing";
import UsageAnalytics from "@/pages/UsageAnalytics";
import ImageGallery from "@/pages/ImageGallery";
import AdminUsers from "@/pages/AdminUsers";
import Onboarding from "@/pages/Onboarding";
import Sites from "@/pages/Sites";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <SiteProvider>
        <TooltipProvider>
          <Sonner />
          <BrowserRouter>
            <ErrorBoundary>
              <Routes>
                <Route path="/auth" element={<Auth />} />
                <Route element={<ProtectedRoute />}>
                  <Route path="/onboarding" element={<Onboarding />} />
                  <Route element={<RequireSites />}>
                    <Route element={<AppLayout />}>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/posts" element={<Posts />} />
                      <Route path="/posts/:id/edit" element={<PostEditorPage />} />
                      <Route path="/rss-feeds" element={<RSSFeeds />} />
                      <Route path="/rss-feeds/new" element={<RSSFeedNew />} />
                      <Route path="/content-creator" element={<ContentCreator />} />
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
                      <Route path="/usage" element={<ErrorBoundary><UsageAnalytics /></ErrorBoundary>} />
                      <Route path="/gallery" element={<ImageGallery />} />
                      <Route path="/admin/users" element={<AdminUsers />} />
                    </Route>
                  </Route>
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </ErrorBoundary>
          </BrowserRouter>
        </TooltipProvider>
      </SiteProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
