# SPRINT BACKLOG
## Project: WAHA Control Center (WhatsApp Module - V1 Standalone)
### Version: 1.0.0
### Total Planned Sprints: 12

---

## Sprint 1: Project Setup & Monorepo Configuration
- **Estimate:** 5 Story Points (SP)
- **Dependencies:** None

### User Story
As a developer, I want a clean feature-based monorepo codebase so that backend and frontend developers can build, lint, and test components concurrently.

### Technical Tasks
- **Backend:** 
  - Initialize the Node.js/Express workspace inside `apps/api`.
  - Add TypeScript compiler configuration and linting rules.
  - Install core dependencies (Express, Cors, Zod, tsx, Vitest).
- **Frontend:**
  - Initialize Vite React project in `apps/web`.
  - Configure Tailwind CSS styles and build variables.
  - Install base dependencies (lucide-react, clsx, tailwind-merge).

### Acceptance Criteria
1. Backend compile script running successfully via `npm run build`.
2. Frontend dev server launches successfully via `npm run dev`.
3. Prettier and ESLint pass without warnings on both directories.

---

## Sprint 2: Database Schema & Authentication Middleware
- **Estimate:** 8 Story Points (SP)
- **Dependencies:** Sprint 1

### User Story
As a user, I want to securely log in with my email and password and remain logged in during my session.

### Technical Tasks
- **Backend:**
  - Create MySQL migration files for tables `users`, `user_credentials`, and `activity_logs`.
  - Implement login controller checking hashed database passwords.
  - Implement JWT helper to issue tokens stored in `httpOnly` secure cookies.
  - Implement `requireAuth` gateway middleware to protect API routes.
- **Frontend:**
  - Build UI login page using Tailwind styled forms.
  - Implement authentication store (Zustand) tracking user profile state.

### Acceptance Criteria
1. Hashed password credentials successfully check database matches.
2. Login endpoint rejects invalid credentials with HTTP 401.
3. Successful login returns an `httpOnly` secure cookie.
4. Active cookie redirects user from `/login` to `/select-persona` view.

---

## Sprint 3: WAHA Session Manager & Connection Console
- **Estimate:** 8 Story Points (SP)
- **Dependencies:** Sprint 2

### User Story
As an Administrator, I want to view my active WhatsApp session status and connect or disconnect sessions from the dashboard.

### Technical Tasks
- **Backend:**
  - Implement `WahaService` wrapper checking connection states at `/api/sessions`.
  - Implement routing endpoints to disconnect or restart sessions.
  - Implement route retrieving active session QR codes.
- **Frontend:**
  - Build WhatsApp Settings panel displaying active connection status.
  - Render dynamically updating QR code blocks if session is offline.
  - Bind Restart and Disconnect actions to trigger backend API endpoints.

### Acceptance Criteria
1. Backend successfully requests session status from WAHA.
2. Disconnected sessions display QR codes retrieved from the backend.
3. Clicking "Disconnect" stops the active session in WAHA and updates MySQL session status.

---

## Sprint 4: Webhook Event Ingestion & Message Archiver
- **Estimate:** 8 Story Points (SP)
- **Dependencies:** Sprint 3

### User Story
As a user, I want incoming WhatsApp messages to automatically sync and store in my database so that no chat history is lost.

### Technical Tasks
- **Backend:**
  - Create database schemas for `whatsapp_chats`, `whatsapp_messages`, and `webhook_events`.
  - Implement secure webhook endpoint `POST /api/whatsapp/webhook/waha` with Bearer auth.
  - Implement validation using Zod to verify webhook payload attributes.
  - Implement transactional logic in MySQL to create/update chats and save messages.

### Acceptance Criteria
1. Inbound message payload containing valid headers successfully resolves to DB tables.
2. Duplicate webhook payloads are rejected and handled idempotently using message IDs.
3. Webhook endpoint returns HTTP 200 on successful processing.

---

## Sprint 5: Realtime Socket.IO Core & Event Handlers
- **Estimate:** 8 Story Points (SP)
- **Dependencies:** Sprint 4

### User Story
As a CRM agent, I want my workspace to update in real-time when new messages are received, without needing to refresh the browser.

### Technical Tasks
- **Backend:**
  - Initialize Socket.IO server inside the Express core process.
  - Implement Socket.IO authorization check utilizing JWT tokens.
  - Map active connection instances to user-specific channel rooms.
  - Update webhook ingestion logic to emit Socket.IO events to relevant rooms.
- **Frontend:**
  - Initialize Socket.IO client instance.
  - Add global hook to process real-time updates and update cached data.

### Acceptance Criteria
1. Socket connection successfully authorizes using JWT cookies.
2. Incoming webhooks trigger Socket.IO events to matching user rooms.
3. Disconnected sockets automatically attempt reconnection.

---

## Sprint 6: CRM Inbox & Conversation Feed UI
- **Estimate:** 8 Story Points (SP)
- **Dependencies:** Sprint 5

### User Story
As a CRM agent, I want to view an inbox of active chats and click on a contact to load their conversation thread.

### Technical Tasks
- **Frontend:**
  - Build the React three-column layout (Sidebar navigation, Inbox list, Chat window).
  - Implement React Query calls to fetch active chats and messages.
  - Build scrollable message window container loading historical messages.
  - Virtualize large lists using `@tanstack/react-virtual`.

### Acceptance Criteria
1. Selecting a chat loads the conversation history.
2. Chat list displays unread counters, contact name, and message previews.
3. Infinite scroll successfully loads older messages when scrolling to the top of the chat window.

---

## Sprint 7: Chat Composer & Rich Media Support
- **Estimate:** 8 Story Points (SP)
- **Dependencies:** Sprint 6

### User Story
As a CRM agent, I want to reply to chats and send files like PDFs or images so that I can share product catalogs with customers.

### Technical Tasks
- **Backend:**
  - Implement file upload handling in routes.
  - Map file parameters to WAHA `/api/sendFile` requirements.
  - Save media URLs to the `whatsapp_messages` table.
- **Frontend:**
  - Build text composer area supporting tag mentions and send triggers.
  - Add file attachment selector and upload indicators.
  - Render voice note audio players and inline document download links.

### Acceptance Criteria
1. Sending a text message calls the backend API and updates the chat feed.
2. File uploads are validated to ensure they do not exceed size limits.
3. Inbound audio files render inside custom player controls.

---

## Sprint 8: Gemini 2.5 Flash Integration & Lead Scoring
- **Estimate:** 8 Story Points (SP)
- **Dependencies:** Sprint 7

### User Story
As a business analyst, I want incoming customer messages analyzed by AI to determine lead purchase intent and sentiment.

### Technical Tasks
- **Backend:**
  - Create table schema `ai_summaries`.
  - Implement `GeminiService` wrapping `gemini-2.5-flash` API queries.
  - Construct prompt templates calculating Lead Score, Sentiment, and Next Action.
  - Implement MD5 message hashing logic to check for conversation changes and skip redundant API calls.

### Acceptance Criteria
1. Gemini analysis parses chat history and returns valid JSON matching the schema.
2. AI analyses are stored in the database and updated only when new messages are added.
3. Invalid JSON responses from the Gemini API trigger automatic retries.

---

## Sprint 9: Interactive AI Assist Pane UI
- **Estimate:** 5 Story Points (SP)
- **Dependencies:** Sprint 8

### User Story
As a CRM agent, I want to view AI-generated summaries, lead scores, and suggested replies next to my chat window so that I can respond to leads faster.

### Technical Tasks
- **Frontend:**
  - Build a collapsible panel on the right side of the Chat Window.
  - Display the Lead Score using a color-coded gauge (Red/Yellow/Green).
  - Render the AI Summary, Sentiment, and Suggested Reply cards.
  - Implement a button to insert the suggested reply directly into the composer.

### Acceptance Criteria
1. AI Pane updates in real-time when new messages are sent or received.
2. Suggested reply inserts text into the composer, allowing the agent to edit before sending.
3. The AI pane hides correctly when using mobile-sized viewports.

---

## Sprint 10: SQL-Polling Broadcast Campaign Queue Engine
- **Estimate:** 8 Story Points (SP)
- **Dependencies:** Sprint 7

### User Story
As a marketer, I want to send WhatsApp campaigns to target audiences without getting blocked by WhatsApp rate limits.

### Technical Tasks
- **Backend:**
  - Create table schemas `broadcasts` and `broadcast_queue`.
  - Implement the background `QueueProcessor` class running on a periodic poll interval.
  - Implement row-level lock polling queries using `FOR UPDATE SKIP LOCKED`.
  - Implement delay logic using randomized time intervals.
  - Implement retry logic with exponential backoffs for failed messages.

### Acceptance Criteria
1. Multiple queue workers can pull tasks concurrently without duplicate sends.
2. Campaigns pause and resume instantly by updating database status values.
3. Safe-sending delay calculations successfully apply random wait windows.

---

## Sprint 11: Broadcast Wizard UI
- **Estimate:** 8 Story Points (SP)
- **Dependencies:** Sprint 10

### User Story
As a marketer, I want to upload a CSV file of contacts, write a template message, and launch campaigns from a step-by-step wizard.

### Technical Tasks
- **Frontend:**
  - Build a multi-step modal wizard.
  - Implement CSV/Excel parsing and map target phone numbers.
  - Build template composer validating dynamic tags like `{{name}}`.
  - Build active progress screen displaying sending statistics, ETA, and Pause/Resume controls.

### Acceptance Criteria
1. Drag-and-drop file upload parses CSV rows.
2. Dynamic text fields validate parameter replacements correctly.
3. Progress indicators update in real-time via Socket.IO events.

---

## Sprint 12: Settings Module & System Diagnostics
- **Estimate:** 8 Story Points (SP)
- **Dependencies:** Sprint 11

### User Story
As an Administrator, I want a centralized settings panel to configure API keys, safe sending limits, and review user audit logs.

### Technical Tasks
- **Backend:**
  - Implement API endpoints supporting settings updates.
  - Build system diagnostics routes (uptime, version, status info).
  - Implement paginated audit logs search endpoint.
- **Frontend:**
  - Build Settings layout sidebar.
  - Implement form panels (Profile, AI settings, safe-sending settings, Integration switches).
  - Build audit log table with pagination controls.

### Acceptance Criteria
1. Updates to settings save to database and instantly apply to active workers.
2. Sensitive keys are encrypted in MySQL using the encryption key.
3. System Diagnostics display accurate server status and connection info.
4. Audit Log lists admin configuration actions.
