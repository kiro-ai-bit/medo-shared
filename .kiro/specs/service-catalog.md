# Medo Inter-Service Contract Catalog

Canonical menu of every external contract across the six Medo services. Built by Map 2 ticket 07 (`.scratch/medo-services/issues/07-inter-service-contract-catalog.md`); feeds Map 3 and all PRDs in `docs/prd/`.

## Conventions

- **REST**: `/v1` prefix on every route, public and internal. Plural kebab-case nouns. Patient-owned resources scoped under `/patients/{patientId}/` (caregivers act on behalf of patients; no `/me` ambiguity for patient data). User's own profile stays `/me` on Identity.
- **Events**: PascalCase names, existing names verbatim. Every event carries an envelope `{eventId, occurredAt}` plus minimal-change payload — IDs and changed fields only, never full entity snapshots. Consumers pull full state via read APIs when needed.
- **DTO rule**: no contract leaks internal domain models. All payloads/responses are DTOs defined at the boundary.
- **Public vs internal**: "public" = frontend-facing (reached via API gateway — gateway choice is Map 3 fog). "internal" = service-to-service only.
- **Authz column** states the *requirement*, not the mechanism. Mechanism (JWT validation, service tokens, mTLS) is Map 3. Caregiver access to patient data is always authorized via Care `check-link` per request (~5–30s positive cache → Map 3); frontend is never trusted for authz.
- **Invite token** = locator only, never authorization. Accept/decline require an authenticated Caregiver session.

## Identity Service

### Public REST

| Endpoint | Authz | Purpose |
|---|---|---|
| `POST /v1/auth/signup` | public | Create account (name/email/password/role Patient\|Caregiver) |
| `POST /v1/auth/login` | public | Email+password login → access JWT + refresh cookie |
| `POST /v1/auth/refresh` | refresh cookie | Rotate access token, sliding renewal |
| `POST /v1/auth/logout` | session | Revoke current device refresh token |
| `POST /v1/auth/logout-all` | session | Revoke all account sessions |
| `POST /v1/auth/forgot-password` | public | Issue reset token → emits `PasswordResetRequested` |
| `POST /v1/auth/reset-password` | reset token | Set new password, revoke all sessions |
| `POST /v1/auth/verify-email` | verify token | Mark email verified |
| `POST /v1/auth/resend-verification` | public | Re-send email verification (rate-limited like other public auth routes) |
| `GET /v1/me` | session | Own profile (displayName, timezone, role, email) |
| `PATCH /v1/me` | session | Update own profile |
| `DELETE /v1/me` | session | Delete own account — Patients blocked while active Care Links exist; publishes `AccountDeleted` |

### Internal REST

| Endpoint | Authz | Purpose |
|---|---|---|
| `GET /v1/users/{id}` | Medo service | Directory lookup → `{id, displayName, role, email?}`; caller-side caching mandatory (Map 3) |

### Events

- **Publishes**: `UserRegistered`, `ProfileChanged`, `AccountDeleted`, `EmailVerificationRequested`, `PasswordResetRequested`
- **Consumes**: none (calls Care `active-links` synchronously during account deletion)

## Care Service

### Public REST

| Endpoint | Authz | Purpose |
|---|---|---|
| `POST /v1/care/links/invites` | patient session | Create Care Link Invite `{caregiverEmail}` (single-use, 7d, 3 resends/24h) |
| `GET /v1/care/invites/{token}` | invite token (locator) | Public invite preview (patient displayName, expiry) |
| `POST /v1/care/invites/{token}/accept` | caregiver session | Accept invite → creates Care Link |
| `POST /v1/care/invites/{token}/decline` | caregiver session | Decline (silent to patient until viewed) |
| `POST /v1/care/invites/{id}/resend` | patient session | Resend within cap; fresh cycle after decline/expiry/cancel |
| `POST /v1/care/invites/{id}/cancel` | patient session | Cancel pending invite |
| `GET /v1/care/invites` | session | List caller's pending invites — Patient: own created; Caregiver: addressed to account email |
| `GET /v1/care/links` | session | My Care Links (as patient or caregiver) |
| `POST /v1/care/links/{id}/end` | either party session | End link — instant revoke |

### Internal REST

| Endpoint | Authz | Purpose |
|---|---|---|
| `GET /v1/care/check-link?patientId=&caregiverId=` | Medo service | Authorization check → active?; invalid + invite state never cached |
| `GET /v1/care/patients/{id}/links` | Medo service | Active links for patient — Identity delete-account flow; Notification recipient mapping |

### Events

- **Publishes**: `CareLinkInviteCreated`, `CareLinkInviteDeclined`, `CareLinkInviteExpired`, `CareLinkCreated`, `CareLinkEnded`
- **Consumes**: `AccountDeleted` → end ALL links involving that user

## Medicine Service

Medicine is split into two aggregates (Map 2 ticket 07, amending ticket 03): a shared **Medicine Catalog** entry and the patient's private **Medicine** record linked to it.

- **Catalog entry** (shared, community-maintained): brand name, ingredient/chemical names (list — multiple per entry, e.g. combination drugs), medicine form, 3 tagged photos (A/B/C), packaging quantity.
- **Patient's Medicine** (private): catalogEntryId link, prescribing doctor, dosage, doses remaining, price, pharmacy name.
- **Catalog rules**: any patient can add an entry; duplicate-check on brand + form + ingredient set at creation (offer existing match); catalog fields editable by any patient (last write wins). Catalog entries are never owned — account deletion does not touch them.

### Public REST — catalog

| Endpoint | Authz | Purpose |
|---|---|---|
| `GET /v1/medicine-catalog?q=&page=` | session | Browse/search catalog (text match on brand + ingredient names) |
| `GET /v1/medicine-catalog/{id}` | session | Catalog entry detail incl. photo read URLs |
| `POST /v1/medicine-catalog` | session | Add new catalog entry (duplicate-check first) |
| `PATCH /v1/medicine-catalog/{id}` | session | Community edit of catalog fields |
| `POST /v1/medicine-catalog/{id}/photos` | session | `{slot: A\|B\|C}` → `{photoKey, uploadUrl}` (short-lived signed PUT, direct-to-bucket) |
| `PUT /v1/medicine-catalog/{id}/photos/{slot}` | session | Attach/confirm `{photoKey}` after upload |

### Public REST — patient's medicines

| Endpoint | Authz | Purpose |
|---|---|---|
| `GET /v1/medicines?patientId=` | patient-self or linked caregiver | List patient's Medicines |
| `POST /v1/medicines` | patient-self or linked caregiver | Adopt catalog entry → create private record `{catalogEntryId, prescribingDoctor, dosage, dosesRemaining, refillThreshold?, price, pharmacyName}` (`refillThreshold` optional int ≥0, default 6 — custom per-medicine alert level, PRD-MEDICINE OQ-MED-06); unknown medicine = create catalog entry first, then adopt |
| `GET /v1/medicines/{id}` | patient-self, linked caregiver, or Medo service | Medicine detail (catalog fields resolved via catalogEntryId) |
| `PATCH /v1/medicines/{id}` | patient-self or linked caregiver | Edit private fields / dosesRemaining / refillThreshold |
| `POST /v1/medicines/{id}/archive` | patient-self or linked caregiver | Archive (keeps history) |
| `DELETE /v1/medicines/{id}` | patient-self or linked caregiver | Hard delete — only with zero dose records; sync check on Schedule & Dose, fail closed |

Photo reads return signed URLs (mechanics → Map 3); offline caching via IndexedDB is client-side, not a contract.

### Internal REST

| Endpoint | Authz | Purpose |
|---|---|---|
| `GET /v1/medicines/{id}` | Medo service | Same route — service callers (e.g. Notification composing reminder text) |

### Events

- **Publishes**: `RefillThresholdCrossed`, `MedicineArchived`
- **Consumes**: `DoseOutcomeChanged` → Doses Remaining delta apply (idempotent, floor 0); `AccountDeleted` → purge patient's private Medicine records only — catalog entries + catalog photos survive (shared data)

## Schedule & Dose Service

### Public REST

| Endpoint | Authz | Purpose |
|---|---|---|
| `GET /v1/patients/{id}/schedules` | patient-self or linked caregiver | List Schedules |
| `POST /v1/patients/{id}/schedules` | patient-self or linked caregiver | Create Schedule (guided builder → RRULE + dose times + tz + start/end) |
| `GET /v1/schedules/{id}` | patient-self or linked caregiver | Schedule detail |
| `PATCH /v1/schedules/{id}` | patient-self or linked caregiver | Edit schedule + per-occurrence exceptions (skip day / time-override) |
| `DELETE /v1/schedules/{id}` | patient-self or linked caregiver | Remove schedule (regeneration handles dose rows) |
| `GET /v1/patients/{id}/doses?from=&to=&outcome=` | patient-self or linked caregiver | Dose window — Today screen, shared caregiver view |
| `GET /v1/doses/{id}` | patient-self or linked caregiver | Dose detail |
| `POST /v1/doses/{id}/outcome` | patient-self or linked caregiver | Mark outcome `{taken-on-time\|taken-late\|skipped}` with actor attribution |
| `POST /v1/doses/{id}/snooze` | patient-self or linked caregiver | Snooze 5 min → transient `snoozedUntil`, no event |

### Internal REST

| Endpoint | Authz | Purpose |
|---|---|---|
| `GET /v1/doses/due?window=` | Medo service | Notification per-minute clock job — doses approaching T−30/T/T+1hr/hourly/midnight; excludes snoozed + `skippedByUser` rows |
| `GET /v1/patients/{id}/doses?from=&to&outcome=` | Medo service | Same route — Gamification pull-bootstrap of outcome history |
| `GET /v1/patients/{id}/has-dose-records` | Medo service | Medicine delete-check — fail closed |
| `GET /v1/doses/{id}` | Medo service | Same route — dose detail for service callers |

### Events

- **Publishes**: `DoseOutcomeChanged` — on EVERY outcome change (not only finalized)
- **Consumes**: `AccountDeleted` → purge Schedules + Dose rows; `MedicineArchived` → stop dose generation for that medicine's schedules (existing Dose rows retained as history)

## Notification Service

### Public REST

| Endpoint | Authz | Purpose |
|---|---|---|
| `GET /v1/notifications?cursor=` | session | In-app feed (stored rows, read/unread) |
| `GET /v1/notifications/unread-count` | session | Unread badge count |
| `POST /v1/notifications/{id}/read` | session | Mark one read |
| `POST /v1/notifications/read-all` | session | Mark all read |
| `GET /v1/notification-preferences` | session | Own notification prefs — two toggles (`refillAlerts`, `careLinkNotifications`), default ON; dose reminders + auth emails non-mutable (Map 3 t10) |
| `PUT /v1/notification-preferences` | session | Update prefs (same two toggles only) |
| `GET /v1/push/vapid-key` | public | VAPID public key → `applicationServerKey` for `pushManager.subscribe` (Map 2 ticket 08; rotation = clients refetch, no redeploy) |
| `POST /v1/push-subscriptions` | session | Register device `{endpoint, p256dh, auth}` per device |
| `DELETE /v1/push-subscriptions/{id}` | session | Unregister device |

### Internal REST

None — Notification pulls `GET /v1/doses/due` and exposes no service-facing routes.

### Events

- **Publishes**: none
- **Consumes**: `RefillThresholdCrossed` → refill push + feed; `CareLinkInviteCreated` → invite email (only Care Link email); `CareLinkInviteDeclined`/`CareLinkInviteExpired`/`CareLinkCreated`/`CareLinkEnded` → feed rows + caregiver recipient mapping; `AccountDeleted` → purge subs + feed; `EmailVerificationRequested` + `PasswordResetRequested` → auth emails via Resend

## Gamification Service

### Public REST

| Endpoint | Authz | Purpose |
|---|---|---|
| `GET /v1/patients/{id}/gamification` | patient-self or linked caregiver (check-link per read) | Current `{harmonyPoints, themeState, updatedAt}` |

### Internal REST

None — read API only; no service callers.

### Events

- **Publishes**: none (no `PointsChanged`/`ThemeChanged` — no consumer exists)
- **Consumes**: `DoseOutcomeChanged` → ordered floor-0 recompute (+10/−5/−10/−20; snooze + plan-skip = no contribution), pull-bootstrap via doses API on first sight/gap; `AccountDeleted` → purge points/theme

## Event catalog

| Event | Producer | Consumers | Payload sketch |
|---|---|---|---|
| `UserRegistered` | Identity | — (no welcome email by design) | `{userId, role}` |
| `ProfileChanged` | Identity | — | `{userId, changedFields[]}` |
| `AccountDeleted` | Identity | Care, Schedule & Dose, Medicine, Notification, Gamification | `{userId}` |
| `EmailVerificationRequested` | Identity | Notification | `{userId, email, verifyLink}` |
| `PasswordResetRequested` | Identity | Notification | `{userId, email, resetLink}` |
| `CareLinkInviteCreated` | Care | Notification | `{inviteId, patientId, caregiverEmail, inviteLink, expiresAt}` |
| `CareLinkInviteDeclined` | Care | Notification | `{inviteId, patientId, caregiverId}` |
| `CareLinkInviteExpired` | Care | Notification | `{inviteId, patientId}` |
| `CareLinkCreated` | Care | Notification | `{linkId, patientId, caregiverId}` |
| `CareLinkEnded` | Care | Notification | `{linkId, patientId, caregiverId, endedBy}` |
| `RefillThresholdCrossed` | Medicine | Notification | `{medicineId, patientId, dosesRemaining, threshold}` (threshold = medicine's `refillThreshold` or 0) |
| `MedicineArchived` | Medicine | Schedule & Dose | `{medicineId, patientId}` |
| `DoseOutcomeChanged` | Schedule & Dose | Medicine, Gamification | `{doseId, medicineId, patientId, outcome, actorId?, occurredAt}` |

All payloads add envelope `{eventId, occurredAt}`. `outcome` ∈ `taken-on-time | taken-late | skipped | missed`.

## Contract gaps closed by this catalog

- Auth emails (`EmailVerificationRequested`, `PasswordResetRequested`) — previously unowned; routed Identity → Notification.
- Medicine model revised: shared **Medicine Catalog** + private patient Medicine record (amends ticket 03). `AccountDeleted` purges private records only; catalog survives by design.
- Identity additions (Map 4 ticket 05, user-approved 2026-11-22): `POST /v1/auth/resend-verification` (public, rate-limited) + `DELETE /v1/me` (session; Patient deletion blocked while active Care Links; publishes `AccountDeleted`).
- Care addition (Map 4 ticket 06, user-approved 2026-11-22): `GET /v1/care/invites` (session; pending-invite listing for patient + caregiver sides — closes pending-invites visibility gap from Map 1 ticket 07).
- Medicine addition (Map 4 ticket 07, user-approved 2026-11-22): `MedicineArchived` event (Medicine → Schedule & Dose; stops dose generation for the medicine's schedules, existing Dose rows kept as history — closes archive→schedule-stop propagation gap).
- Notification amendment (Map 4 ticket 09, user-approved 2026-11-22): prefs routes renamed `notification-prefs` → `notification-preferences` to match the Map 3 ticket 10 locked decision (`GET/PUT /v1/notification-preferences`; two toggles `refillAlerts`/`careLinkNotifications`, default ON; dose reminders + auth emails non-mutable); same rename applied in `frontend-map.md`.
