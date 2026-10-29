import React from 'react';
import { Calendar, Plus, Search, Sparkles } from 'lucide-react';

interface HeaderProps {
  onNewEvent: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  currentView: 'dashboard' | 'event-detail' | 'guest-portal';
  onGoHome: () => void;
  apiStatus: 'connected' | 'offline' | 'checking';
  saveStatus?: 'saving' | 'saved' | null;
}

export const Header: React.FC<HeaderProps> = ({
  onNewEvent,
  searchQuery,
  onSearchChange,
  currentView,
  onGoHome,
  apiStatus,
  saveStatus,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#E5E7EB] transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-18 gap-4">
          {/* Logo & Brand */}
          <button
            onClick={onGoHome}
            className="flex items-center gap-3 text-left focus:outline-none group cursor-pointer"
            aria-label="EventPilot AI home"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#4B2FC9] to-[#7A5AF8] flex items-center justify-center text-white shadow-md shadow-[#4B2FC9]/20 group-hover:scale-105 transition-transform">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-extrabold tracking-tight text-[#111827]">
                  EventPilot
                </span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-[#EDE9FE] text-[#4B2FC9]">
                  v1.0
                </span>
              </div>
              <p className="text-xs text-[#4B5563] hidden sm:block font-medium">
                Modern Event Architecture & Coordination
              </p>
            </div>
          </button>

          {/* Search bar */}
          <div className="flex-1 max-w-md hidden md:block">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" />
              <input
                type="text"
                placeholder="Search events, guests, vendors, or timeline..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full h-11 pl-10 pr-4 bg-[#F4F5FA] border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:bg-white focus:border-[#4B2FC9] focus:ring-3 focus:ring-[#4B2FC9]/15 transition-all"
              />
            </div>
          </div>

          {/* Actions & Connection Badge */}
          <div className="flex items-center gap-3">
            {/* Saving / Saved Indicator */}
            {saveStatus && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#F4F5FA] text-[#4B5563] border border-[#E5E7EB] hidden sm:inline-flex items-center gap-1.5">
                {saveStatus === 'saving' ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>Saved</span>
                  </>
                )}
              </span>
            )}

            {/* Connection Badge (Green "API connected" / Red "API offline") */}
            <div
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                apiStatus === 'connected'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : apiStatus === 'offline'
                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                  : 'bg-gray-50 text-gray-600 border-gray-200'
              }`}
              title={apiStatus === 'connected' ? 'Connected to REST backend' : 'Backend connection unavailable'}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  apiStatus === 'connected'
                    ? 'bg-emerald-500'
                    : apiStatus === 'offline'
                    ? 'bg-rose-500'
                    : 'bg-gray-400 animate-pulse'
                }`}
              />
              <span className="hidden sm:inline">
                {apiStatus === 'connected'
                  ? 'API connected'
                  : apiStatus === 'offline'
                  ? 'API offline'
                  : 'Connecting...'}
              </span>
            </div>

            {currentView !== 'dashboard' && (
              <button
                onClick={onGoHome}
                className="hidden sm:inline-flex items-center justify-center px-4 h-11 rounded-[12px] text-sm font-semibold text-[#4B2FC9] bg-[#EDE9FE]/70 hover:bg-[#EDE9FE] border border-[#DDD6FE] transition-colors cursor-pointer"
              >
                All Events
              </button>
            )}

            {/* Primary Action Button */}
            <button
              onClick={onNewEvent}
              className="inline-flex items-center justify-center gap-2 px-5 h-11 rounded-[12px] bg-[#4B2FC9] hover:bg-[#3C24A4] active:scale-[0.98] text-white font-semibold text-sm shadow-sm transition-all cursor-pointer"
              aria-label="Create new event"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>New Event</span>
            </button>

            {/* User Avatar */}
            <div className="flex items-center gap-2 pl-2 border-l border-[#E5E7EB]">
              <div className="w-10 h-10 rounded-full bg-[#EDE9FE] border-2 border-[#DDD6FE] flex items-center justify-center text-[#4B2FC9] font-bold text-sm">
                EP
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
