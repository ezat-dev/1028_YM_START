import { BrowserRouter, Routes, Route } from 'react-router-dom';
import menuRoutes from './router/routes';
import MainLayout from './layouts/MainLayout';
import LoginPage from './pages/LoginPage';
import RequireAuth from './components/RequireAuth';
import { AuthProvider } from './context/AuthContext';
import CapabilityMonitor from './pages/quality/CapabilityMonitor';

function renderMenuRoutes(routeList) {
  return routeList.map((route) => {
    const Element = route.element;
    return (
      <Route
        key={route.path ?? 'index'}
        index={route.index}
        path={route.path}
        element={<Element />}
      />
    );
  });
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          {/* CPK·PPK 대형 모니터링 — 사이드바 없는 전체 화면 */}
          <Route
            path="/monitor/:kind"
            element={
              <RequireAuth>
                <CapabilityMonitor />
              </RequireAuth>
            }
          />
          <Route
            path="/"
            element={
              <RequireAuth>
                <MainLayout />
              </RequireAuth>
            }
          >
            {renderMenuRoutes(menuRoutes)}
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
