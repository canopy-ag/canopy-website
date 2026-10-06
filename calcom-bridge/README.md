# calcom-bridge

Cal.com booking webhooks to ERPNext. When someone books a demo on canopy.ag, this
creates or updates the **Lead** (the person) and an **Opportunity** (the demo),
following the `crm-io` contract in canopy-ai/canopy-sales: Lead = person,
Opportunity = deal.

```
schedule.canopy.ag (Cal.com) --signed webhook, in-cluster--> calcom-bridge --REST--> ERPNext
```

Runs in namespace `canopy-tools`, deployed from
`canopy-k8s-configs/canopy-tools/calcom-erpnext-bridge/`. It has **no public
route**: a ClusterIP Service plus a NetworkPolicy that admits only the Cal.com
pod. Every request must still carry a valid `X-Cal-Signature-256`.

## What it writes

| Event | Lead (found by `email_id`) | Opportunity (found by booking UID) |
|---|---|---|
| `BOOKING_CREATED` | created if missing; an existing Lead only has blanks filled (company, mobile, UTM) | created: `opportunity_from=Lead`, status Open, meeting start/URL, UTM, booking status `Accepted` |
| `BOOKING_RESCHEDULED` | unchanged | the same Opportunity moves to the new UID and time; old UID kept in `custom_calcom_rescheduled_from`; status `Rescheduled` |
| `BOOKING_CANCELLED` | unchanged | status Closed, booking status `Cancelled` (or Open + `Reschedule requested` when the host asked the booker to rebook) |

- **Source:** ERPNext v16's Lead has no `source` field; its `utm_source` (Link to
  UTM Source) is the source. A booking link with no `utm_source` gets
  `Website`. `utm_medium` / `utm_campaign` records are created on first use.
  `utm_term` and `gclid` go into the Opportunity's Tracking field.
- **Times:** `custom_calcom_meeting_start` is written as wall-clock time in
  `ERPNEXT_TIME_ZONE`, which must equal ERPNext's System Settings time zone.

## Idempotency

Duplicate and out-of-order deliveries are safe:

1. Upserts keyed on stable IDs. The booking UID custom field is UNIQUE in
   ERPNext, so even two concurrent deliveries end in one Opportunity (the loser's
   409 becomes an update).
2. `custom_calcom_last_event_at` stores the webhook `createdAt`; an event at or
   before it is skipped.
3. A late event for a UID the Opportunity was rescheduled away from is skipped.
4. Work for one email is serialised in-process (the Deployment is one replica).

## Responses

`200` applied or skipped · `202` trigger not handled · `401` bad signature ·
`422` malformed booking (retrying cannot help) · `502` ERPNext failed (safe to
retry).

## Configuration

| Env | Example | Notes |
|---|---|---|
| `CALCOM_WEBHOOK_SECRET` | (Vault) | the secret set on the Cal.com webhook |
| `ERPNEXT_URL` | `http://erpnext-dev.canopy-tools.svc.cluster.local:8080` | in-cluster nginx; it sets the Frappe site header itself |
| `ERPNEXT_API_KEY` / `ERPNEXT_API_SECRET` | (Vault) | a dedicated API user, not Administrator |
| `ERPNEXT_COMPANY` | exact ERPNext Company name | Opportunity requires it |
| `ERPNEXT_TIME_ZONE` | IANA zone | must match System Settings |
| `ERPNEXT_OPPORTUNITY_TYPE` | `Sales` (default) | an existing Opportunity Type |

## Demo event type (Cal.com side)

Booking questions the bridge reads, by **identifier** (not label):

- `name`, `email`: system fields.
- `company`: Short text, required.
- `attendeePhoneNumber`: the system phone field; enable it to collect phone.
- `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `gclid`:
  Short text, **hidden**. The canopy.ag embed passes these as URL params, which
  pre-fill them; this is how campaign data reaches the webhook payload.

Webhook: Settings, then Developer, then Webhooks. Subscriber URL
`http://calcom-erpnext-bridge.canopy-tools.svc.cluster.local:8080/webhook`
(self-hosted Cal.com allows in-cluster HTTP URLs), triggers Booking created,
Booking rescheduled and Booking cancelled, payload template left at the default,
and the secret from Vault.

## ERPNext setup (once)

1. Create an API-only user (for example `calcom-bridge@canopy.ag`) with role
   **Sales User** and generate its API key/secret. It needs create/read/write on
   Lead and Opportunity and create on UTM Source/Medium/Campaign. If UTM inserts
   return 403, grant those three doctypes to the role rather than using an admin key.
2. With an Administrator key, run `npm run erpnext:setup` (dry run), then with
   `--apply`. It creates the Opportunity custom fields and UTM Source `Website`.

## Develop

`npm test` (Node 22+, no dependencies to install).
