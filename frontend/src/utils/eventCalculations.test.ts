import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBudgetSummary,
  calculateRsvpStats,
  calculateDaysRemaining,
  calculateTaskProgress,
  formatCurrency,
} from './eventCalculations';
import { BudgetItem, Guest, TaskItem } from '../types/event';

test('calculateBudgetSummary correctly sums amounts and tracks over-budget status', () => {
  const items: BudgetItem[] = [
    {
      id: '1',
      category: 'Venue',
      description: 'Hall booking',
      allocatedAmount: 50000,
      actualAmount: 55000,
      paidAmount: 55000,
      isPaid: true,
    },
    {
      id: '2',
      category: 'Catering',
      description: 'Buffet',
      allocatedAmount: 30000,
      actualAmount: 25000,
      paidAmount: 10000,
      isPaid: false,
    },
  ];

  const summary = calculateBudgetSummary(75000, items);
  assert.equal(summary.totalAllocated, 80000);
  assert.equal(summary.totalActual, 80000);
  assert.equal(summary.totalPaid, 65000);
  assert.equal(summary.remainingBudget, -5000);
  assert.equal(summary.isOverBudget, true);
  assert.equal(summary.percentSpent, 107);
  assert.equal(summary.categoryBreakdown['Venue'].allocated, 50000);
  assert.equal(summary.categoryBreakdown['Catering'].count, 1);
});

test('calculateRsvpStats correctly aggregates attending headcounts with plus-ones', () => {
  const guests: Guest[] = [
    {
      id: 'g1',
      name: 'Ananya Sharma',
      email: 'ananya@example.com',
      status: 'attending',
      dietaryRestrictions: 'Vegetarian',
      plusOnes: 2,
      invitedDate: '2026-01-10',
    },
    {
      id: 'g2',
      name: 'Rahul Verma',
      email: 'rahul@example.com',
      status: 'attending',
      dietaryRestrictions: 'None',
      plusOnes: 0,
      invitedDate: '2026-01-10',
    },
    {
      id: 'g3',
      name: 'Kavita Rao',
      email: 'kavita@example.com',
      status: 'declined',
      plusOnes: 0,
      invitedDate: '2026-01-10',
    },
    {
      id: 'g4',
      name: 'Siddharth Patel',
      email: 'sid@example.com',
      status: 'pending',
      plusOnes: 1,
      invitedDate: '2026-01-10',
    },
  ];

  const stats = calculateRsvpStats(guests, 10);
  assert.equal(stats.attendingCount, 2);
  assert.equal(stats.declinedCount, 1);
  assert.equal(stats.pendingCount, 1);
  assert.equal(stats.totalGuests, 4);
  // g1 has 1 + 2 = 3 headcount, g2 has 1 + 0 = 1 headcount -> total 4
  assert.equal(stats.totalAttendingHeadcount, 4);
  // Responded: 3 of 4 -> 75%
  assert.equal(stats.responseRate, 75);
  // Headcount: 4 of 10 target -> 40%
  assert.equal(stats.percentOfCapacity, 40);
});

test('calculateDaysRemaining accurately classifies dates', () => {
  const refDate = new Date(2026, 4, 15); // May 15, 2026
  assert.equal(calculateDaysRemaining('2026-05-15', refDate).label, 'Today');
  assert.equal(calculateDaysRemaining('2026-05-16', refDate).label, 'Tomorrow');
  assert.equal(calculateDaysRemaining('2026-05-20', refDate).label, 'In 5 days');
  assert.equal(calculateDaysRemaining('2026-05-10', refDate).isPast, true);
});

test('calculateTaskProgress computes percentage and totals', () => {
  const tasks: TaskItem[] = [
    { id: 't1', title: 'Task 1', category: 'General', priority: 'high', dueDate: '2026-06-01', completed: true },
    { id: 't2', title: 'Task 2', category: 'General', priority: 'medium', dueDate: '2026-06-02', completed: false },
    { id: 't3', title: 'Task 3', category: 'General', priority: 'low', dueDate: '2026-06-03', completed: true },
    { id: 't4', title: 'Task 4', category: 'General', priority: 'medium', dueDate: '2026-06-04', completed: false },
  ];
  assert.deepEqual(calculateTaskProgress(tasks), {
    completed: 2,
    total: 4,
    percentage: 50,
  });
  assert.deepEqual(calculateTaskProgress([]), {
    completed: 0,
    total: 0,
    percentage: 0,
  });
});

test('formatCurrency formats Indian Rupee correctly', () => {
  const formatted = formatCurrency(500000, 'INR');
  assert.ok(formatted.includes('5,00,000') || formatted.includes('₹'));
});
