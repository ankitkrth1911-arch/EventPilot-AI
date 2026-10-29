import React, { useState } from 'react';
import { EventItem, BudgetItem } from '../../types/event';
import { calculateBudgetSummary, formatCurrency } from '../../utils/eventCalculations';
import { generatePlan } from '../../services/api';
import {
  Plus,
  Check,
  DollarSign,
  AlertTriangle,
  Trash2,
  PieChart,
  Sparkles,
  Calculator,
  RefreshCw,
  Users,
  Calendar,
} from 'lucide-react';

interface BudgetTabProps {
  event: EventItem;
  onUpdateEvent: (updated: EventItem) => void;
}

function mapBackendCategory(cat: string): BudgetItem['category'] {
  const norm = (cat || '').toLowerCase();
  if (norm.includes('venue') || norm.includes('hall') || norm.includes('location')) return 'Venue';
  if (norm.includes('cater') || norm.includes('food') || norm.includes('drink') || norm.includes('beverage')) return 'Catering';
  if (norm.includes('photo') || norm.includes('video')) return 'Photography';
  if (norm.includes('floral') || norm.includes('flower')) return 'Florals & Decor';
  if (norm.includes('decor')) return 'Decor';
  if (norm.includes('music') || norm.includes('sound') || norm.includes('dj') || norm.includes('band')) return 'Music & Sound';
  if (norm.includes('favor') || norm.includes('print') || norm.includes('invite') || norm.includes('stationery')) return 'Favors & Print';
  if (norm.includes('attire') || norm.includes('dress') || norm.includes('suit') || norm.includes('outfit')) return 'Attire';
  if (norm.includes('logistics') || norm.includes('travel') || norm.includes('transport')) return 'Logistics';
  return 'Other';
}

export const BudgetTab: React.FC<BudgetTabProps> = ({ event, onUpdateEvent }) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [isAllocating, setIsAllocating] = useState(false);
  const [allocateError, setAllocateError] = useState<string | null>(null);

  const [newItem, setNewItem] = useState({
    description: '',
    category: 'Catering' as BudgetItem['category'],
    allocatedAmount: 10000,
    actualAmount: 10000,
    paidAmount: 0,
    vendorName: '',
    dueDate: '',
    isPaid: false,
  });

  const summary = calculateBudgetSummary(event.totalBudget, event.budgetItems);

  const handleAutoAllocate = async () => {
    if (event.budgetItems.length > 0) {
      const ok = window.confirm(
        'Replace existing budget items with rule-based allocation from the backend?'
      );
      if (!ok) return;
    }

    setIsAllocating(true);
    setAllocateError(null);
    try {
      const plan = await generatePlan({
        event_type: event.category,
        budget: event.totalBudget,
        guest_count: event.targetGuests,
        event_date: event.date || undefined,
      });

      const newBudgetItems: BudgetItem[] = plan.budget_breakdown.map((item) => ({
        id: crypto.randomUUID(),
        description: `${item.category} (${item.percentage}%)`,
        category: mapBackendCategory(item.category),
        allocatedAmount: item.amount,
        actualAmount: 0,
        paidAmount: 0,
        isPaid: false,
      }));

      onUpdateEvent({
        ...event,
        budgetItems: newBudgetItems,
        ruleBasedPlan: {
          warnings: plan.warnings,
          per_guest_cost: plan.per_guest_cost,
          days_until_event: plan.days_until_event,
          total_budget: plan.total_budget,
          guest_count: plan.guest_count,
          generated_by: plan.generated_by,
        },
      });
    } catch (err: any) {
      console.error('Auto allocate failed:', err);
      setAllocateError(err.message || 'Failed to auto-allocate budget from backend.');
    } finally {
      setIsAllocating(false);
    }
  };

  const handleTogglePaid = (id: string) => {
    const updatedItems = event.budgetItems.map((item) => {
      if (item.id === id) {
        const nextPaid = !item.isPaid;
        return {
          ...item,
          isPaid: nextPaid,
          paidAmount: nextPaid ? item.actualAmount : 0,
        };
      }
      return item;
    });
    onUpdateEvent({ ...event, budgetItems: updatedItems });
  };

  const handleDeleteItem = (id: string) => {
    const updatedItems = event.budgetItems.filter((i) => i.id !== id);
    onUpdateEvent({ ...event, budgetItems: updatedItems });
  };

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.description.trim()) return;

    const item: BudgetItem = {
      id: crypto.randomUUID(),
      description: newItem.description.trim(),
      category: newItem.category,
      allocatedAmount: Number(newItem.allocatedAmount) || 0,
      actualAmount: Number(newItem.actualAmount) || 0,
      paidAmount: newItem.isPaid
        ? Number(newItem.actualAmount)
        : Number(newItem.paidAmount) || 0,
      vendorName: newItem.vendorName.trim() || undefined,
      dueDate: newItem.dueDate || undefined,
      isPaid: newItem.isPaid,
    };

    onUpdateEvent({
      ...event,
      budgetItems: [...event.budgetItems, item],
    });

    setShowAddModal(false);
    setNewItem({
      description: '',
      category: 'Catering',
      allocatedAmount: 10000,
      actualAmount: 10000,
      paidAmount: 0,
      vendorName: '',
      dueDate: '',
      isPaid: false,
    });
  };

  const warnings = event.ruleBasedPlan?.warnings || [];
  const perGuestCost = event.ruleBasedPlan?.per_guest_cost;
  const daysUntil = event.ruleBasedPlan?.days_until_event;

  return (
    <div className="space-y-6">
      {/* Backend Rule-based Warnings Alert Cards */}
      {warnings.length > 0 && (
        <div className="space-y-2">
          {warnings.map((warn, i) => (
            <div
              key={i}
              className="p-4 rounded-[12px] bg-amber-50 border border-amber-200 flex items-start gap-3 text-xs text-amber-900 shadow-xs"
            >
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{warn}</div>
            </div>
          ))}
        </div>
      )}

      {allocateError && (
        <div className="p-4 rounded-[12px] bg-rose-50 border border-rose-200 flex items-center justify-between gap-3 text-xs text-rose-900 shadow-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{allocateError}</span>
          </div>
          <button
            onClick={() => setAllocateError(null)}
            className="text-rose-600 font-bold hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Backend Stat Chips: per_guest_cost & days_until_event */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-[16px] border border-[#E5E7EB] p-4 shadow-surface-card">
        <div className="flex flex-wrap items-center gap-2">
          {perGuestCost !== undefined && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EDE9FE] text-[#4B2FC9] text-xs font-semibold border border-[#DDD6FE]">
              <Users className="w-3.5 h-3.5" />
              <span>Est. {formatCurrency(perGuestCost, event.currency)} / guest</span>
            </span>
          )}

          {daysUntil !== undefined && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F4F5FA] text-[#4B5563] text-xs font-semibold border border-[#E5E7EB]">
              <Calendar className="w-3.5 h-3.5" />
              <span>{daysUntil} days until event</span>
            </span>
          )}

          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 text-[11px] font-semibold">
            Rule-based planner v1
          </span>
        </div>

        <button
          onClick={handleAutoAllocate}
          disabled={isAllocating}
          className="inline-flex items-center gap-2 px-4 h-10 rounded-[10px] bg-[#4B2FC9] hover:bg-[#3C24A4] active:scale-[0.98] text-white text-xs font-semibold shadow-sm transition-all cursor-pointer disabled:opacity-50"
        >
          {isAllocating ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Allocating...</span>
            </>
          ) : (
            <>
              <Calculator className="w-3.5 h-3.5" />
              <span>Auto-allocate budget (rule-based)</span>
            </>
          )}
        </button>
      </div>

      {/* Top metrics summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-[16px] border border-[#E5E7EB] p-5 shadow-surface-card">
          <span className="text-xs font-semibold text-[#4B5563] uppercase tracking-wide block mb-1">
            Total Target Budget
          </span>
          <div className="text-2xl font-bold text-[#111827]">
            {formatCurrency(summary.totalBudget, event.currency)}
          </div>
          <span className="text-xs text-[#9CA3AF] mt-1 block">Set by event host</span>
        </div>

        <div className="bg-white rounded-[16px] border border-[#E5E7EB] p-5 shadow-surface-card">
          <span className="text-xs font-semibold text-[#4B5563] uppercase tracking-wide block mb-1">
            Committed / Spent
          </span>
          <div className="text-2xl font-bold text-[#111827]">
            {formatCurrency(summary.totalActual, event.currency)}
          </div>
          <div className="flex items-center gap-1.5 mt-1 text-xs">
            <span
              className={`font-semibold ${
                summary.isOverBudget ? 'text-rose-600' : 'text-emerald-600'
              }`}
            >
              {summary.percentSpent}% allocated
            </span>
          </div>
        </div>

        <div className="bg-white rounded-[16px] border border-[#E5E7EB] p-5 shadow-surface-card">
          <span className="text-xs font-semibold text-[#4B5563] uppercase tracking-wide block mb-1">
            Paid to Date
          </span>
          <div className="text-2xl font-bold text-[#0D9488]">
            {formatCurrency(summary.totalPaid, event.currency)}
          </div>
          <span className="text-xs text-[#9CA3AF] mt-1 block">
            {formatCurrency(summary.totalActual - summary.totalPaid, event.currency)} pending balance
          </span>
        </div>

        <div
          className={`rounded-[16px] border p-5 shadow-surface-card ${
            summary.isOverBudget
              ? 'bg-rose-50 border-rose-200'
              : 'bg-emerald-50/60 border-emerald-200'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-[#4B5563]">
              {summary.isOverBudget ? 'Budget Overrun' : 'Remaining Buffer'}
            </span>
            {summary.isOverBudget ? (
              <AlertTriangle className="w-4 h-4 text-rose-600" />
            ) : (
              <DollarSign className="w-4 h-4 text-emerald-600" />
            )}
          </div>
          <div
            className={`text-2xl font-bold ${
              summary.isOverBudget ? 'text-rose-700' : 'text-emerald-700'
            }`}
          >
            {formatCurrency(Math.abs(summary.remainingBudget), event.currency)}
          </div>
          <span className="text-xs text-[#4B5563] mt-1 block">
            {summary.isOverBudget
              ? 'Warning: Total expenses exceed limit'
              : 'Available for incidentals'}
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-white rounded-[16px] border border-[#E5E7EB] p-5 shadow-surface-card">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="font-semibold text-[#111827]">
            Overall Budget Utilization
          </span>
          <span className="font-bold text-[#4B2FC9]">
            {formatCurrency(summary.totalActual, event.currency)} of{' '}
            {formatCurrency(summary.totalBudget, event.currency)} ({summary.percentSpent}%)
          </span>
        </div>
        <div className="w-full bg-[#E5E7EB] rounded-full h-3 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              summary.isOverBudget
                ? 'bg-rose-500'
                : summary.percentSpent > 85
                ? 'bg-amber-500'
                : 'bg-[#4B2FC9]'
            }`}
            style={{ width: `${Math.min(100, summary.percentSpent)}%` }}
          />
        </div>
      </div>

      {/* Category Breakdown & Optimization Tips Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-[16px] border border-[#E5E7EB] p-5 shadow-surface-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-[#111827] flex items-center gap-2">
              <PieChart className="w-4 h-4 text-[#4B2FC9]" />
              <span>Category Breakdown</span>
            </h3>
            <span className="text-xs text-[#9CA3AF]">
              {Object.keys(summary.categoryBreakdown).length} categories active
            </span>
          </div>

          <div className="space-y-3">
            {Object.keys(summary.categoryBreakdown).length === 0 ? (
              <p className="text-xs text-[#9CA3AF] py-4 text-center">
                No budget categories recorded yet. Click "Auto-allocate budget" above or add an expense below.
              </p>
            ) : (
              Object.entries(summary.categoryBreakdown).map(([category, data]) => {
                const catPercent =
                  summary.totalActual > 0
                    ? Math.round((data.actual / summary.totalActual) * 100)
                    : summary.totalAllocated > 0
                    ? Math.round((data.allocated / summary.totalAllocated) * 100)
                    : 0;

                return (
                  <div key={category} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[#111827]">
                        {category} ({data.count} items)
                      </span>
                      <span className="font-medium text-[#4B5563]">
                        {formatCurrency(data.actual, event.currency)}{' '}
                        <span className="text-[#9CA3AF]">({catPercent}%)</span>
                      </span>
                    </div>
                    <div className="w-full bg-[#F4F5FA] rounded-full h-2 overflow-hidden border border-[#E5E7EB]/50">
                      <div
                        className="h-full bg-[#4B2FC9] rounded-full"
                        style={{ width: `${catPercent}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Budget Planning Guidelines Panel */}
        <div className="bg-[#EDE9FE]/40 rounded-[16px] border border-[#DDD6FE] p-5">
          <div className="flex items-center gap-2 text-sm font-bold text-[#4B2FC9] mb-3">
            <Sparkles className="w-4 h-4" />
            <span>Budget Guidelines & Optimizer</span>
          </div>

          <div className="space-y-3 text-xs text-[#4B5563]">
            <div className="p-3 bg-white rounded-[12px] border border-[#DDD6FE]/60">
              <span className="font-bold text-[#111827] block mb-0.5">
                Catering & Venue Rule-of-Thumb
              </span>
              Venue and catering typically account for ~50-60% of total event expenditures.
            </div>

            <div className="p-3 bg-white rounded-[12px] border border-[#DDD6FE]/60">
              <span className="font-bold text-[#111827] block mb-0.5">
                Contract Headcount Deadline
              </span>
              Lock catering headcount 10 days before the event to prevent last-minute per-plate surcharges.
            </div>

            <div className="p-3 bg-white rounded-[12px] border border-[#DDD6FE]/60">
              <span className="font-bold text-[#111827] block mb-0.5">
                Incidentals & Buffer
              </span>
              Reserve 5-10% of total allocation for transportation overage, tips, and unexpected fees.
            </div>
          </div>
        </div>
      </div>

      {/* Expense Items Table */}
      <div className="bg-white rounded-[16px] border border-[#E5E7EB] overflow-hidden shadow-surface-card">
        <div className="p-5 border-b border-[#E5E7EB] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-[#111827]">
              Expense Ledger & Invoices
            </h3>
            <p className="text-xs text-[#4B5563]">
              Track vendor invoices, due dates, and payment milestones
            </p>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-4 h-10 rounded-[10px] bg-[#4B2FC9] hover:bg-[#3C24A4] active:scale-[0.98] text-white text-xs font-semibold shadow-sm transition-all cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Add Expense</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F4F5FA] text-[#4B5563] uppercase tracking-wider font-semibold border-b border-[#E5E7EB]">
              <tr>
                <th className="py-3.5 px-5">Description</th>
                <th className="py-3.5 px-4">Category</th>
                <th className="py-3.5 px-4">Vendor</th>
                <th className="py-3.5 px-4 text-right">Allocated</th>
                <th className="py-3.5 px-4 text-right">Actual Cost</th>
                <th className="py-3.5 px-4 text-center">Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {event.budgetItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#9CA3AF]">
                    No expenses recorded yet. Click "Add Expense" or "Auto-allocate budget".
                  </td>
                </tr>
              ) : (
                event.budgetItems.map((item) => (
                  <tr key={item.id} className="hover:bg-[#F9FAFB] transition-colors">
                    <td className="py-3.5 px-5 font-semibold text-[#111827]">
                      {item.description}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded-full bg-[#EDE9FE] text-[#4B2FC9] font-medium text-[11px]">
                        {item.category}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-[#4B5563]">
                      {item.vendorName || '—'}
                    </td>
                    <td className="py-3.5 px-4 text-right text-[#9CA3AF]">
                      {formatCurrency(item.allocatedAmount, event.currency)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-[#111827]">
                      {formatCurrency(item.actualAmount, event.currency)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => handleTogglePaid(item.id)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all cursor-pointer ${
                          item.isPaid
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}
                      >
                        {item.isPaid ? (
                          <>
                            <Check className="w-3 h-3" /> Paid Full
                          </>
                        ) : (
                          'Pending'
                        )}
                      </button>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        className="p-1.5 text-gray-400 hover:text-rose-600 rounded-md transition-colors cursor-pointer"
                        title="Delete expense"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Expense Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-[16px] border border-[#E5E7EB] shadow-surface-modal w-full max-w-lg p-6 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-[#111827] mb-1">
              Add Budget Expense
            </h3>
            <p className="text-xs text-[#4B5563] mb-4">
              Enter quote or invoice details for this event deliverable.
            </p>

            <form onSubmit={handleAddItem} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#111827] mb-1">
                  Expense Description *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Catering Deposit"
                  value={newItem.description}
                  onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                  className="w-full h-11 px-3.5 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] focus:outline-none focus:border-[#4B2FC9]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#111827] mb-1">
                    Category
                  </label>
                  <select
                    value={newItem.category}
                    onChange={(e) =>
                      setNewItem({
                        ...newItem,
                        category: e.target.value as BudgetItem['category'],
                      })
                    }
                    className="w-full h-11 px-3 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] focus:outline-none focus:border-[#4B2FC9]"
                  >
                    <option value="Venue">Venue</option>
                    <option value="Catering">Catering</option>
                    <option value="Photography">Photography</option>
                    <option value="Florals & Decor">Florals & Decor</option>
                    <option value="Decor">Decor</option>
                    <option value="Music & Sound">Music & Sound</option>
                    <option value="Favors & Print">Favors & Print</option>
                    <option value="Attire">Attire</option>
                    <option value="Logistics">Logistics</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#111827] mb-1">
                    Vendor Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Grand Caterers"
                    value={newItem.vendorName}
                    onChange={(e) => setNewItem({ ...newItem, vendorName: e.target.value })}
                    className="w-full h-11 px-3.5 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] focus:outline-none focus:border-[#4B2FC9]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#111827] mb-1">
                    Allocated ({event.currency})
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={newItem.allocatedAmount}
                    onChange={(e) =>
                      setNewItem({ ...newItem, allocatedAmount: Number(e.target.value) })
                    }
                    className="w-full h-11 px-3.5 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] focus:outline-none focus:border-[#4B2FC9]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#111827] mb-1">
                    Actual Cost ({event.currency}) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={newItem.actualAmount}
                    onChange={(e) =>
                      setNewItem({ ...newItem, actualAmount: Number(e.target.value) })
                    }
                    className="w-full h-11 px-3.5 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] focus:outline-none focus:border-[#4B2FC9]"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="paidCheckbox"
                  checked={newItem.isPaid}
                  onChange={(e) => setNewItem({ ...newItem, isPaid: e.target.checked })}
                  className="w-4 h-4 rounded text-[#4B2FC9] focus:ring-[#4B2FC9]"
                />
                <label htmlFor="paidCheckbox" className="text-xs font-medium text-[#111827]">
                  Mark this expense as fully paid
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E5E7EB]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 h-11 rounded-[12px] bg-white border border-[#E5E7EB] text-sm font-semibold text-[#111827] hover:bg-[#F9FAFB] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 h-11 rounded-[12px] bg-[#4B2FC9] hover:bg-[#3C24A4] text-sm font-semibold text-white shadow-sm cursor-pointer"
                >
                  Save Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
