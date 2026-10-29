import React, { useState } from 'react';
import { EventItem, Guest, CATEGORY_THEMES } from '../types/event';
import { CategoryBadge } from './CategoryBadge';
import { calculateDaysRemaining } from '../utils/eventCalculations';
import confetti from 'canvas-confetti';
import {
  Calendar,
  Clock,
  MapPin,
  CheckCircle2,
  Heart,
  ArrowLeft,
  PartyPopper,
  Sparkles,
} from 'lucide-react';

interface GuestRsvpPortalProps {
  event: EventItem;
  onBack: () => void;
  onRsvpSubmitted: (guest: Guest) => void;
}

export const GuestRsvpPortal: React.FC<GuestRsvpPortalProps> = ({
  event,
  onBack,
  onRsvpSubmitted,
}) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [attending, setAttending] = useState<'attending' | 'declined'>('attending');
  const [plusOnes, setPlusOnes] = useState(0);
  const [dietary, setDietary] = useState('None');
  const [notes, setNotes] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const guest: Guest = {
      id: crypto.randomUUID(),
      name: name.trim(),
      email: email.trim() || `${name.toLowerCase().replace(/\s+/g, '.')}@guest.com`,
      status: attending,
      plusOnes: attending === 'attending' ? Number(plusOnes) : 0,
      dietaryRestrictions: dietary,
      invitedDate: new Date().toISOString().split('T')[0],
      notes: notes.trim() || undefined,
    };

    onRsvpSubmitted(guest);
    setIsSubmitted(true);

    if (attending === 'attending') {
      try {
        confetti({
          particleCount: 80,
          spread: 80,
          origin: { y: 0.6 },
          colors: ['#4B2FC9', '#EDE9FE', '#0D9488', '#D97706', '#F59E0B'],
        });
      } catch {
        // ignore
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F5FA] py-8 px-4 sm:px-6 lg:px-8">
      {/* Top back banner */}
      <div className="max-w-3xl mx-auto mb-6 flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-semibold text-[#4B5563] hover:text-[#111827] px-3 py-2 rounded-[8px] bg-white border border-[#E5E7EB] shadow-xs cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Event Dashboard</span>
        </button>

        <span className="text-xs font-semibold text-[#4B2FC9] bg-[#EDE9FE] px-3 py-1 rounded-full border border-[#DDD6FE]">
          Guest RSVP Portal
        </span>
      </div>

      {/* Main Celebration Invitation Card */}
      <div className="max-w-3xl mx-auto bg-white rounded-[24px] border border-[#E5E7EB] overflow-hidden shadow-surface-modal">
        {/* Top signature accent strip */}
        <div
          className="h-2 w-full"
          style={{ backgroundColor: theme.topAccentColor }}
        />

        {/* Hero header */}
        <div className="p-8 sm:p-12 text-center bg-gradient-to-b from-[#F4F5FA] to-white border-b border-[#E5E7EB]">
          <div className="inline-block mb-3">
            <CategoryBadge category={event.category} size="lg" />
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#111827] tracking-tight mb-3">
            {event.title}
          </h1>

          {event.description && (
            <p className="text-sm sm:text-base text-[#4B5563] max-w-xl mx-auto mb-6 leading-relaxed">
              {event.description}
            </p>
          )}

          {/* Countdown Pill Banner */}
          {event.date && (
            <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-[#EDE9FE] border border-[#DDD6FE] text-[#4B2FC9] text-sm font-bold shadow-xs">
              <Sparkles className="w-4 h-4" />
              <span>{countdown.label}</span>
            </div>
          )}
        </div>

        {/* Event Key Details Banner */}
        <div className="p-6 sm:p-8 bg-[#F4F5FA] border-b border-[#E5E7EB] grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
          <div>
            <Calendar className="w-5 h-5 text-[#4B2FC9] mx-auto mb-2" />
            <span className="text-xs text-[#9CA3AF] uppercase font-semibold block">Date</span>
            <span className="text-sm font-bold text-[#111827]">{formattedDate}</span>
          </div>

          <div>
            <Clock className="w-5 h-5 text-[#0D9488] mx-auto mb-2" />
            <span className="text-xs text-[#9CA3AF] uppercase font-semibold block">Schedule</span>
            <span className="text-sm font-bold text-[#111827]">
              {event.startTime} - {event.endTime}
            </span>
          </div>

          <div>
            <MapPin className="w-5 h-5 text-[#D97706] mx-auto mb-2" />
            <span className="text-xs text-[#9CA3AF] uppercase font-semibold block">Venue</span>
            <span className="text-sm font-bold text-[#111827] block truncate">
              {event.venueName || event.location || 'Venue details to follow'}
            </span>
            {event.venueName && event.location && (
              <span className="text-xs text-[#4B5563]">{event.location}</span>
            )}
          </div>
        </div>

        {/* RSVP Form / Confirmation State */}
        <div className="p-8 sm:p-12">
          {isSubmitted ? (
            <div className="text-center py-6 animate-in fade-in duration-300">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h2 className="text-2xl font-bold text-[#111827] mb-2">
                {attending === 'attending'
                  ? 'RSVP Confirmed! See you there!'
                  : 'Thank you for letting us know!'}
              </h2>
              <p className="text-sm text-[#4B5563] max-w-md mx-auto mb-6">
                {attending === 'attending'
                  ? `We've saved a spot for ${name}${
                      plusOnes > 0 ? ` + ${plusOnes} guest` : ''
                    }. Your response has been saved.`
                  : `Your response has been recorded. We will miss you!`}
              </p>

              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => setIsSubmitted(false)}
                  className="px-4 py-2.5 rounded-[10px] bg-[#F4F5FA] border border-[#E5E7EB] text-xs font-semibold text-[#4B5563] hover:text-[#111827] cursor-pointer"
                >
                  Edit Response
                </button>
                <button
                  onClick={onBack}
                  className="px-5 py-2.5 rounded-[10px] bg-[#4B2FC9] text-white text-xs font-semibold shadow-sm cursor-pointer"
                >
                  Back to Dashboard
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="text-center mb-8">
                <h2 className="text-xl font-bold text-[#111827] mb-1">
                  Kindly Respond by Confirmation Date
                </h2>
                <p className="text-xs text-[#4B5563]">
                  Please let us know your attendance status to help us finalize catering and seating.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6 max-w-xl mx-auto">
                {/* Attendance radio buttons */}
                <div>
                  <label className="block text-xs font-semibold text-[#111827] uppercase tracking-wider mb-2.5 text-center">
                    Will you be joining us?
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setAttending('attending')}
                      className={`p-4 rounded-[14px] border-2 text-center transition-all cursor-pointer ${
                        attending === 'attending'
                          ? 'border-[#4B2FC9] bg-[#EDE9FE]/50 text-[#4B2FC9] shadow-xs'
                          : 'border-[#E5E7EB] bg-white text-[#4B5563] hover:border-gray-300'
                      }`}
                    >
                      <PartyPopper className="w-5 h-5 mx-auto mb-1 text-[#4B2FC9]" />
                      <span className="font-bold text-sm block">Joyfully Accepts</span>
                      <span className="text-[11px] text-[#4B5563]">Can't wait to celebrate</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setAttending('declined')}
                      className={`p-4 rounded-[14px] border-2 text-center transition-all cursor-pointer ${
                        attending === 'declined'
                          ? 'border-gray-600 bg-gray-50 text-gray-900 shadow-xs'
                          : 'border-[#E5E7EB] bg-white text-[#4B5563] hover:border-gray-300'
                      }`}
                    >
                      <Heart className="w-5 h-5 mx-auto mb-1 text-gray-500" />
                      <span className="font-bold text-sm block">Regretfully Declines</span>
                      <span className="text-[11px] text-[#4B5563]">Celebrating in spirit</span>
                    </button>
                  </div>
                </div>

                {/* Name & Email */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#111827] mb-1">
                      Your Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Maya Chen"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full h-11 px-3.5 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] focus:outline-none focus:border-[#4B2FC9] focus:ring-3 focus:ring-[#4B2FC9]/15"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#111827] mb-1">
                      Email Address *
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="maya@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full h-11 px-3.5 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] focus:outline-none focus:border-[#4B2FC9] focus:ring-3 focus:ring-[#4B2FC9]/15"
                    />
                  </div>
                </div>

                {attending === 'attending' && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-[#111827] mb-1">
                        Additional Guests Attending with You (+Plus Ones)
                      </label>
                      <select
                        value={plusOnes}
                        onChange={(e) => setPlusOnes(Number(e.target.value))}
                        className="w-full h-11 px-3 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] focus:outline-none focus:border-[#4B2FC9]"
                      >
                        <option value={0}>Just me (1 person)</option>
                        <option value={1}>Bringing +1 guest (2 people)</option>
                        <option value={2}>Bringing +2 guests (3 people)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#111827] mb-1">
                        Dietary Requirements
                      </label>
                      <select
                        value={dietary}
                        onChange={(e) => setDietary(e.target.value)}
                        className="w-full h-11 px-3 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] focus:outline-none focus:border-[#4B2FC9]"
                      >
                        <option value="None">No specific dietary requirements</option>
                        <option value="Vegetarian">Vegetarian</option>
                        <option value="Vegan">Vegan</option>
                        <option value="Gluten-Free">Gluten-Free</option>
                        <option value="Halal">Halal</option>
                        <option value="Nut Allergy">Nut Allergy</option>
                      </select>
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-xs font-semibold text-[#111827] mb-1">
                    Warm wishes or note for the host
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Looking forward to celebrating!"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full p-3 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] focus:outline-none focus:border-[#4B2FC9]"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full h-12 rounded-[12px] bg-[#4B2FC9] hover:bg-[#3C24A4] active:scale-[0.98] text-white text-sm font-bold shadow-md transition-all cursor-pointer"
                >
                  Confirm RSVP
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
