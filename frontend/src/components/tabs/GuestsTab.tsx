import React, { useState } from 'react';
import { EventItem, Guest } from '../../types/event';
import { calculateRsvpStats, calculateDaysRemaining } from '../../utils/eventCalculations';
import { generateRsvpMessage } from '../../services/aiPlanner';
import {
  Plus,
  Search,
  Mail,
  Copy,
  Check,
  Users,
  Utensils,
  CheckCircle,
  XCircle,
  Clock,
  Trash2,
  Sparkles,
} from 'lucide-react';

interface GuestsTabProps {
  event: EventItem;
  onUpdateEvent: (updated: EventItem) => void;
  onOpenGuestPortal: () => void;
}

export const GuestsTab: React.FC<GuestsTabProps> = ({
  event,
  onUpdateEvent,
  onOpenGuestPortal,
}) => {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'attending' | 'pending' | 'declined'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAiReminderModal, setShowAiReminderModal] = useState(false);
  const [selectedGuestForReminder, setSelectedGuestForReminder] = useState<Guest | null>(null);
  const [copiedType, setCopiedType] = useState<'email' | 'sms' | null>(null);

  const [newGuest, setNewGuest] = useState({
    name: '',
    email: '',
    status: 'pending' as Guest['status'],
    plusOnes: 0,
    dietaryRestrictions: '',
    tableNumber: '',
    notes: '',
  });

  const stats = calculateRsvpStats(event.guests, event.targetGuests);
  const countdown = calculateDaysRemaining(event.date);

  const filteredGuests = event.guests.filter((g) => {
    const matchesSearch =
      g.name.toLowerCase().includes(search.toLowerCase()) ||
      g.email.toLowerCase().includes(search.toLowerCase()) ||
      (g.dietaryRestrictions && g.dietaryRestrictions.toLowerCase().includes(search.toLowerCase()));

    const matchesStatus = filterStatus === 'all' || g.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  // Collect dietary restriction summary
  const dietaryCounts: Record<string, number> = {};
  for (const g of event.guests) {
    if (g.status === 'attending' && g.dietaryRestrictions && g.dietaryRestrictions !== 'None') {
      const diet = g.dietaryRestrictions;
      dietaryCounts[diet] = (dietaryCounts[diet] || 0) + (1 + g.plusOnes);
    }
  }

  const handleUpdateStatus = (id: string, status: Guest['status']) => {
    const updated = event.guests.map((g) => (g.id === id ? { ...g, status } : g));
    onUpdateEvent({ ...event, guests: updated });
  };

  const handleDeleteGuest = (id: string) => {
    const updated = event.guests.filter((g) => g.id !== id);
    onUpdateEvent({ ...event, guests: updated });
  };

  const handleAddGuest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGuest.name.trim()) return;

    const guest: Guest = {
      id: crypto.randomUUID(),
      name: newGuest.name.trim(),
      email: newGuest.email.trim(),
      status: newGuest.status,
      plusOnes: Number(newGuest.plusOnes) || 0,
      dietaryRestrictions: newGuest.dietaryRestrictions.trim() || undefined,
      tableNumber: newGuest.tableNumber.trim() || undefined,
      invitedDate: new Date().toISOString().split('T')[0],
      notes: newGuest.notes.trim() || undefined,
    };

    onUpdateEvent({
      ...event,
      guests: [...event.guests, guest],
    });

    setShowAddModal(false);
    setNewGuest({
      name: '',
      email: '',
      status: 'pending',
      plusOnes: 0,
      dietaryRestrictions: '',
      tableNumber: '',
      notes: '',
    });
  };

  const handleOpenReminder = (guest?: Guest) => {
    const target = guest || event.guests.find((g) => g.status === 'pending') || event.guests[0];
    setSelectedGuestForReminder(target || null);
    setShowAiReminderModal(true);
  };

  const copyToClipboard = (text: string, type: 'email' | 'sms') => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  const aiMessage = selectedGuestForReminder
    ? generateRsvpMessage(event, selectedGuestForReminder.name, countdown.days)
    : null;

  return (
    <div className="space-y-6">
      {/* RSVP Metrics Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-[16px] border border-[#E5E7EB] p-5 shadow-surface-card">
          <div className="flex items-center justify-between text-xs text-[#4B5563] mb-1 font-semibold uppercase">
            <span>Attending</span>
            <CheckCircle className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-[#111827]">
            {stats.totalAttendingHeadcount}
          </div>
          <span className="text-xs text-[#9CA3AF]">
            {stats.attendingCount} parties ({stats.percentOfCapacity}% capacity)
          </span>
        </div>

        <div className="bg-white rounded-[16px] border border-[#E5E7EB] p-5 shadow-surface-card">
          <div className="flex items-center justify-between text-xs text-[#4B5563] mb-1 font-semibold uppercase">
            <span>Pending RSVP</span>
            <Clock className="w-4 h-4 text-[#D97706]" />
          </div>
          <div className="text-2xl font-bold text-[#D97706]">
            {stats.pendingCount}
          </div>
          <span className="text-xs text-[#9CA3AF]">Awaiting reply</span>
        </div>

        <div className="bg-white rounded-[16px] border border-[#E5E7EB] p-5 shadow-surface-card">
          <div className="flex items-center justify-between text-xs text-[#4B5563] mb-1 font-semibold uppercase">
            <span>Declined</span>
            <XCircle className="w-4 h-4 text-[#9CA3AF]" />
          </div>
          <div className="text-2xl font-bold text-[#9CA3AF]">
            {stats.declinedCount}
          </div>
          <span className="text-xs text-[#9CA3AF]">Unable to attend</span>
        </div>

        <div className="bg-white rounded-[16px] border border-[#E5E7EB] p-5 shadow-surface-card">
          <div className="flex items-center justify-between text-xs text-[#4B5563] mb-1 font-semibold uppercase">
            <span>Target Capacity</span>
            <Users className="w-4 h-4 text-[#4B2FC9]" />
          </div>
          <div className="text-2xl font-bold text-[#4B2FC9]">
            {event.targetGuests}
          </div>
          <span className="text-xs text-[#9CA3AF]">Maximum guests</span>
        </div>
      </div>

      {/* Dietary Restrictions Alert Bar */}
      {Object.keys(dietaryCounts).length > 0 && (
        <div className="bg-white rounded-[16px] border border-[#E5E7EB] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-surface-card">
          <div className="flex items-center gap-2 text-xs font-bold text-[#111827]">
            <Utensils className="w-4 h-4 text-[#4B2FC9]" />
            <span>Catering Dietary Alerts:</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {Object.entries(dietaryCounts).map(([diet, count]) => (
              <span
                key={diet}
                className="text-xs px-2.5 py-1 rounded-full bg-[#EDE9FE] text-[#4B2FC9] font-medium border border-[#DDD6FE]"
              >
                {diet}: <strong>{count} guests</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Controls Bar */}
      <div className="bg-white rounded-[16px] border border-[#E5E7EB] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-surface-card">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" />
          <input
            type="text"
            placeholder="Search guests by name or diet..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-9 pr-3.5 bg-[#F4F5FA] border border-[#E5E7EB] rounded-[10px] text-xs text-[#111827] focus:outline-none focus:border-[#4B2FC9]"
          />
        </div>

        {/* Status filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {(['all', 'attending', 'pending', 'declined'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition-all cursor-pointer ${
                filterStatus === st
                  ? 'bg-[#4B2FC9] text-white shadow-xs'
                  : 'bg-[#F4F5FA] text-[#4B5563] hover:text-[#111827]'
              }`}
            >
              {st} {st !== 'all' ? `(${event.guests.filter((g) => g.status === st).length})` : ''}
            </button>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            onClick={() => handleOpenReminder()}
            className="inline-flex items-center gap-1.5 px-3.5 h-10 rounded-[10px] bg-[#EDE9FE] text-[#4B2FC9] hover:bg-[#DDD6FE] text-xs font-semibold border border-[#DDD6FE] transition-colors cursor-pointer"
            title="Compose reminder message for pending guests"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">RSVP Reminder</span>
          </button>

          <button
            onClick={onOpenGuestPortal}
            className="inline-flex items-center gap-1.5 px-3.5 h-10 rounded-[10px] bg-white text-[#111827] hover:bg-[#F9FAFB] text-xs font-semibold border border-[#E5E7EB] transition-colors cursor-pointer"
          >
            <span>Live Guest Portal</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 px-4 h-10 rounded-[10px] bg-[#4B2FC9] hover:bg-[#3C24A4] active:scale-[0.98] text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Add Guest</span>
          </button>
        </div>
      </div>

      {/* Guest Table */}
      <div className="bg-white rounded-[16px] border border-[#E5E7EB] overflow-hidden shadow-surface-card">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F4F5FA] text-[#4B5563] uppercase tracking-wider font-semibold border-b border-[#E5E7EB]">
              <tr>
                <th className="py-3.5 px-5">Guest Name</th>
                <th className="py-3.5 px-4">Contact</th>
                <th className="py-3.5 px-4 text-center">RSVP Status</th>
                <th className="py-3.5 px-4 text-center">Party (+1s)</th>
                <th className="py-3.5 px-4">Dietary Notes</th>
                <th className="py-3.5 px-4">Table / Seating</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {filteredGuests.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#9CA3AF]">
                    No guests match your criteria.
                  </td>
                </tr>
              ) : (
                filteredGuests.map((guest) => (
                  <tr key={guest.id} className="hover:bg-[#F9FAFB] transition-colors">
                    <td className="py-3.5 px-5">
                      <div className="font-bold text-[#111827]">{guest.name}</div>
                      {guest.notes && (
                        <div className="text-[11px] text-[#9CA3AF] italic">{guest.notes}</div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-[#4B5563]">{guest.email || '—'}</td>
                    <td className="py-3.5 px-4 text-center">
                      <select
                        value={guest.status}
                        onChange={(e) =>
                          handleUpdateStatus(guest.id, e.target.value as Guest['status'])
                        }
                        className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border cursor-pointer focus:outline-none ${
                          guest.status === 'attending'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : guest.status === 'declined'
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}
                      >
                        <option value="attending">✓ Attending</option>
                        <option value="pending">⏳ Pending</option>
                        <option value="declined">✕ Declined</option>
                      </select>
                    </td>
                    <td className="py-3.5 px-4 text-center font-bold text-[#111827]">
                      {1 + guest.plusOnes}{' '}
                      {guest.plusOnes > 0 && (
                        <span className="text-[10px] text-[#9CA3AF] font-normal">
                          (+{guest.plusOnes})
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      {guest.dietaryRestrictions && guest.dietaryRestrictions !== 'None' ? (
                        <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 font-medium text-[11px] border border-rose-200">
                          {guest.dietaryRestrictions}
                        </span>
                      ) : (
                        <span className="text-[#9CA3AF]">None</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-[#4B5563]">
                      {guest.tableNumber || 'Unassigned'}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {guest.status === 'pending' && (
                          <button
                            onClick={() => handleOpenReminder(guest)}
                            className="p-1.5 text-[#4B2FC9] hover:bg-[#EDE9FE] rounded-md transition-colors cursor-pointer"
                            title="Compose AI reminder"
                          >
                            <Mail className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteGuest(guest.id)}
                          className="p-1.5 text-gray-400 hover:text-rose-600 rounded-md transition-colors cursor-pointer"
                          title="Remove guest"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Guest Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-[16px] border border-[#E5E7EB] shadow-surface-modal w-full max-w-lg p-6 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-[#111827] mb-1">Add Guest</h3>
            <p className="text-xs text-[#4B5563] mb-4">
              Enter attendee contact details, dietary notes, and party count.
            </p>

            <form onSubmit={handleAddGuest} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#111827] mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Dr. Maya Lin"
                    value={newGuest.name}
                    onChange={(e) => setNewGuest({ ...newGuest, name: e.target.value })}
                    className="w-full h-11 px-3.5 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] focus:outline-none focus:border-[#4B2FC9]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#111827] mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    placeholder="maya@example.com"
                    value={newGuest.email}
                    onChange={(e) => setNewGuest({ ...newGuest, email: e.target.value })}
                    className="w-full h-11 px-3.5 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] focus:outline-none focus:border-[#4B2FC9]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#111827] mb-1">
                    RSVP Status
                  </label>
                  <select
                    value={newGuest.status}
                    onChange={(e) =>
                      setNewGuest({ ...newGuest, status: e.target.value as Guest['status'] })
                    }
                    className="w-full h-11 px-3 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] focus:outline-none focus:border-[#4B2FC9]"
                  >
                    <option value="attending">Attending</option>
                    <option value="pending">Pending</option>
                    <option value="declined">Declined</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#111827] mb-1">
                    Plus-Ones (+#)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={newGuest.plusOnes}
                    onChange={(e) =>
                      setNewGuest({ ...newGuest, plusOnes: Number(e.target.value) })
                    }
                    className="w-full h-11 px-3.5 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] focus:outline-none focus:border-[#4B2FC9]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#111827] mb-1">
                    Table / Seating
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Table 4"
                    value={newGuest.tableNumber}
                    onChange={(e) => setNewGuest({ ...newGuest, tableNumber: e.target.value })}
                    className="w-full h-11 px-3.5 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] focus:outline-none focus:border-[#4B2FC9]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#111827] mb-1">
                  Dietary Restrictions
                </label>
                <input
                  type="text"
                  placeholder="e.g. Vegetarian, Gluten-Free, Nut Allergy..."
                  value={newGuest.dietaryRestrictions}
                  onChange={(e) =>
                    setNewGuest({ ...newGuest, dietaryRestrictions: e.target.value })
                  }
                  className="w-full h-11 px-3.5 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] focus:outline-none focus:border-[#4B2FC9]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#111827] mb-1">
                  Private Notes
                </label>
                <input
                  type="text"
                  placeholder="e.g. Needs first-row wheelchair accessibility..."
                  value={newGuest.notes}
                  onChange={(e) => setNewGuest({ ...newGuest, notes: e.target.value })}
                  className="w-full h-11 px-3.5 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] focus:outline-none focus:border-[#4B2FC9]"
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
                  Save Guest
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AI RSVP Reminder Composer Modal */}
      {showAiReminderModal && aiMessage && selectedGuestForReminder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-[16px] border border-[#E5E7EB] shadow-surface-modal w-full max-w-xl p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2 text-sm font-bold text-[#4B2FC9] mb-1">
              <Sparkles className="w-4 h-4" />
              <span>RSVP Follow-Up Composer</span>
            </div>
            <h3 className="text-base font-bold text-[#111827] mb-1">
              Personalized Reminder for {selectedGuestForReminder.name}
            </h3>
            <p className="text-xs text-[#4B5563] mb-4">
              Gentle, celebratory follow-up draft tailored to lock in catering and seating numbers.
            </p>

            <div className="space-y-4">
              {/* Email draft */}
              <div className="bg-[#F4F5FA] rounded-[12px] p-4 border border-[#E5E7EB]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-[#111827] flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-[#4B2FC9]" /> Email Message Draft
                  </span>
                  <button
                    onClick={() =>
                      copyToClipboard(
                        `Subject: ${aiMessage.emailSubject}\n\n${aiMessage.emailBody}`,
                        'email'
                      )
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[8px] bg-white border border-[#DDD6FE] text-[#4B2FC9] text-xs font-semibold hover:bg-[#EDE9FE] cursor-pointer transition-colors"
                  >
                    {copiedType === 'email' ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-600" /> Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" /> Copy Email
                      </>
                    )}
                  </button>
                </div>

                <div className="text-xs text-[#111827] font-semibold mb-1">
                  Subject: {aiMessage.emailSubject}
                </div>
                <pre className="text-xs text-[#4B5563] whitespace-pre-wrap font-sans bg-white p-3 rounded-[8px] border border-[#E5E7EB] max-h-40 overflow-y-auto">
                  {aiMessage.emailBody}
                </pre>
              </div>

              {/* SMS draft */}
              <div className="bg-[#F4F5FA] rounded-[12px] p-4 border border-[#E5E7EB]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-[#111827]">
                    SMS / WhatsApp Quick Text
                  </span>
                  <button
                    onClick={() => copyToClipboard(aiMessage.smsText, 'sms')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[8px] bg-white border border-[#DDD6FE] text-[#4B2FC9] text-xs font-semibold hover:bg-[#EDE9FE] cursor-pointer transition-colors"
                  >
                    {copiedType === 'sms' ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-600" /> Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" /> Copy Text
                      </>
                    )}
                  </button>
                </div>
                <div className="text-xs text-[#4B5563] bg-white p-3 rounded-[8px] border border-[#E5E7EB]">
                  {aiMessage.smsText}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end pt-4 mt-4 border-t border-[#E5E7EB]">
              <button
                onClick={() => setShowAiReminderModal(false)}
                className="px-5 h-11 rounded-[12px] bg-[#4B2FC9] hover:bg-[#3C24A4] text-sm font-semibold text-white shadow-sm cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
