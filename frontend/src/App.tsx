import React, { useState, useEffect, useRef, useCallback } from 'react';
import { EventItem, EventCategory, Guest } from './types/event';
import {
  getHealth,
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  isApiConfigured,
  API_URL,
} from './services/api';
import { fromBackend, toBackend } from './services/mappers';
import { Header } from './components/Header';
import { DashboardMetrics } from './components/DashboardMetrics';
import { EventCard } from './components/EventCard';
import { EventDetail } from './components/EventDetail';
import { CreateEventModal } from './components/CreateEventModal';
import { GuestRsvpPortal } from './components/GuestRsvpPortal';
import { CategoryBadge } from './components/CategoryBadge';
import { Plus, Sparkles, CalendarSearch, AlertTriangle, RefreshCw } from 'lucide-react';

export default function App() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<'dashboard' | 'event-detail' | 'guest-portal'>('dashboard');
  const [categoryFilter, setCategoryFilter] = useState<'all' | EventCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Connection and async states
  const [apiStatus, setApiStatus] = useState<'connected' | 'offline' | 'checking'>('checking');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Dedicated RSVP portal event (e.g. when accessed directly via #rsvp=<id>)
  const [rsvpEvent, setRsvpEvent] = useState<EventItem | null>(null);

  // Cache last-known confirmed state for rollbacks
  const lastSavedEventsRef = useRef<Map<string, EventItem>>(new Map());
  // Debounce timers per event
  const debounceTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  // Abort controllers per event for canceling stale in-flight PATCHes
  const patchAbortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const fetchAbortControllerRef = useRef<AbortController | null>(null);
  const saveTimeoutIndicatorRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 4000);
  };

  // Health check worker
  const checkHealth = useCallback(async () => {
    if (!isApiConfigured()) {
      setApiStatus('offline');
      return;
    }
    try {
      const res = await getHealth();
      if (res && res.status === 'ok') {
        setApiStatus('connected');
      } else {
        setApiStatus('offline');
      }
    } catch {
      setApiStatus('offline');
    }
  }, []);

  // Fetch all events from REST API
  const fetchEvents = useCallback(async () => {
    if (!isApiConfigured()) {
      setIsLoading(false);
      setLoadError('VITE_API_URL environment variable is missing. Please configure your backend API URL.');
      return;
    }

    if (fetchAbortControllerRef.current) {
      fetchAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    fetchAbortControllerRef.current = controller;

    setIsLoading(true);
    setLoadError(null);
    try {
      await checkHealth();
      const rows = await listEvents({ limit: 200 }, controller.signal);
      const mapped = rows.map(fromBackend);
      setEvents(mapped);

      // Seed last saved cache
      const map = new Map<string, EventItem>();
      for (const ev of mapped) {
        map.set(ev.id, ev);
      }
      lastSavedEventsRef.current = map;
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error('Failed to load events:', err);
      setLoadError(err.message || 'Failed to connect to the backend server.');
    } finally {
      setIsLoading(false);
    }
  }, [checkHealth]);

  // Handle URL hash changes for #rsvp=<uuid>
  useEffect(() => {
    const handleHash = async () => {
      const hash = window.location.hash || '';
      if (hash.startsWith('#rsvp=')) {
        const eventId = hash.replace('#rsvp=', '').trim();
        if (eventId) {
          try {
            const row = await getEvent(eventId);
            const mapped = fromBackend(row);
            setRsvpEvent(mapped);
            setCurrentView('guest-portal');
          } catch (err) {
            console.error('Could not load RSVP event from hash:', err);
            showToast('Event for RSVP was not found or could not be loaded.');
          }
        }
      }
    };

    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  // Initial load & recurring health check every 60s
  useEffect(() => {
    fetchEvents();
    const interval = setInterval(checkHealth, 60000);
    return () => clearInterval(interval);
  }, [fetchEvents, checkHealth]);

  // Selected event accessor
  const selectedEvent = events.find((e) => e.id === selectedEventId) || null;

  // CREATE EVENT (POST WITH IDEMPOTENCY KEY)
  const handleCreateEvent = async (data: {
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
    budgetItems: any[];
    tasks: any[];
    ruleBasedPlan?: any;
  }) => {
    const backendPayload = toBackend({
      title: data.title,
      category: data.category,
      date: data.date || '',
      location: data.location || '',
      targetGuests: data.targetGuests,
      totalBudget: data.totalBudget,
      venueName: data.venueName,
      startTime: data.startTime,
      endTime: data.endTime,
      description: data.description,
      hostName: data.hostName,
      hostEmail: data.hostEmail,
      currency: 'INR',
      timeline: [],
      budgetItems: data.budgetItems || [],
      guests: [],
      tasks: data.tasks || [],
      vendors: [],
      ruleBasedPlan: data.ruleBasedPlan,
    });

    const idempotencyKey = `create-event-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const createdRow = await createEvent(
      {
        name: backendPayload.name!,
        event_type: backendPayload.event_type!,
        event_date: backendPayload.event_date,
        location: backendPayload.location,
        guest_count: backendPayload.guest_count,
        budget: backendPayload.budget,
        plan: backendPayload.plan,
      },
      idempotencyKey
    );

    const mapped = fromBackend(createdRow);
    setEvents((prev) => [mapped, ...prev]);
    lastSavedEventsRef.current.set(mapped.id, mapped);
    setSelectedEventId(mapped.id);
    setCurrentView('event-detail');
  };

  // UPDATE EVENT (OPTIMISTIC + 600ms DEBOUNCED PATCH WITH ABORTION & ETAG)
  const handleUpdateEvent = (updated: EventItem) => {
    const eventId = updated.id;

    // 1. Optimistic update
    setEvents((prev) => prev.map((e) => (e.id === eventId ? updated : e)));
    if (rsvpEvent && rsvpEvent.id === eventId) {
      setRsvpEvent(updated);
    }

    setSaveStatus('saving');
    if (saveTimeoutIndicatorRef.current) clearTimeout(saveTimeoutIndicatorRef.current);

    // 2. Abort any existing in-flight PATCH for this event
    const activeController = patchAbortControllersRef.current.get(eventId);
    if (activeController) {
      activeController.abort();
      patchAbortControllersRef.current.delete(eventId);
    }

    // 3. Clear existing debounce timer for this event
    const existingTimer = debounceTimersRef.current.get(eventId);
    if (existingTimer) clearTimeout(existingTimer);

    // 4. Schedule PATCH after 600 ms
    const timer = setTimeout(async () => {
      const controller = new AbortController();
      patchAbortControllersRef.current.set(eventId, controller);

      try {
        const payload = toBackend(updated);
        const patchedRow = await updateEvent(eventId, payload, updated._etag, controller.signal);
        const latestMapped = fromBackend(patchedRow);

        // Update last saved snapshot & local event state with latest ETag
        lastSavedEventsRef.current.set(eventId, latestMapped);
        setEvents((prev) => prev.map((e) => (e.id === eventId ? latestMapped : e)));
        if (rsvpEvent && rsvpEvent.id === eventId) {
          setRsvpEvent(latestMapped);
        }

        setSaveStatus('saved');
        saveTimeoutIndicatorRef.current = setTimeout(() => {
          setSaveStatus(null);
        }, 2000);
      } catch (err: any) {
        if (err.name === 'AbortError') return;

        console.error(`Failed to persist changes to event ${eventId}:`, err);
        setSaveStatus(null);

        if (err.status === 412) {
          showToast('This event was updated in another session. Reloading latest data...');
          try {
            const freshRow = await getEvent(eventId);
            const freshMapped = fromBackend(freshRow);
            lastSavedEventsRef.current.set(eventId, freshMapped);
            setEvents((prev) => prev.map((e) => (e.id === eventId ? freshMapped : e)));
            return;
          } catch {
            // fallback to rollback
          }
        } else if (err.status === 429 || err.status === 503) {
          showToast(err.message || 'Server is busy. Changes could not be saved right now.');
        } else {
          showToast(err.message || 'Could not save changes');
        }

        // Roll back to last saved version
        const lastSaved = lastSavedEventsRef.current.get(eventId);
        if (lastSaved) {
          setEvents((prev) => prev.map((e) => (e.id === eventId ? lastSaved : e)));
          if (rsvpEvent && rsvpEvent.id === eventId) {
            setRsvpEvent(lastSaved);
          }
        }
      } finally {
        debounceTimersRef.current.delete(eventId);
        patchAbortControllersRef.current.delete(eventId);
      }
    }, 600);

    debounceTimersRef.current.set(eventId, timer);
  };

  // DELETE EVENT (DELETE)
  const handleDeleteEvent = async (id: string) => {
    try {
      await deleteEvent(id);
      setEvents((prev) => prev.filter((e) => e.id !== id));
      lastSavedEventsRef.current.delete(id);
      setSelectedEventId(null);
      setCurrentView('dashboard');
    } catch (err: any) {
      console.error(`Failed to delete event ${id}:`, err);
      showToast(err.message || 'Failed to delete event on server');
    }
  };

  // RSVP PORTAL SUBMISSION
  const handleRsvpSubmitted = (guest: Guest) => {
    const target = rsvpEvent || selectedEvent;
    if (!target) return;

    const existingIdx = target.guests.findIndex(
      (g) => g.email.toLowerCase() === guest.email.toLowerCase()
    );
    let updatedGuests: Guest[];
    if (existingIdx >= 0) {
      updatedGuests = [...target.guests];
      updatedGuests[existingIdx] = guest;
    } else {
      updatedGuests = [guest, ...target.guests];
    }

    const updatedEvent: EventItem = {
      ...target,
      guests: updatedGuests,
    };

    handleUpdateEvent(updatedEvent);
  };

  // Filter & Search
  const filteredEvents = events.filter((ev) => {
    const matchesCategory = categoryFilter === 'all' || ev.category === categoryFilter;
    const matchesSearch =
      ev.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ev.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ev.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ev.venueName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ev.hostName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const categoryCounts = {
    all: events.length,
    wedding: events.filter((e) => e.category === 'wedding').length,
    birthday: events.filter((e) => e.category === 'birthday').length,
    community: events.filter((e) => e.category === 'community').length,
  };

  // If in guest portal view
  if (currentView === 'guest-portal') {
    const activePortalEvent = rsvpEvent || selectedEvent;
    if (activePortalEvent) {
      return (
        <GuestRsvpPortal
          event={activePortalEvent}
          onBack={() => {
            window.location.hash = '';
            setRsvpEvent(null);
            setCurrentView(selectedEventId ? 'event-detail' : 'dashboard');
          }}
          onRsvpSubmitted={handleRsvpSubmitted}
        />
      );
    }
  }

  return (
    <div className="min-h-screen bg-[#F4F5FA] flex flex-col font-sans">
      {/* Toast alert */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 animate-in fade-in slide-in-from-top-4 duration-200">
          <div className="bg-rose-600 text-white px-4 py-2.5 rounded-[10px] text-xs font-semibold shadow-lg flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Missing API URL error banner */}
      {!isApiConfigured() && (
        <div className="bg-amber-500 text-white text-xs px-4 py-2.5 font-semibold text-center flex items-center justify-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          <span>
            Backend URL is missing. Set <code>VITE_API_URL</code> in your environment (e.g. http://localhost:8000).
          </span>
        </div>
      )}

      <Header
        onNewEvent={() => setIsCreateModalOpen(true)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        currentView={currentView}
        onGoHome={() => {
          setSelectedEventId(null);
          setCurrentView('dashboard');
        }}
        apiStatus={apiStatus}
        saveStatus={saveStatus}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {currentView === 'event-detail' && selectedEvent ? (
          <EventDetail
            event={selectedEvent}
            onBack={() => {
              setSelectedEventId(null);
              setCurrentView('dashboard');
            }}
            onUpdateEvent={handleUpdateEvent}
            onOpenGuestPortal={() => {
              window.location.hash = `rsvp=${selectedEvent.id}`;
              setCurrentView('guest-portal');
            }}
            onDeleteEvent={handleDeleteEvent}
          />
        ) : (
          <div>
            {/* Hero / Intro section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EDE9FE] text-[#4B2FC9] text-xs font-bold mb-2 border border-[#DDD6FE]">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Celebration & Logistics Engine</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-[#111827] tracking-tight">
                  Event Operations Dashboard
                </h1>
                <p className="text-xs sm:text-sm text-[#4B5563] mt-1 max-w-2xl">
                  Coordinate wedding itineraries, community summits, and celebratory milestones with rule-based timelines, budget balancing, and RSVP guest management.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="inline-flex items-center gap-2 px-5 h-11 rounded-[12px] bg-[#4B2FC9] hover:bg-[#3C24A4] active:scale-[0.98] text-white font-semibold text-sm shadow-sm transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>Create New Event</span>
                </button>
              </div>
            </div>

            {/* Metrics Row */}
            <DashboardMetrics events={events} />

            {/* Category Filter Pills & Search */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 no-scrollbar">
                <button
                  onClick={() => setCategoryFilter('all')}
                  className={`px-4 h-10 rounded-full text-xs font-bold tracking-wide transition-all cursor-pointer shrink-0 ${
                    categoryFilter === 'all'
                      ? 'bg-[#111827] text-white shadow-xs'
                      : 'bg-white text-[#4B5563] border border-[#E5E7EB] hover:text-[#111827]'
                  }`}
                >
                  All Events ({categoryCounts.all})
                </button>

                <button
                  onClick={() => setCategoryFilter('wedding')}
                  className={`h-10 px-1 rounded-full transition-all cursor-pointer shrink-0 ${
                    categoryFilter === 'wedding' ? 'ring-2 ring-[#4B2FC9]' : ''
                  }`}
                >
                  <CategoryBadge category="wedding" size="lg" />
                </button>

                <button
                  onClick={() => setCategoryFilter('birthday')}
                  className={`h-10 px-1 rounded-full transition-all cursor-pointer shrink-0 ${
                    categoryFilter === 'birthday' ? 'ring-2 ring-[#D97706]' : ''
                  }`}
                >
                  <CategoryBadge category="birthday" size="lg" />
                </button>

                <button
                  onClick={() => setCategoryFilter('community')}
                  className={`h-10 px-1 rounded-full transition-all cursor-pointer shrink-0 ${
                    categoryFilter === 'community' ? 'ring-2 ring-[#0D9488]' : ''
                  }`}
                >
                  <CategoryBadge category="community" size="lg" />
                </button>
              </div>

              <div className="text-xs text-[#9CA3AF] font-medium self-end sm:self-auto">
                Showing {filteredEvents.length} of {events.length} events
              </div>
            </div>

            {/* Loading Skeleton */}
            {isLoading && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="bg-white rounded-[16px] border border-[#E5E7EB] p-6 h-64 animate-pulse space-y-4"
                  >
                    <div className="h-4 bg-gray-200 rounded w-1/3" />
                    <div className="h-6 bg-gray-200 rounded w-3/4" />
                    <div className="h-16 bg-gray-100 rounded" />
                    <div className="h-10 bg-gray-100 rounded" />
                  </div>
                ))}
              </div>
            )}

            {/* Error Card with Retry Button */}
            {!isLoading && loadError && (
              <div className="bg-white rounded-[16px] border border-rose-200 p-8 text-center max-w-lg mx-auto shadow-surface-card space-y-4">
                <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-[#111827]">
                  Unable to connect to EventPilot backend
                </h3>
                <p className="text-xs text-[#4B5563] leading-relaxed">
                  {loadError}
                </p>
                <button
                  onClick={fetchEvents}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[10px] bg-[#4B2FC9] hover:bg-[#3C24A4] text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry Connection</span>
                </button>
              </div>
            )}

            {/* Empty State when list is empty */}
            {!isLoading && !loadError && events.length === 0 && (
              <div className="bg-white rounded-[16px] border border-[#E5E7EB] p-12 text-center shadow-surface-card max-w-lg mx-auto space-y-4">
                <div className="w-14 h-14 rounded-full bg-[#EDE9FE] text-[#4B2FC9] flex items-center justify-center mx-auto">
                  <CalendarSearch className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-bold text-[#111827]">
                  No events yet - create your first event
                </h3>
                <p className="text-xs text-[#4B5563] max-w-sm mx-auto">
                  Get started by creating a wedding, birthday, or community gathering with automated timelines and budget allocations.
                </p>
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[10px] bg-[#4B2FC9] text-white text-xs font-semibold shadow-sm cursor-pointer"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>Create Your First Event</span>
                </button>
              </div>
            )}

            {/* Event Cards Grid */}
            {!isLoading && !loadError && events.length > 0 && (
              filteredEvents.length === 0 ? (
                <div className="bg-white rounded-[16px] border border-[#E5E7EB] p-12 text-center shadow-surface-card">
                  <CalendarSearch className="w-12 h-12 text-[#9CA3AF] mx-auto mb-3" />
                  <h3 className="text-base font-bold text-[#111827]">
                    No matching events found
                  </h3>
                  <p className="text-xs text-[#4B5563] mt-1 mb-4">
                    Try adjusting your search terms or category filter to find what you're looking for.
                  </p>
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setCategoryFilter('all');
                    }}
                    className="px-4 py-2 rounded-[10px] bg-[#4B2FC9] text-white text-xs font-semibold cursor-pointer"
                  >
                    Reset Filters
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredEvents.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      onSelect={(ev) => {
                        setSelectedEventId(ev.id);
                        setCurrentView('event-detail');
                      }}
                      onPreviewRsvp={(ev) => {
                        window.location.hash = `rsvp=${ev.id}`;
                        setSelectedEventId(ev.id);
                        setCurrentView('guest-portal');
                      }}
                    />
                  ))}
                </div>
              )
            )}
          </div>
        )}
      </main>

      {/* Create Event Modal */}
      <CreateEventModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleCreateEvent}
      />
    </div>
  );
}
