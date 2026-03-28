import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { isAuthenticated } from './lib/auth';
import Layout from './components/Layout';

// Lazy-loaded pages
const LoginPage = lazy(() => import('./pages/Login'));
const DashboardPage = lazy(() => import('./pages/Dashboard'));
const DspUsersPage = lazy(() => import('./pages/DspUsers'));
const StaffPage = lazy(() => import('./pages/Staff'));
const AreasPage = lazy(() => import('./pages/Areas'));
const RostersPage = lazy(() => import('./pages/Rosters'));
const ReportsPage = lazy(() => import('./pages/Reports'));
const SystemPage = lazy(() => import('./pages/System'));

function ProtectedRoute() {
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  return <Outlet />;
}

const LoadingFallback = () => (
  <div className="flex items-center justify-center h-screen bg-slate-100">
    <div className="flex flex-col items-center gap-3">
      <div className="w-10 h-10 border-4 border-slate-300 border-t-[#1A3A5C] rounded-full animate-spin" />
      <span className="text-slate-500 text-sm font-medium">Loading...</span>
    </div>
  </div>
);

const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to="/dashboard" replace />,
  },
  {
    path: '/login',
    element: (
      <Suspense fallback={<LoadingFallback />}>
        <LoginPage />
      </Suspense>
    ),
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <Layout />,
        children: [
          {
            path: '/dashboard',
            element: (
              <Suspense fallback={<LoadingFallback />}>
                <DashboardPage />
              </Suspense>
            ),
          },
          {
            path: '/dsp-users',
            element: (
              <Suspense fallback={<LoadingFallback />}>
                <DspUsersPage />
              </Suspense>
            ),
          },
          {
            path: '/staff',
            element: (
              <Suspense fallback={<LoadingFallback />}>
                <StaffPage />
              </Suspense>
            ),
          },
          {
            path: '/areas',
            element: (
              <Suspense fallback={<LoadingFallback />}>
                <AreasPage />
              </Suspense>
            ),
          },
          {
            path: '/rosters',
            element: (
              <Suspense fallback={<LoadingFallback />}>
                <RostersPage />
              </Suspense>
            ),
          },
          {
            path: '/reports',
            element: (
              <Suspense fallback={<LoadingFallback />}>
                <ReportsPage />
              </Suspense>
            ),
          },
          {
            path: '/system',
            element: (
              <Suspense fallback={<LoadingFallback />}>
                <SystemPage />
              </Suspense>
            ),
          },
        ],
      },
    ],
  },
]);

export default router;
