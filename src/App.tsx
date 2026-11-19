import React, { useCallback, useEffect, useState } from 'react';
import {
  api,
  clearSession,
  getStoredUser,
  getToken,
  saveSession,
  setUnauthorizedHandler,
} from './lib/api';
import type { SessionUser } from './lib/types';
import { CarViewModal } from './components/CarViewModal';
import { Layout, type AppPage } from './components/Layout';
import { ToastProvider } from './components/Toast';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { AnnouncementsPage } from './pages/AnnouncementsPage';
import { CarFormPage } from './pages/CarFormPage';
import { CompanyDetailsPage } from './pages/CompanyDetailsPage';
import { EmployeeDashboardPage } from './pages/EmployeeDashboardPage';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';
import { TermsPage } from './pages/TermsPage';
import { UsersPage } from './pages/UsersPage';

const ADMIN_ONLY_PAGES: AppPage[] = ['admin', 'overview', 'users'];

function readInitialRoute(): { page: AppPage | 'login'; carNo?: string } {
  const params = new URLSearchParams(window.location.search);
  const p = params.get('page') as AppPage | 'login' | null;
  const car = params.get('car') || undefined;
  return { page: p || 'admin', carNo: car };
}

function AppInner() {
  const [user, setUser] = useState<SessionUser | null>(() => (getToken() ? getStoredUser() : null));
  const [company, setCompany] = useState<Record<string, string>>({});
  const [route, setRoute] = useState<{ page: AppPage | 'login'; carNo?: string }>(() =>
    readInitialRoute()
  );
  const [viewCarNo, setViewCarNo] = useState<string | null>(null);

  const navigate = useCallback(
    (page: AppPage, carNo?: string) => {
      const targetUser = getStoredUser();
      let safePage = page;
      if (targetUser && targetUser.role !== 'Admin' && ADMIN_ONLY_PAGES.includes(page)) {
        safePage = 'employee';
      }
      setRoute({ page: safePage, carNo });
      const url = new URL(window.location.href);
      url.searchParams.set('page', safePage);
      if (carNo) url.searchParams.set('car', carNo);
      else url.searchParams.delete('car');
      window.history.pushState({}, '', url.toString());
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    []
  );

  const loadCompany = useCallback((useCache = true) => {
    if (!getToken()) return;
    api
      .getCompanyDetails(useCache)
      .then((c) => {
        if (c) setCompany(c);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setViewCarNo(null);
    });
  }, []);

  useEffect(() => {
    if (user) {
      loadCompany(true);
      // Verify token & refresh user role/departments silently on mount
      api
        .me()
        .then((res) => {
          if (res.ok && res.user) {
            setUser(res.user);
            const t = getToken();
            if (t) saveSession(t, res.user);
          }
        })
        .catch(() => {});
    }
  }, [Boolean(user), loadCompany]);

  useEffect(() => {
    const onPop = () => {
      setRoute(readInitialRoute());
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const handleLoginSuccess = (token: string, loggedInUser: SessionUser) => {
    saveSession(token, loggedInUser);
    setUser(loggedInUser);
    const defaultPage: AppPage = loggedInUser.role === 'Admin' ? 'admin' : 'employee';
    navigate(defaultPage);
  };

  const handleLogout = () => {
    api.logout().catch(() => {});
    clearSession();
    setUser(null);
    setViewCarNo(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('page');
    url.searchParams.delete('car');
    window.history.replaceState({}, '', url.toString());
  };

  if (!user) {
    return <LoginPage company={company} onLoginSuccess={handleLoginSuccess} />;
  }

  let activePage: AppPage =
    route.page === 'login' ? (user.role === 'Admin' ? 'admin' : 'employee') : route.page;
  if (user.role !== 'Admin' && ADMIN_ONLY_PAGES.includes(activePage)) {
    activePage = 'employee';
  }
  if (user.role === 'Admin' && activePage === 'employee') {
    activePage = 'admin';
  }

  const returnHome = () => navigate(user.role === 'Admin' ? 'admin' : 'employee');

  return (
    <Layout
      user={user}
      activePage={activePage}
      company={company}
      onNavigate={navigate}
      onLogout={handleLogout}
    >
      {activePage === 'admin' && (
        <AdminDashboardPage
          onViewCar={(c) => setViewCarNo(c)}
          onEditCar={(c) => navigate('form', c)}
          onNewCar={() => navigate('form')}
        />
      )}
      {activePage === 'employee' && (
        <EmployeeDashboardPage
          onViewCar={(c) => setViewCarNo(c)}
          onEditCar={(c) => navigate('form', c)}
        />
      )}
      {activePage === 'overview' && <OverviewPage />}
      {activePage === 'users' && <UsersPage currentUser={user} />}
      {activePage === 'form' && (
        <CarFormPage
          key={route.carNo || 'new'}
          carNo={route.carNo}
          user={user}
          company={company}
          onDone={returnHome}
        />
      )}
      {activePage === 'announcements' && <AnnouncementsPage user={user} />}
      {activePage === 'company' && (
        <CompanyDetailsPage user={user} onCompanyUpdated={() => loadCompany(false)} />
      )}
      {activePage === 'profile' && <ProfilePage user={user} />}
      {activePage === 'settings' && <SettingsPage user={user} onNavigate={navigate} />}
      {activePage === 'terms' && <TermsPage />}

      <CarViewModal
        carNo={viewCarNo}
        user={user}
        company={company}
        onClose={() => setViewCarNo(null)}
      />
    </Layout>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}
