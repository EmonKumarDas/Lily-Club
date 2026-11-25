import React, { useState } from 'react';
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
import { LoadingSkeleton } from './components/LoadingSkeleton.js';
import type { BookingFormInitialData } from './components/BookingWizardModal.js';

export const App: React.FC = () => {
  const { user, activeRoom, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [showRoomChoice, setShowRoomChoice] = useState(false);

  const [pendingWizardData, setPendingWizardData] = useState<BookingFormInitialData | null>(null);
  const [pendingDetailBookingId, setPendingDetailBookingId] = useState<string | null>(null);
  const [pendingBookingsFilter, setPendingBookingsFilter] = useState<BookingsExternalFilter | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#FDFBF9] dark:bg-[#151216]">
        <div className="max-w-md w-full p-8 rounded-3xl bg-white dark:bg-[#1E1920] border border-stone-200 dark:border-stone-800 shadow-xl space-y-4">
          <LoadingSkeleton rows={4} />
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  if (!activeRoom || showRoomChoice) {
    return (
      <div className="min-h-screen flex flex-col bg-[#FDFBF9] dark:bg-[#151216]">
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
    <div className="min-h-screen flex flex-col bg-[#FDFBF9] dark:bg-[#151216] transition-colors">
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
