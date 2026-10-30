export type EventCategory = 'wedding' | 'birthday' | 'community';

export interface CategoryTheme {
  name: EventCategory;
  label: string;
  primaryColor: string;
  bgColor: string;
  borderColor: string;
  topAccentColor: string;
  textColor: string;
}

export interface TimelineItem {
  id: string;
  title: string;
  time: string; // e.g. "14:00"
  endTime?: string;
  phase: 'Pre-Event' | 'Main Program' | 'Reception' | 'Wrap-Up' | 'General';
  location?: string;
  description?: string;
  assignedTo?: string;
  status: 'pending' | 'in-progress' | 'completed';
}

export interface BudgetItem {
  id: string;
  category: 'Venue' | 'Catering' | 'Photography' | 'Florals & Decor' | 'Music & Sound' | 'Favors & Print' | 'Attire' | 'Decor' | 'Logistics' | 'Other';
  description: string;
  allocatedAmount: number;
  actualAmount: number;
  paidAmount: number;
  dueDate?: string;
  vendorName?: string;
  isPaid: boolean;
}

export interface Guest {
  id: string;
  name: string;
  email: string;
  status: 'attending' | 'declined' | 'pending';
  plusOnes: number;
  dietaryRestrictions?: string;
  tableNumber?: string;
  invitedDate: string;
  notes?: string;
}

export interface TaskItem {
  id: string;
  title: string;
  dueDate: string;
  priority: 'high' | 'medium' | 'low';
  category: string;
  assignedTo?: string;
  completed: boolean;
}

export interface VendorItem {
  id: string;
  name: string;
  service: string;
  contactPerson: string;
  phone: string;
  email: string;
  website?: string;
  fee: number;
  status: 'contacted' | 'booked' | 'confirmed';
  notes?: string;
}

export interface RuleBasedPlanMeta {
  warnings?: string[];
  per_guest_cost?: number;
  days_until_event?: number;
  total_budget?: number;
  guest_count?: number;
  generated_by?: string;
}

export interface EventItem {
  id: string;
  title: string;
  category: EventCategory;
  date: string; // ISO date YYYY-MM-DD
  startTime: string;
  endTime: string;
  location: string;
  venueName: string;
  description: string;
  coverImage?: string;
  hostName: string;
  hostEmail: string;
  totalBudget: number;
  currency: string;
  targetGuests: number;
  timeline: TimelineItem[];
  budgetItems: BudgetItem[];
  guests: Guest[];
  tasks: TaskItem[];
  vendors: VendorItem[];
  ruleBasedPlan?: RuleBasedPlanMeta;
  createdAt: string;
  _etag?: string;
}

export const CATEGORY_THEMES: Record<EventCategory, CategoryTheme> = {
  wedding: {
    name: 'wedding',
    label: 'Wedding',
    primaryColor: '#4B2FC9',
    bgColor: '#EDE9FE',
    borderColor: '#DDD6FE',
    topAccentColor: '#4B2FC9',
    textColor: '#4B2FC9',
  },
  birthday: {
    name: 'birthday',
    label: 'Birthday',
    primaryColor: '#D97706',
    bgColor: '#FEF3C7',
    borderColor: '#FDE68A',
    topAccentColor: '#D97706',
    textColor: '#D97706',
  },
  community: {
    name: 'community',
    label: 'Community',
    primaryColor: '#0D9488',
    bgColor: '#CCFBF1',
    borderColor: '#99F6E4',
    topAccentColor: '#0D9488',
    textColor: '#0D9488',
  },
};
