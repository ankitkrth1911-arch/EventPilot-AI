import React, { useState } from 'react';
import { EventItem, TimelineItem } from '../../types/event';
import { AiAssistantBlock } from './AiAssistantBlock';
import { Plus, Clock, MapPin, User, CheckCircle2, Circle, AlertCircle, Trash2 } from 'lucide-react';

interface TimelineTabProps {
  event: EventItem;
  onUpdateEvent: (updated: EventItem) => void;
}

export const TimelineTab: React.FC<TimelineTabProps> = ({ event, onUpdateEvent }) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItem, setNewItem] = useState({
    title: '',
    time: '14:00',
    endTime: '15:00',
    phase: 'Main Program' as TimelineItem['phase'],
    location: '',
    description: '',
    assignedTo: '',
  });

  const handleApplyAiTimeline = (newItems: TimelineItem[]) => {
    onUpdateEvent({
      ...event,
      timeline: newItems,
    });
  };

  const handleToggleStatus = (id: string) => {
    const nextStatusMap: Record<TimelineItem['status'], TimelineItem['status']> = {
      pending: 'in-progress',
      'in-progress': 'completed',
      completed: 'pending',
    };

    const updatedTimeline = event.timeline.map((item) => {
      if (item.id === id) {
        return { ...item, status: nextStatusMap[item.status] };
      }
      return item;
    });

    onUpdateEvent({ ...event, timeline: updatedTimeline });
  };

  const handleDeleteItem = (id: string) => {
    const updated = event.timeline.filter((item) => item.id !== id);
    onUpdateEvent({ ...event, timeline: updated });
  };

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.title.trim()) return;

    const created: TimelineItem = {
      id: crypto.randomUUID(),
      title: newItem.title.trim(),
      time: newItem.time,
      endTime: newItem.endTime || undefined,
      phase: newItem.phase,
      location: newItem.location.trim() || undefined,
      description: newItem.description.trim() || undefined,
      assignedTo: newItem.assignedTo.trim() || undefined,
      status: 'pending',
    };

    // Sort chronologically
    const combined = [...event.timeline, created].sort((a, b) => a.time.localeCompare(b.time));
    onUpdateEvent({ ...event, timeline: combined });
    setShowAddModal(false);
    setNewItem({
      title: '',
      time: '14:00',
      endTime: '15:00',
      phase: 'Main Program',
      location: '',
      description: '',
      assignedTo: '',
    });
  };

  const statusIcons = {
    pending: <Circle className="w-4 h-4 text-[#9CA3AF]" />,
    'in-progress': <AlertCircle className="w-4 h-4 text-[#D97706] animate-pulse" />,
    completed: <CheckCircle2 className="w-4 h-4 text-emerald-600 fill-emerald-50" />,
  };

  const statusLabels = {
    pending: 'Pending',
    'in-progress': 'Active Now',
    completed: 'Completed',
  };

  const statusBadgeClasses = {
    pending: 'bg-gray-100 text-[#4B5563] border-gray-200',
    'in-progress': 'bg-amber-50 text-amber-700 border-amber-200',
    completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  };

  return (
    <div>
      {/* AI Assistant Banner */}
      <AiAssistantBlock event={event} onApplyTimeline={handleApplyAiTimeline} />

      {/* Timeline Controls Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-[#111827]">
            Event Itinerary & Run-of-Show
          </h2>
          <p className="text-xs text-[#4B5563]">
            {event.timeline.length} scheduled milestones • Click status indicator to cycle state
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center justify-center gap-2 px-4 h-11 rounded-[12px] bg-[#4B2FC9] hover:bg-[#3C24A4] active:scale-[0.98] text-white text-xs font-semibold shadow-sm transition-all cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Add Milestone</span>
        </button>
      </div>

      {/* Timeline list */}
      {event.timeline.length === 0 ? (
        <div className="bg-white rounded-[16px] border border-[#E5E7EB] p-12 text-center shadow-surface-card">
          <Clock className="w-12 h-12 text-[#9CA3AF] mx-auto mb-3" />
          <h3 className="text-base font-bold text-[#111827]">No Milestones Scheduled</h3>
          <p className="text-xs text-[#4B5563] max-w-sm mx-auto mt-1 mb-4">
            Use the EventPilot smart planner above to auto-generate a schedule or add your first event milestone manually.
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 rounded-[10px] bg-[#4B2FC9] text-white text-xs font-semibold cursor-pointer"
          >
            Add Milestone
          </button>
        </div>
      ) : (
        <div className="relative pl-6 sm:pl-8 space-y-6 before:content-[''] before:absolute before:left-3 sm:before:left-4 before:top-3 before:bottom-3 before:w-0.5 before:bg-[#E5E7EB]">
          {event.timeline.map((item, idx) => (
            <div
              key={item.id || idx}
              className="relative group bg-white rounded-[16px] border border-[#E5E7EB] p-5 shadow-surface-card hover:shadow-surface-hover transition-all"
            >
              {/* Timeline dot */}
              <div
                onClick={() => handleToggleStatus(item.id)}
                className="absolute -left-[30px] sm:-left-[38px] top-6 w-7 h-7 rounded-full bg-white border-2 border-[#4B2FC9] flex items-center justify-center cursor-pointer shadow-sm group-hover:scale-110 transition-transform"
                title={`Click to mark ${item.status === 'completed' ? 'pending' : 'next status'}`}
              >
                {statusIcons[item.status]}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-sm text-[#4B2FC9] bg-[#EDE9FE] px-2.5 py-1 rounded-[8px]">
                    {item.time} {item.endTime ? `– ${item.endTime}` : ''}
                  </span>
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#F4F5FA] text-[#4B5563] border border-[#E5E7EB]">
                    {item.phase}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleStatus(item.id)}
                    className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-all cursor-pointer ${
                      statusBadgeClasses[item.status]
                    }`}
                  >
                    {statusLabels[item.status]}
                  </button>
                  <button
                    onClick={() => handleDeleteItem(item.id)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-600 rounded-md transition-all cursor-pointer"
                    title="Delete milestone"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <h4
                className={`text-base font-bold text-[#111827] mb-1 ${
                  item.status === 'completed' ? 'line-through text-[#9CA3AF]' : ''
                }`}
              >
                {item.title}
              </h4>

              {item.description && (
                <p className="text-xs text-[#4B5563] mb-3 leading-relaxed">
                  {item.description}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-4 text-xs text-[#9CA3AF] pt-2 border-t border-[#F4F5FA]">
                {item.location && (
                  <div className="flex items-center gap-1.5 text-[#4B5563]">
                    <MapPin className="w-3.5 h-3.5 text-[#4B2FC9]" />
                    <span>{item.location}</span>
                  </div>
                )}
                {item.assignedTo && (
                  <div className="flex items-center gap-1.5 text-[#4B5563]">
                    <User className="w-3.5 h-3.5 text-[#0D9488]" />
                    <span>Lead: {item.assignedTo}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Milestone Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-[16px] border border-[#E5E7EB] shadow-surface-modal w-full max-w-lg p-6 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-[#111827] mb-1">
              Add Timeline Milestone
            </h3>
            <p className="text-xs text-[#4B5563] mb-4">
              Specify the time, phase, and responsibilities for this run-of-show item.
            </p>

            <form onSubmit={handleAddItem} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#111827] mb-1">
                  Milestone Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Cocktail Hour & Sunset Photos"
                  value={newItem.title}
                  onChange={(e) => setNewItem({ ...newItem, title: e.target.value })}
                  className="w-full h-11 px-3.5 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] focus:outline-none focus:border-[#4B2FC9] focus:ring-3 focus:ring-[#4B2FC9]/15"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#111827] mb-1">
                    Start Time *
                  </label>
                  <input
                    type="time"
                    required
                    value={newItem.time}
                    onChange={(e) => setNewItem({ ...newItem, time: e.target.value })}
                    className="w-full h-11 px-3.5 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] focus:outline-none focus:border-[#4B2FC9]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#111827] mb-1">
                    End Time
                  </label>
                  <input
                    type="time"
                    value={newItem.endTime}
                    onChange={(e) => setNewItem({ ...newItem, endTime: e.target.value })}
                    className="w-full h-11 px-3.5 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] focus:outline-none focus:border-[#4B2FC9]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#111827] mb-1">
                    Phase
                  </label>
                  <select
                    value={newItem.phase}
                    onChange={(e) =>
                      setNewItem({ ...newItem, phase: e.target.value as TimelineItem['phase'] })
                    }
                    className="w-full h-11 px-3 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] focus:outline-none focus:border-[#4B2FC9]"
                  >
                    <option value="Pre-Event">Pre-Event</option>
                    <option value="Main Program">Main Program</option>
                    <option value="Reception">Reception</option>
                    <option value="Wrap-Up">Wrap-Up</option>
                    <option value="General">General</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#111827] mb-1">
                    Assigned Lead
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Lead Coordinator / DJ"
                    value={newItem.assignedTo}
                    onChange={(e) => setNewItem({ ...newItem, assignedTo: e.target.value })}
                    className="w-full h-11 px-3.5 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] focus:outline-none focus:border-[#4B2FC9]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#111827] mb-1">
                  Location / Specific Zone
                </label>
                <input
                  type="text"
                  placeholder="e.g. Lower Garden Courtyard"
                  value={newItem.location}
                  onChange={(e) => setNewItem({ ...newItem, location: e.target.value })}
                  className="w-full h-11 px-3.5 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] focus:outline-none focus:border-[#4B2FC9]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#111827] mb-1">
                  Notes / Special Instructions
                </label>
                <textarea
                  rows={2}
                  placeholder="Cue music, lighting cues, guest announcements..."
                  value={newItem.description}
                  onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                  className="w-full p-3 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] focus:outline-none focus:border-[#4B2FC9]"
                />
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
                  Save Milestone
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
