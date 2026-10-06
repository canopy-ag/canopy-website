import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { parseBookingEvent } from '../lib/booking.mjs';
import { signatureValid } from '../lib/signature.mjs';
import { createSync, opportunityStatus, toErpDatetime } from '../lib/sync.mjs';
import { ErpError } from '../lib/erpnext.mjs';

// ---------------------------------------------------------------- fixtures

function webhook(trigger, overrides = {}, createdAt = '2026-10-06T15:00:00.000Z') {
  return {
    triggerEvent: trigger,
    createdAt,
    payload: {
      uid: 'uid-1',
      title: 'Demo between Canopy and Pat Grower',
      startTime: '2026-10-08T14:00:00Z',
      endTime: '2026-10-08T14:30:00Z',
      attendees: [{ name: 'Pat Grower', email: 'Pat@Example.com', timeZone: 'America/Chicago' }],
      responses: {
        name: { label: 'Your name', value: 'Pat Grower' },
        email: { label: 'Email', value: 'Pat@Example.com' },
        company: { label: 'Company', value: 'Green Acres Nursery' },
        attendeePhoneNumber: { label: 'Phone', value: '+15551234567' },
        utm_source: { label: 'utm_source', value: 'linkedin' },
        utm_campaign: { label: 'utm_campaign', value: 'q4-demo' },
        utm_term: { label: 'utm_term', value: 'irrigation' },
      },
      metadata: { videoCallUrl: 'https://meet.google.com/abc-defg-hij' },
      status: 'ACCEPTED',
      ...overrides,
    },
  };
}

/** In-memory ERPNext with the UNIQUE uid constraint the custom field declares. */
function fakeErp() {
  const db = { Lead: [], Opportunity: [], 'UTM Source': [], 'UTM Medium': [], 'UTM Campaign': [] };
  const calls = [];
  let seq = 0;
  const match = (doc, [field, op, value]) =>
    op === 'in' ? value.includes(doc[field]) : String(doc[field] ?? '').toLowerCase() === String(value).toLowerCase();
  return {
    db,
    calls,
    async list(doctype, { filters = [], limit = 20 } = {}) {
      calls.push(['list', doctype]);
      return db[doctype].filter((d) => filters.every((f) => match(d, f))).slice(0, limit).map((d) => ({ ...d }));
    },
    async insert(doctype, doc) {
      calls.push(['insert', doctype]);
      if (doctype === 'Opportunity' && db.Opportunity.some((o) => o.custom_calcom_booking_uid === doc.custom_calcom_booking_uid)) {
        throw new ErpError('duplicate', 409, {});
      }
      const name = doc.name ?? `${doctype}-${++seq}`;
      const row = JSON.parse(JSON.stringify({ ...doc, name }));
      db[doctype].push(row);
      return row;
    },
    async update(doctype, name, patch) {
      calls.push(['update', doctype]);
      const row = db[doctype].find((d) => d.name === name);
      Object.assign(row, JSON.parse(JSON.stringify(patch)));
      return row;
    },
    async exists(doctype, name) {
      return db[doctype].some((d) => d.name === name);
    },
  };
}

const syncWith = (erp) => createSync({ erp, company: 'Canopy Ag', timeZone: 'America/New_York' });

// ---------------------------------------------------------------- parsing

test('parses a created booking into the fields ERPNext needs', () => {
  const ev = parseBookingEvent(webhook('BOOKING_CREATED'));
  assert.equal(ev.uid, 'uid-1');
  assert.equal(ev.email, 'pat@example.com');
  assert.equal(ev.firstName, 'Pat');
  assert.equal(ev.lastName, 'Grower');
  assert.equal(ev.company, 'Green Acres Nursery');
  assert.equal(ev.phone, '+15551234567');
  assert.equal(ev.meetingUrl, 'https://meet.google.com/abc-defg-hij');
  assert.deepEqual(ev.utm, { utm_source: 'linkedin', utm_campaign: 'q4-demo', utm_term: 'irrigation' });
  assert.equal(ev.status, 'Accepted');
});

test('ignores triggers it does not handle, rejects a broken booking body', () => {
  assert.deepEqual(parseBookingEvent({ triggerEvent: 'MEETING_ENDED' }), { ignored: 'trigger MEETING_ENDED' });
  assert.throws(() => parseBookingEvent(webhook('BOOKING_CREATED', { uid: '' })), /uid/);
});

test('falls back to the meeting location and the attendee record', () => {
  const ev = parseBookingEvent(
    webhook('BOOKING_CREATED', { metadata: {}, location: 'https://meet.google.com/xyz', responses: { email: { value: 'a@b.co' } } }),
  );
  assert.equal(ev.meetingUrl, 'https://meet.google.com/xyz');
  assert.equal(ev.firstName, 'Pat');
});

test('a cancel that asks for a reschedule is not a dead deal', () => {
  assert.equal(parseBookingEvent(webhook('BOOKING_CANCELLED', { requestReschedule: true })).status, 'Reschedule requested');
  assert.equal(opportunityStatus('Reschedule requested'), 'Open');
  assert.equal(opportunityStatus('Cancelled'), 'Closed');
});

// ---------------------------------------------------------------- signature

test('accepts only the exact HMAC of the raw body', () => {
  const raw = Buffer.from(JSON.stringify(webhook('BOOKING_CREATED')));
  const sig = createHmac('sha256', 's3cret').update(raw).digest('hex');
  assert.equal(signatureValid(raw, sig, 's3cret'), true);
  assert.equal(signatureValid(raw, sig, 'other'), false);
  assert.equal(signatureValid(Buffer.concat([raw, Buffer.from(' ')]), sig, 's3cret'), false);
  assert.equal(signatureValid(raw, undefined, 's3cret'), false);
  assert.equal(signatureValid(raw, 'zz', 's3cret'), false);
});

// ---------------------------------------------------------------- sync

test('created: one Lead (source from utm) and one Opportunity', async () => {
  const erp = fakeErp();
  const r = await syncWith(erp)(parseBookingEvent(webhook('BOOKING_CREATED')));
  assert.equal(r.action, 'created');
  assert.equal(erp.db.Lead.length, 1);
  assert.equal(erp.db.Lead[0].utm_source, 'linkedin');
  const [opp] = erp.db.Opportunity;
  assert.equal(opp.opportunity_from, 'Lead');
  assert.equal(opp.party_name, erp.db.Lead[0].name);
  assert.equal(opp.status, 'Open');
  assert.equal(opp.company, 'Canopy Ag');
  assert.equal(opp.custom_calcom_meeting_start, '2026-10-08 10:00:00'); // America/New_York
  assert.equal(opp.custom_calcom_meeting_url, 'https://meet.google.com/abc-defg-hij');
  assert.match(opp.custom_calcom_tracking, /utm_term=irrigation/);
  assert.deepEqual(erp.db['UTM Campaign'].map((d) => d.name), ['q4-demo']);
});

test('no utm_source on the link: Lead source is Website', async () => {
  const erp = fakeErp();
  const body = webhook('BOOKING_CREATED');
  delete body.payload.responses.utm_source;
  await syncWith(erp)(parseBookingEvent(body));
  assert.equal(erp.db.Lead[0].utm_source, 'Website');
});

test('duplicate delivery creates nothing new', async () => {
  const erp = fakeErp();
  const apply = syncWith(erp);
  const ev = parseBookingEvent(webhook('BOOKING_CREATED'));
  await apply(ev);
  const r = await apply(ev);
  assert.equal(r.action, 'skipped');
  assert.equal(erp.db.Lead.length, 1);
  assert.equal(erp.db.Opportunity.length, 1);
});

test('concurrent duplicate deliveries still yield one Lead and one Opportunity', async () => {
  const erp = fakeErp();
  const apply = syncWith(erp);
  const ev = parseBookingEvent(webhook('BOOKING_CREATED'));
  await Promise.all([apply(ev), apply(ev), apply(ev)]);
  assert.equal(erp.db.Lead.length, 1);
  assert.equal(erp.db.Opportunity.length, 1);
});

test('a second booking by the same person reuses the Lead and adds an Opportunity', async () => {
  const erp = fakeErp();
  const apply = syncWith(erp);
  await apply(parseBookingEvent(webhook('BOOKING_CREATED')));
  await apply(parseBookingEvent(webhook('BOOKING_CREATED', { uid: 'uid-2' }, '2026-10-07T10:00:00Z')));
  assert.equal(erp.db.Lead.length, 1);
  assert.equal(erp.db.Opportunity.length, 2);
});

test('existing Lead keeps first-touch attribution and human edits', async () => {
  const erp = fakeErp();
  erp.db.Lead.push({ name: 'L-1', email_id: 'pat@example.com', company_name: 'Typed By Sales', utm_source: 'Referral' });
  await syncWith(erp)(parseBookingEvent(webhook('BOOKING_CREATED')));
  assert.equal(erp.db.Lead[0].company_name, 'Typed By Sales');
  assert.equal(erp.db.Lead[0].utm_source, 'Referral');
  assert.equal(erp.db.Lead[0].mobile_no, '+15551234567'); // blank was filled
});

test('reschedule moves the same Opportunity to the new uid and time', async () => {
  const erp = fakeErp();
  const apply = syncWith(erp);
  await apply(parseBookingEvent(webhook('BOOKING_CREATED')));
  const r = await apply(
    parseBookingEvent(
      webhook('BOOKING_RESCHEDULED', { uid: 'uid-1b', rescheduleUid: 'uid-1', startTime: '2026-10-09T18:00:00Z' }, '2026-10-06T16:00:00Z'),
    ),
  );
  assert.equal(r.action, 'updated');
  assert.equal(erp.db.Opportunity.length, 1);
  const [opp] = erp.db.Opportunity;
  assert.equal(opp.custom_calcom_booking_uid, 'uid-1b');
  assert.equal(opp.custom_calcom_rescheduled_from, 'uid-1');
  assert.equal(opp.custom_calcom_booking_status, 'Rescheduled');
  assert.equal(opp.custom_calcom_meeting_start, '2026-10-09 14:00:00');
});

test('a late event for the pre-reschedule uid is ignored', async () => {
  const erp = fakeErp();
  const apply = syncWith(erp);
  await apply(parseBookingEvent(webhook('BOOKING_CREATED')));
  await apply(parseBookingEvent(webhook('BOOKING_RESCHEDULED', { uid: 'uid-1b', rescheduleUid: 'uid-1' }, '2026-10-06T16:00:00Z')));
  const r = await apply(parseBookingEvent(webhook('BOOKING_CANCELLED', { uid: 'uid-1' }, '2026-10-06T17:00:00Z')));
  assert.equal(r.action, 'skipped');
  assert.equal(erp.db.Opportunity[0].status, 'Open');
  assert.equal(erp.db.Opportunity.length, 1);
});

test('cancel closes the Opportunity; an older event delivered after it is skipped', async () => {
  const erp = fakeErp();
  const apply = syncWith(erp);
  await apply(parseBookingEvent(webhook('BOOKING_CREATED')));
  await apply(parseBookingEvent(webhook('BOOKING_CANCELLED', {}, '2026-10-06T18:00:00Z')));
  assert.equal(erp.db.Opportunity[0].status, 'Closed');
  assert.equal(erp.db.Opportunity[0].custom_calcom_booking_status, 'Cancelled');
  const late = await apply(parseBookingEvent(webhook('BOOKING_CREATED', {}, '2026-10-06T15:00:00Z')));
  assert.equal(late.action, 'skipped');
  assert.equal(erp.db.Opportunity[0].status, 'Closed');
});

test('ERPNext datetimes are naive wall-clock in the system time zone', () => {
  assert.equal(toErpDatetime('2026-01-15T14:00:00Z', 'America/New_York'), '2026-01-15 09:00:00');
  assert.equal(toErpDatetime('2026-07-15T14:00:00Z', 'UTC'), '2026-07-15 14:00:00');
  assert.equal(toErpDatetime(null, 'UTC'), null);
});
