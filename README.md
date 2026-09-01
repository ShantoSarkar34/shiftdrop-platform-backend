# Nexora Backend

AI-powered freelance marketplace API. Node.js / Express 5 / TypeScript / PostgreSQL (Prisma 7) / Upstash Redis.

**Live API:** `https://nexora-marketplace-backend.vercel.app`
**Base path for all routes below:** `/api/v1`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js, Express 5, TypeScript (ESM) |
| Build/Bundle | tsup (esbuild-based) |
| Database | PostgreSQL via Prisma 7, `@prisma/adapter-pg` driver adapter |
| Cache / temp storage | Upstash Redis (REST-based, namespaced with `nexora:` prefix) |
| Auth | JWT (httpOnly cookie), bcryptjs, Google OAuth (`google-auth-library`) |
| Email | Resend |
| Payments | Stripe (Checkout Sessions + Webhooks) |
| AI | Anthropic API (Claude) |
| Validation | Zod |
| Deployment | Vercel |

---

## Architecture

```
src/
├── app.ts                  Express app instance (no listen — used by both server.ts and Vercel)
├── server.ts                Local dev entry point (calls app.listen)
├── config/                  env validation, Prisma/Redis/Stripe/Anthropic/Google clients
├── middleware/               auth, authorize, validateRequest, rateLimiter, errorHandler, notFound
├── utils/                    ApiError, catchAsync, sendResponse, pagination, checkOwnership, getParam
└── modules/
    ├── auth/
    ├── skill/
    ├── freelancer-profile/
    ├── client-profile/
    ├── job/
    ├── application/
    ├── contract/
    ├── review/
    ├── payment/
    ├── ai-match/
    └── notification/
api/
└── index.ts                 Vercel serverless entry (exports app)
prisma/
└── schema/                  multi-file schema (schema.prisma, enums.prisma, user.prisma, job.prisma, ...)
```

Each module follows the same file pattern: `*.interface.ts` (TS types) → `*.validation.ts` (Zod schemas) → `*.service.ts` (business logic + DB access) → `*.controller.ts` (request handling) → `*.routes.ts` (endpoints).

---

## Response Envelope

Every response follows this shape:

```json
{
  "success": true,
  "message": "Human-readable description",
  "data": { },
  "meta": { "page": 1, "limit": 10, "total": 42, "totalPages": 5 }
}
```

- `data` is omitted on some action-only responses (e.g. logout).
- `meta` is present only on paginated list endpoints.
- Errors always have `"success": false` and a `message`; validation errors additionally include an `errors` object (field-level messages).

**Pagination query params** (on every list endpoint): `?page=1&limit=10` (limit capped at 50, defaults to 10).

---

## Authentication Model — read this before building any frontend auth flow

- Session token is a **JWT stored in an `httpOnly` cookie** (`accessToken`) — **not** accessible via `document.cookie` and never returned in a JSON body. Your frontend does not manage the token directly.
- **Every request that needs auth must be sent with `credentials: "include"`** (fetch) or `withCredentials: true` (axios), or the cookie won't be sent.
- CORS is locked to `FRONTEND_URL` (set server-side) with `credentials: true` — your frontend's exact origin must match what's configured server-side, or cookies will be silently rejected by the browser.
- **Login-first, verify-later:** registering does *not* block login. `isVerified` starts `false` and is only required by specific actions later (none currently gate on it, but treat it as a dashboard prompt: "Verify your account").
- **Verification is OTP-based, not link-based:** after login, call `send-verification-otp` (emails a 6-digit code), then `verify-otp` with that code. There is no email-link flow for this.
- **Forgot-password is still link-based** (makes sense — it happens *before* login, no dashboard to click a button from).
- Google login: your frontend obtains a Google ID token client-side (Google Identity Services), then POSTs it to `/auth/google`. First-time Google sign-ups must also send a `role`.

---

## Environment Variables (server-side reference)

| Variable | Purpose |
|---|---|
| `NODE_ENV`, `PORT`, `FRONTEND_URL` | Core server config — `FRONTEND_URL` must match your deployed frontend origin exactly |
| `DATABASE_URL` | Postgres connection string |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Redis |
| `REDIS_NAMESPACE` | Key prefix (`nexora`) — this Redis DB is shared with another project |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Session tokens |
| `RESEND_API_KEY`, `EMAIL_FROM` | Transactional email |
| `GOOGLE_CLIENT_ID` | Google OAuth verification |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Payments |
| `ANTHROPIC_API_KEY`, `AI_DAILY_REQUEST_LIMIT` | AI job matching |

---

## Core Enums

| Enum | Values |
|---|---|
| `Role` | `CLIENT`, `FREELANCER`, `ADMIN` |
| `JobStatus` | `DRAFT` → `OPEN` → (`CLOSED` \| `CANCELLED`) — `IN_PROGRESS`/`COMPLETED` are system-set only, never client-editable |
| `ApplicationStatus` | `PENDING` → (`SHORTLISTED` \| `REJECTED` \| `WITHDRAWN` \| `HIRED`); `SHORTLISTED` → (`REJECTED` \| `WITHDRAWN` \| `HIRED`) |
| `ContractStatus` | `PENDING` → `ACTIVE` → `SUBMITTED` → `COMPLETED`; `SUBMITTED` → `ACTIVE` (revision requested); `PENDING`/`ACTIVE` → `CANCELLED`. `COMPLETED`/`CANCELLED` are terminal |
| `PaymentStatus` | `PENDING`, `PROCESSING`, `SUCCESS`, `FAILED`, `CANCELLED`, `REFUNDED` |
| `JobCategory` | `WEB_DEVELOPMENT`, `MOBILE_DEVELOPMENT`, `DESIGN`, `WRITING`, `MARKETING`, `DATA_SCIENCE`, `DEVOPS`, `OTHER` |
| `BudgetType` | `FIXED`, `HOURLY` |
| `ExperienceLevel` | `ENTRY`, `INTERMEDIATE`, `EXPERT` |
| `NotificationType` | `NEW_APPLICATION`, `APPLICATION_SHORTLISTED`, `APPLICATION_REJECTED`, `FREELANCER_HIRED`, `CONTRACT_ACTIVATED`, `WORK_SUBMITTED`, `CONTRACT_COMPLETED`, `PAYMENT_SUCCESSFUL`, `NEW_REVIEW` |

**Important sequencing note for the frontend:** a job only becomes `IN_PROGRESS` when a contract is created via hiring; it only becomes `COMPLETED` when the client approves submitted work. A contract only becomes `ACTIVE` after a **successful Stripe payment webhook** — not immediately after hiring. Design your UI states around this: post-hire, show "awaiting payment" before "in progress."

---

## API Reference

### Health
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | none | DB + Redis connectivity check |

### Auth (`/auth`)
| Method | Path | Auth | Body | Notes |
|---|---|---|---|---|
| POST | `/auth/register` | none | `{ name, email, password, role }` | `role`: `CLIENT` \| `FREELANCER`. No email sent. |
| POST | `/auth/login` | none | `{ email, password }` | Sets `accessToken` cookie. Works regardless of `isVerified`. |
| POST | `/auth/google` | none | `{ idToken, role? }` | `role` required only for brand-new users |
| POST | `/auth/logout` | cookie | — | Clears cookie |
| POST | `/auth/send-verification-otp` | cookie | — | Emails a 6-digit code. Rate-limited (5/hour/user). |
| POST | `/auth/verify-otp` | cookie | `{ otp }` | Max 5 wrong attempts per code |
| POST | `/auth/forgot-password` | none | `{ email }` | Always returns success message (no user enumeration) |
| POST | `/auth/reset-password` | none | `{ token, newPassword }` | `token` comes from the emailed link |
| GET | `/auth/me` | cookie | — | Returns current user (no password field) |

### Freelancer Profile (`/profiles/freelancer`)
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/` | FREELANCER | Create profile (one per user) |
| GET | `/me` | FREELANCER | Includes `completionPercentage` |
| PATCH | `/me` | FREELANCER | Partial update |
| POST | `/skills` | FREELANCER | `{ name }` — global skill list, dedupes automatically |
| DELETE | `/skills/:skillId` | FREELANCER | |
| POST | `/experience` | FREELANCER | `{ title, company, startDate, endDate?, isCurrent, description? }` |
| DELETE | `/experience/:experienceId` | FREELANCER | |
| POST | `/portfolio` | FREELANCER | `{ title, description?, projectUrl?, imageUrl? }` |
| DELETE | `/portfolio/:portfolioId` | FREELANCER | |
| GET | `/:userId` | none | Public profile view |

### Client Profile (`/profiles/client`)
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/` | CLIENT | `{ companyName?, industry?, companySize?, website?, about? }` |
| GET | `/me` | CLIENT | |
| PATCH | `/me` | CLIENT | |
| GET | `/:userId` | none | Public |

### Jobs (`/jobs`)
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/` | none | Only `OPEN` jobs. Query: `search`, `category`, `budgetType`, `experienceLevel`, `minBudget`, `maxBudget`, `sortBy` (`newest`\|`budget_asc`\|`budget_desc`), `page`, `limit`. Cached 60s. |
| POST | `/` | CLIENT | `{ title, description, category, budgetType, budgetMin, budgetMax, experienceLevel, deadline?, skills: string[] }` — created as `DRAFT` |
| GET | `/client/me` | CLIENT | Your own jobs, any status. Query: `status`, `page`, `limit` |
| GET | `/:jobId` | none | Full job detail |
| PATCH | `/:jobId` | CLIENT (owner) | Only while `DRAFT`/`OPEN` |
| PATCH | `/:jobId/status` | CLIENT (owner) | `{ status }` — only `DRAFT→OPEN`, `OPEN→CLOSED\|CANCELLED`, `DRAFT→CANCELLED` allowed here |
| DELETE | `/:jobId` | CLIENT (owner) | Only `DRAFT` jobs |
| GET | `/saved/me` | FREELANCER | |
| POST | `/:jobId/save` | FREELANCER | |
| DELETE | `/:jobId/save` | FREELANCER | |

### Applications (`/applications`)
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/` | FREELANCER | `{ jobId, coverLetter (50+ chars), proposedBudget, estimatedDeliveryDays }`. Blocks duplicate applications and non-`OPEN` jobs |
| GET | `/me` | FREELANCER | Query: `status`, `page`, `limit` |
| POST | `/:applicationId/withdraw` | FREELANCER (owner) | Only from `PENDING`/`SHORTLISTED` |
| GET | `/job/:jobId` | CLIENT (job owner) | All applications for one job |
| PATCH | `/:applicationId/status` | CLIENT (job owner) | `{ status: "SHORTLISTED" \| "REJECTED" }` — `HIRED` is set only via the Contract hire endpoint |
| GET | `/:applicationId` | either participant | |

### Contracts (`/contracts`)
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/hire/:applicationId` | CLIENT (job owner) | Atomically: application→`HIRED`, other applicants→`REJECTED`, job→`IN_PROGRESS`, contract created `PENDING` |
| GET | `/me` | either | Your contracts, filtered by role automatically |
| GET | `/:contractId` | either participant | |
| PATCH | `/:contractId/activate` | CLIENT | Manual fallback — normally the Stripe webhook does this |
| PATCH | `/:contractId/submit` | FREELANCER | `{ submissionNote?, submissionUrl? }` (at least one required) |
| PATCH | `/:contractId/request-revision` | CLIENT | `SUBMITTED → ACTIVE` |
| PATCH | `/:contractId/approve` | CLIENT | Completes contract **and** job together |
| PATCH | `/:contractId/cancel` | either participant | `{ reason (10+ chars) }` — only from `PENDING`/`ACTIVE`; reopens job to `OPEN` |

### Reviews (`/reviews`)
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/contract/:contractId` | either participant | `{ rating (1-5), comment? }` — reviewee is derived server-side, never client-supplied. Only on `COMPLETED` contracts. One review per user per contract. |
| GET | `/contract/:contractId` | either participant | Both reviews for that contract |
| GET | `/user/:userId` | none | Public — reviews received. Query: `page`, `limit` |
| GET | `/user/:userId/summary` | none | `{ averageRating, totalReviews }` |

### Payments (`/payments`)
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/contract/:contractId/checkout` | CLIENT (owner) | Returns `{ checkoutUrl, payment }` — **redirect the browser to `checkoutUrl`** (Stripe-hosted page) |
| GET | `/contract/:contractId` | either participant | Payment history for one contract |
| GET | `/me` | CLIENT | Your payment history. Query: `status`, `page`, `limit` |
| POST | `/webhook/stripe` | Stripe only | Not called by the frontend. Signature-verified server-to-server. |

Frontend flow: call `checkout`, redirect to `checkoutUrl`, Stripe redirects back to `FRONTEND_URL/payments/success?session_id=...` or `/payments/cancel` on your end — poll or refetch the contract afterward to reflect the now-`ACTIVE` status (webhook processing is asynchronous relative to the redirect).

### AI Job Matching (`/ai-match`)
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/jobs/:jobId/rule-based` | FREELANCER | Instant, deterministic, no external call. Returns `matchScore` + transparent `breakdown` |
| POST | `/jobs/:jobId/analyze` | FREELANCER | Real Claude API call. Rate-limited (`AI_DAILY_REQUEST_LIMIT`/day/user, default 20). Saves/overwrites result. |
| GET | `/jobs/:jobId/analysis` | FREELANCER | Fetch previously saved analysis without re-calling AI |

### Notifications (`/notifications`)
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/me` | any | Query: `unreadOnly=true`, `page`, `limit` |
| GET | `/unread-count` | any | `{ unreadCount }` — poll this for a badge |
| PATCH | `/:notificationId/read` | owner | |
| PATCH | `/read-all` | any | |

Notifications are created automatically by other modules (new application, hired, payment success, work submitted, contract completed, new review) — there's no manual "create notification" endpoint.

---

## Error Responses

```json
{ "success": false, "message": "Description of what went wrong" }
```

Validation errors additionally include:
```json
{ "success": false, "message": "Validation failed", "errors": { "email": ["Invalid email"] } }
```

| Status | Meaning |
|---|---|
| 400 | Bad request / invalid state transition / validation failure |
| 401 | Not authenticated (no/invalid/expired cookie) |
| 403 | Authenticated but not permitted (wrong role or not the resource owner/participant) |
| 404 | Resource not found |
| 409 | Conflict (duplicate application, already reviewed, already exists) |
| 429 | Rate limited — auth endpoints and AI analysis both enforce limits |
| 500 | Unexpected server error |

---

## Rate Limits (relevant to frontend UX — show appropriate messaging)

| Endpoint | Limit |
|---|---|
| `POST /auth/register` | 5 / hour / IP |
| `POST /auth/login` | 10 / 15 min / IP |
| `POST /auth/forgot-password` | 5 / 15 min / IP |
| `POST /auth/send-verification-otp` | 5 / hour / user |
| `POST /ai-match/jobs/:jobId/analyze` | 20 / day / user (configurable) |

`429` responses include `X-RateLimit-Limit` / `X-RateLimit-Remaining` headers.

---

## Notes for Frontend Integration

- **No WebSocket/real-time layer exists yet** — notifications require polling `GET /notifications/unread-count` on an interval, or on relevant page loads.
- **Public vs. private data:** job listing, job details, both public profile endpoints, and review endpoints work without auth — build those pages to render for logged-out visitors too.
- **Route order matters server-side, not client-side** — e.g. `/jobs/saved/me` vs `/jobs/:jobId` — this only affects the backend implementation, not anything the frontend needs to handle.
- **Always send `credentials: "include"`** on every authenticated request, or you'll get silent 401s that look like broken auth state.
