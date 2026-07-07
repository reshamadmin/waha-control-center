# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0-sprint3] - 2026-07-07
### Added
- Created database migration `011_seed_credentials.sql` to seed the default WAHA credentials mapped to the admin user.
- Introduced a provider abstraction layer (`WhatsAppProvider`) in `providers/WhatsAppProvider.ts` to cleanly isolate WhatsApp engines.
- Implemented `WahaService` implementing the `WhatsAppProvider` to wrap REST calls to the WAHA container API.
- Replaced the external QR rendering service with local QR code base64 Data URI generation in the backend using the pure-js `qrcode` library.
- Implemented the webhook receiver endpoint (`POST /api/webhooks/waha`) to ingest and log WAHA session status updates and incoming/outgoing messages.
- Integrated automatic contact/conversation synchronization in the webhook handler: syncs chat records into the `whatsapp_chats` table and logs/archives all message details inside `whatsapp_messages`.
- Wired live updates via Socket.IO (`whatsapp:message` and `whatsapp:status` channels), updating the frontend settings console instantly without relying on polling.
- Exposed transport-oriented endpoints under the `/api/whatsapp/*` namespaces (`/status`, `/qr`, `/disconnect`, `/restart`), consuming them in the Settings UI.
- Updated `docs/api_contract.yaml` to document the `/api/whatsapp/*` transport-oriented paths and the `/api/webhooks/waha` receiver.

## [1.0.0-sprint2] - 2026-07-07
### Added
- Database DDL SQL schemas configured as migrations under `/migrations` (001 to 010).
- Admin default user seeded with SHA-256 pre-hashed credentials.
- Backend session managers, JWT signers, HTTPOnly secure cookie managers, and `requireAuth` gateway middlewares in `auth.ts`.
- Backend endpoints for login (`POST /auth/login`), logout (`POST /auth/logout`), and profile sync (`GET /api/auth/me`).
- Frontend store (`authStore.ts`), navigation routing guards (`ProtectedRoute.tsx`), login forms (`Login.tsx`), and persona dashboards selector (`PersonaSelection.tsx`).
- Dynamic Express server migration runner executed on startup.
- Full Vitest testing integration suite for authentication route verification.
- Documented session checks in `api_contract.yaml`.

## [1.0.0-sprint1] - 2026-07-07
### Added
- Created standalone production-grade monorepo setup for `waha-control-center`.
- Setup feature-based React workspace in `apps/waha-web` with Vite, TypeScript, and Tailwind CSS.
- Setup Express API backend workspace in `apps/waha-api` with Zod configurations and Vitest integration suites.
- Added GitHub Actions workflow configuration for continuous integration (CI) on code pushes.
- Copied technical and functional specifications into the `docs/` repository directory.
