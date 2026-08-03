import { useEffect } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { Router, Route, Switch } from 'wouter-preact';
import { authFailed, redirectToLogin } from './api/client';
import { loadSession, sessionLoading, sessionLoaded, sessionError, isAuthenticated } from './store/session';
import { AppShell } from './components/AppShell';
import { KeyboardShortcuts } from './components/KeyboardShortcuts';
import { Spinner, ErrorBanner, ToastHost } from './ui';
import { Dashboard } from './pages/Dashboard';
import { ContactsList } from './pages/contacts/ContactsList';
import { ContactProfileView } from './pages/contacts/ContactProfileView';
import { ContactForm } from './pages/contacts/ContactForm';
import { ContactDuplicates } from './pages/contacts/ContactDuplicates';
import { TagPage } from './pages/tags/TagPage';
import { SearchPage } from './pages/Search';
import { Settings } from './pages/Settings';
import { DataExport } from './pages/DataExport';
import { ImportPage } from './pages/ImportPage';
import { EntityDetail } from './pages/EntityDetail';
import { EntityOverview } from './pages/EntityOverview';
import { NewNotePage, NewActivityPage, NewReminderPage, NewTaskPage, NewGiftPage, NewDebtPage } from './pages/quickCreate';
import { NotFound } from './pages/NotFound';

/**
 * Auth guard: loads the session on mount; while loading shows a spinner; on
 * 401/auth-failure redirects to the server login page (preserving the /app path).
 */
function AuthGuard({ children }: { children: ComponentChildren }) {
  useEffect(() => {
    void loadSession();
  }, []);

  // React to any auth failure surfaced by the API client.
  useEffect(() => {
    if (authFailed.value) redirectToLogin();
  }, [authFailed.value]);

  if (!sessionLoaded.value || sessionLoading.value) {
    return <Spinner size="lg" center />;
  }

  if (authFailed.value || !isAuthenticated.value) {
    // A redirect is in flight; render nothing meaningful meanwhile.
    if (sessionError.value) {
      return <div class="main"><ErrorBanner message={sessionError.value.message} /></div>;
    }
    return <Spinner size="lg" center />;
  }

  return <>{children}</>;
}

export function App() {
  return (
    <Router base="/app">
      <AuthGuard>
        <AppShell>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/contacts" component={ContactsList} />
            <Route path="/contacts/new">{() => <ContactForm />}</Route>
            <Route path="/contacts/duplicates" component={ContactDuplicates} />
            <Route path="/contacts/:id/edit">{(p) => <ContactForm id={p.id} />}</Route>
            <Route path="/contacts/:id">{(p) => <ContactProfileView id={p.id} />}</Route>
            <Route path="/search" component={SearchPage} />
            <Route path="/tags/:name">{(p) => <TagPage name={p.name} />}</Route>
            <Route path="/import" component={ImportPage} />
            <Route path="/data" component={DataExport} />
            <Route path="/settings" component={Settings} />
            {/* "+ New" pages — registered BEFORE the /:id routes so /notes/new
                etc. match the focused-creation page, not the detail view. */}
            <Route path="/notes/new" component={NewNotePage} />
            <Route path="/activities/new" component={NewActivityPage} />
            <Route path="/reminders/new" component={NewReminderPage} />
            <Route path="/tasks/new" component={NewTaskPage} />
            <Route path="/gifts/new" component={NewGiftPage} />
            <Route path="/debts/new" component={NewDebtPage} />
            {/* Overview pages — registered BEFORE /:id detail routes so base
                resource paths render lists while /:id still renders details. */}
            <Route path="/activities">{() => <EntityOverview resource="activities" />}</Route>
            <Route path="/notes">{() => <EntityOverview resource="notes" />}</Route>
            <Route path="/reminders">{() => <EntityOverview resource="reminders" />}</Route>
            <Route path="/tasks">{() => <EntityOverview resource="tasks" />}</Route>
            <Route path="/debts">{() => <EntityOverview resource="debts" />}</Route>
            <Route path="/gifts">{() => <EntityOverview resource="gifts" />}</Route>
            <Route path="/activities/:id">{(p) => <EntityDetail resource="activities" label="Activity" id={p.id} />}</Route>
            <Route path="/reminders/:id">{(p) => <EntityDetail resource="reminders" label="Reminder" id={p.id} />}</Route>
            <Route path="/gifts/:id">{(p) => <EntityDetail resource="gifts" label="Gift" id={p.id} />}</Route>
            <Route path="/debts/:id">{(p) => <EntityDetail resource="debts" label="Debt" id={p.id} />}</Route>
            <Route path="/tasks/:id">{(p) => <EntityDetail resource="tasks" label="Task" id={p.id} />}</Route>
            <Route path="/life-events/:id">{(p) => <EntityDetail resource="life-events" label="Life Event" id={p.id} />}</Route>
            <Route path="/notes/:id">{(p) => <EntityDetail resource="notes" label="Note" id={p.id} />}</Route>
            <Route component={NotFound} />
          </Switch>
        </AppShell>
        <ToastHost />
        <KeyboardShortcuts />
      </AuthGuard>
    </Router>
  );
}
