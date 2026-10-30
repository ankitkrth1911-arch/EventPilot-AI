import React from 'react';
import { EventItem } from '../types/event';
import { calculateRsvpStats, calculateBudgetSummary, formatCurrency } from '../utils/eventCalculations';
import { CalendarDays, Users, DollarSign, CheckCircle2 } from 'lucide-react';

interface DashboardMetricsProps {
  events: EventItem[];
}

export const DashboardMetrics: React.FC<DashboardMetricsProps> = ({ events }) => {
  const totalEvents = events.length;

  let totalConfirmedGuests = 0;
  let totalTrackedBudget = 0;
  let totalPendingTasks = 0;

  for (const ev of events) {
    const rsvp = calculateRsvpStats(ev.guests, ev.targetGuests);
    totalConfirmedGuests += rsvp.totalAttendingHeadcount;

    const b = calculateBudgetSummary(ev.totalBudget, ev.budgetItems);
    totalTrackedBudget += b.totalBudget;

    const pendingTasks = ev.tasks.filter((t) => !t.completed).length;
    totalPendingTasks += pendingTasks;
  }

  const metrics = [
    {
      label: 'Active Events',
      value: totalEvents,
      helper: 'In planning pipeline',
      icon: <CalendarDays className="w-5 h-5 text-[#4B2FC9]" />,
      iconBg: 'bg-[#EDE9FE]',
    },
    {
      label: 'Confirmed Guests',
      value: totalConfirmedGuests,
      helper: 'Across active RSVPs',
      icon: <Users className="w-5 h-5 text-[#0D9488]" />,
      iconBg: 'bg-[#CCFBF1]',
    },
    {
      label: 'Total Budget Managed',
      value: formatCurrency(totalTrackedBudget),
      helper: 'Allocated across vendors',
      icon: <DollarSign className="w-5 h-5 text-[#D97706]" />,
      iconBg: 'bg-[#FEF3C7]',
    },
    {
      label: 'Pending Run-of-Show Tasks',
      value: totalPendingTasks,
      helper: 'Requires host attention',
      icon: <CheckCircle2 className="w-5 h-5 text-[#4B2FC9]" />,
      iconBg: 'bg-[#EDE9FE]',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {metrics.map((m, idx) => (
        <div
          key={idx}
          className="bg-white rounded-[16px] border border-[#E5E7EB] p-5 shadow-surface-card hover:shadow-surface-hover transition-all duration-200"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-[#4B5563] tracking-wide uppercase">
              {m.label}
            </span>
            <div className={`w-9 h-9 rounded-xl ${m.iconBg} flex items-center justify-center`}>
              {m.icon}
            </div>
          </div>
          <div className="text-2xl font-bold tracking-tight text-[#111827] mb-1">
            {m.value}
          </div>
          <p className="text-xs text-[#9CA3AF] font-medium">{m.helper}</p>
        </div>
      ))}
    </div>
  );
};
