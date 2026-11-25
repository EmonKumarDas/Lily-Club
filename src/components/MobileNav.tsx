import React, { useState } from 'react';
import {
  LayoutDashboard,
  CalendarDays,
  CalendarRange,
  Building2,
  Users,
  CreditCard,
  BarChart3,
  Users2,
  FileCheck2,
  MoreHorizontal,
  Plus,
  X,
  ArrowLeftRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import type { ActiveTab } from './Sidebar.js';

interface MobileNavProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onOpenRooms: () => void;
  onNewBooking: () => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({
  activeTab,
  onSelectTab,
  onOpenRooms,
  onNewBooking,
}) => {
  const { activeMember, activeRoom, t } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);

  const role = activeMember?.role;
  const isOwner = role === 'OWNER';
  const isManager = role === 'MANAGER';
  const canFinance = isOwner || isManager;
  const canCreateBooking = isOwner || isManager || role === 'STAFF';

  if (!activeRoom) return null;

  const isMoreTabActive =
    activeTab === 'halls' ||
    activeTab === 'payments' ||
    activeTab === 'reports' ||
    activeTab === 'members_settings' ||
    activeTab === 'audit_log';

  const handleSelectFromMore = (tab: ActiveTab) => {
    setMoreOpen(false);
    onSelectTab(tab);
  };

  return (
    <>
      {/* Floating "+ New Booking" Button on Mobile */}
      {canCreateBooking && (
        <button
          onClick={onNewBooking}
          aria-label={t('newBookingBtn')}
          className="md:hidden fixed bottom-20 right-4 z-40 min-h-[48px] px-4 py-2.5 rounded-full bg-[#582C4D] hover:bg-[#47233E] text-white font-bold text-xs shadow-lg shadow-[#582C4D]/35 border border-[#C5A059]/40 flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
        >
          <Plus className="w-4 h-4 text-[#C5A059]" />
          <span>{t('newBookingBtn')}</span>
        </button>
      )}

      {/* Slide-up "More" Sheet on Mobile */}
      {moreOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="w-full rounded-t-3xl bg-white dark:bg-[#1E1920] border-t border-stone-200 dark:border-stone-800 p-5 pb-8 space-y-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-stone-100 dark:border-stone-800">
              <div>
                <p className="text-xs font-bold text-stone-900 dark:text-stone-100">
                  {activeRoom.name}
                </p>
                <p className="text-[11px] font-mono text-stone-500 dark:text-stone-400">
                  ID: {activeRoom.join_code}
                </p>
              </div>
              <button
                onClick={() => setMoreOpen(false)}
                aria-label={t('cancel')}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => handleSelectFromMore('halls')}
                className={`min-h-[48px] px-3.5 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2.5 border transition-colors cursor-pointer ${
                  activeTab === 'halls'
                    ? 'bg-[#582C4D] text-white border-[#582C4D]'
                    : 'bg-stone-50 dark:bg-stone-800/70 text-stone-700 dark:text-stone-200 border-stone-200 dark:border-stone-700'
                }`}
              >
                <Building2 className="w-4 h-4 shrink-0 text-[#C5A059]" />
                <span className="truncate">{t('navHalls')}</span>
              </button>

              {canFinance && (
                <>
                  <button
                    onClick={() => handleSelectFromMore('payments')}
                    className={`min-h-[48px] px-3.5 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2.5 border transition-colors cursor-pointer ${
                      activeTab === 'payments'
                        ? 'bg-[#582C4D] text-white border-[#582C4D]'
                        : 'bg-stone-50 dark:bg-stone-800/70 text-stone-700 dark:text-stone-200 border-stone-200 dark:border-stone-700'
                    }`}
                  >
                    <CreditCard className="w-4 h-4 shrink-0 text-[#C5A059]" />
                    <span className="truncate">{t('navExpenses')}</span>
                  </button>

                  <button
                    onClick={() => handleSelectFromMore('reports')}
                    className={`min-h-[48px] px-3.5 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2.5 border transition-colors cursor-pointer ${
                      activeTab === 'reports'
                        ? 'bg-[#582C4D] text-white border-[#582C4D]'
                        : 'bg-stone-50 dark:bg-stone-800/70 text-stone-700 dark:text-stone-200 border-stone-200 dark:border-stone-700'
                    }`}
                  >
                    <BarChart3 className="w-4 h-4 shrink-0 text-[#C5A059]" />
                    <span className="truncate">{t('navReports')}</span>
                  </button>

                  <button
                    onClick={() => handleSelectFromMore('members_settings')}
                    className={`min-h-[48px] px-3.5 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2.5 border transition-colors cursor-pointer ${
                      activeTab === 'members_settings'
                        ? 'bg-[#582C4D] text-white border-[#582C4D]'
                        : 'bg-stone-50 dark:bg-stone-800/70 text-stone-700 dark:text-stone-200 border-stone-200 dark:border-stone-700'
                    }`}
                  >
                    <Users2 className="w-4 h-4 shrink-0 text-[#C5A059]" />
                    <span className="truncate">{t('navMembersSettings')}</span>
                  </button>
                </>
              )}

              {isOwner && (
                <button
                  onClick={() => handleSelectFromMore('audit_log')}
                  className={`min-h-[48px] px-3.5 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2.5 border transition-colors cursor-pointer ${
                    activeTab === 'audit_log'
                      ? 'bg-[#582C4D] text-white border-[#582C4D]'
                      : 'bg-stone-50 dark:bg-stone-800/70 text-stone-700 dark:text-stone-200 border-stone-200 dark:border-stone-700'
                  }`}
                >
                  <FileCheck2 className="w-4 h-4 shrink-0 text-[#C5A059]" />
                  <span className="truncate">{t('navAuditLog')}</span>
                </button>
              )}

              <button
                onClick={() => {
                  setMoreOpen(false);
                  onOpenRooms();
                }}
                className="min-h-[48px] px-3.5 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2.5 border bg-stone-50 dark:bg-stone-800/70 text-stone-700 dark:text-stone-200 border-stone-200 dark:border-stone-700 cursor-pointer"
              >
                <ArrowLeftRight className="w-4 h-4 shrink-0 text-[#C5A059]" />
                <span className="truncate">{t('switchRoom')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5-Tab Bottom Navigation Bar: Home, Calendar, Bookings, Customers, More */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#161317]/95 backdrop-blur-md border-t border-stone-200 dark:border-stone-800 px-1 py-1 flex items-center justify-around"
      >
        <button
          onClick={() => onSelectTab('overview')}
          className={`min-h-[48px] min-w-[56px] flex flex-col items-center justify-center gap-1 px-2 py-1 rounded-xl text-[10px] font-semibold transition-colors cursor-pointer ${
            activeTab === 'overview'
              ? 'text-[#582C4D] dark:text-[#C5A059] bg-[#582C4D]/8 dark:bg-[#C5A059]/10'
              : 'text-stone-500 dark:text-stone-400'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" />
          <span className="truncate max-w-[64px]">{t('navHome')}</span>
        </button>

        <button
          onClick={() => onSelectTab('calendar')}
          className={`min-h-[48px] min-w-[56px] flex flex-col items-center justify-center gap-1 px-2 py-1 rounded-xl text-[10px] font-semibold transition-colors cursor-pointer ${
            activeTab === 'calendar'
              ? 'text-[#582C4D] dark:text-[#C5A059] bg-[#582C4D]/8 dark:bg-[#C5A059]/10'
              : 'text-stone-500 dark:text-stone-400'
          }`}
        >
          <CalendarRange className="w-4 h-4" />
          <span className="truncate max-w-[64px]">{t('navCalendar')}</span>
        </button>

        <button
          onClick={() => onSelectTab('bookings')}
          className={`min-h-[48px] min-w-[56px] flex flex-col items-center justify-center gap-1 px-2 py-1 rounded-xl text-[10px] font-semibold transition-colors cursor-pointer ${
            activeTab === 'bookings'
              ? 'text-[#582C4D] dark:text-[#C5A059] bg-[#582C4D]/8 dark:bg-[#C5A059]/10'
              : 'text-stone-500 dark:text-stone-400'
          }`}
        >
          <CalendarDays className="w-4 h-4" />
          <span className="truncate max-w-[64px]">{t('navBookings')}</span>
        </button>

        <button
          onClick={() => onSelectTab('customers')}
          className={`min-h-[48px] min-w-[56px] flex flex-col items-center justify-center gap-1 px-2 py-1 rounded-xl text-[10px] font-semibold transition-colors cursor-pointer ${
            activeTab === 'customers'
              ? 'text-[#582C4D] dark:text-[#C5A059] bg-[#582C4D]/8 dark:bg-[#C5A059]/10'
              : 'text-stone-500 dark:text-stone-400'
          }`}
        >
          <Users className="w-4 h-4" />
          <span className="truncate max-w-[64px]">{t('navCustomers')}</span>
        </button>

        <button
          onClick={() => setMoreOpen((prev) => !prev)}
          aria-expanded={moreOpen}
          className={`min-h-[48px] min-w-[56px] flex flex-col items-center justify-center gap-1 px-2 py-1 rounded-xl text-[10px] font-semibold transition-colors cursor-pointer ${
            isMoreTabActive || moreOpen
              ? 'text-[#582C4D] dark:text-[#C5A059] bg-[#582C4D]/8 dark:bg-[#C5A059]/10'
              : 'text-stone-500 dark:text-stone-400'
          }`}
        >
          <MoreHorizontal className="w-4 h-4" />
          <span className="truncate max-w-[64px]">{t('navMore')}</span>
        </button>
      </nav>
    </>
  );
};
