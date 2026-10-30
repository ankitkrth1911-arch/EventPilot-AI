import { BudgetItem, Guest, TaskItem } from '../types/event';

export interface BudgetSummary {
  totalBudget: number;
  totalAllocated: number;
  totalActual: number;
  totalPaid: number;
  remainingBudget: number;
  percentSpent: number;
  isOverBudget: boolean;
  categoryBreakdown: Record<string, { allocated: number; actual: number; paid: number; count: number }>;
}

export function calculateBudgetSummary(totalBudget: number, items: BudgetItem[]): BudgetSummary {
  let totalAllocated = 0;
  let totalActual = 0;
  let totalPaid = 0;

  const categoryBreakdown: Record<string, { allocated: number; actual: number; paid: number; count: number }> = {};

  for (const item of items) {
    totalAllocated += item.allocatedAmount || 0;
    totalActual += item.actualAmount || 0;
    totalPaid += item.paidAmount || (item.isPaid ? item.actualAmount : 0);

    const cat = item.category || 'Other';
    if (!categoryBreakdown[cat]) {
      categoryBreakdown[cat] = { allocated: 0, actual: 0, paid: 0, count: 0 };
    }
    categoryBreakdown[cat].allocated += item.allocatedAmount || 0;
    categoryBreakdown[cat].actual += item.actualAmount || 0;
    categoryBreakdown[cat].paid += item.paidAmount || (item.isPaid ? item.actualAmount : 0);
    categoryBreakdown[cat].count += 1;
  }

  const remainingBudget = totalBudget - totalActual;
  const percentSpent = totalBudget > 0 ? Math.round((totalActual / totalBudget) * 100) : 0;
  const isOverBudget = totalActual > totalBudget;

  return {
    totalBudget,
    totalAllocated,
    totalActual,
    totalPaid,
    remainingBudget,
    percentSpent,
    isOverBudget,
    categoryBreakdown,
  };
}

export interface RsvpStats {
  attendingCount: number;
  declinedCount: number;
  pendingCount: number;
  totalGuests: number;
  totalAttendingHeadcount: number;
  responseRate: number;
  percentOfCapacity: number;
}

export function calculateRsvpStats(guests: Guest[], targetGuests: number): RsvpStats {
  let attendingCount = 0;
  let declinedCount = 0;
  let pendingCount = 0;
  let totalAttendingHeadcount = 0;

  for (const guest of guests) {
    if (guest.status === 'attending') {
      attendingCount += 1;
      totalAttendingHeadcount += 1 + (guest.plusOnes || 0);
    } else if (guest.status === 'declined') {
      declinedCount += 1;
    } else {
      pendingCount += 1;
    }
  }

  const totalGuests = guests.length;
  const responded = attendingCount + declinedCount;
  const responseRate = totalGuests > 0 ? Math.round((responded / totalGuests) * 100) : 0;
  const percentOfCapacity = targetGuests > 0 ? Math.min(100, Math.round((totalAttendingHeadcount / targetGuests) * 100)) : 0;

  return {
    attendingCount,
    declinedCount,
    pendingCount,
    totalGuests,
    totalAttendingHeadcount,
    responseRate,
    percentOfCapacity,
  };
}

export interface CountdownInfo {
  days: number;
  label: string;
  isPast: boolean;
  isToday: boolean;
}

export function calculateDaysRemaining(targetDateStr: string, currentDate: Date = new Date()): CountdownInfo {
  // Parse target date in local calendar day
  const [year, month, day] = targetDateStr.split('-').map(Number);
  const target = new Date(year, month - 1, day);
  
  const current = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());

  const diffTime = target.getTime() - current.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return { days: 0, label: 'Today', isPast: false, isToday: true };
  } else if (diffDays === 1) {
    return { days: 1, label: 'Tomorrow', isPast: false, isToday: false };
  } else if (diffDays > 1) {
    return { days: diffDays, label: `In ${diffDays} days`, isPast: false, isToday: false };
  } else {
    return { days: Math.abs(diffDays), label: `${Math.abs(diffDays)}d ago`, isPast: true, isToday: false };
  }
}

export function calculateTaskProgress(tasks: TaskItem[]): { completed: number; total: number; percentage: number } {
  const total = tasks.length;
  if (total === 0) return { completed: 0, total: 0, percentage: 0 };
  const completed = tasks.filter(t => t.completed).length;
  const percentage = Math.round((completed / total) * 100);
  return { completed, total, percentage };
}

export function formatCurrency(amount: number, currency: string = 'INR'): string {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency || 'INR',
      maximumFractionDigits: 0,
    }).format(amount || 0);
  } catch {
    return `₹${Math.round(amount || 0).toLocaleString('en-IN')}`;
  }
}
