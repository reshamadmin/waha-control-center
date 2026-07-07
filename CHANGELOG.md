# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0-sprint3] - 2026-07-07
### Added
- Created database migration `011_seed_credentials.sql` to seed the default WAHA credentials mapped to the admin user.
- Implemented `WahaService` inside backend connecting to the WAHA container REST API, retrieving active sessions, executing starts/stops, fetching QR code strings, and syncing statuses into the MySQL database.
- Implemented backend routing for session control in `settingsRoutes.ts` with strict role authorizations (checking for `ADMIN` permission gates on restarts and disconnects).
- Registered settings and connection console endpoints in Express API routing structure.
- Documented session connection endpoints in `api_contract.yaml` immediately upon implementation.
- Built frontend Settings and Connection Console UI in `WahaSettings.tsx` displaying status panels (Connected, Disconnected, QR Scan needed).
- Integrated automatic 5-second connection status polling loops.
- Embedded a QR code linking canvas using a public QR code server rendering API.
- Verified that all 15 backend integration tests compile and pass cleanly under Vitest.

## [1.0.0-sprint2] - 2026-07-07
### Added
- Database DDL SQL schemas configured as migrations under `/migrations` (001 to 010).
- Admin default user seeded with SHA-256 pre-hashed credentials.
- Backend session managers, JWT signers, HTTPOnly secure cookie managers, and `requireAuth` gateway middlewares in `auth.ts`.
- Backend endpoints for login (`POST /auth/login`), logout (`POST /auth/logout`), and profile sync (`GET /auth/me`).
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
