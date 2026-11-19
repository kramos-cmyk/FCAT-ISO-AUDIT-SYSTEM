import React, { useCallback, useEffect, useState } from 'react';
import {
  api,
  clearSession,
  getStoredUser,
  getToken,
  isDpoPending,
  markDpoPending,
  saveSession,
  setUnauthorizedHandler,
} from './lib/api';
import { isAuditorRole } from './lib/format';
import { disconnectRealtime } from './lib/realtime';
import type { SessionUser } from './lib/types';
import { CarViewModal } from './components/CarViewModal';
import { DpoNoticeGate } from './components/DpoNoticeGate';
import { Layout, type AppPage } from './components/Layout';
import { ToastProvider } from './components/Toast';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { AnnouncementsPage } from './pages/AnnouncementsPage';
import { CarFormPage } from './pages/CarFormPage';
import { CompanyDetailsPage } from './pages/CompanyDetailsPage';
import { EmployeeDashboardPage } from './pages/EmployeeDashboardPage';
import { HelpDeskPage, type HelpDeskTarget } from './pages/HelpDeskPage';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';
import { TermsPage } from './pages/TermsPage';
import { UsersPage } from './pages/UsersPage';

const AUDITOR_PAGES: AppPage[] = ['admin', 'overview', 'users'];
const SYSTEM_ADMIN_ONLY_PAGES: AppPage[] = ['company'];

function readInitialRoute(): { page: AppPage | 'login'; carNo?: string } {
  const params = new URLSearchParams(window.location.search);
  const p = params.get('page') as AppPage | 'login' | null;
  const car = params.get('car') || undefined;
  return { page: p || 'admin', carNo: car };
}

function AppInner() {
  const [logoutNotice, setLogoutNotice] = useState<string>(() => {
    if (getToken() && isDpoPending()) {
      clearSession();
      return 'Your account was automatically logged out because the Privacy, Security, and Accountability Notice was not confirmed.';
    }
    return '';
  });
  const [user, setUser] = useState<SessionUser | null>(() => (getToken() ? getStoredUser() : null));
  const [dpoConfirmed, setDpoConfirmed] = useState<boolean>(() => Boolean(getToken() && !isDpoPending()));
  const [company, setCompany] = useState<Record<string, string>>({});
  const [route, setRoute] = useState<{ page: AppPage | 'login'; carNo?: string }>(() =>
    readInitialRoute()
  );
  const [viewCarNo, setViewCarNo] = useState<string | null>(null);
  const [helpDeskTarget, setHelpDeskTarget] = useState<HelpDeskTarget | null>(null);

  const navigate = useCallback(
    (page: AppPage, carNo?: string) => {
      const targetUser = getStoredUser();
      let safePage = page;
      if (targetUser && !isAuditorRole(targetUser.role) && (AUDITOR_PAGES.includes(page) || SYSTEM_ADMIN_ONLY_PAGES.includes(page))) {
        safePage = 'employee';
      } else if (targetUser && targetUser.role !== 'Admin' && SYSTEM_ADMIN_ONLY_PAGES.includes(page)) {
        safePage = 'admin';
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
      setDpoConfirmed(false);
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
    markDpoPending(true);
    setLogoutNotice('');
    setDpoConfirmed(false);
    setUser(loggedInUser);
    const defaultPage: AppPage = isAuditorRole(loggedInUser.role) ? 'admin' : 'employee';
    navigate(defaultPage);
  };

  const handleLogout = useCallback((reason?: string) => {
    api.logout().catch(() => {});
    disconnectRealtime();
    clearSession();
    setUser(null);
    setDpoConfirmed(false);
    setViewCarNo(null);
    setHelpDeskTarget(null);
    setLogoutNotice(typeof reason === 'string' ? reason : '');
    const url = new URL(window.location.href);
    url.searchParams.delete('page');
    url.searchParams.delete('car');
    window.history.replaceState({}, '', url.toString());
  }, []);

  const handleDpoConfirm = async () => {
    markDpoPending(false);
    setDpoConfirmed(true);
    await api.confirmDpo().catch(() => {});
  };

  if (!user) {
    return (
      <LoginPage
        company={company}
        notice={logoutNotice}
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  if (!dpoConfirmed) {
    return (
      <DpoNoticeGate
        user={user}
        company={company}
        onConfirm={handleDpoConfirm}
        onDeclineOrTimeout={(reason) => handleLogout(reason)}
      />
    );
  }

  let activePage: AppPage =
    route.page === 'login' ? (isAuditorRole(user.role) ? 'admin' : 'employee') : route.page;
  if (!isAuditorRole(user.role) && (AUDITOR_PAGES.includes(activePage) || SYSTEM_ADMIN_ONLY_PAGES.includes(activePage))) {
    activePage = 'employee';
  }
  if (user.role !== 'Admin' && SYSTEM_ADMIN_ONLY_PAGES.includes(activePage)) {
    activePage = 'admin';
  }
  if (isAuditorRole(user.role) && activePage === 'employee') {
    activePage = 'admin';
  }

  const returnHome = () => navigate(isAuditorRole(user.role) ? 'admin' : 'employee');

  const openHelpDesk = useCallback(
    (tab: 'tickets' | 'dm', id?: string) => {
      setHelpDeskTarget({ tab, id });
      navigate('helpdesk');
    },
    [navigate]
  );

  return (
    <Layout
      user={user}
      activePage={activePage}
      company={company}
      onNavigate={navigate}
      onViewCar={(c) => setViewCarNo(c)}
      onOpenHelpDesk={openHelpDesk}
      onLogout={() => handleLogout()}
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
      {activePage === 'helpdesk' && (
        <HelpDeskPage
          user={user}
          target={helpDeskTarget}
          onViewCar={(c) => setViewCarNo(c)}
        />
      )}
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
