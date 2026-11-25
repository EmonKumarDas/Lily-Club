import React from 'react';
import { Sparkles, CalendarDays, CalendarRange, CreditCard, BarChart3, LayoutDashboard } from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { DateBadge } from '../components/DateBadge.js';
import type { ActiveTab } from '../components/Sidebar.js';

interface ComingSoonPageProps {
  tab: ActiveTab;
}

export const ComingSoonPage: React.FC<ComingSoonPageProps> = ({ tab }) => {
  const { t } = useAuth();

  const getTabMeta = () => {
    switch (tab) {
      case 'bookings':
        return {
          icon: CalendarDays,
          part: 'Part 2',
          title: t('comingSoonPart2Title'),
          description: t('comingSoonPart2Desc'),
          features: [
            'Internal bookings management (Day, Night, Full slot system)',
            'Customer details and guest count tracking',
            'Booking collision prevention and calendar reservation',
          ],
        };
      case 'calendar':
        return {
          icon: CalendarRange,
          part: 'Part 2',
          title: t('comingSoonPart2Title'),
          description: t('comingSoonPart2Desc'),
          features: [
            'Bilingual month and week view with dual Bengali-English dates',
            'Interactive slot availability view (Day vs Night vs Full)',
            'Upcoming club events and booking status filter',
          ],
        };
      case 'payments':
        return {
          icon: CreditCard,
          part: 'Part 3',
          title: t('comingSoonPart3Title'),
          description: t('comingSoonPart3Desc'),
          features: [
            'Advance deposits and installment tracking in BDT (৳)',
            'Auto-generated Bengali Money Receipts and invoices',
            'Manager payment approval and payment receipts history',
          ],
        };
      case 'reports':
        return {
          icon: BarChart3,
          part: 'Part 4',
          title: t('comingSoonPart4Title'),
          description: t('comingSoonPart4Desc'),
          features: [
            'Monthly & yearly revenue reports in BDT',
            'Slot utilization rates and most popular booking days',
            'Print-friendly club financial summary statements',
          ],
        };
      default:
        return {
          icon: LayoutDashboard,
          part: 'Part 4',
          title: t('comingSoonPart4Title'),
          description: t('comingSoonPart4Desc'),
          features: [
            'Club at a glance: upcoming events, occupancy and pending tasks',
            'Key performance indicators for management',
            'Quick action links to bookings and payments',
          ],
        };
    }
  };

  const meta = getTabMeta();
  const Icon = meta.icon;

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-8 space-y-8 animate-in fade-in duration-200">
      <div className="flex items-center justify-between border-b border-stone-200 dark:border-stone-800 pb-5">
        <DateBadge />
        <span className="px-3 py-1 rounded-full bg-[#582C4D]/10 dark:bg-[#C5A059]/15 text-[#582C4D] dark:text-[#C5A059] font-mono text-xs font-bold">
          {meta.part} Upcoming
        </span>
      </div>

      <div className="p-8 sm:p-12 rounded-3xl bg-white dark:bg-[#1E1920] border border-stone-200 dark:border-stone-800 shadow-xl text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#582C4D] to-[#3B1D34] flex items-center justify-center text-[#C5A059] mx-auto shadow-lg shadow-[#582C4D]/25">
          <Icon className="w-8 h-8" />
        </div>

        <div className="space-y-2 max-w-xl mx-auto">
          <h2 className="text-xl sm:text-2xl font-extrabold text-stone-900 dark:text-stone-100 tracking-tight">
            {meta.title}
          </h2>
          <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
            {meta.description}
          </p>
        </div>

        {/* Feature bullets preview */}
        <div className="max-w-md mx-auto p-5 rounded-2xl bg-stone-50 dark:bg-stone-900/60 border border-stone-100 dark:border-stone-800 text-left space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-bold text-[#582C4D] dark:text-[#C5A059]">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Planned Capabilities</span>
          </div>
          <ul className="space-y-2 text-xs text-stone-600 dark:text-stone-400">
            {meta.features.map((feat, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-[#C5A059] font-bold mt-0.5">•</span>
                <span>{feat}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
