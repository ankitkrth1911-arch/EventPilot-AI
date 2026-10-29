import React from 'react';
import { EventItem, CATEGORY_THEMES } from '../types/event';
import { CategoryBadge } from './CategoryBadge';
import {
  calculateDaysRemaining,
  calculateRsvpStats,
  calculateBudgetSummary,
  calculateTaskProgress,
  formatCurrency,
} from '../utils/eventCalculations';
import { Calendar, Clock, MapPin, CheckCircle, Users, ArrowRight } from 'lucide-react';

interface EventCardProps {
  event: EventItem;
  onSelect: (event: EventItem) => void;
  onPreviewRsvp: (event: EventItem) => void;
}

export const EventCard: React.FC<EventCardProps> = ({
  event,
  onSelect,
  onPreviewRsvp,
}) => {
  const theme = CATEGORY_THEMES[event.category] || CATEGORY_THEMES.wedding;
  const countdown = calculateDaysRemaining(event.date || '2099-01-01');
  const rsvp = calculateRsvpStats(event.guests, event.targetGuests);
  const budget = calculateBudgetSummary(event.totalBudget, event.budgetItems);
  const tasks = calculateTaskProgress(event.tasks);

  // Format friendly date
  let formattedDate = event.date || 'Date TBD';
  if (event.date) {
    const [year, month, day] = event.date.split('-').map(Number);
    if (year && month && day) {
      const dateObj = new Date(year, month - 1, day);
      formattedDate = dateObj.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }
  }

  return (
    <div
      onClick={() => onSelect(event)}
      className="group relative bg-white rounded-[16px] border border-[#E5E7EB] overflow-hidden shadow-surface-card hover:shadow-surface-hover hover:-translate-y-0.5 transition-all duration-200 cursor-pointer flex flex-col justify-between"
      role="button"
      tabIndex={0}
      aria-label={`View details for ${event.title}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(event);
        }
      }}
    >
      {/* Top 4px accent line matching the event type's signature color */}
      <div
        className="h-1 w-full"
        style={{ backgroundColor: theme.topAccentColor }}
      />

      <div className="p-6 flex-1 flex flex-col justify-between">
        <div>
          {/* Top badges bar */}
          <div className="flex items-center justify-between gap-2 mb-3">
            <CategoryBadge category={event.category} size="md" />

            <span
              className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                countdown.isToday
                  ? 'bg-rose-100 text-rose-700 animate-pulse'
                  : countdown.isPast
                  ? 'bg-gray-100 text-gray-600'
                  : 'bg-[#F4F5FA] text-[#4B5563] border border-[#E5E7EB]'
              }`}
            >
              {countdown.label}
            </span>
          </div>

          {/* Event Title */}
          <h3 className="text-lg font-bold text-[#111827] group-hover:text-[#4B2FC9] transition-colors leading-snug line-clamp-1 mb-2">
            {event.title}
          </h3>

          <p className="text-xs text-[#4B5563] line-clamp-2 mb-4 leading-relaxed">
            {event.description}
          </p>

          {/* Logistics meta */}
          <div className="space-y-1.5 text-xs text-[#4B5563] mb-5">
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-[#9CA3AF] shrink-0" />
              <span className="font-medium text-[#111827]">{formattedDate}</span>
              <span className="text-[#9CA3AF]">•</span>
              <Clock className="w-3.5 h-3.5 text-[#9CA3AF] shrink-0 ml-1" />
              <span>{event.startTime} - {event.endTime}</span>
            </div>

            <div className="flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 text-[#9CA3AF] shrink-0" />
              <span className="truncate">{event.venueName}, {event.location}</span>
            </div>
          </div>
        </div>

        <div>
          {/* Quick Metrics Split: RSVPs & Tasks */}
          <div className="pt-4 border-t border-[#E5E7EB] grid grid-cols-2 gap-3 mb-4">
            <div className="bg-[#F4F5FA] rounded-[10px] p-2.5">
              <div className="flex items-center justify-between text-xs text-[#4B5563] mb-1">
                <span className="flex items-center gap-1 font-medium">
                  <Users className="w-3 h-3 text-[#4B2FC9]" /> Guests
                </span>
                <span className="font-bold text-[#111827]">
                  {rsvp.totalAttendingHeadcount}/{event.targetGuests}
                </span>
              </div>
              <div className="w-full bg-[#E5E7EB] rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${rsvp.percentOfCapacity}%`,
                    backgroundColor: theme.primaryColor,
                  }}
                />
              </div>
            </div>

            <div className="bg-[#F4F5FA] rounded-[10px] p-2.5">
              <div className="flex items-center justify-between text-xs text-[#4B5563] mb-1">
                <span className="flex items-center gap-1 font-medium">
                  <CheckCircle className="w-3 h-3 text-[#0D9488]" /> Tasks
                </span>
                <span className="font-bold text-[#111827]">
                  {tasks.completed}/{tasks.total}
                </span>
              </div>
              <div className="w-full bg-[#E5E7EB] rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full bg-[#0D9488] rounded-full transition-all duration-500"
                  style={{ width: `${tasks.percentage}%` }}
                />
              </div>
            </div>
          </div>

          {/* Budget row & Footer Actions */}
          <div className="flex items-center justify-between text-xs pt-1">
            <div>
              <span className="text-[#9CA3AF] uppercase font-semibold text-[10px] tracking-wider block">
                Budget Allocated
              </span>
              <span className="font-bold text-sm text-[#111827]">
                {formatCurrency(budget.totalActual, event.currency)}{' '}
                <span className="text-[#9CA3AF] font-normal text-xs">
                  / {formatCurrency(budget.totalBudget, event.currency)}
                </span>
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPreviewRsvp(event);
                }}
                className="px-2.5 py-1.5 text-xs font-semibold text-[#4B2FC9] hover:bg-[#EDE9FE] rounded-[8px] transition-colors"
                title="Preview guest invitation & RSVP portal"
              >
                RSVP Link
              </button>

              <div className="w-8 h-8 rounded-full bg-[#EDE9FE] text-[#4B2FC9] flex items-center justify-center group-hover:bg-[#4B2FC9] group-hover:text-white transition-colors">
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
