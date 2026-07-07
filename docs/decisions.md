# ARCHITECTURE DECISION RECORD (ADR)
## Project: WAHA Control Center (WhatsApp Module - V1 Standalone)

This document tracks the significant architectural and design choices made during the planning and implementation of the WhatsApp Control Center module at Resham Sutra.

---

## ADR-001: Standalone MySQL Persistence (No Supabase in Phase 1)

### Status
Accepted

### Context
The main Resham Sutra application utilizes Supabase for specific functions. However, the WhatsApp Module (WAHA Control Center) must operate as a standalone, self-contained workspace in Phase 1 to reduce deployment complexity.

### Decision
All persistence layers—including Users, Contacts, Chats, Messages, Credentials, Broadcast Queue, AI Summaries, and Audit Logs—will be stored directly in the existing local **MySQL** database. The backend will not query or write to Supabase.

### Consequences
- **Pros:**
  - Zero external cloud dependencies for database access during Phase 1.
  - Transactions on chats, messages, and broadcast status can be safely managed on a single database.
  - Simplifies local Docker environments.
- **Cons:**
  - Requires maintaining a separate MySQL database schema alongside Supabase tables.

---

## ADR-002: SQL Table-Polling Queue Processor for Broadcasts

### Status
Accepted

### Context
Staging and executing large WhatsApp broadcast campaigns requires a message queue to control sending rates, randomize delays, retry failed messages, and support pausing/resuming. Using standard message brokers (like Redis + BullMQ) introduces extra infrastructure dependencies.

### Decision
We will implement a backend background queue processor in Node.js that polls a database table (`broadcast_queue`). To prevent race conditions in multi-threaded or containerized instances, the polling logic will use row-level locking via MySQL's `FOR UPDATE SKIP LOCKED` inside transactions:

```sql
SELECT * FROM broadcast_queue WHERE status = 'pending' LIMIT 1 FOR UPDATE SKIP LOCKED;
```

### Consequences
- **Pros:**
  - Minimal infrastructure footprint (no additional Redis container needed).
  - Transactional alignment with the messages database.
  - Simple campaign pause/resume states managed via simple SQL updates.
- **Cons:**
  - Introduces database polling overhead (mitigated by a 1-second query interval and index optimizations).

---

## ADR-003: Selection of Gemini 2.5 Flash (`gemini-2.5-flash`)

### Status
Accepted

### Context
The application provides real-time AI summarization, sentiment analysis, lead intent scoring (0–100), and suggested replies for active customer conversations.

### Decision
We will integrate the **Gemini 2.5 Flash** (`gemini-2.5-flash`) model as the primary AI engine. 

### Rationale
- **Latency & Speed:** Fast processing times suitable for real-time inbox operations.
- **Cost Efficiency:** Low cost per token, making it affordable to run analysis on ongoing conversations.
- **Structured JSON Outputs:** Native support for Structured Outputs (using Zod schemas) ensures reliable JSON response formatting without text parsing errors.
- **Context Window:** Large context window allows analyzing longer conversation histories when generating summaries.

---

## ADR-004: Deferred Multi-User Isolation Hooks

### Status
Accepted

### Context
While Version 1 will operate as a single-user system, the codebase must be designed to support multiple users in the future with minimal architectural refactoring.

### Decision
We will defer building multi-user UI controls and team routing logic, but implement database tables and backend routes with multi-user support in mind from day one.
- **Mandatory User Scoping:** Every database query targeting chats, messages, or broadcasts will include a `user_id` constraint.
- **Private Room Events:** Real-time Socket.IO events will be emitted to user-specific rooms (`user:${userId}`) rather than a global channel.

### Consequences
- **Pros:**
  - High extensibility. Introducing multiple users, teams, and departments in Phase 2 will require zero changes to database queries or WebSocket structures.
- **Cons:**
  - Slightly more overhead during V1 setup to pass the `user_id` parameter through all API and database layers.

---

## ADR-005: Cookie-Based JWT Session Management

### Status
Accepted

### Context
The frontend and backend require a secure authentication mechanism to protect API routes and real-time socket connections.

### Decision
We will store JSON Web Tokens (JWT) inside **HTTPOnly, Secure, and SameSite=Lax** cookies, rather than browser localStorage.

### Rationale
- **XSS Prevention:** Storing tokens in `httpOnly` cookies prevents malicious JavaScript from accessing and stealing the session tokens.
- **Socket.IO Handshakes:** Sockets can automatically read cookies during connection setup, simplifying real-time authentication.
