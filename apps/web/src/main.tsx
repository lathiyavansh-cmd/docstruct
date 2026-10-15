/**
 * What this file does
 *   This is the entry point of the web app. The browser runs this file first, and it mounts the whole React app into the page.
 *
 * How it works
 *   - Loads the IBM Plex fonts and the global stylesheet (index.css).
 *   - Creates one TanStack Query client that caches all server data for every page.
 *   - Wraps <App /> in providers: MotionConfig (animations), QueryClientProvider (data), BrowserRouter (routes), AuthProvider (logged-in user), ToastProvider (popup messages).
 *
 * Where it fits
 *   Loaded by index.html. It renders App.tsx, which holds all the routes. Module: app shell (owner: Vansh).
 */
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-serif/400.css';
import '@fontsource/ibm-plex-serif/600.css';
import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { App } from './App';
import { ToastProvider } from './components/toast';
import { ApiError } from './lib/api';
import { AuthProvider } from './lib/auth';

// One shared cache for all server data. Pages read from it with useQuery.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data counts as fresh for 15 seconds, so moving between pages does not refetch at once.
      staleTime: 15_000,
      // When the user comes back to the tab, data is fetched again so it stays current.
      refetchOnWindowFocus: true,
      // Do not retry permission or not-found answers; they will not change.
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
    },
  },
});

// Find the <div id="root"> in index.html and draw the app inside it.
// The order of providers matters: AuthProvider needs the router, and pages need all of them.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Animations follow the operating system's "reduce motion" setting. */}
    <MotionConfig reducedMotion="user">
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </MotionConfig>
  </StrictMode>,
);
