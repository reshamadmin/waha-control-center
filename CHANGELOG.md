# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0-rc1] - 2026-07-08
### Added
- Created schema migration `017_feedback_and_hardening.sql` supporting `system_logs`, `app_feedback`, `system_metrics_history`, and `feature_flags`.
- Added multi-component `/health` endpoint validating API, MySQL database connectivity, WAHA sessions, Gemini AI, local storage folder, JobEngine metrics, and active Socket.IO connections.
- Implemented structured request interceptors tracking correlation IDs.
- Coded background metrics snapshots cron logging average latency, queue depth, and message speeds.
- Built interactive ADMIN `/developer` Diagnostics console with logs tables, feature flags toggles, metrics timeline history, and exports/restores data controls.
- Integrated a global floating "Report Issue" feedback submission modal.
- Configured Socket.IO system notification alerts populating React Toast alerts.
- Wrote integration test suite `hardening.test.ts` verifying all route actions.

## [1.0.0-sprint8] - 2026-07-07
### Added
- Integrated Gemini 2.5 Flash via REST wrapper `GeminiAIProvider` with cost tracking telemetry calculations.
- Coded SQL-polling `AIWorker` executing background asynchronous text summaries and semantic intent classifications.
- Created MySQL schemas migration `016_ai_integration.sql` creating `conversation_ai`, `prompt_templates`, `ai_usage`, and `ai_feedback` tables.
- Built interactive `AiSidebar.tsx` panel in CRM Inbox displaying extracted metadata, priority, sentiment, and knowledge facts.
- Generated multi-style suggested replies (Professional, Friendly, Short, Detailed) with copy tools and 👍/👎 review logging.
- Coded `AiSettings.tsx` console featuring editable prompt libraries, prompt sandbox playgrounds, and 30-day token aggregate charts.
- Wrote integration test suite `aiIntelligence.test.ts` verifying all route actions.

## [1.0.0-sprint7] - 2026-07-07
### Added
- Developed generic background `JobEngine` processing polling tasks using atomic transactions (`SELECT ... FOR UPDATE SKIP LOCKED`).
- Created database migration `015_queue_refinements.sql` supporting attempts counters, lock worker IDs, and campaign stop states.
- Implemented `BroadcastWorker` processing outbound campaign message dispatches and classifying exceptions.
- Added strict business hours checks and weekday filters to regulate dispatch schedules.
- Structured real-time Socket.IO worker telemetry events (`campaign.progress`, `campaign.completed`, `queue.updated`).
- Appended a Diagnostics section to the sidebar of `CrmBroadcasts.tsx` showing active uptime and latency metrics.

## [1.0.0-sprint6] - 2026-07-07
### Added
- Implemented Campaign State Machine backing proper lifecycles: `DRAFT`, `VALIDATED`, `SCHEDULED`, `RUNNING`, `PAUSED`, `COMPLETED`.
- Built an 8-Step Campaign Wizard workflow in `CrmBroadcasts.tsx` (Title definition, CSV upload, header mappings, composer templates, substitution previews, safe delay rules, scheduled windows, and review boards).
- Added client-side CSV parsing supporting dynamic field maps (mapping any column header to target phone, name, and village variables).
- Added variable preview controls parsing real imported rows to test variables replacement rendering.
- Created MySQL schema migration `014_broadcasts_refinements.sql` supporting details error logs, retry states, and variables mapping text.
- Added validation reports logging duplicates, empty values, valid, and invalid targets, including trigger links to download rejected rows.
- Coded active campaign dashboards displaying progress bars, success/failure percentages, live average sending speeds, and ETA estimator controls.
- Integrated queue controller actions: dry-run sent to logged-in user, pauses, resumes, and retries failed campaigns.
- Created `broadcast.test.ts` verifying all lifecycle control dispatches.

## [1.0.0-sprint5] - 2026-07-07
### Added
- Standardized provider abstraction patterns: `WhatsAppProvider`, `StorageProvider`, `AIProvider`, `EmailProvider`, and `NotificationProvider`.
- Created database migration `012_message_media.sql` for 1-to-N message attachments (`whatsapp_messages_media`).
- Created database migration `013_message_templates.sql` seeding quick replies: `/thanks`, `/catalog`, `/meeting`, `/payment` variables.
- Built a multiple file upload receiver at `POST /api/whatsapp/media/upload` using `multer`.
- Implemented `MediaService` executing file types/size checks (excluding executable vectors), generating thumbnails, and compressing images via `sharp`.
- Coded `S3StorageProvider` supporting DigitalOcean Spaces with automated fallback to `LocalStorageProvider` using static paths routing.
- Added fullscreen lightbox preview viewer with scales and rotation triggers.
- Added drag-and-drop file imports, clipboard paste events intercept, and cached upload drafts in React.
- Coded audio notes playback player with speeds controls (`1x`, `1.5x`, `2x`).

## [1.0.0-sprint4] - 2026-07-07
### Added
- Implemented real-time CRM Inbox workspace in `CrmInbox.tsx` featuring a three-column layout.
- Added cursor-based pagination for both chat thread listings (`last_message_at`) and historical conversation feeds (`sent_at`).
- Integrated inline message draft caching, saving composed message inputs in React state when agents switch between active chat threads.
- Expanded conversation search on the backend, joining tables to search contact name, contact phone, or message body content.
- Standardized delivery/read indicator statuses (`sending`, `sent`, `delivered`, `read`) with responsive tick symbols.
- Added `POST /api/whatsapp/messages` to handle outbound message delivery via WAHA client integrations.
- Added `POST /api/whatsapp/chats/:chatId/read` to clear thread unread counters.
- Updated `docs/api_contract.yaml` to document the paginated chats, message history, read resets, and outbound sending endpoints.

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
- Added GitHub Actions workflow configuration for continuous integration (CN) on code pushes.
- Copied technical and functional specifications into the `docs/` repository directory.
