import { Route, Routes } from 'react-router-dom';
import { Header } from './components/Header';
import { DashboardPage } from './pages/DashboardPage';
import { ForecastPage } from './pages/ForecastPage';
import { LoginPage } from './pages/LoginPage';
import { RequireAuth } from './auth/RequireAuth';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <div className="font-body-md text-ink">
              <Header />
              <DashboardPage />
            </div>
          </RequireAuth>
        }
      />
      <Route
        path="/forecast"
        element={
          <RequireAuth>
            <div className="font-body-md text-ink">
              <Header />
              <ForecastPage />
            </div>
          </RequireAuth>
        }
      />
    </Routes>
  );
}
