import React, { useState } from 'react';
import { EventItem, EventCategory, BudgetItem, TaskItem } from '../types/event';
import { CategoryBadge } from './CategoryBadge';
import { generatePlan } from '../services/api';
import { X, Calendar, RefreshCw, AlertTriangle, ListChecks } from 'lucide-react';

interface CreateEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (newEventData: {
    title: string;
    category: EventCategory;
    date: string | null;
    startTime: string;
    endTime: string;
    venueName: string;
    location: string | null;
    description: string;
    hostName: string;
    hostEmail: string;
    totalBudget: number;
    targetGuests: number;
    budgetItems: BudgetItem[];
    tasks: TaskItem[];
    ruleBasedPlan?: any;
  }) => Promise<void>;
}

export const CreateEventModal: React.FC<CreateEventModalProps> = ({
  isOpen,
  onClose,
  onCreate,
}) => {
  const [category, setCategory] = useState<EventCategory>('wedding');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('18:00');
  const [venueName, setVenueName] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [hostName, setHostName] = useState('');
  const [hostEmail, setHostEmail] = useState('');
  const [totalBudget, setTotalBudget] = useState('500000');
  const [targetGuests, setTargetGuests] = useState('150');
  const [autoSeedPlan, setAutoSeedPlan] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Validation errors
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  if (!isOpen) return null;

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      errors.title = 'Event title is required.';
    } else if (trimmedTitle.length > 120) {
      errors.title = 'Title must be 120 characters or fewer.';
    }

    if (location && location.length > 200) {
      errors.location = 'Location must be 200 characters or fewer.';
    }

    const guestsNum = parseInt(targetGuests, 10);
    if (isNaN(guestsNum) || guestsNum < 0 || guestsNum > 100000) {
      errors.guests = 'Guest count must be an integer between 0 and 100,000.';
    }

    const budgetNum = parseFloat(totalBudget);
    if (isNaN(budgetNum) || budgetNum < 0) {
      errors.budget = 'Budget must be greater than or equal to 0.';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const budgetNum = Math.max(0, parseFloat(totalBudget) || 0);
      const guestsNum = Math.max(0, parseInt(targetGuests, 10) || 0);
      const eventDate = date ? date.trim() : null;

      let budgetItems: BudgetItem[] = [];
      let tasks: TaskItem[] = [];
      let ruleBasedPlan: any = undefined;

      if (autoSeedPlan) {
        try {
          const plan = await generatePlan({
            event_type: category,
            budget: budgetNum,
            guest_count: guestsNum,
            event_date: eventDate,
          });

          ruleBasedPlan = {
            warnings: plan.warnings,
            per_guest_cost: plan.per_guest_cost,
            days_until_event: plan.days_until_event,
            total_budget: plan.total_budget,
            guest_count: plan.guest_count,
            generated_by: plan.generated_by,
          };

          if (Array.isArray(plan.budget_breakdown)) {
            budgetItems = plan.budget_breakdown.map((item) => ({
              id: crypto.randomUUID(),
              description: `${item.category} (${item.percentage}%)`,
              category: 'Other',
              allocatedAmount: item.amount,
              actualAmount: 0,
              paidAmount: 0,
              isPaid: false,
            }));
          }

          if (Array.isArray(plan.checklist)) {
            for (const section of plan.checklist) {
              const phase = section.phase || 'General';
              const priority = phase.toLowerCase().includes('week') ? 'high' : 'medium';
              for (const t of section.tasks || []) {
                tasks.push({
                  id: crypto.randomUUID(),
                  title: t.task,
                  category: phase,
                  priority,
                  dueDate: eventDate || '',
                  completed: Boolean(t.done),
                });
              }
            }
          }
        } catch (planErr) {
          console.warn('Could not auto-generate starter plan, continuing with empty plan:', planErr);
        }
      }

      await onCreate({
        title: title.trim(),
        category,
        date: eventDate,
        startTime: startTime || '10:00',
        endTime: endTime || '18:00',
        venueName: venueName.trim(),
        location: location.trim() ? location.trim() : null,
        description: description.trim(),
        hostName: hostName.trim(),
        hostEmail: hostEmail.trim(),
        totalBudget: budgetNum,
        targetGuests: guestsNum,
        budgetItems,
        tasks,
        ruleBasedPlan,
      });

      onClose();
    } catch (err: any) {
      console.error('Failed to create event:', err);
      setErrorMessage(err.message || 'Failed to create event on server. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const categories: EventCategory[] = ['wedding', 'birthday', 'community'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-[16px] border border-[#E5E7EB] shadow-surface-modal w-full max-w-2xl my-8 p-6 sm:p-8 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-4 border-b border-[#E5E7EB] mb-6">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#EDE9FE] text-[#4B2FC9] flex items-center justify-center font-bold">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#111827]">Create New Event</h2>
              <p className="text-xs text-[#4B5563]">
                Set up your event plan with rule-based budget and checklist allocation
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-2 rounded-lg text-gray-400 hover:text-[#111827] hover:bg-[#F4F5FA] transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMessage && (
          <div className="mb-5 p-4 rounded-[12px] bg-rose-50 border border-rose-200 text-xs text-rose-900 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Category Select Chips (strictly wedding, birthday, community) */}
          <div>
            <label className="block text-xs font-semibold text-[#111827] uppercase tracking-wider mb-2">
              Event Category *
            </label>
            <div className="flex flex-wrap gap-2.5">
              {categories.map((cat) => {
                const isSelected = category === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`cursor-pointer transition-transform duration-100 ${
                      isSelected ? 'ring-2 ring-[#4B2FC9] scale-105' : 'opacity-70 hover:opacity-100'
                    }`}
                  >
                    <CategoryBadge category={cat} size="lg" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Event Title */}
          <div>
            <label className="block text-xs font-semibold text-[#111827] mb-1">
              Event Title (1-120 chars) *
            </label>
            <input
              type="text"
              required
              maxLength={120}
              placeholder="e.g. Rahul & Priya's Wedding Reception"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={`w-full h-11 px-3.5 bg-white border rounded-[10px] text-sm text-[#111827] focus:outline-none focus:ring-3 focus:ring-[#4B2FC9]/15 ${
                validationErrors.title ? 'border-rose-500' : 'border-[#E5E7EB] focus:border-[#4B2FC9]'
              }`}
            />
            {validationErrors.title && (
              <p className="text-xs text-rose-600 mt-1">{validationErrors.title}</p>
            )}
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#111827] mb-1">
                Date (Optional)
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full h-11 px-3.5 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] focus:outline-none focus:border-[#4B2FC9]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#111827] mb-1">
                Start Time
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full h-11 px-3.5 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] focus:outline-none focus:border-[#4B2FC9]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#111827] mb-1">
                End Time
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full h-11 px-3.5 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] focus:outline-none focus:border-[#4B2FC9]"
              />
            </div>
          </div>

          {/* Venue & Location */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#111827] mb-1">
                Venue Name
              </label>
              <input
                type="text"
                placeholder="e.g. Royal Orchid Convention Center"
                value={venueName}
                onChange={(e) => setVenueName(e.target.value)}
                className="w-full h-11 px-3.5 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] focus:outline-none focus:border-[#4B2FC9]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#111827] mb-1">
                City / Location (max 200 chars)
              </label>
              <input
                type="text"
                maxLength={200}
                placeholder="e.g. Bengaluru, Karnataka"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className={`w-full h-11 px-3.5 bg-white border rounded-[10px] text-sm text-[#111827] focus:outline-none ${
                  validationErrors.location ? 'border-rose-500' : 'border-[#E5E7EB] focus:border-[#4B2FC9]'
                }`}
              />
              {validationErrors.location && (
                <p className="text-xs text-rose-600 mt-1">{validationErrors.location}</p>
              )}
            </div>
          </div>

          {/* Targets: Budget & Guest Count */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#111827] mb-1">
                Total Target Budget (INR) *
              </label>
              <input
                type="number"
                min="0"
                step="1"
                required
                value={totalBudget}
                onChange={(e) => setTotalBudget(e.target.value)}
                className={`w-full h-11 px-3.5 bg-white border rounded-[10px] text-sm text-[#111827] focus:outline-none ${
                  validationErrors.budget ? 'border-rose-500' : 'border-[#E5E7EB] focus:border-[#4B2FC9]'
                }`}
              />
              {validationErrors.budget && (
                <p className="text-xs text-rose-600 mt-1">{validationErrors.budget}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#111827] mb-1">
                Target Guest Capacity (0-100,000) *
              </label>
              <input
                type="number"
                min="0"
                max="100000"
                step="1"
                required
                value={targetGuests}
                onChange={(e) => setTargetGuests(e.target.value)}
                className={`w-full h-11 px-3.5 bg-white border rounded-[10px] text-sm text-[#111827] focus:outline-none ${
                  validationErrors.guests ? 'border-rose-500' : 'border-[#E5E7EB] focus:border-[#4B2FC9]'
                }`}
              />
              {validationErrors.guests && (
                <p className="text-xs text-rose-600 mt-1">{validationErrors.guests}</p>
              )}
            </div>
          </div>

          {/* Host info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#111827] mb-1">
                Host Name(s)
              </label>
              <input
                type="text"
                placeholder="e.g. Rahul Sharma"
                value={hostName}
                onChange={(e) => setHostName(e.target.value)}
                className="w-full h-11 px-3.5 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] focus:outline-none focus:border-[#4B2FC9]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#111827] mb-1">
                Host Contact Email
              </label>
              <input
                type="email"
                placeholder="rahul@example.com"
                value={hostEmail}
                onChange={(e) => setHostEmail(e.target.value)}
                className="w-full h-11 px-3.5 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] focus:outline-none focus:border-[#4B2FC9]"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-[#111827] mb-1">
              Event Notes & Description
            </label>
            <textarea
              rows={2}
              placeholder="Ceremony schedule notes, dress code, traditions..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full p-3 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] focus:outline-none focus:border-[#4B2FC9]"
            />
          </div>

          {/* Rule-based auto-starter checklist */}
          <div className="p-3.5 rounded-[12px] bg-[#EDE9FE]/50 border border-[#DDD6FE] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <ListChecks className="w-5 h-5 text-[#4B2FC9] shrink-0" />
              <div>
                <span className="text-xs font-bold text-[#111827] block">
                  Auto-Allocate Initial Budget & Checklist
                </span>
                <span className="text-[11px] text-[#4B5563]">
                  Uses backend rule-based planner to pre-fill budget breakdown and phase checklist
                </span>
              </div>
            </div>

            <input
              type="checkbox"
              id="autoPlanCheckbox"
              checked={autoSeedPlan}
              onChange={(e) => setAutoSeedPlan(e.target.checked)}
              className="w-5 h-5 rounded text-[#4B2FC9] focus:ring-[#4B2FC9] cursor-pointer"
            />
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E5E7EB]">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-5 h-11 rounded-[12px] bg-white border border-[#E5E7EB] text-sm font-semibold text-[#111827] hover:bg-[#F9FAFB] cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 h-11 rounded-[12px] bg-[#4B2FC9] hover:bg-[#3C24A4] active:scale-[0.98] text-sm font-semibold text-white shadow-sm cursor-pointer disabled:opacity-50 inline-flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Creating Event...</span>
                </>
              ) : (
                <span>Create Event</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
