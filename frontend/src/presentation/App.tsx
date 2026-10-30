import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { HouseholdProvider } from '../application/use-household';
import { OfflineQueueProvider } from '../application/use-offline-queue';
import { SpaceProvider } from '../application/use-space';
import { RequireAuth } from './auth/RequireAuth';
import { AppShell } from './layout/AppShell';
import { RequireHousehold } from './layout/RequireHousehold';
import { FoyerPage } from './pages/FoyerPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { PlanPage } from './pages/PlanPage';
import { WelcomePage } from './pages/WelcomePage';

function Protected() {
  return (
    <RequireAuth>
      <HouseholdProvider>
        <Outlet />
      </HouseholdProvider>
    </RequireAuth>
  );
}

function HouseholdArea() {
  return (
    <RequireHousehold>
      <SpaceProvider>
        <OfflineQueueProvider>
          <AppShell />
        </OfflineQueueProvider>
      </SpaceProvider>
    </RequireHousehold>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Protected />}>
        <Route path="/bienvenue" element={<WelcomePage />} />
        <Route element={<HouseholdArea />}>
          <Route index element={<HomePage />} />
          <Route path="plan" element={<PlanPage />} />
          <Route path="foyer" element={<FoyerPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
