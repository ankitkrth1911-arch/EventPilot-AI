import React, { useState } from 'react';
import { EventItem, CATEGORY_THEMES } from '../types/event';
import { CategoryBadge } from './CategoryBadge';
import { calculateDaysRemaining } from '../utils/eventCalculations';
import { TimelineTab } from './tabs/TimelineTab';
import { BudgetTab } from './tabs/BudgetTab';
import { GuestsTab } from './tabs/GuestsTab';
import { TasksTab } from './tabs/TasksTab';
import { VendorsTab } from './tabs/VendorsTab';
import {
  Calendar,
  Clock,
  MapPin,
  ArrowLeft,
  ExternalLink,
  Download,
  CalendarCheck,
  DollarSign,
  Users,
  CheckSquare,
  Building2,
  Trash2,
} from 'lucide-react';

interface EventDetailProps {
  event: EventItem;
  onBack: () => void;
  onUpdateEvent: (updated: EventItem) => void;
  onOpenGuestPortal: () => void;
  onDeleteEvent: (id: string) => Promise<void> | void;
}

export const EventDetail: React.FC<EventDetailProps> = ({
  event,
  onBack,
  onUpdateEvent,
  onOpenGuestPortal,
  onDeleteEvent,
}) => {
  const [activeTab, setActiveTab] = useState<
    'timeline' | 'budget' | 'guests' | 'tasks' | 'vendors'
  >('timeline');
  const [isDeleting, setIsDeleting] = useState(false);

  const theme = CATEGORY_THEMES[event.category] || CATEGORY_THEMES.wedding;
  const countdown = calculateDaysRemaining(event.date || '2099-01-01');

  let formattedDate = event.date || 'Date to be announced';
  if (event.date) {
    const [year, month, day] = event.date.split('-').map(Number);
    if (year && month && day) {
      formattedDate = new Date(year, month - 1, day).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    }
  }

  const handleExportRunOfShow = () => {
    let output = `# ${event.title}\n`;
    output += `Date: ${formattedDate} (${event.startTime} - ${event.endTime})\n`;
    output += `Venue: ${event.venueName}, ${event.location}\n`;
    output += `Host: ${event.hostName} (${event.hostEmail})\n\n`;
    output += `## Run of Show & Timeline\n`;
    event.timeline.forEach((item) => {
      output += `- [${item.time}${item.endTime ? ` - ${item.endTime}` : ''}] ${item.title} (${item.phase})\n`;
      if (item.location) output += `  Location: ${item.location}\n`;
      if (item.assignedTo) output += `  Lead: ${item.assignedTo}\n`;
      if (item.description) output += `  Notes: ${item.description}\n`;
    });

    const blob = new Blob([output], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${event.title.replace(/\s+/g, '_')}_RunOfShow.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async () => {
    const ok = window.confirm(`Are you sure you want to delete "${event.title}"? This action cannot be undone.`);
    if (!ok) return;

    setIsDeleting(true);
    try {
      await onDeleteEvent(event.id);
    } finally {
      setIsDeleting(false);
    }
  };

  const tabs = [
    {
      id: 'timeline',
      label: 'Itinerary & Schedule',
      icon: <CalendarCheck className="w-4 h-4" />,
      count: event.timeline.length,
    },
    {
      id: 'budget',
      label: 'Budget & Ledger',
      icon: <DollarSign className="w-4 h-4" />,
      count: event.budgetItems.length,
    },
    {
      id: 'guests',
      label: 'Guests & RSVPs',
      icon: <Users className="w-4 h-4" />,
      count: event.guests.length,
    },
    {
      id: 'tasks',
      label: 'Run-of-Show Tasks',
      icon: <CheckSquare className="w-4 h-4" />,
      count: event.tasks.length,
    },
    {
      id: 'vendors',
      label: 'Vendors & Partners',
      icon: <Building2 className="w-4 h-4" />,
      count: event.vendors.length,
    },
  ] as const;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Back button & Actions Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-semibold text-[#4B5563] hover:text-[#111827] px-3 py-1.5 rounded-[8px] hover:bg-white border border-transparent hover:border-[#E5E7EB] transition-all cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to All Events</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportRunOfShow}
            className="inline-flex items-center gap-1.5 px-3.5 h-10 rounded-[10px] bg-white border border-[#E5E7EB] text-xs font-semibold text-[#111827] hover:bg-[#F9FAFB] shadow-xs transition-colors cursor-pointer"
            title="Download formatted Run-of-Show document"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export Run-of-Show</span>
          </button>

          {/* Guest portal launch button */}
          <button
            onClick={onOpenGuestPortal}
            className="inline-flex items-center gap-1.5 px-4 h-10 rounded-[10px] bg-[#EDE9FE] hover:bg-[#DDD6FE] text-[#4B2FC9] text-xs font-bold border border-[#DDD6FE] transition-colors cursor-pointer shadow-xs"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Guest RSVP Portal Preview</span>
          </button>

          {/* Delete event button */}
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="inline-flex items-center gap-1.5 px-3 h-10 rounded-[10px] bg-white hover:bg-rose-50 text-rose-600 text-xs font-semibold border border-rose-200 transition-colors cursor-pointer disabled:opacity-50"
            title="Delete this event"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{isDeleting ? 'Deleting...' : 'Delete Event'}</span>
          </button>
        </div>
      </div>

      {/* Main Event Title Banner Card */}
      <div className="relative bg-white rounded-[16px] border border-[#E5E7EB] overflow-hidden shadow-surface-card">
        {/* Top 4px signature accent line */}
        <div
          className="h-1 w-full"
          style={{ backgroundColor: theme.topAccentColor }}
        />

        <div className="p-6 sm:p-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <CategoryBadge category={event.category} size="lg" />

              {event.date && (
                <span
                  className={`text-xs font-bold px-3 py-1 rounded-full ${
                    countdown.isToday
                      ? 'bg-rose-100 text-rose-700 animate-pulse'
                      : countdown.isPast
                      ? 'bg-gray-100 text-gray-600'
                      : 'bg-[#EDE9FE] text-[#4B2FC9] border border-[#DDD6FE]'
                  }`}
                >
                  {countdown.label}
                </span>
              )}
            </div>

            {event.hostName && (
              <div className="text-xs text-[#9CA3AF]">
                Host: <strong className="text-[#111827]">{event.hostName}</strong>
              </div>
            )}
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#111827] tracking-tight mb-3">
            {event.title}
          </h1>

          {event.description && (
            <p className="text-sm text-[#4B5563] max-w-3xl leading-relaxed mb-6">
              {event.description}
            </p>
          )}

          {/* Event Meta Ribbon */}
          <div className="flex flex-wrap items-center gap-6 text-xs text-[#4B5563] pt-4 border-t border-[#E5E7EB]">
            <div className="flex items-center gap-2 font-semibold text-[#111827]">
              <Calendar className="w-4 h-4 text-[#4B2FC9]" />
              <span>{formattedDate}</span>
            </div>

            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#0D9488]" />
              <span>
                {event.startTime} - {event.endTime}
              </span>
            </div>

            {(event.venueName || event.location) && (
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#D97706]" />
                <span className="font-medium text-[#111827]">
                  {event.venueName || event.location}
                </span>
                {event.venueName && event.location && (
                  <span className="text-[#9CA3AF]">({event.location})</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Navigation Tabs Bar */}
      <div className="flex items-center gap-2 border-b border-[#E5E7EB] overflow-x-auto no-scrollbar pb-1">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 text-xs sm:text-sm font-semibold transition-all shrink-0 cursor-pointer ${
                isActive
                  ? 'border-[#4B2FC9] text-[#4B2FC9] bg-white rounded-t-[10px] shadow-xs'
                  : 'border-transparent text-[#4B5563] hover:text-[#111827] hover:border-[#E5E7EB]'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full ${
                  isActive
                    ? 'bg-[#EDE9FE] text-[#4B2FC9]'
                    : 'bg-[#F4F5FA] text-[#9CA3AF]'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      <div className="pt-2">
        {activeTab === 'timeline' && (
          <TimelineTab event={event} onUpdateEvent={onUpdateEvent} />
        )}
        {activeTab === 'budget' && (
          <BudgetTab event={event} onUpdateEvent={onUpdateEvent} />
        )}
        {activeTab === 'guests' && (
          <GuestsTab
            event={event}
            onUpdateEvent={onUpdateEvent}
            onOpenGuestPortal={onOpenGuestPortal}
          />
        )}
        {activeTab === 'tasks' && (
          <TasksTab event={event} onUpdateEvent={onUpdateEvent} />
        )}
        {activeTab === 'vendors' && (
          <VendorsTab event={event} onUpdateEvent={onUpdateEvent} />
        )}
      </div>
    </div>
  );
};
