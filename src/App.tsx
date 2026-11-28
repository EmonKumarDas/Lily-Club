import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, LogIn } from 'lucide-react';
import { useAuth } from './context/AuthContext.js';
import { Navbar } from './components/Navbar.js';
import { Sidebar, type ActiveTab } from './components/Sidebar.js';
import { MobileNav } from './components/MobileNav.js';
import { LoginPage } from './pages/LoginPage.js';
import { RoomChoicePage } from './pages/RoomChoicePage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { MembersSettingsPage } from './pages/MembersSettingsPage.js';
import { AuditLogPage } from './pages/AuditLogPage.js';
import { HallsPage } from './pages/HallsPage.js';
import { CustomersPage } from './pages/CustomersPage.js';
import { BookingsPage, type BookingsExternalFilter } from './pages/BookingsPage.js';
import { CalendarPage } from './pages/CalendarPage.js';
import { ExpensesPage } from './pages/ExpensesPage.js';
import { ReportsPage } from './pages/ReportsPage.js';
import { FullScreenLoader } from './components/Loader.js';
import { UpdateNotificationManager } from './components/UpdateNotificationManager.js';
import type { BookingFormInitialData } from './components/BookingWizardModal.js';

const TAB_TO_PATH: Record<ActiveTab, string> = {
  overview: '/',
  bookings: '/bookings',
  calendar: '/calendar',
  halls: '/halls',
  customers: '/customers',
  payments: '/costs',
  reports: '/reports',
  members_settings: '/settings',
  audit_log: '/audit-log',
};

function resolveTabFromPath(pathname: string): ActiveTab {
  const clean = pathname.replace(/\/+$/, '') || '/';
  for (const [tab, p] of Object.entries(TAB_TO_PATH) as Array<[ActiveTab, string]>) {
    if (p === clean) return tab;
  }
  if (clean === '/expenses' || clean === '/payments') return 'payments';
  if (clean === '/members') return 'members_settings';
  return 'overview';
}

export const App: React.FC = () => {
  const {
    user,
    activeRoom,
    activeMember,
    roomSwitchEpoch,
    sessionExpiredBanner,
    clearSessionExpiredBanner,
    refreshAuth,
    language,
    loading,
  } = useAuth();

  const [activeTab, setActiveTabState] = useState<ActiveTab>(() =>
    typeof window !== 'undefined' ? resolveTabFromPath(window.location.pathname) : 'overview'
  );
  const [showRoomChoice, setShowRoomChoice] = useState(false);

  const [pendingWizardData, setPendingWizardData] = useState<BookingFormInitialData | null>(null);
  const [pendingDetailBookingId, setPendingDetailBookingId] = useState<string | null>(null);
  const [pendingBookingsFilter, setPendingBookingsFilter] = useState<BookingsExternalFilter | null>(null);

  const isTabAllowedForRole = useCallback(
    (tab: ActiveTab): boolean => {
      const role = activeMember?.role;
      if (!role) return false;
      if (tab === 'audit_log') return role === 'OWNER';
      if (tab === 'payments' || tab === 'reports' || tab === 'members_settings') {
        return role === 'OWNER' || role === 'MANAGER';
      }
      return true;
    },
    [activeMember?.role]
  );

  const setActiveTab = useCallback(
    (next: ActiveTab) => {
      const safeTab = isTabAllowedForRole(next) ? next : 'overview';
      setActiveTabState(safeTab);
      if (typeof window !== 'undefined') {
        const targetPath = TAB_TO_PATH[safeTab] || '/';
        if (window.location.pathname !== targetPath) {
          window.history.pushState({}, '', targetPath);
        }
      }
    },
    [isTabAllowedForRole]
  );

  // Enforce deep-link & browser Back/Forward guards (Section 1 #13 & Section 9)
  useEffect(() => {
    const onPopState = () => {
      if (!user || !activeRoom) return;
      const requested = resolveTabFromPath(window.location.pathname);
      if (!isTabAllowedForRole(requested)) {
        window.history.replaceState({}, '', '/');
        setActiveTabState('overview');
      } else {
        setActiveTabState(requested);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [user, activeRoom, isTabAllowedForRole]);

  // Redirect disallowed deep links on role change or initial mount
  useEffect(() => {
    if (loading) return;
    if (!user) {
      if (window.location.pathname !== '/login') {
        window.history.replaceState({}, '', '/login');
      }
      return;
    }
    if (!activeRoom || showRoomChoice) {
      if (window.location.pathname !== '/welcome') {
        window.history.replaceState({}, '', '/welcome');
      }
      return;
    }
    if (!isTabAllowedForRole(activeTab)) {
      setActiveTab('overview');
    } else if (window.location.pathname === '/login' || window.location.pathname === '/welcome') {
      window.history.replaceState({}, '', TAB_TO_PATH[activeTab] || '/');
    }
  }, [loading, user, activeRoom, showRoomChoice, activeTab, isTabAllowedForRole, setActiveTab]);

  // Section 1 #1 & Section 3: Full-screen spinner while auth & membership state is checked — zero screen flash!
  if (loading) {
    return (
      <>
        <UpdateNotificationManager language={language} />
        <FullScreenLoader language={language} onRetry={refreshAuth} />
      </>
    );
  }

  if (!user) {
    return (
      <>
        <UpdateNotificationManager language={language} />
        <LoginPage />
      </>
    );
  }

  if (!activeRoom || showRoomChoice) {
    return (
      <div className="min-h-screen flex flex-col bg-[#FDFBF9] dark:bg-[#141115] transition-colors">
        <UpdateNotificationManager language={language} />
        <Navbar onNavigateToRooms={() => setShowRoomChoice(true)} />
        <main className="flex-1 p-4 sm:p-6">
          <RoomChoicePage
            onRoomSelected={() => {
              setShowRoomChoice(false);
              setActiveTab('overview');
            }}
          />
        </main>
      </div>
    );
  }

  return (
    <div
      key={`${activeRoom.id}:${roomSwitchEpoch}`}
      className="min-h-screen flex flex-col bg-[#FDFBF9] dark:bg-[#141115] transition-colors"
    >
      <UpdateNotificationManager language={language} />

      {/* Session Expiry Draft-Preserving Banner (Section 9) */}
      {sessionExpiredBanner && (
        <div
          role="alert"
          className="bg-amber-500 text-stone-950 px-4 py-2.5 text-xs font-bold flex items-center justify-center gap-3 z-50"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            {language === 'bn'
              ? 'আপনার সেশনের মেয়াদ শেষ হয়েছে। আপনার ফর্মের তথ্য অক্ষুণ্ণ রাখা হয়েছে — অনুগ্রহ করে পুনরায় সাইন-ইন করুন।'
              : 'Your session expired. Your open form draft has been kept — please sign in again to save.'}
          </span>
          <button
            type="button"
            onClick={() => {
              clearSessionExpiredBanner();
              window.location.href = '/login';
            }}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-stone-950 text-white text-xs font-bold cursor-pointer"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>{language === 'bn' ? 'সাইন-ইন' : 'Sign In'}</span>
          </button>
        </div>
      )}

      <Navbar
        onNavigateToRooms={() => setShowRoomChoice(true)}
        onOpenBookingFromNotif={(bookingId) => {
          setPendingDetailBookingId(bookingId);
          setActiveTab('bookings');
        }}
      />

      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        <Sidebar activeTab={activeTab} onSelectTab={setActiveTab} />

        <main className="flex-1 min-w-0 pb-24 md:pb-8">
          {activeTab === 'overview' && (
            <DashboardPage
              onNavigateTab={setActiveTab}
              onOpenNewBooking={(prefill) => {
                setPendingWizardData(prefill || {});
                setActiveTab('bookings');
              }}
              onOpenBookingDetail={(bookingId) => {
                setPendingDetailBookingId(bookingId);
                setActiveTab('bookings');
              }}
              onNavigateBookingsFilter={(filter) => {
                setPendingBookingsFilter(filter);
                setActiveTab('bookings');
              }}
            />
          )}
          {activeTab === 'bookings' && (
            <BookingsPage
              externalWizardData={pendingWizardData}
              onClearExternalWizard={() => setPendingWizardData(null)}
              externalDetailBookingId={pendingDetailBookingId}
              onClearExternalDetail={() => setPendingDetailBookingId(null)}
              externalFilter={pendingBookingsFilter}
              onClearExternalFilter={() => setPendingBookingsFilter(null)}
            />
          )}
          {activeTab === 'calendar' && (
            <CalendarPage
              onStartBookingFromSlot={(prefill) => {
                setPendingWizardData(prefill);
                setActiveTab('bookings');
              }}
              onOpenBookingDetail={(bookingId) => {
                setPendingDetailBookingId(bookingId);
                setActiveTab('bookings');
              }}
            />
          )}
          {activeTab === 'halls' && <HallsPage />}
          {activeTab === 'customers' && (
            <CustomersPage
              onOpenBookingDetail={(bookingId) => {
                setPendingDetailBookingId(bookingId);
                setActiveTab('bookings');
              }}
            />
          )}
          {activeTab === 'payments' && <ExpensesPage />}
          {activeTab === 'reports' && (
            <ReportsPage
              onOpenBookingDetail={(bookingId) => {
                setPendingDetailBookingId(bookingId);
                setActiveTab('bookings');
              }}
            />
          )}
          {activeTab === 'members_settings' && <MembersSettingsPage />}
          {activeTab === 'audit_log' && <AuditLogPage />}
        </main>
      </div>

      <MobileNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenRooms={() => setShowRoomChoice(true)}
        onNewBooking={() => {
          setPendingWizardData({});
          setActiveTab('bookings');
        }}
      />
    </div>
  );
};
