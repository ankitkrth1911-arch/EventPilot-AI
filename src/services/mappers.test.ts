import test from 'node:test';
import assert from 'node:assert/strict';
import { fromBackend, toBackend } from './mappers';
import { EventItem } from '../types/event';

test('fromBackend handles null/empty workspace defensively with defaults', () => {
  const row = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: 'Diwali Gala',
    event_type: 'community',
    event_date: '2026-11-01',
    location: 'Community Hall',
    guest_count: 150,
    budget: '500000',
    plan: null,
    created_at: '2026-01-01T00:00:00Z',
  };

  const item = fromBackend(row as any);
  assert.equal(item.id, '123e4567-e89b-12d3-a456-426614174000');
  assert.equal(item.title, 'Diwali Gala');
  assert.equal(item.category, 'community');
  assert.equal(item.totalBudget, 500000);
  assert.equal(item.currency, 'INR');
  assert.equal(item.startTime, '10:00');
  assert.equal(item.endTime, '18:00');
  assert.deepEqual(item.budgetItems, []);
  assert.deepEqual(item.guests, []);
  assert.deepEqual(item.tasks, []);
  assert.deepEqual(item.vendors, []);
  assert.deepEqual(item.timeline, []);
});

test('fromBackend restricts invalid categories to fallback wedding', () => {
  const row = {
    id: 'abc',
    name: 'Unknown Event',
    event_type: 'invalid_category',
    plan: {},
  };

  const item = fromBackend(row as any);
  assert.equal(item.category, 'wedding');
});

test('toBackend formats payload matching database expectations and bundles workspace into plan', () => {
  const partialEvent: Partial<EventItem> = {
    title: 'Aarav Birthday',
    category: 'birthday',
    date: '2026-08-20',
    location: 'Kids Zone',
    targetGuests: 50,
    totalBudget: 45000,
    venueName: 'Fun Paradise',
    currency: 'INR',
    guests: [],
  };

  const payload = toBackend(partialEvent);
  assert.equal(payload.name, 'Aarav Birthday');
  assert.equal(payload.event_type, 'birthday');
  assert.equal(payload.event_date, '2026-08-20');
  assert.equal(payload.location, 'Kids Zone');
  assert.equal(payload.guest_count, 50);
  assert.equal(payload.budget, 45000);
  assert.equal(payload.plan.workspace.venueName, 'Fun Paradise');
  assert.equal(payload.plan.workspace.currency, 'INR');
});
