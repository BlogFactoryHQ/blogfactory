import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import Auth from "@/pages/Auth";
import Dashboard from "@/pages/Dashboard";
import Posts from "@/pages/Posts";
import PostEditorPage from "@/pages/PostEditorPage";
import RSSFeeds from "@/pages/RSSFeeds";
import RSSFeedNew from "@/pages/RSSFeedNew";
import ContentCreator from "@/pages/ContentCreator";
import Jobs from "@/pages/Jobs";
import Personas from "@/pages/Personas";
import Settings from "@/pages/Settings";
import UsageAnalytics from "@/pages/UsageAnalytics";
import ImageGallery from "@/pages/ImageGallery";
import AdminUsers from "@/pages/AdminUsers";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ErrorBoundary>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/posts" element={<Posts />} />
                  <Route path="/posts/:id/edit" element={<PostEditorPage />} />
                  <Route path="/rss-feeds" element={<RSSFeeds />} />
                  <Route path="/rss-feeds/new" element={<RSSFeedNew />} />
                  <Route path="/content-creator" element={<ContentCreator />} />
                  <Route path="/jobs" element={<Jobs />} />
                  <Route path="/personas" element={<Personas />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/usage" element={<ErrorBoundary><UsageAnalytics /></ErrorBoundary>} />
                  <Route path="/gallery" element={<ImageGallery />} />
                  <Route path="/admin/users" element={<AdminUsers />} />
                </Route>
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </ErrorBoundary>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
