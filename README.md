# SwiftDrop — Courier & Logistics Management Platform

A backend-only courier and logistics platform where customers create and track parcel shipments, delivery agents manage assigned deliveries, and administrators oversee users, shipments, delivery operations, payments, and platform activity. Built to support a frontend that will be developed separately later, without requiring architectural changes to the API.

**Live API:** https://shiftdrop-platform-backend.vercel.app/

---

## Project Summary

SwiftDrop models a real courier workflow end-to-end:

1. A **customer** creates a shipment with sender/receiver details, pickup and delivery addresses, parcel type, and weight. The system calculates a delivery charge automatically from weight, service type, and cross-city zone — the client never supplies a price.
2. An **admin** assigns an available **delivery agent** to the shipment. Assignment is protected against race conditions using atomic, transaction-scoped claims, so two admins can never double-book the same agent.
3. The agent accepts (or rejects) the job, picks up the parcel, and moves it through a strictly enforced status pipeline (`PICKED_UP → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED`), with invalid or out-of-order transitions rejected at the service layer.
4. Payment is handled through **Stripe Checkout**, with payment status updated exclusively by a **verified Stripe webhook** — a client can never mark an order as paid by calling the API directly.
5. Every meaningful action (shipment created, status changed, agent assigned, payment completed, etc.) is recorded in an **audit log**, viewable by admins.

The project was intentionally built phase by phase, with each phase kept deployable, so that infrastructure issues (database connectivity, serverless deployment config, webhook signature handling) surfaced early rather than at the end.

---

## Tech Stack

| Category | Technology |
|---|---|
| Runtime | Node.js |
| Language | TypeScript |
| Framework | Express 5 |
| Database | PostgreSQL |
| ORM | Prisma 7 (multi-file schema, driver adapter via `@prisma/adapter-pg`) |
| Validation | Zod |
| Auth | JWT (access + rotating refresh tokens), bcryptjs password hashing |
| Social Login | Google OAuth (`google-auth-library`) |
| Payments | Stripe Checkout + verified webhooks |
| Caching | Upstash Redis (health-check round-trip) |
| Security | Helmet, CORS (origin allowlist), express-rate-limit |
| Build | tsup (esbuild-based bundler, solves path-alias resolution) |
| Deployment | Vercel (serverless functions) |
| API Docs | Postman collection |

---

## Authentication & Authorization

- **Three fixed roles:** `CUSTOMER`, `DELIVERY_AGENT`, `ADMIN`. Self-registration is only permitted for the first two — `ADMIN` accounts are created exclusively via a seed script, never through the public API.
- **Email/password:** registration hashes passwords with bcrypt (cost factor 12); login issues a short-lived JWT access token (15 min default) and a longer-lived refresh token (7 days default).
- **Refresh tokens** live in their own database table (not just signed and trusted blindly) so they can be individually revoked and are **rotated on every use** — each refresh call invalidates the token that was just used and issues a new one, limiting the blast radius of a leaked token.
- **Google OAuth:** the client obtains a Google `idToken` and sends it to the backend, which verifies it server-side via `google-auth-library`. If the email matches an existing local account, the Google identity is linked to it rather than creating a duplicate user. New Google sign-ups default to role `CUSTOMER` — Google has no way to indicate role, so the backend never trusts a client-supplied role.
- **RBAC middleware:** `authenticate` verifies the JWT and re-checks the user's live status in the database on every request (so a suspended or deleted account's still-valid token is rejected immediately, not just after expiry). `authorize(...roles)` restricts routes to specific roles. Ownership checks (a customer can only see their own shipments, an agent only their assigned ones) are enforced at the service layer, not just at the route layer — changing an ID in the URL cannot expose another user's data.

---

## Payment System (Stripe)

Payment integration follows a strict rule: **the backend never trusts a client-submitted payment status.** A request body like `{ "status": "PAID" }` has no code path that could ever set a payment to paid.

**Flow:**
```
Customer requests checkout
      ↓
Backend creates a PENDING Payment record + Stripe Checkout Session
      ↓
Customer pays on Stripe's hosted checkout page (test mode)
      ↓
Stripe sends a signed webhook event to /api/v1/payments/webhook
      ↓
Backend verifies the webhook signature (rejects anything unsigned or tampered)
      ↓
Only then: Payment → PAID, Parcel → CONFIRMED, audit log written
```

Key implementation details:
- The webhook route is mounted with `express.raw()` **before** `express.json()` in the middleware chain, because Stripe's signature is computed over the exact raw request bytes — a JSON-parsed-and-re-serialized body would fail verification even if the content were identical.
- Each processed Stripe event ID is stored (`lastProcessedEventId`) so retried/duplicate webhook deliveries are idempotent no-ops rather than double-processing.
- A `FAILED` event can never downgrade an already-`PAID` payment, protecting against out-of-order webhook delivery.
- Local webhook testing uses the Stripe CLI (`stripe listen --forward-to localhost:5000/api/v1/payments/webhook`), which forwards real test-mode events to the local server with its own signing secret.
- In production, a webhook endpoint is registered directly in the Stripe Dashboard pointing at the live URL (`/api/v1/payments/webhook`), with its own `STRIPE_WEBHOOK_SECRET` set in the deployment environment — this is separate from the local CLI's secret.
- `success_url`/`cancel_url` currently point at simple static HTML pages served from the backend (`/payment-success.html`, `/payment-cancelled.html`) via `CLIENT_URL`, since no frontend exists yet. Once the frontend is live, `CLIENT_URL` is updated to point there — no backend code changes required.

---

## Agent Earnings & Commission Model

Delivery agents earn a **percentage-based commission** on shipments they complete:

- **Rate:** `AGENT_COMMISSION_RATE` (env-configurable, default `0.7` — agent earns 70% of the shipment's `deliveryCharge`).
- **Eligibility:** only parcels that are both `DELIVERED` **and** have a `PAID` payment count toward earnings. A delivered-but-unpaid shipment (e.g. a failed or abandoned payment) is deliberately excluded — crediting an agent for revenue the platform never actually collected would create a real financial liability.
- **No schema changes required** — earnings are computed on read from existing `Parcel`/`Payment` data, not stored as a separate ledger. This keeps the model simple and avoids inventing a payroll system beyond what the project needs.
- Percentage-based (rather than a flat fee per delivery) was chosen deliberately: it scales fairly with shipment size and revenue, matching how real courier platforms typically structure agent pay.

---

## Shipment Status State Machine

Status changes are validated against a centralized transition table rather than allowed arbitrarily:

```
PENDING → CONFIRMED, CANCELLED
CONFIRMED → ASSIGNED, CANCELLED
ASSIGNED → PICKED_UP, CONFIRMED (agent rejects)
PICKED_UP → IN_TRANSIT, FAILED_DELIVERY
IN_TRANSIT → OUT_FOR_DELIVERY, FAILED_DELIVERY
OUT_FOR_DELIVERY → DELIVERED, FAILED_DELIVERY
FAILED_DELIVERY → OUT_FOR_DELIVERY (retry), RETURNED
DELIVERED / CANCELLED / RETURNED → terminal (no further transitions)
```

An attempt like `DELIVERED → PENDING` is rejected with `409 Conflict` before it ever reaches the database. Every valid transition writes a row to `ParcelStatusHistory` in the same transaction as the status change, giving each shipment a full auditable timeline.

---

## Delivery Agent Assignment (Concurrency Safety)

Assigning an agent to a shipment is a classic double-booking risk under concurrent requests. This is handled with conditional, transaction-scoped `updateMany` calls instead of a naive read-then-write:

- Claiming the agent (`availability: AVAILABLE → ON_DELIVERY`) and claiming the parcel (`status → ASSIGNED`) each check their *current* state as part of the `WHERE` clause at write time, inside a single Prisma transaction.
- If either claim affects zero rows — meaning someone else's request got there first — the whole operation fails loudly with `409 Conflict` and nothing is left in a half-updated state, rather than silently overwriting a concurrent assignment.

---

## Database Design Highlights

- **Role-specific data lives in separate tables** (`Customer`, `DeliveryAgent`), each linked 1:1 to a shared `User` table — rather than one wide table with mostly-null role-specific columns.
- **Soft deletes** (`deletedAt`) are used for `User` and `Parcel` records; normal queries exclude soft-deleted rows by default.
- **Refresh tokens** are a separate table (not a field on `User`), allowing multiple concurrent sessions and per-token revocation.
- **Audit logs** reference `actorId` as a plain string, not a foreign key, so the audit trail remains intact even in edge cases involving account removal; `actorId` is nullable to support system-triggered events (e.g. a Stripe webhook confirming payment).
- Prisma schema is split into separate domain files (`user.prisma`, `parcel.prisma`, `payment.prisma`, `auditLog.prisma`, etc.) under `prisma/schema/`, rather than one monolithic `schema.prisma`.

---

## Problems & Challenges Encountered

| Issue | Resolution |
|---|---|
| Prisma 7 changed the default client export — `@prisma/client` no longer auto-exports `PrismaClient` | Configured an explicit `output` path in the `generator client` block and imported from the generated path directly |
| `tsup` bundling conflicted with path aliases (`@/*`) during early setup | Standardized on relative imports (`../../module`) across the codebase instead of relying on alias resolution at build time |
| A profile update endpoint returned `200 OK` but showed stale (pre-update) data | Root cause: the confirmation read was happening *inside* the same Prisma `$transaction` callback as the write, before the transaction had committed, so it read through an uncommitted/isolated view. Fixed by moving the read to run only after the transaction resolved |
| Delivery agent assignment repeatedly returned `404 Delivery agent not found` despite a valid ID being sent | The ID being sent was the agent's `User.id`, but the service was looking it up by the internal `DeliveryAgent.id` (a different UUID) — a design gap, since there was no endpoint exposing the internal ID in the first place. Fixed by having the assignment endpoint accept and look up by `User.id` instead, which is the identifier an admin would realistically have access to |
| Stripe webhook signature verification failing | Traced to `express.json()` parsing the body before it reached the webhook handler, which alters the raw bytes the signature was computed over. Fixed by mounting the webhook route with `express.raw()` ahead of the global JSON body parser |
| Postman requests returning `401 Authentication token is missing` despite a token being set | Two causes surfaced during testing: (1) the `Bearer ` prefix was omitted from the raw header value, and (2) a refresh token was mistakenly used where an access token was required — each is signed with a different secret and fails verification against the wrong one |
| Express 5's stricter typing on `req.params` (`string \| string[]`) breaking TypeScript builds | Since Zod validation middleware already guarantees param shape before the controller runs, params are read with a narrow, justified type assertion at the point of use rather than restructuring the routing layer |
| The generic profile update endpoint (`PATCH /users/me`) allowed a delivery agent to set their own `availability` to any value, including `ON_DELIVERY` — which is meant to be system-controlled by active assignment, and could desync from real assignment state, risking a double-booking | `availability` was removed from the generic profile endpoint entirely and moved to a dedicated `PATCH /deliveries/availability` endpoint whose Zod schema only accepts `AVAILABLE`/`OFFLINE` (rejecting `ON_DELIVERY` before it reaches business logic), and which additionally checks for any active in-progress parcel before allowing the change |

---

## Project Architecture

```
src/
├── config/         # env validation (Zod-parsed process.env)
├── lib/            # Prisma client singleton, Stripe client, Redis service
├── middlewares/     # authenticate, authorize, validateRequest, rate limiters, error handling
├── modules/
│   ├── auth/       # register, login, google login, refresh, logout
│   ├── user/       # profile get/update
│   ├── parcel/     # shipment CRUD, pricing, state machine
│   ├── delivery/   # agent assignment workflow
│   ├── payment/    # Stripe checkout + webhook
│   └── admin/      # audit log viewer
├── routes/         # /api/v1 router aggregation
├── types/          # Express Request type extensions
├── utils/          # response envelope, catchAsync, tracking ID generator, audit logger
├── app.ts
└── server.ts

prisma/
└── schema/         # multi-file schema: user.prisma, parcel.prisma, payment.prisma, auditLog.prisma, client.prisma
```

Request flow: **Route → Validation (Zod) → Authentication → Authorization → Controller → Service → Prisma**. Business logic lives in services; controllers stay thin.

---

## API Response Format

All endpoints return a consistent envelope.

**Success:**
```json
{
  "success": true,
  "message": "Operation successful",
  "data": {}
}
```

**Error:**
```json
{
  "success": false,
  "message": "Something went wrong",
  "errors": []
}
```

List endpoints additionally include a `meta` object for pagination:
```json
{ "page": 1, "limit": 10, "total": 42, "totalPages": 5 }
```

All routes are versioned under `/api/v1`.

---

## API Routes

Full request/response examples for every route below are in the accompanying **Postman collection** (`SwiftDrop.postman_collection.json`). Import it and set the `baseUrl`, `accessToken`, and `refreshToken` collection variables to get started.

### Auth (`/api/v1/auth`)
| Method | Route | Access | Description |
|---|---|---|---|
| POST | `/register` | Public | Register as CUSTOMER or DELIVERY_AGENT |
| POST | `/login` | Public | Email/password login |
| POST | `/google` | Public | Login/register via Google idToken |
| POST | `/refresh-token` | Public | Rotate refresh token, issue new pair |
| POST | `/logout` | Public | Revoke a refresh token |

### Users (`/api/v1/users`)
| Method | Route | Access | Description |
|---|---|---|---|
| GET | `/me` | Authenticated | Get own profile (role-aware) |
| PATCH | `/me` | Authenticated | Update own profile |

### Parcels (`/api/v1/parcels`)
| Method | Route | Access | Description |
|---|---|---|---|
| POST | `/` | CUSTOMER | Create a shipment |
| GET | `/` | Authenticated | List shipments (role-scoped) — supports `page`, `limit`, `status`, `sortBy`, `sortOrder`, `q` |
| GET | `/:id` | Authenticated | Get shipment details + status history (ownership enforced) |
| PATCH | `/:id/cancel` | CUSTOMER | Cancel a shipment (only while PENDING/CONFIRMED) |
| PATCH | `/:id/status` | DELIVERY_AGENT, ADMIN | Advance shipment status per the state machine |

### Deliveries (`/api/v1/deliveries`)
| Method | Route | Access | Description |
|---|---|---|---|
| PATCH | `/:parcelId/assign` | ADMIN | Assign a delivery agent (by User ID) to a shipment |
| PATCH | `/:parcelId/accept` | DELIVERY_AGENT | Accept an assignment |
| PATCH | `/:parcelId/reject` | DELIVERY_AGENT | Reject an assignment (returns parcel to pool) |
| PATCH | `/:parcelId/pickup` | DELIVERY_AGENT | Mark parcel as picked up |
| GET | `/my` | DELIVERY_AGENT | List own assigned deliveries — supports `page`, `limit`, `status` |
| PATCH | `/availability` | DELIVERY_AGENT | Set own availability to `AVAILABLE` or `OFFLINE`. `ON_DELIVERY` is system-controlled and cannot be set manually; blocked with `409` while an active delivery is in progress |
| GET | `/earnings` | DELIVERY_AGENT | Own earnings summary + trend — supports `period` (`7d`/`30d`/`90d`/`year`, omit for all-time). Commission-based (see Payment System section) |
| GET | `/analytics` | DELIVERY_AGENT | Own delivery performance breakdown + outcome trend — supports `period` |

### Payments (`/api/v1/payments`)
| Method | Route | Access | Description |
|---|---|---|---|
| POST | `/:parcelId/checkout` | CUSTOMER | Create a Stripe Checkout session |
| GET | `/:parcelId` | CUSTOMER | Get payment details for a shipment |
| GET | `/` | CUSTOMER | List own payment history — supports `page`, `limit` |
| POST | `/webhook` | Stripe only | Verified webhook — updates payment/shipment status |

### Admin (`/api/v1/admin`)
| Method | Route | Access | Description |
|---|---|---|---|
| GET | `/dashboard/stats` | ADMIN | Real-time aggregate counts — users, parcels, payments, and total revenue (sum of `PAID` payments) |
| GET | `/dashboard/analytics` | ADMIN | Shipment trend, revenue trend, and status distribution, shaped for charts — supports `period` (defaults to `30d`) |
| GET | `/audit-logs` | ADMIN | View audit trail — supports `page`, `limit`, `action`, `entityType`, `actorId` filters |
| GET | `/users` | ADMIN | List platform users — supports `page`, `limit`, `role`, `status`, `q` (name/email search), `sortBy`, `sortOrder`. Never returns password hashes or refresh tokens; excludes soft-deleted users |
| PATCH | `/users/:id/status` | ADMIN | Set a user's status to `ACTIVE` or `SUSPENDED`. Cannot change role. Cannot be used on the admin's own account. Writes a `USER_STATUS_CHANGED` audit log entry |

### Health
| Method | Route | Access | Description |
|---|---|---|---|
| GET | `/api/v1/health` | Public | Confirms server, database, and Redis connectivity |

---

## Environment Variables

See `.env.example` for the full list. Required at minimum:

```
DATABASE_URL=
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
GOOGLE_CLIENT_ID=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
ALLOWED_ORIGINS=
CLIENT_URL=
AGENT_COMMISSION_RATE=       # default 0.7 — agent's share of deliveryCharge per completed, paid delivery
SEED_ADMIN_EMAIL=
SEED_ADMIN_PASSWORD=
SEED_CUSTOMER_EMAIL=
SEED_CUSTOMER_PASSWORD=
SEED_AGENT_EMAIL=
SEED_AGENT_PASSWORD=
```

---

## Running Locally

```bash
npm install
npx prisma generate
npx prisma migrate dev
npm run dev
```

Server starts on `http://localhost:5000`. Health check: `GET /api/v1/health`.

For local Stripe webhook testing:
```bash
stripe listen --forward-to localhost:5000/api/v1/payments/webhook
```

---

## Demo Accounts

Seeded via `npm run seed` (idempotent — safe to re-run). Credentials come from `.env`'s `SEED_*` variables; the values below are the project's current defaults — update this table if those variables are changed.

| Role | Email | Password |
|---|---|---|
| ADMIN | `admin@swiftdrop.com` | *(value of `SEED_ADMIN_PASSWORD`)* |
| CUSTOMER | `customer@swiftdrop.com` | *(value of `SEED_CUSTOMER_PASSWORD`)* |
| DELIVERY_AGENT | `agent@swiftdrop.com` | *(value of `SEED_AGENT_PASSWORD`)* |

All three log in through the standard endpoint — `POST /api/v1/auth/login` — there is no separate demo-login bypass. A frontend "quick login" button for each role should simply call this endpoint with the credentials above.

---

## Frontend Integration Notes

**Base URL:** `https://shiftdrop-platform-backend.vercel.app/api/v1` (set as `NEXT_PUBLIC_API_BASE_URL` or equivalent in the frontend's env).

**Authentication:** store `accessToken` and `refreshToken` from login/register/google responses. Send `Authorization: Bearer <accessToken>` on every authenticated request. On a `401` from an expired access token, call `POST /auth/refresh-token` with the stored refresh token to get a new pair, then retry the original request once.

**Role routing:** `role` comes back on every login/profile response (`CUSTOMER` / `DELIVERY_AGENT` / `ADMIN`). Route users to `/dashboard`, `/provider`, or `/admin` accordingly after login — the backend enforces the real authorization regardless of what the frontend renders, so this is a UX routing decision, not a security boundary.

**Stripe flow:** call `POST /payments/:parcelId/checkout`, redirect the browser to the returned `checkoutUrl`. After payment, Stripe redirects to the backend's static success/cancel pages (see Payment System section) — poll or refetch `GET /payments/:parcelId` on the frontend's own success page to confirm `status: "PAID"` before showing a confirmation state, since the redirect itself is not proof of payment — the webhook is.

**Pagination/filter/sort convention:** every list endpoint (`parcels`, `payments`, `admin/users`, `admin/audit-logs`, `deliveries/my`) uses the same query shape — `page`, `limit`, plus endpoint-specific filters (`status`, `role`, `q`, etc.) — and returns the same `meta: { page, limit, total, totalPages }` object. Safe to build one generic pagination hook/component against this shape.

---

## Status

Core backend is feature-complete against the current spec, including frontend-support endpoints (agent availability/earnings/analytics, admin dashboard stats/analytics). Remaining work before frontend integration begins: confirm the production Stripe webhook endpoint is registered and verified against the live URL, and a final end-to-end regression pass on production.