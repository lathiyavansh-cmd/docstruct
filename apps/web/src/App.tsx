/**
 * What this file does
 *   This is the route table of the app. It decides which page to show for each URL, and blocks pages that need a login.
 *
 * How it works
 *   - RequireAuth checks useAuth(). If nobody is logged in, "/" shows the overview page (LandingPage); any other
 *     page sends the user to /login and remembers where they wanted to go.
 *   - GuestOnly does the opposite: a logged-in user who opens /login or /signup is sent to the home page.
 *   - Logged-in pages sit inside AppLayout (the sidebar and top bar). Project pages also sit inside ProjectLayout (the project tabs).
 *   - The share link page (/s/:token) and the password pages are public, so they are outside RequireAuth.
 *
 * Where it fits
 *   Rendered by main.tsx. Every page component in src/pages is connected here. Module: app shell (owner: Vansh).
 */
import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { Spinner } from './components/ui';
import { useAuth } from './lib/auth';
import { LoginPage } from './pages/auth/LoginPage';
import { ForgotPasswordPage, ResetPasswordPage } from './pages/auth/PasswordPages';
import { SignUpPage } from './pages/auth/SignUpPage';
import { LandingPage } from './pages/landing/LandingPage';
import { ComparePage } from './pages/ComparePage';
import { DocumentPage } from './pages/DocumentPage';
import { HelpPage } from './pages/HelpPage';
import { ProfilePage } from './pages/ProfilePage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ActivityPage } from './pages/project/ActivityPage';
import { DashboardPage } from './pages/project/DashboardPage';
import { MembersPage } from './pages/project/MembersPage';
import { ProjectLayout } from './pages/project/ProjectLayout';
import { TemplatesPage } from './pages/project/TemplatesPage';
import { WorkspacePage } from './pages/project/WorkspacePage';
import { RemindersPage } from './pages/RemindersPage';
import { ReviewQueuePage } from './pages/ReviewQueuePage';
import { SharedWithMePage } from './pages/SharedWithMePage';
import { SearchPage } from './pages/SearchPage';
import { SharedDocumentPage } from './pages/SharedDocumentPage';

/** Account.Login / SE-2: every screen except the auth and share pages needs a session. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  // While the saved session is still being checked, show a spinner instead of a page.
  if (loading) return <Spinner label="Opening DocStruct" />;
  // Not logged in: the home address shows the overview page with its log-in and sign-up buttons.
  if (!user && location.pathname === '/') return <LandingPage />;
  // Any other page goes to /login, passing the current URL so login can bring the user back here.
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

/** Only for logged-out visitors: a logged-in user who opens /login or /signup goes to the home page. */
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
      {/* Public page: anyone with a share link can open it, no login needed. */}
      <Route path="/s/:token" element={<SharedDocumentPage />} />
      {/* Everything below needs a login and is drawn inside AppLayout (sidebar and top bar). */}
      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<ProjectsPage />} />
        {/* Project pages share ProjectLayout, which loads the project and shows its tabs. */}
        <Route path="reviews" element={<ReviewQueuePage />} />
        <Route path="reminders" element={<RemindersPage />} />
        <Route path="shared" element={<SharedWithMePage />} />
        <Route path="p/:projectId" element={<ProjectLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="documents" element={<WorkspacePage />} />
          <Route path="members" element={<MembersPage />} />
          <Route path="activity" element={<ActivityPage />} />
          <Route path="templates" element={<TemplatesPage />} />
        </Route>
        <Route path="d/:documentId" element={<DocumentPage />} />
        <Route path="d/:documentId/compare" element={<ComparePage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="help" element={<HelpPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="*" element={<div className="p-8 text-ink-soft">This page does not exist.</div>} />
      </Route>
    </Routes>
  );
}
