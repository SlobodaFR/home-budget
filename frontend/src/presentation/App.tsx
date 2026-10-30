import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AccountsProvider } from '../application/use-accounts';
import { HouseholdProvider } from '../application/use-household';
import { OfflineQueueProvider } from '../application/use-offline-queue';
import { SelectedMonthProvider } from '../application/use-selected-month';
import { SpaceProvider } from '../application/use-space';
import { RequireAuth } from './auth/RequireAuth';
import { AppShell } from './layout/AppShell';
import { RequireHousehold } from './layout/RequireHousehold';
import { AidesPage } from './pages/AidesPage';
import { ComptesPage } from './pages/ComptesPage';
import { FoyerPage } from './pages/FoyerPage';
import { HomePage } from './pages/HomePage';
import { ImportPage } from './pages/ImportPage';
import { LoginPage } from './pages/LoginPage';
import { PlanPage } from './pages/PlanPage';
import { PrevisionnelPage } from './pages/PrevisionnelPage';
import { ProjetsPage } from './pages/ProjetsPage';
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
          <AccountsProvider>
            <SelectedMonthProvider>
              <AppShell />
            </SelectedMonthProvider>
          </AccountsProvider>
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
          <Route path="import" element={<ImportPage />} />
          <Route path="plan" element={<PlanPage />} />
          <Route path="previsionnel" element={<PrevisionnelPage />} />
          <Route path="aides" element={<AidesPage />} />
          <Route path="comptes" element={<ComptesPage />} />
          <Route path="projets" element={<ProjetsPage />} />
          <Route path="foyer" element={<FoyerPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
