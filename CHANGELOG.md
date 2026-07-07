# Changelog

All notable changes to this project will be documented in this file.

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
