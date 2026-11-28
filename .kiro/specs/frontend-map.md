# Medo Frontend Contract Map

Canonical map of the combined frontend's service calls per screen/module plus the Dexie offline-sync contract. Built by Map 2 ticket 08 (`.scratch/medo-services/issues/08-frontend-contract-map.md`); consumes `service-catalog.md`. Feeds the frontend PRD in `docs/prd/` and Map 3.

## Conventions

- **API-first**: screens read via TanStack Query → API gateway (Map 3) → services. Dexie (IndexedDB) is an offline cache only — never the source of truth.
- **`patientId` rule**: for Patient accounts, `patientId` = Identity `userId` (no separate Patient entity exists). For Caregiver accounts, `patientId` = the selected Care Link's `patientId`; the switcher lists choices from `GET /v1/care/links`.
- **Aggregation**: parallel fan-out per screen — independent TanStack Query calls fire simultaneously, per-section rendering (skeleton per section). No chained calls, no backend aggregation endpoint.
- **Authz**: frontend is never trusted — every patient-scoped call is authorized server-side via Care `check-link`.

## Per-screen service calls

| Screen/module | Services called (parallel unless noted) |
|---|---|
| Auth: signup / login / refresh / logout / forgot / reset / verify-email | Identity `POST /v1/auth/*` |
| Own profile (view/edit) | Identity `GET/PATCH /v1/me` |
| **Today** (dose list + theme + points + notifications) | Schedule & Dose `GET /v1/patients/{id}/doses?from=today&to=today` · Gamification `GET /v1/patients/{id}/gamification` · Notification `GET /v1/notifications`, `GET /v1/notifications/unread-count` · Medicine `GET /v1/medicines?patientId=` (display data per dose) |
| Dose actions (taken/skipped/snooze) | Schedule & Dose `POST /v1/doses/{id}/outcome`, `POST /v1/doses/{id}/snooze` |
| Medicines list | Medicine `GET /v1/medicines?patientId=`; catalog search `GET /v1/medicine-catalog?q=` |
| Medicine detail / edit / archive / delete | Medicine `GET/PATCH /v1/medicines/{id}`, `POST .../archive`, `DELETE .../{id}`; catalog detail `GET /v1/medicine-catalog/{id}` |
| Add medicine (adopt catalog) | Medicine `POST /v1/medicines` `{catalogEntryId, ...}`; unknown medicine → `POST /v1/medicine-catalog` first |
| Medicine/catalog photos | Medicine two-step signed URL: `POST .../photos` → `{photoKey, uploadUrl}` → direct PUT → `PUT .../photos/{slot}` |
| Scheduling builder + exceptions | Schedule & Dose `GET/POST /v1/patients/{id}/schedules`, `GET/PATCH/DELETE /v1/schedules/{id}` |
| Care Links management (invites, links, end) | Care `POST /v1/care/links/invites`, `GET /v1/care/invites/{token}`, `POST .../accept|decline`, resend/cancel, `GET /v1/care/links`, `POST /v1/care/links/{id}/end` |
| Notifications feed + prefs | Notification `GET /v1/notifications?cursor=`, `POST .../read`, `POST /v1/notifications/read-all`, `GET/PUT /v1/notification-preferences` |
| Push subscription lifecycle | Notification `GET /v1/push/vapid-key` (applicationServerKey) · `POST /v1/push-subscriptions` on permission grant · `DELETE /v1/push-subscriptions/{id}` on logout |
| Caregiver gamification view | Gamification `GET /v1/patients/{id}/gamification` — same endpoint; authz = Care check-link per read; read-only |

## Dexie offline-sync contract

**Cached entities (the offline-critical slice only):**

- **Doses** — upcoming/today dose rows (times, outcome, `snoozedUntil`) → Today screen + local notifications offline
- **Medicine display data** — name, photo, dosage per medicine → notification text + Today screen
- **Schedules** — future dose times → local notification scheduling
- **Write queue** — dose outcomes marked offline

**API-only (never cached in Dexie):** notifications feed, Harmony Points/theme state (show last-known or hide offline — server-authoritative, cosmetic), catalog browsing, Care Links.

**Write path:** offline outcome marks enqueue as FIFO entries; on reconnect they replay in order to `POST /v1/doses/{id}/outcome` / `.../snooze`. Conflicts (e.g. caregiver marked while patient offline) resolve server-side — last write wins; outcomes stay editable until midnight missed-lock anyway.

**Read refresh triggers:**

1. App open
2. Connectivity restored
3. After every successful online mutation (response carries fresh state)
4. `refetchInterval` ≈ 15 min on Today-screen queries while app is open — catches multi-actor changes (linked caregiver marking doses, midnight missed-lock job)

**Local notifications:** the service worker reads Dexie schedules + doses and schedules on-device notifications (rich, Monster Defense themed, Taken/Snooze actions per Map 1 ticket 06). Server Web Push is the backup channel for when the app is closed — no handoff logic between them.
