/**
 * Apply one Cal.com booking event to ERPNext: find-or-create the Lead (by email),
 * then upsert the booking's Opportunity (by Cal booking UID).
 *
 * Idempotency, in order of defence:
 *   1. Everything is an upsert keyed on stable identifiers (Lead by email_id,
 *      Opportunity by custom_calcom_booking_uid, which is UNIQUE in ERPNext), so
 *      a redelivered event re-applies the same state and creates nothing.
 *   2. custom_calcom_last_event_at holds the webhook createdAt (ISO UTC) of the
 *      last event applied; an event at or before it is a duplicate or arrived
 *      late, and is skipped.
 *   3. A reschedule moves the Opportunity to the NEW uid and remembers the old
 *      one in custom_calcom_rescheduled_from, so a late event for the old uid
 *      cannot resurrect or duplicate it.
 *   4. Concurrent deliveries for the same person are serialised in-process
 *      (single replica), and a 409 on the UNIQUE uid falls back to update.
 *
 * Field shape follows the canopy-sales crm-io contract: Lead = the person,
 * Opportunity = the deal (opportunity_from = Lead). ERPNext v16 has no Lead
 * `source`; its UTM Source link is the source, "Website" when the booking link
 * carried no utm_source.
 */

import { ErpError } from './erpnext.mjs';

export const DEFAULT_SOURCE = 'Website';

const UTM_LINKS = { utm_source: 'UTM Source', utm_medium: 'UTM Medium', utm_campaign: 'UTM Campaign' };

const OPP_FIELDS = [
  'name',
  'status',
  'party_name',
  'custom_calcom_booking_uid',
  'custom_calcom_rescheduled_from',
  'custom_calcom_last_event_at',
];

/** "YYYY-MM-DD HH:MM:SS" in ERPNext's system time zone (Datetime fields are naive). */
export function toErpDatetime(iso, timeZone) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

/** Opportunity status for a Cal booking status. */
export function opportunityStatus(bookingStatus) {
  return bookingStatus === 'Cancelled' ? 'Closed' : 'Open';
}

function trackingNote(ev) {
  const bits = [];
  if (ev.utm.utm_term) bits.push(`utm_term=${ev.utm.utm_term}`);
  if (ev.gclid) bits.push(`gclid=${ev.gclid}`);
  if (ev.cancellationReason) bits.push(`cancellation: ${ev.cancellationReason}`);
  return bits.join('\n');
}

const locks = new Map();
/** Serialise work per key (one replica; see the Deployment). */
export async function withLock(key, fn) {
  const prev = locks.get(key) ?? Promise.resolve();
  let release;
  const next = new Promise((r) => (release = r));
  const chained = prev.then(() => next);
  locks.set(key, chained);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(key) === chained) locks.delete(key);
  }
}

export function createSync({ erp, company, timeZone, opportunityType = 'Sales', log = () => {} }) {
  if (!company) throw new Error('ERPNEXT_COMPANY is required');
  if (!timeZone) throw new Error('ERPNEXT_TIME_ZONE is required');

  const knownLinks = new Set();
  async function ensureLink(doctype, value) {
    if (!value) return null;
    const key = `${doctype}\u0000${value}`;
    if (knownLinks.has(key)) return value;
    if (!(await erp.exists(doctype, value))) {
      try {
        await erp.insert(doctype, { name: value });
      } catch (err) {
        if (!(err instanceof ErpError && err.status === 409)) throw err;
      }
    }
    knownLinks.add(key);
    return value;
  }

  async function utmFields(ev) {
    const out = {};
    const source = ev.utm.utm_source || DEFAULT_SOURCE;
    out.utm_source = await ensureLink(UTM_LINKS.utm_source, source);
    if (ev.utm.utm_medium) out.utm_medium = await ensureLink(UTM_LINKS.utm_medium, ev.utm.utm_medium);
    if (ev.utm.utm_campaign) out.utm_campaign = await ensureLink(UTM_LINKS.utm_campaign, ev.utm.utm_campaign);
    if (ev.utm.utm_content) out.utm_content = ev.utm.utm_content;
    return out;
  }

  async function upsertLead(ev, utm) {
    const [existing] = await erp.list('Lead', {
      filters: [['email_id', '=', ev.email]],
      fields: ['name', 'company_name', 'mobile_no', 'utm_source', 'utm_medium', 'utm_campaign'],
      limit: 1,
    });
    if (!existing) {
      const lead = await erp.insert('Lead', {
        first_name: ev.firstName,
        last_name: ev.lastName || undefined,
        email_id: ev.email,
        company_name: ev.company || undefined,
        mobile_no: ev.phone || undefined,
        request_type: 'Product Enquiry',
        ...utm,
      });
      log('lead.created', { lead: lead.name });
      return lead.name;
    }
    // Existing Lead: fill blanks only. First-touch attribution and anything a
    // human typed are never overwritten by a later booking.
    const patch = {};
    if (!existing.company_name && ev.company) patch.company_name = ev.company;
    if (!existing.mobile_no && ev.phone) patch.mobile_no = ev.phone;
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign']) {
      if (!existing[k] && utm[k]) patch[k] = utm[k];
    }
    if (Object.keys(patch).length) await erp.update('Lead', existing.name, patch);
    return existing.name;
  }

  async function findOpportunity(uids) {
    const wanted = uids.filter(Boolean);
    if (!wanted.length) return null;
    const [byUid] = await erp.list('Opportunity', {
      filters: [['custom_calcom_booking_uid', 'in', wanted]],
      fields: OPP_FIELDS,
      limit: 1,
    });
    if (byUid) return { opp: byUid, via: 'uid' };
    const [byOld] = await erp.list('Opportunity', {
      filters: [['custom_calcom_rescheduled_from', 'in', wanted]],
      fields: OPP_FIELDS,
      limit: 1,
    });
    return byOld ? { opp: byOld, via: 'rescheduled_from' } : null;
  }

  return async function apply(ev) {
    return withLock(ev.email, async () => {
      const lookupUids = ev.trigger === 'BOOKING_RESCHEDULED' ? [ev.uid, ev.rescheduleUid] : [ev.uid];
      const found = await findOpportunity(lookupUids);

      if (found) {
        const { opp, via } = found;
        // An event for a uid this Opportunity was rescheduled AWAY from is stale.
        if (via === 'rescheduled_from' && ev.trigger !== 'BOOKING_RESCHEDULED') {
          return { action: 'skipped', reason: 'event for superseded uid', opportunity: opp.name };
        }
        const last = opp.custom_calcom_last_event_at;
        if (last && Date.parse(last) >= Date.parse(ev.createdAt)) {
          return { action: 'skipped', reason: 'duplicate or out-of-order delivery', opportunity: opp.name };
        }
      }

      const utm = await utmFields(ev);
      const lead = found?.opp.party_name ?? (await upsertLead(ev, utm));

      const fields = {
        status: opportunityStatus(ev.status),
        contact_email: ev.email,
        phone: ev.phone || undefined,
        custom_calcom_booking_uid: ev.uid,
        custom_calcom_booking_status: ev.status,
        custom_calcom_meeting_start: toErpDatetime(ev.startTime, timeZone),
        custom_calcom_meeting_url: ev.meetingUrl || undefined,
        custom_calcom_last_event_at: ev.createdAt,
        custom_calcom_tracking: trackingNote(ev) || undefined,
      };
      if (ev.trigger === 'BOOKING_RESCHEDULED' && ev.rescheduleUid && ev.rescheduleUid !== ev.uid) {
        fields.custom_calcom_rescheduled_from = ev.rescheduleUid;
      }

      if (found) {
        await erp.update('Opportunity', found.opp.name, fields);
        return { action: 'updated', lead, opportunity: found.opp.name };
      }

      try {
        const opp = await erp.insert('Opportunity', {
          opportunity_from: 'Lead',
          party_name: lead,
          company,
          opportunity_type: opportunityType,
          transaction_date: toErpDatetime(ev.createdAt, timeZone).slice(0, 10),
          ...utm,
          ...fields,
        });
        return { action: 'created', lead, opportunity: opp.name };
      } catch (err) {
        // Lost a race with a concurrent delivery of the same booking: the UNIQUE
        // uid already exists, so this delivery becomes an update.
        if (err instanceof ErpError && err.status === 409) {
          const again = await findOpportunity([ev.uid]);
          if (again) {
            await erp.update('Opportunity', again.opp.name, fields);
            return { action: 'updated', lead, opportunity: again.opp.name };
          }
        }
        throw err;
      }
    });
  };
}
