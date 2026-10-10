import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { Spinner } from './components/ui';
import { useAuth } from './lib/auth';
import { LoginPage } from './pages/auth/LoginPage';
import { ForgotPasswordPage, ResetPasswordPage } from './pages/auth/PasswordPages';
import { SignUpPage } from './pages/auth/SignUpPage';
import { DocumentPage } from './pages/DocumentPage';
import { HelpPage } from './pages/HelpPage';
import { ProfilePage } from './pages/ProfilePage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ActivityPage } from './pages/project/ActivityPage';
import { DashboardPage } from './pages/project/DashboardPage';
import { MembersPage } from './pages/project/MembersPage';
import { ProjectLayout } from './pages/project/ProjectLayout';
import { WorkspacePage } from './pages/project/WorkspacePage';
import { ReviewQueuePage } from './pages/ReviewQueuePage';
import { SearchPage } from './pages/SearchPage';
import { SharedDocumentPage } from './pages/SharedDocumentPage';

/** Account.Login / SE-2: every screen except the auth and share pages needs a session. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner label="Opening DocStruct" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/" replace /> : <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
      <Route path="/signup" element={<GuestOnly><SignUpPage /></GuestOnly>} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/s/:token" element={<SharedDocumentPage />} />
      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<ProjectsPage />} />
        <Route path="reviews" element={<ReviewQueuePage />} />
        <Route path="p/:projectId" element={<ProjectLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="documents" element={<WorkspacePage />} />
          <Route path="members" element={<MembersPage />} />
          <Route path="activity" element={<ActivityPage />} />
        </Route>
        <Route path="d/:documentId" element={<DocumentPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="help" element={<HelpPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="*" element={<div className="p-8 text-ink-soft">This page does not exist.</div>} />
      </Route>
    </Routes>
  );
}
