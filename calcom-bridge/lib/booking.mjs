/**
 * Cal.com (Cal.diy) webhook payload -> the booking facts the ERPNext sync needs.
 *
 * Payload contract: Cal.diy v2021-10-20 booking webhooks
 * (packages/features/webhooks/lib/factory/versioned/v2021-10-20/BookingPayloadBuilder.ts
 * at the pinned commit): { triggerEvent, createdAt, payload: { uid, startTime,
 * endTime, attendees[], responses{ name: { label, value } }, metadata,
 * videoCallData, location, status, rescheduleUid?, requestReschedule? } }.
 *
 * Pure: no I/O, so every mapping rule is unit-tested in test/booking.test.mjs.
 */

export const HANDLED_TRIGGERS = new Set(['BOOKING_CREATED', 'BOOKING_RESCHEDULED', 'BOOKING_CANCELLED']);

export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

/** Booking-question names the Demo event type uses (docs: README.md "Demo event type"). */
export const FIELD_COMPANY = 'company';
export const FIELD_PHONE = 'attendeePhoneNumber';

const MAX_TEXT = 140;

function str(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

/** A response value: Cal sends { label, value }; `name` may be { firstName, lastName }. */
function response(responses, key) {
  const entry = responses?.[key];
  if (entry === undefined || entry === null) return undefined;
  if (typeof entry === 'object' && 'value' in entry) return entry.value;
  return entry;
}

function splitName(full) {
  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function firstHttpUrl(...candidates) {
  for (const c of candidates) {
    const s = str(c);
    if (/^https:\/\//i.test(s)) return s;
  }
  return '';
}

/**
 * Normalise one webhook body. Returns { ignored: reason } for triggers we do not
 * handle, and throws on a body that claims a handled trigger but lacks the
 * fields every one of them needs (a contract break we want to see, not skip).
 */
export function parseBookingEvent(body) {
  const trigger = str(body?.triggerEvent);
  if (!HANDLED_TRIGGERS.has(trigger)) return { ignored: `trigger ${trigger || '(none)'}` };

  const p = body.payload ?? {};
  const uid = str(p.uid);
  const createdAt = str(body.createdAt);
  if (!uid) throw new Error('payload.uid missing');
  if (!createdAt || Number.isNaN(Date.parse(createdAt))) throw new Error('createdAt missing or invalid');

  const responses = p.responses ?? {};
  const attendee = Array.isArray(p.attendees) ? p.attendees[0] ?? {} : {};

  const email = str(response(responses, 'email') ?? attendee.email).toLowerCase();
  if (!email) throw new Error('attendee email missing');

  const rawName = response(responses, 'name');
  let firstName = '';
  let lastName = '';
  if (rawName && typeof rawName === 'object') {
    firstName = str(rawName.firstName);
    lastName = str(rawName.lastName);
  } else {
    ({ firstName, lastName } = splitName(str(rawName) || str(attendee.name)));
  }
  if (!firstName) firstName = email.split('@')[0];

  const utm = {};
  for (const key of UTM_KEYS) {
    const v = str(response(responses, key));
    if (v) utm[key] = v.slice(0, MAX_TEXT);
  }
  const gclid = str(response(responses, 'gclid')).slice(0, MAX_TEXT);

  const status =
    trigger === 'BOOKING_CANCELLED'
      ? p.requestReschedule
        ? 'Reschedule requested'
        : 'Cancelled'
      : trigger === 'BOOKING_RESCHEDULED'
        ? 'Rescheduled'
        : 'Accepted';

  return {
    trigger,
    uid,
    rescheduleUid: str(p.rescheduleUid) || null,
    createdAt: new Date(createdAt).toISOString(),
    startTime: str(p.startTime) || null,
    endTime: str(p.endTime) || null,
    title: str(p.title).slice(0, MAX_TEXT),
    firstName: firstName.slice(0, MAX_TEXT),
    lastName: lastName.slice(0, MAX_TEXT),
    email,
    company: str(response(responses, FIELD_COMPANY)).slice(0, MAX_TEXT),
    phone: str(response(responses, FIELD_PHONE) ?? attendee.phoneNumber).slice(0, 50),
    meetingUrl: firstHttpUrl(p.metadata?.videoCallUrl, p.videoCallData?.url, p.location),
    utm,
    gclid,
    status,
    cancellationReason: str(p.cancellationReason).slice(0, 500),
  };
}
