#!/usr/bin/env node
/**
 * One-time, idempotent ERPNext setup for the Cal.com bridge. Run by an operator
 * with an ADMINISTRATOR API key (the bridge's own key must not be able to
 * change DocTypes). Safe to re-run: every step checks before it writes.
 *
 *   ERPNEXT_URL=https://erp.canopy.ag ERPNEXT_API_KEY=... ERPNEXT_API_SECRET=... \
 *     node scripts/ensure-erpnext-setup.mjs            # dry run, prints the plan
 *   ... node scripts/ensure-erpnext-setup.mjs --apply  # writes
 *
 * Creates:
 *   - Custom Fields on Opportunity (section "Cal.com booking"). The booking UID
 *     is UNIQUE: that constraint is what makes concurrent duplicate webhook
 *     deliveries collapse into one Opportunity.
 *   - UTM Source "Website" (the Lead source when a booking link has no utm_source).
 */
import { createErpClient } from '../lib/erpnext.mjs';

const apply = process.argv.includes('--apply');
for (const k of ['ERPNEXT_URL', 'ERPNEXT_API_KEY', 'ERPNEXT_API_SECRET']) {
  if (!process.env[k]) {
    console.error(`${k} is required`);
    process.exit(2);
  }
}
const erp = createErpClient({
  baseUrl: process.env.ERPNEXT_URL,
  apiKey: process.env.ERPNEXT_API_KEY,
  apiSecret: process.env.ERPNEXT_API_SECRET,
});

const base = { dt: 'Opportunity', read_only: 1, no_copy: 1 };
export const CUSTOM_FIELDS = [
  { fieldname: 'custom_calcom_section', label: 'Cal.com booking', fieldtype: 'Section Break', insert_after: 'utm_content', collapsible: 0, read_only: 0 },
  { fieldname: 'custom_calcom_booking_uid', label: 'Booking UID', fieldtype: 'Data', unique: 1, search_index: 1, insert_after: 'custom_calcom_section' },
  { fieldname: 'custom_calcom_booking_status', label: 'Booking status', fieldtype: 'Data', in_standard_filter: 1, insert_after: 'custom_calcom_booking_uid' },
  { fieldname: 'custom_calcom_meeting_start', label: 'Meeting start', fieldtype: 'Datetime', in_list_view: 1, insert_after: 'custom_calcom_booking_status' },
  { fieldname: 'custom_calcom_column', fieldtype: 'Column Break', insert_after: 'custom_calcom_meeting_start', read_only: 0 },
  { fieldname: 'custom_calcom_meeting_url', label: 'Meeting URL', fieldtype: 'Data', options: 'URL', insert_after: 'custom_calcom_column' },
  { fieldname: 'custom_calcom_rescheduled_from', label: 'Rescheduled from UID', fieldtype: 'Data', search_index: 1, insert_after: 'custom_calcom_meeting_url' },
  { fieldname: 'custom_calcom_tracking', label: 'Tracking', fieldtype: 'Small Text', insert_after: 'custom_calcom_rescheduled_from' },
  { fieldname: 'custom_calcom_last_event_at', label: 'Last webhook event (UTC)', fieldtype: 'Data', hidden: 1, insert_after: 'custom_calcom_tracking' },
];

let pending = 0;
async function step(label, isDone, write) {
  if (await isDone()) return console.log(`ok       ${label}`);
  pending += 1;
  if (!apply) return console.log(`missing  ${label}`);
  await write();
  console.log(`created  ${label}`);
}

for (const f of CUSTOM_FIELDS) {
  // Custom Field documents are named "<DocType>-<fieldname>".
  await step(
    `Custom Field Opportunity.${f.fieldname}`,
    () => erp.exists('Custom Field', `Opportunity-${f.fieldname}`),
    () => erp.insert('Custom Field', { ...base, ...f }),
  );
}
await step(
  'UTM Source "Website"',
  () => erp.exists('UTM Source', 'Website'),
  () => erp.insert('UTM Source', { name: 'Website' }),
);

if (!apply && pending) {
  console.log(`\n${pending} change(s) needed. Re-run with --apply to write them.`);
  process.exit(1);
}
