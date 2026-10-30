import { EventItem, TimelineItem } from '../types/event';

/**
 * Rule-based local timeline generator (v1).
 * Creates a structured chronological run-of-show schedule tailored to the event category.
 */
export async function generateSmartTimeline(
  event: EventItem,
  _customPrompt?: string
): Promise<{ items: TimelineItem[]; suggestions: string[] }> {
  const isWedding = event.category === 'wedding';
  const isCommunity = event.category === 'community';

  if (isWedding) {
    return {
      items: [
        {
          id: crypto.randomUUID(),
          title: 'Party & Host Preparations',
          time: '12:30',
          endTime: '14:30',
          phase: 'Pre-Event',
          location: 'Prep Suite',
          description: 'Hair, makeup touchups, first look portraits and family photos.',
          assignedTo: 'Lead Coordinator & Photographer',
          status: 'pending',
        },
        {
          id: crypto.randomUUID(),
          title: 'Guest Arrival & Welcome Music Prelude',
          time: '15:00',
          endTime: '15:30',
          phase: 'Pre-Event',
          location: 'Main Entry Garden',
          description: 'Acoustic instrumental prelude, welcome refreshments offered.',
          assignedTo: 'Ushers & Musicians',
          status: 'pending',
        },
        {
          id: crypto.randomUUID(),
          title: 'Ceremony Processional & Vows Exchange',
          time: '15:30',
          endTime: '16:15',
          phase: 'Main Program',
          location: 'Altar & Ceremony Hall',
          description: 'Processional, reading of vows, ring exchange, celebratory recessional.',
          assignedTo: 'Officiant & Event Coordinator',
          status: 'pending',
        },
        {
          id: crypto.randomUUID(),
          title: 'Cocktail Hour & Family Photos',
          time: '16:30',
          endTime: '17:45',
          phase: 'Reception',
          location: 'Courtyard Terrace',
          description: 'Passed hors d’oeuvres, open bar, sunset portraits.',
          assignedTo: 'Catering Captain & Photographer',
          status: 'pending',
        },
        {
          id: crypto.randomUUID(),
          title: 'Grand Entrance, Plated Dinner & Heartfelt Toasts',
          time: '18:00',
          endTime: '20:00',
          phase: 'Reception',
          location: 'Dining Pavilion',
          description: 'Welcome by hosts, 3-course dinner service, speeches & toasts.',
          assignedTo: 'Maître d’ & Toast Speakers',
          status: 'pending',
        },
        {
          id: crypto.randomUUID(),
          title: 'First Dance, Cake Cutting & Celebration',
          time: '20:15',
          endTime: '23:00',
          phase: 'Reception',
          location: 'Main Dance Floor',
          description: 'First dance song, parent dances, cake reveal, musical sets.',
          assignedTo: 'Music & Band Lead',
          status: 'pending',
        },
        {
          id: crypto.randomUUID(),
          title: 'Grand Send-Off & Departure',
          time: '23:15',
          endTime: '23:30',
          phase: 'Wrap-Up',
          location: 'Front Portico',
          description: 'Guests line pathway for final farewell as hosts depart.',
          assignedTo: 'Event Coordinator & Transportation',
          status: 'pending',
        },
      ],
      suggestions: [
        'Schedule photos 45 minutes before sunset for optimal lighting.',
        'Ask the catering captain to keep a private plate of appetizers in the suite.',
        'Add a 15-minute buffer between the ceremony conclusion and dinner seating.',
      ],
    };
  }

  if (isCommunity) {
    return {
      items: [
        {
          id: crypto.randomUUID(),
          title: 'Organizer Briefing & Volunteer Check-In',
          time: '08:00',
          endTime: '08:45',
          phase: 'Pre-Event',
          location: 'Registration Foyer',
          description: 'Review run-of-show, test wireless mics and distribute volunteer badges.',
          assignedTo: 'Lead Coordinator',
          status: 'pending',
        },
        {
          id: crypto.randomUUID(),
          title: 'Attendee Registration & Networking Breakfast',
          time: '09:00',
          endTime: '10:00',
          phase: 'Pre-Event',
          location: 'Main Exhibition Hall',
          description: 'Badge scanning, coffee/tea service, partner exhibition tables open.',
          assignedTo: 'Registration Team',
          status: 'pending',
        },
        {
          id: crypto.randomUUID(),
          title: 'Opening Plenary & Civic Keynote Panel',
          time: '10:00',
          endTime: '11:30',
          phase: 'Main Program',
          location: 'Main Auditorium',
          description: 'Welcome remarks from summit organizers, visionary keynote, and Q&A.',
          assignedTo: 'Panel Moderator',
          status: 'pending',
        },
        {
          id: crypto.randomUUID(),
          title: 'Collaborative Action Workshops & Breakouts',
          time: '11:45',
          endTime: '13:15',
          phase: 'Main Program',
          location: 'Breakout Rooms 101-104',
          description: 'Working group sessions on tech, sustainability, and civic policy.',
          assignedTo: 'Track Facilitators',
          status: 'pending',
        },
        {
          id: crypto.randomUUID(),
          title: 'Community Lunch & Solutions Showcase',
          time: '13:15',
          endTime: '14:45',
          phase: 'Reception',
          location: 'Atrium Dining Commons',
          description: 'Locally-sourced catering, poster session and open project showcase.',
          assignedTo: 'Catering Lead',
          status: 'pending',
        },
        {
          id: crypto.randomUUID(),
          title: 'Closing Town Hall & Next Steps Roadmap',
          time: '15:00',
          endTime: '16:30',
          phase: 'Wrap-Up',
          location: 'Main Auditorium',
          description: 'Commitments review, volunteer awards, closing reception.',
          assignedTo: 'Host Committee',
          status: 'pending',
        },
      ],
      suggestions: [
        'Reserve 10 minutes at the start of every session for microphone and slides checks.',
        'Provide a live chat channel or QR code for audience Q&A questions.',
        'Confirm emergency exits and accessibility pathways are clearly marked before doors open.',
      ],
    };
  }

  // Birthday / Celebration
  return {
    items: [
      {
        id: crypto.randomUUID(),
        title: 'Vendor Load-In & Balloon/Lighting Decor Setup',
        time: '17:30',
        endTime: '19:00',
        phase: 'Pre-Event',
        location: 'Main Lounge & Patio',
        description: 'Soundcheck, decor setup, lighting preset tests, bar stocking.',
        assignedTo: 'Host & Decor Team',
        status: 'pending',
      },
      {
        id: crypto.randomUUID(),
        title: 'Guest Arrival, Welcome Drinks & Photo Lounge',
        time: '19:00',
        endTime: '20:15',
        phase: 'Pre-Event',
        location: 'Welcome Lounge',
        description: 'Bespoke signature drinks, guestbook signing, ambient music.',
        assignedTo: 'Bar Staff & Host Greeters',
        status: 'pending',
      },
      {
        id: crypto.randomUUID(),
        title: 'Dinner Feast & Social Grazing',
        time: '20:15',
        endTime: '21:30',
        phase: 'Main Program',
        location: 'Dining & Patio Space',
        description: 'Gourmet dinner, appetizers, and artisan dessert stations.',
        assignedTo: 'Catering Staff',
        status: 'pending',
      },
      {
        id: crypto.randomUUID(),
        title: 'Celebratory Toast & Milestone Tribute',
        time: '21:30',
        endTime: '22:15',
        phase: 'Main Program',
        location: 'Central Stage',
        description: 'Friend tribute speeches, video memories on the screen, cake cutting.',
        assignedTo: 'Host / MC',
        status: 'pending',
      },
      {
        id: crypto.randomUUID(),
        title: 'Music, Dancing & Late Night Celebration',
        time: '22:15',
        endTime: '01:00',
        phase: 'Reception',
        location: 'Main Dance Floor',
        description: 'Dance tracks, celebration effects, dessert bites.',
        assignedTo: 'DJ & Bar Staff',
        status: 'pending',
      },
    ],
    suggestions: [
      'Keep cake presentations concise (10-15 minutes max) to keep dance momentum high.',
      'Have extra phone chargers and a designated rideshare pickup zone for guests.',
      'Pre-assign a close friend to coordinate tributes so the host can enjoy the party.',
    ],
  };
}

export function generateRsvpMessage(
  event: EventItem,
  guestName: string,
  daysLeft: number
): { emailSubject: string; emailBody: string; smsText: string } {
  const occasion = event.title;
  const rsvpLink = typeof window !== 'undefined' ? `${window.location.origin}/#rsvp=${event.id}` : `#rsvp=${event.id}`;

  const emailSubject = `Friendly reminder: RSVP for ${occasion} (${daysLeft > 0 ? `${daysLeft} days to go` : 'coming soon'}!)`;

  const emailBody = `Hi ${guestName},

We are so excited to celebrate ${event.title} on ${event.date} at ${event.venueName || event.location || 'our venue'}!

As we finalize catering headcounts and seating arrangements, we'd love to know if you will be able to join us.

Please take a moment to confirm your attendance and let us know about any dietary preferences:
🔗 ${rsvpLink}

Warmly,
${event.hostName || 'Event Host'}`;

  const smsText = `Hey ${guestName}! Just a quick note from ${event.hostName || 'the host'} regarding ${event.title} on ${event.date}. Please let us know if you can make it by tapping here: ${rsvpLink} - Looking forward to celebrating! 🎉`;

  return { emailSubject, emailBody, smsText };
}
