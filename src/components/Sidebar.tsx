import React from 'react';
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
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';

export type ActiveTab =
  | 'overview'
  | 'bookings'
  | 'calendar'
  | 'halls'
  | 'customers'
  | 'payments'
  | 'reports'
  | 'members_settings'
  | 'audit_log';

interface SidebarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onSelectTab }) => {
  const { activeMember, activeRoom, t } = useAuth();
  const isOwner = activeMember?.role === 'OWNER';
  const isManager = activeMember?.role === 'MANAGER';

  const navItems: Array<{
    id: ActiveTab;
    label: string;
    icon: any;
    comingSoonPart?: number;
    isLive?: boolean;
  }> = [
    {
      id: 'overview',
      label: t('navHome'),
      icon: LayoutDashboard,
      isLive: true,
    },
    {
      id: 'bookings',
      label: t('navBookings'),
      icon: CalendarDays,
      isLive: true,
    },
    {
      id: 'calendar',
      label: t('navCalendar'),
      icon: CalendarRange,
      isLive: true,
    },
    {
      id: 'halls',
      label: t('navHalls'),
      icon: Building2,
      isLive: true,
    },
    {
      id: 'customers',
      label: t('navCustomers'),
      icon: Users,
      isLive: true,
    },
    ...(isOwner || isManager
      ? [
          {
            id: 'payments' as ActiveTab,
            label: t('navExpenses'),
            icon: CreditCard,
            isLive: true,
          },
          {
            id: 'reports' as ActiveTab,
            label: t('navReports'),
            icon: BarChart3,
            isLive: true,
          },
          {
            id: 'members_settings' as ActiveTab,
            label: t('navMembersSettings'),
            icon: Users2,
            isLive: true,
          },
        ]
      : []),
    ...(isOwner
      ? [
          {
            id: 'audit_log' as ActiveTab,
            label: t('navAuditLog'),
            icon: FileCheck2,
            isLive: true,
          },
        ]
      : []),
  ];

  if (!activeRoom) return null;

  return (
    <aside className="hidden md:flex flex-col w-64 shrink-0 bg-white dark:bg-[#161317] border-r border-stone-200 dark:border-stone-800 p-4 min-h-[calc(100vh-4rem)]">
      {/* Active Club Mini Header (Room ID is strictly Owner-only in Profile/Settings, never shown here) */}
      <div className="p-3.5 mb-4 rounded-2xl bg-gradient-to-br from-[#4A2545]/8 to-[#C5A059]/10 border border-[#4A2545]/15 dark:border-[#C5A059]/20">
        <p className="text-[11px] font-bold text-[#4A2545] dark:text-[#C5A059] uppercase tracking-wider">
          {t('currentRoom')}
        </p>
        <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100 truncate mt-0.5">
          {activeRoom.name}
        </h2>
        {activeMember?.role && (
          <p className="text-[11px] font-semibold text-stone-500 dark:text-stone-400 mt-1">
            {t(`role_${activeMember.role}` as any)}
          </p>
        )}
      </div>

      {/* Navigation List */}
      <nav className="flex-1 space-y-1.5">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                isActive
                  ? 'bg-[#582C4D] text-white shadow-md shadow-[#582C4D]/25'
                  : 'text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800/80 hover:text-stone-900 dark:hover:text-stone-100'
              }`}
            >
              <div className="flex items-center gap-3 truncate">
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-[#C5A059]' : 'text-stone-400 group-hover:text-stone-600'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </div>

              {item.comingSoonPart && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono shrink-0 ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-stone-100 dark:bg-stone-800 text-stone-400'
                  }`}
                >
                  P{item.comingSoonPart}
                </span>
              )}

              {item.isLive && (
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    isActive ? 'bg-[#C5A059]' : 'bg-emerald-500'
                  }`}
                  title="Live"
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer Info */}
      <div className="pt-4 mt-auto border-t border-stone-100 dark:border-stone-800 text-center">
        <div className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-[#582C4D] dark:text-[#C5A059]">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Part 4: Complete System</span>
        </div>
        <p className="text-[10px] text-stone-400 mt-1">Asia/Dhaka • BDT (৳)</p>
      </div>
    </aside>
  );
};
