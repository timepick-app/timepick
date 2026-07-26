import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryProvider } from './providers';
import { AuthProvider } from './hooks/useAuth';
import { NavigationBlockerProvider } from './contexts/NavigationBlockerContext';
import { Toaster } from 'sonner';
import Login from './pages/Login';
import EmergencyLogin from './pages/EmergencyLogin';
import { RootRedirect } from './components/RootRedirect';
import Admin from './pages/Admin';
import EventsListPage from './pages/admin/EventsListPage';
import { EventEditPage } from './pages/admin/EventEditPage';
import Users from './pages/Users';
import Settings from './pages/Settings';
import Profile from './pages/Profile';
import { PublicCalendar } from './pages/PublicCalendar';
import { SetupWizard } from './pages/SetupWizard';
import { SetupGuard } from './components/SetupGuard';
import { SetupRedirect } from './components/SetupRedirect';
import { AdminGuard } from './components/AdminGuard';
import { MemberLayout } from './components/layout/MemberLayout';
import { MemberAgendaPage } from './pages/member/MemberAgendaPage';
import { MemberEventPage } from './pages/member/MemberEventPage';
import { ProfileContent } from './components/profile/ProfileContent';
import { DesignSystemLayout } from './pages/design-system/DesignSystemLayout';
import { FoundationsView } from './pages/design-system/FoundationsView';
import { FormsView } from './pages/design-system/FormsView';
import { SurfacesView } from './pages/design-system/SurfacesView';
import { NavigationView } from './pages/design-system/NavigationView';
import { FeedbackView } from './pages/design-system/FeedbackView';
import { DataView } from './pages/design-system/DataView';
import { ChartsView } from './pages/design-system/ChartsView';
import { PrototypesView } from './pages/design-system/PrototypesView';
import { ListDirectionsView } from './pages/design-system/ListDirectionsView';
import { ErrorBoundary } from './components/ErrorBoundary';

function App() {
  return (
    <QueryProvider>
      <NavigationBlockerProvider>
        <BrowserRouter>
          <ErrorBoundary>
            <AuthProvider>
            <SetupRedirect />
            <Routes>
              {/* Setup Wizard - accessible seulement si needsSetup est true */}
              <Route path="/setup" element={
                <SetupGuard><SetupWizard /></SetupGuard>
              } />

              {/* Routes d'authentification */}
              <Route path="/login" element={<Login />} />
              <Route path="/emergency-login" element={<EmergencyLogin />} />

              {/* Racine : aiguilleur par rôle — cf. docs/2026-07-26-note-page-racine-identite-organisation.md */}
              <Route path="/" element={<RootRedirect />} />
              {/* Routes admin — guard de route (D9 story 1.4) : AdminGuard est un
                  layout-route pur (Outlet/redirect) au-dessus des pages admin.
                  Les pages restent wrappées individuellement par AdminLayout. */}
              <Route element={<AdminGuard />}>
                <Route path="/admin" element={<Admin />} />
                <Route path="/admin/dashboard" element={<Admin />} />
                <Route path="/admin/events" element={<EventsListPage />} />
                <Route path="/admin/events/:id/edit" element={<EventEditPage />} />
                <Route path="/admin/users" element={<Users />} />
                <Route path="/admin/settings" element={<Settings />} />
                <Route path="/admin/profile" element={<Profile />} />
              </Route>

              {/* Espace membre connecté (Story 1.3) */}
              <Route path="/me" element={<MemberLayout />}>
                <Route index element={<MemberAgendaPage />} />
                <Route path="events/:uuid" element={<MemberEventPage />} />
                <Route path="profile" element={<ProfileContent />} />
              </Route>
              <Route path="/events/:uuid" element={<PublicCalendar />} />

              {/* Legacy redirect for old magic links with /event/ (singular) */}
              <Route path="/event/:uuid" element={<PublicCalendar />} />

              {/* Design System — dev-only. import.meta.env.DEV folds to false in
                  prod builds, so Vite drops these routes and tree-shakes the page
                  modules (side-effect-free) out of the bundle. */}
              {import.meta.env.DEV && (
                <Route path="/design-system" element={<DesignSystemLayout />}>
                  <Route index element={<Navigate to="foundations" replace />} />
                  <Route path="foundations" element={<FoundationsView />} />
                  <Route path="forms" element={<FormsView />} />
                  <Route path="surfaces" element={<SurfacesView />} />
                  <Route path="navigation" element={<NavigationView />} />
                  <Route path="feedback" element={<FeedbackView />} />
                  <Route path="data" element={<DataView />} />
                  <Route path="charts" element={<ChartsView />} />
                  <Route path="prototypes" element={<PrototypesView />} />
                  <Route path="list-directions" element={<ListDirectionsView />} />
                </Route>
              )}
            </Routes>
            </AuthProvider>
          </ErrorBoundary>
        </BrowserRouter>
        <Toaster position="bottom-right" richColors theme="light" closeButton />
      </NavigationBlockerProvider>
    </QueryProvider>
  );
}

export default App;
