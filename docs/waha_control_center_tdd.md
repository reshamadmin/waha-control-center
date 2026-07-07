# TECHNICAL DESIGN DOCUMENT (TDD)
## Project: WAHA Control Center (WhatsApp Module - V1 Standalone)
### Version: 1.0.0
### Date: July 7, 2026
### Target Audience: Software Engineering Team, QA, DevOps

---

## 1. System Architecture

The Resham Sutra WhatsApp Control Center operates as a standalone module in Phase 1, using the existing infrastructure and completely bypassing Supabase for data access. It integrates with WAHA (WhatsApp HTTP API), the Gemini API, and future ERP/n8n services.

### 1.1 Architectural Blueprint

```mermaid
graph TD
    subgraph Client Application (Browser)
        FE[React Frontend]
        ZQ[Zustand & React Query]
        SIOC[Socket.IO Client]
        FE -->|State & Cache| ZQ
    end

    subgraph Backend Services (DigitalOcean Ubuntu Droplet)
        API[Express API Gateway]
        DB[(MySQL Database)]
        QP[SQL-Polling Queue Processor]
        SIOS[Socket.IO Server]
        
        API -->|Reads/Writes| DB
        QP -->|Polls Queue / Updates Status| DB
        SIOS -->|Real-time Events| FE
    end

    subgraph External Systems
        WAHA[WAHA Server Community / NOWEB Engine]
        GEMINI[Gemini API - gemini-2.5-flash]
        N8N[n8n Workflow Automation]
        ERP[Future ERP Module]
    end

    %% Communications
    FE -->|HTTPS + JWT| API
    FE -->|WebSocket| SIOS
    API -->|HTTP REST + API Key| WAHA
    API -->|HTTP REST + API Key| GEMINI
    QP -->|HTTP REST| WAHA
    WAHA -->|Webhook Events| API
    API -->|Webhooks / Webhook Trigger| N8N
    N8N -->|REST Calls| API
    ERP -->|REST API| API
```

### 1.2 Data Flow & System Boundaries

1. **Inbound WhatsApp Message:**
   - Client sends message to WAHA WhatsApp node.
   - WAHA generates a `message` webhook and sends it to `POST /api/whatsapp/webhook/waha` with Bearer Authentication.
   - The API server inserts the raw event into `webhook_events`, maps it to a user and chat, writes the message into `whatsapp_messages`, updates the chat preview in `whatsapp_chats`, and broadcasts the message via Socket.IO to the React Frontend.
   - Concurrently, the backend schedules an asynchronous task to request an AI Summary and Sentiment analysis from `gemini-2.5-flash`, which updates the database and pushes updates to the frontend.

2. **Outbound WhatsApp Message (Manual):**
   - User types a message and clicks Send.
   - Frontend calls `POST /api/whatsapp/send`.
   - Backend calls WAHA `/api/sendText` synchronously.
   - On success, the message is stored in MySQL, and Socket.IO pushes the update to active sessions.

3. **Outbound WhatsApp Message (Broadcast):**
   - User initiates a broadcast via the Broadcast Wizard.
   - Backend creates a `broadcasts` master record and inserts chunked messages into the `broadcast_queue` table with a status of `pending`.
   - The background SQL-polling Queue Processor pulls pending messages, executes delay timers, calls WAHA, updates status, and fires updates via Socket.IO.

---

## 2. Folder Structure

The project uses a monorepo structure with independent `apps/web` (React/Vite) and `apps/api` (Node/Express). The frontend adopts a feature-based architecture to enable scaling.

```
c:/Automation/
├── apps/
│   ├── web/                      # React / TypeScript / Vite Frontend
│   │   ├── src/
│   │   │   ├── assets/           # Global assets (logos, illustrations)
│   │   │   ├── components/       # Shared UI components (Shadcn primitives)
│   │   │   │   ├── ui/
│   │   │   │   │   ├── button.tsx
│   │   │   │   │   ├── dialog.tsx
│   │   │   │   │   ├── table.tsx
│   │   │   │   │   └── input.tsx
│   │   │   │   └── layouts/      # Global Layout components (Sidebar, Header)
│   │   │   ├── features/         # Feature-based folders
│   │   │   │   ├── auth/         # Login, JWT parsing, Protected Routes
│   │   │   │   ├── crm/          # Inbox, Chat window, Customer cards, AI panel
│   │   │   │   ├── broadcast/    # Broadcast Wizard, Queue monitor, Safe sending config
│   │   │   │   ├── settings/     # Settings panels, WAHA console, Gemini prompts
│   │   │   │   └── dashboard/    # CXO/Admin widgets, message counters
│   │   │   ├── hooks/            # Global reusable hooks
│   │   │   ├── lib/              # Library instantiations (axiosClient, socket, utils)
│   │   │   ├── routes/           # Router configuration & nested routes
│   │   │   ├── store/            # Zustand global stores
│   │   │   ├── App.tsx           # Entry router injection
│   │   │   ├── index.css         # Global CSS system variables
│   │   │   └── main.tsx          # React DOM entry mount
│   │   ├── package.json
│   │   └── vite.config.ts
│   └── api/                      # Node.js Express API
│       ├── src/
│       │   ├── config.ts         # Environment variables & zod configuration
│       │   ├── server.ts         # Express entrypoint, Socket.io initialization
│       │   ├── auth.ts           # Session auth, JWT validation, cookie helpers
│       │   ├── errors/           # Custom AppError subclasses (4xx, 5xx)
│       │   ├── middleware/       # Auth validation, Logger, Rate-limiter
│       │   ├── models/           # Types & interfaces matching MySQL
│       │   ├── repositories/     # Data Access Objects (Raw SQL via mysql2/promise)
│       │   │   ├── UserRepository.ts
│       │   │   ├── ChatRepository.ts
│       │   │   ├── MessageRepository.ts
│       │   │   ├── QueueRepository.ts
│       │   │   └── AuditLogRepository.ts
│       │   ├── services/         # Business logic layer
│       │   │   ├── WahaService.ts      # Direct wrapper for WAHA Engine REST API
│       │   │   ├── GeminiService.ts    # Direct integration with Gemini 2.5 Flash
│       │   │   ├── QueueProcessor.ts   # SQL table-polling queue engine
│       │   │   └── EncryptService.ts   # AES-256 credentials encryption
│       │   ├── routes/           # Express router endpoints
│       │   │   ├── authRoutes.ts
│       │   │   ├── whatsappRoutes.ts
│       │   │   ├── broadcastRoutes.ts
│       │   │   └── settingsRoutes.ts
│       │   └── db.ts             # MySQL pool initialization
│       ├── package.json
│       └── tsconfig.json
```

---

## 3. Routing Design

The routing architecture implements nested layouts, protected route guards, and automatic landing page redirection based on user settings and selected persona modes.

```
                     ┌───────────────┐
                     │  /login Page  │
                     └───────┬───────┘
                             │ (Checks JWT)
                             ▼
                 ┌──────────────────────┐
                 │  /select-persona     │ (Choose CRM, SERVICE, ADMIN, CXO)
                 └───────────┬──────────┘
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
┌──────────────────────┐          ┌──────────────────────┐
│  /crm Nested Layout  │          │  /settings Layout    │
├──────────────────────┤          ├──────────────────────┤
│  /crm/inbox          │          │  /settings/profile   │
│  /crm/broadcast      │          │  /settings/waha      │
│  /crm/dashboard      │          │  /settings/ai        │
└──────────────────────┘          └──────────────────────┘
```

### 3.1 Protected Route Wrapper (React Router v6)

```typescript
// apps/web/src/routes/ProtectedRoute.tsx
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

export const ProtectedRoute = ({ allowedPersonas }: { allowedPersonas?: string[] }) => {
  const { isAuthenticated, user, currentPersona } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedPersonas && (!currentPersona || !allowedPersonas.includes(currentPersona))) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <Outlet />;
};
```

### 3.2 Router Declaration

```typescript
// apps/web/src/routes/index.tsx
import { createBrowserRouter, Navigate } from "react-router-dom";
import { MainLayout } from "../components/layouts/MainLayout";
import { Login } from "../features/auth/Login";
import { PersonaSelection } from "../features/auth/PersonaSelection";
import { Inbox } from "../features/crm/Inbox";
import { BroadcastWizard } from "../features/broadcast/BroadcastWizard";
import { CrmDashboard } from "../features/dashboard/CrmDashboard";
import { ProfileSettings } from "../features/settings/ProfileSettings";
import { WahaSettings } from "../features/settings/WahaSettings";
import { AiSettings } from "../features/settings/AiSettings";
import { ProtectedRoute } from "./ProtectedRoute";

export const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  { path: "/select-persona", element: <PersonaSelection /> },
  {
    element: <ProtectedRoute />, // Basic Auth Guard
    children: [
      {
        path: "/",
        element: <MainLayout />,
        children: [
          // Persona-specific routing
          {
            element: <ProtectedRoute allowedPersonas={["CRM", "ADMIN"]} />,
            children: [
              { path: "crm/inbox", element: <Inbox /> },
              { path: "crm/broadcast", element: <BroadcastWizard /> },
              { path: "crm/dashboard", element: <CrmDashboard /> }
            ]
          },
          // Shared Settings layout
          {
            path: "settings",
            children: [
              { path: "", element: <Navigate to="profile" replace /> },
              { path: "profile", element: <ProfileSettings /> },
              { path: "waha", element: <WahaSettings /> },
              { path: "ai", element: <AiSettings /> }
            ]
          }
        ]
      }
    ]
  },
  { path: "*", element: <Navigate to="/login" replace /> }
]);
```

---

## 4. Component Architecture

### 4.1 Layout Components

- **MainLayout:** Contains the persistent sidebar, horizontal top navigation containing the active user avatar, notification bell, active persona selector dropdown, and the central canvas wrapper.
- **SettingsLayout:** Left navigation panel containing sub-links for Settings categories (Profile, WAHA, AI, Broadcast, Integration, Appearance, Audit Log).

### 4.2 Interactive Core UI Primitives

1. **Inbox Sidebar (`<InboxSidebar />`):** Handles contact listing, virtual lists for infinite scrolling, label badges, typing indicator state (via socket), and active-state hooks.
2. **Chat Container (`<ChatWindow />`):** Renders the active message feed. Dynamically outputs text, images, videos, audio, PDF links, and location cards. Includes the draft composer, attachment buttons, and quick AI response buttons.
3. **AI Assist Pane (`<AiAssistPane />`):** Slides out from the right of the Chat Window. Displays:
   - Lead Score (0–100 scale, with customized color mapping: Red < 30, Yellow 30-70, Green > 70).
   - Sentiment Badge (Positive, Neutral, Negative).
   - AI Generated Summary with refresh capability.
   - Suggested Reply text cards that can be edited or clicked to insert directly into the chat composer.

### 4.3 Broadcast Wizard Component

The Wizard utilizes a multi-step design powered by Zustand to maintain progress state during compilation.

```
[Step 1: Targets] ───► [Step 2: Message Template] ───► [Step 3: Safe Settings] ───► [Step 4: Review & Run]
```

- **Target Selection:** Supports uploading a CSV/Excel file or checking checkboxes on a paginated grid of existing contacts.
- **Message Composer:** Supports template tag injection (`{{name}}`, `{{phone}}`, `{{last_message}}`) and attachment uploading.
- **Delay Config:** Simple inputs representing delay boundaries (Fixed Delay, Min Random, Max Random).
- **Execution Controller:** Shows progress bar, estimated completion time, status counters (Queued, Sent, Failed), and Pause/Resume/Cancel triggers.

---

## 5. State Management

The frontend state management coordinates global app shell configurations, real-time message streams, and HTTP endpoint cache layers.

```
                                  ┌───────────────────────────┐
                                  │      React Query Cache    │
                                  ├───────────────────────────┤
                                  │  - whatsapp_chats         │
                                  │  - whatsapp_messages      │
                                  │  - session_status         │
                                  └─────────────▲─────────────┘
                                                │ (API Fetch)
                                                │
┌──────────────────────────┐      ┌─────────────┴─────────────┐      ┌──────────────────────────┐
│      Zustand Store       ├─────►│     UI Components (CRM)   │◄─────┤      Socket.IO Client    │
├──────────────────────────┤      └───────────────────────────┘      ├──────────────────────────┤
│  - currentPersona        │                                         │  - message.created       │
│  - notificationSettings  │                                         │  - typing.status         │
│  - activeChatId          │                                         │  - queue.progress        │
└──────────────────────────┘                                         └──────────────────────────┘
```

### 5.1 Zustand Global Store Definition

```typescript
// apps/web/src/store/uiStore.ts
import { create } from "zustand";

interface UiState {
  currentPersona: "CRM" | "SERVICE" | "ADMIN" | "CXO";
  activeChatId: string | null;
  sidebarOpen: boolean;
  theme: "light" | "dark" | "system";
  setPersona: (persona: "CRM" | "SERVICE" | "ADMIN" | "CXO") => void;
  setActiveChatId: (chatId: string | null) => void;
  toggleSidebar: () => void;
  setTheme: (theme: "light" | "dark" | "system") => void;
}

export const useUiStore = create<UiState>((set) => ({
  currentPersona: "CRM",
  activeChatId: null,
  sidebarOpen: true,
  theme: "system",
  setPersona: (persona) => set({ currentPersona: persona }),
  setActiveChatId: (chatId) => set({ activeChatId: chatId }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setTheme: (theme) => set({ theme })
}));
```

### 5.2 React Query and Optimistic Updates

React Query (TanStack Query) handles server state, caching details, and optimistic UI mutations for features like message sending.

```typescript
// apps/web/src/features/crm/hooks/useSendMessage.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { WhatsappMessage } from "../../../models/Whatsapp";

export const useSendMessage = (chatId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (text: string) => {
      const response = await axios.post(`/api/whatsapp/send`, { to: chatId, text });
      return response.data as WhatsappMessage;
    },
    // Optimistic Update
    onMutate: async (newText) => {
      await queryClient.cancelQueries({ queryKey: ["messages", chatId] });
      const previousMessages = queryClient.getQueryData<WhatsappMessage[]>(["messages", chatId]) || [];

      const optimisticMsg: WhatsappMessage = {
        id: `optimistic-${Date.now()}`,
        chatId,
        userId: "current-user",
        direction: "outbound",
        wahaMessageId: null,
        messageType: "text",
        body: newText,
        mediaUrl: null,
        status: "sending",
        sentAt: new Date(),
        createdAt: new Date()
      };

      queryClient.setQueryData<WhatsappMessage[]>(
        ["messages", chatId],
        [...previousMessages, optimisticMsg]
      );

      return { previousMessages };
    },
    onError: (err, newText, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(["messages", chatId], context.previousMessages);
      }
    },
    onSuccess: (data) => {
      // Replace optimistic message with actual database message from response
      queryClient.setQueryData<WhatsappMessage[]>(["messages", chatId], (old) => {
        if (!old) return [data];
        return old.map((m) => (m.id.startsWith("optimistic-") ? data : m));
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["chats"] });
    }
  });
};
```

---

## 6. API Design

All endpoints require JWT authorization passed via standard HTTP cookies or HTTP headers. The endpoints return JSON responses.

### 6.1 Authentication Endpoints

#### `POST /api/auth/login`
- **Purpose:** User authentication and session assignment.
- **Request Body:**
  ```json
  {
    "email": "user@reshamsutra.com",
    "password": "strongPassword123"
  }
  | Field | Type | Required | Description |
  |---|---|---|---|
  | email | string | Yes | Normalized email address |
  | password | string | Yes | Raw text password |
  ```
- **Response (200 OK):**
  ```json
  {
    "status": "success",
    "user": {
      "id": "usr_781290",
      "name": "Jane Doe",
      "email": "user@reshamsutra.com"
    }
  }
  ```
- **Response Headers:** `Set-Cookie: session_token=jwt_hash; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`
- **Error Response (401 Unauthorized):**
  ```json
  {
    "status": "error",
    "code": "UNAUTHORIZED",
    "message": "Invalid email or password."
  }
  ```

---

### 6.2 WhatsApp Module Endpoints

#### `GET /api/whatsapp/chats`
- **Purpose:** Fetch all active chats for the authenticated user, ordered by latest message timestamp.
- **Response (200 OK):**
  ```json
  [
    {
      "id": "cht_102941",
      "userId": "usr_781290",
      "customerId": "cust_88012",
      "wahaChatId": "919876543210@s.whatsapp.net",
      "contactPhone": "919876543210",
      "contactName": "Rahul Kumar",
      "lastMessageAt": "2026-07-07T05:00:00.000Z",
      "lastMessagePreview": "I need info on the silk reeling machine.",
      "unreadCount": 2
    }
  ]
  ```

#### `GET /api/whatsapp/chats/:id/messages`
- **Purpose:** Fetch paginated message logs for a single chat thread.
- **Parameters:** `id` (Database Chat ID or `wahaChatId`)
- **Query Parameters:** `page` (number, default: 1), `limit` (number, default: 50)
- **Response (200 OK):**
  ```json
  {
    "messages": [
      {
        "id": "msg_90124",
        "chatId": "cht_102941",
        "userId": "usr_781290",
        "direction": "inbound",
        "wahaMessageId": "msg_waha_8829103",
        "messageType": "text",
        "body": "I need info on the silk reeling machine.",
        "mediaUrl": null,
        "status": "read",
        "sentAt": "2026-07-07T05:00:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "hasNextPage": false
    }
  }
  ```

#### `POST /api/whatsapp/send`
- **Purpose:** Synchronously dispatch outbound message to WAHA and save record to Database.
- **Request Body:**
  ```json
  {
    "to": "919876543210",
    "text": "Hello, thank you for reaching out to Resham Sutra."
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "id": "msg_90125",
    "chatId": "cht_102941",
    "userId": "usr_781290",
    "direction": "outbound",
    "wahaMessageId": "msg_waha_8829104",
    "messageType": "text",
    "body": "Hello, thank you for reaching out to Resham Sutra.",
    "mediaUrl": null,
    "status": "delivered",
    "sentAt": "2026-07-07T05:02:10.000Z"
  }
  ```

---

### 6.3 Broadcast Endpoints

#### `POST /api/broadcast`
- **Purpose:** Stage a new campaign and queue messages.
- **Request Body:**
  ```json
  {
    "name": "Monsoon Reeling Offer",
    "targets": [
      { "phone": "919876543210", "name": "Rahul" },
      { "phone": "919876543211", "name": "Sita" }
    ],
    "messageType": "text",
    "body": "Hi {{name}}, avail 10% discount on reelers this week!",
    "mediaUrl": null
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "broadcastId": "brd_55102",
    "status": "queued",
    "totalTargets": 2,
    "createdAt": "2026-07-07T05:03:00.000Z"
  }
  ```

#### `POST /api/broadcast/:id/control`
- **Purpose:** Pause, resume, or abort an active campaign.
- **Request Body:**
  ```json
  {
    "action": "pause" // "resume" | "stop"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "broadcastId": "brd_55102",
    "currentStatus": "paused"
  }
  ```

---

## 7. Database Design (MySQL Schemas)

This design uses MySQL. The schema is normalized and ready to support multi-user teams and multi-session architecture in future phases.

```
┌─────────────────┐       ┌─────────────────┐       ┌──────────────────┐
│      users      │◄──────┤user_credentials │       │  webhook_events  │
└────────┬────────┘       └─────────────────┘       └──────────────────┘
         │
         │                ┌─────────────────┐       ┌──────────────────┐
         ├───────────────►│ whatsapp_chats  │◄──────┤   ai_summaries   │
         │                └────────┬────────┘       └──────────────────┘
         │                         │
         │                         ▼
         │                ┌─────────────────┐       ┌──────────────────┐
         └───────────────►│whatsapp_messages│       │   activity_logs  │
                          └─────────────────┘       └──────────────────┘
```

### 7.1 Table: `users`
Tracks system users. Holds auth credentials and persona choices.
```sql
CREATE TABLE `users` (
  `id` VARCHAR(36) PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(191) UNIQUE NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('ADMIN', 'USER', 'CXO') NOT NULL DEFAULT 'USER',
  `default_persona` ENUM('CRM', 'SERVICE', 'ADMIN', 'CXO') NOT NULL DEFAULT 'CRM',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 7.2 Table: `user_credentials`
Stores encrypted external API properties, SMTP logins, and session names.
```sql
CREATE TABLE `user_credentials` (
  `id` VARCHAR(36) PRIMARY KEY,
  `user_id` VARCHAR(36) UNIQUE NOT NULL,
  `whatsapp_session_name` VARCHAR(100) UNIQUE NULL,
  `whatsapp_session_status` ENUM('DISCONNECTED', 'SCAN_QR', 'CONNECTED') NOT NULL DEFAULT 'DISCONNECTED',
  `whatsapp_connected_at` TIMESTAMP NULL DEFAULT NULL,
  
  -- Encrypted OAuth configurations (V1 properties)
  `zoho_email` VARCHAR(191) NULL DEFAULT NULL,
  `zoho_app_password_encrypted` TEXT NULL DEFAULT NULL,
  `google_email` VARCHAR(191) NULL DEFAULT NULL,
  `google_refresh_token_encrypted` TEXT NULL DEFAULT NULL,
  
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 7.3 Table: `whatsapp_chats`
Active chat entities, mapped to a user (to preserve isolation in single-user setups, ready for multi-user shared folders).
```sql
CREATE TABLE `whatsapp_chats` (
  `id` VARCHAR(36) PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `customer_id` VARCHAR(36) NULL DEFAULT NULL,
  `waha_chat_id` VARCHAR(100) NOT NULL,
  `contact_phone` VARCHAR(30) NULL DEFAULT NULL,
  `contact_name` VARCHAR(100) NULL DEFAULT NULL,
  `last_message_at` TIMESTAMP NULL DEFAULT NULL,
  `last_message_preview` TEXT NULL DEFAULT NULL,
  `unread_count` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `idx_user_waha` (`user_id`, `waha_chat_id`),
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 7.4 Table: `whatsapp_messages`
Records individual chat transactions. Mapped to parents via relational constraints.
```sql
CREATE TABLE `whatsapp_messages` (
  `id` VARCHAR(36) PRIMARY KEY,
  `chat_id` VARCHAR(36) NOT NULL,
  `user_id` VARCHAR(36) NOT NULL,
  `direction` ENUM('inbound', 'outbound') NOT NULL,
  `waha_message_id` VARCHAR(100) UNIQUE NULL DEFAULT NULL,
  `message_type` VARCHAR(50) NOT NULL DEFAULT 'text',
  `body` TEXT NULL DEFAULT NULL,
  `media_url` TEXT NULL DEFAULT NULL,
  `status` ENUM('sending', 'sent', 'delivered', 'read', 'failed') DEFAULT 'sending',
  `sent_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`chat_id`) REFERENCES `whatsapp_chats` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 7.5 Table: `broadcasts`
Represents the campaign master records.
```sql
CREATE TABLE `broadcasts` (
  `id` VARCHAR(36) PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `status` ENUM('draft', 'queued', 'sending', 'paused', 'completed', 'cancelled') NOT NULL DEFAULT 'draft',
  `total_targets` INT NOT NULL DEFAULT 0,
  `sent_count` INT NOT NULL DEFAULT 0,
  `failed_count` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 7.6 Table: `broadcast_queue`
Maintains staged targets. Monitored by the SQL poll processor.
```sql
CREATE TABLE `broadcast_queue` (
  `id` VARCHAR(36) PRIMARY KEY,
  `broadcast_id` VARCHAR(36) NOT NULL,
  `phone` VARCHAR(30) NOT NULL,
  `recipient_name` VARCHAR(100) NULL DEFAULT NULL,
  `message_body` TEXT NOT NULL,
  `media_url` TEXT NULL DEFAULT NULL,
  `status` ENUM('pending', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'pending',
  `retry_count` INT NOT NULL DEFAULT 0,
  `last_error` VARCHAR(255) NULL DEFAULT NULL,
  `scheduled_at` TIMESTAMP NOT NULL,
  `processed_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_poll_status` (`status`, `scheduled_at`),
  FOREIGN KEY (`broadcast_id`) REFERENCES `broadcasts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 7.7 Table: `webhook_events`
Immutable historical log of every incoming webhook request.
```sql
CREATE TABLE `webhook_events` (
  `id` VARCHAR(36) PRIMARY KEY,
  `session_name` VARCHAR(100) NOT NULL,
  `event_type` VARCHAR(100) NOT NULL,
  `payload` JSON NOT NULL,
  `processed` TINYINT(1) NOT NULL DEFAULT 0,
  `error` TEXT NULL DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 7.8 Table: `ai_summaries`
Maintains conversational insights. Linked to chats to prevent redundant AI operations.
```sql
CREATE TABLE `ai_summaries` (
  `id` VARCHAR(36) PRIMARY KEY,
  `chat_id` VARCHAR(36) UNIQUE NOT NULL,
  `summary` TEXT NOT NULL,
  `sentiment` ENUM('positive', 'neutral', 'negative') NOT NULL DEFAULT 'neutral',
  `lead_score` INT NOT NULL DEFAULT 0,
  `next_action` VARCHAR(255) NULL DEFAULT NULL,
  `last_message_hash` VARCHAR(64) NOT NULL, -- MD5 hash of latest processed messages to check dirty state
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`chat_id`) REFERENCES `whatsapp_chats` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 7.9 Table: `activity_logs`
System-wide audit trail. Keeps track of configurations, session status changes, etc.
```sql
CREATE TABLE `activity_logs` (
  `id` VARCHAR(36) PRIMARY KEY,
  `user_id` VARCHAR(36) NULL DEFAULT NULL,
  `action` VARCHAR(100) NOT NULL,
  `details` TEXT NULL DEFAULT NULL,
  `ip_address` VARCHAR(45) NULL DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 8. Security

### 8.1 JWT Authentication & Cookie Storage
- **Protocol:** Cookies containing HTTPOnly, Secure, and SameSite=Lax flags store JWT tokens. This prevents XSS tokens from leaking access headers.
- **JWT Content:** Holds `id`, `name`, `email`, and standard validation fields (`exp`, `iss`).

### 8.2 Role-Based Access Controls (RBAC) & Persona Isolation
- Direct mapping checks role access for specific modules:
  - **ADMIN:** Full configurations access, integration triggers, audit log audits.
  - **CRM/SERVICE:** Standard read/write, queue controls.
  - **CXO:** Read-only widgets, high-level dashboards, analytics panels.

### 8.3 Rate Limiting
- API requests restricted using `express-rate-limit`:
  - Default: Maximum 100 queries per minute per IP for standard endpoints.
  - Broadcast submissions: Maximum 10 requests per minute per IP.
  - WAHA Webhooks: Excluded from standard limits but protected by a shared Webhook Authorization Secret Token.

### 8.4 Encryption
- Sensitive settings values (such as `zohoAppPasswordEncrypted` and `googleRefreshTokenEncrypted`) are encrypted using **AES-256-GCM** inside the `EncryptionService` before database storage.
- Key properties: Secrets stored in environmental environment variables (`ENCRYPTION_KEY`), rotated periodically.

---

## 9. Broadcast Engine

The Broadcast Engine uses a SQL-table-polling queue processor to control sending rates, randomize delays, retry failed messages, and handle pauses/resumes.

### 9.1 Process Lifetime & Transaction Logic

```
   [Queue Worker Loop]
           │
           ▼
[Poll: SELECT FOR UPDATE] ──(No Jobs)──► [Sleep 500ms]
           │
     (Found Job)
           │
           ▼
[Check status of Campaign] ────(Paused/Cancelled)────► [Update Job to 'pending' + Release Lock]
           │
       (Active)
           │
           ▼
[Update Job to 'processing']
           │
           ▼
[Calculate Random Delay] ──► [Wait (Sleep)] ──► [Post to WAHA /api/sendText]
                                                        │
                                             ┌──────────┴──────────┐
                                             ▼                     ▼
                                         (Success)             (Failure)
                                             │                     │
                                             ▼                     ▼
                                    [Status='completed']   [Retry Limit Exceeded?]
                                                               ├───────(No)───────► [Status='pending', retry_count++]
                                                               └───────(Yes)──────► [Status='failed', Log error]
```

### 9.2 SQL Query with Row-Level Locking
To prevent race conditions in a multi-instance production environment, row-level locking ensures that only one worker thread can fetch a pending message at a time:

```sql
START TRANSACTION;

SELECT q.*, b.status as campaign_status
FROM broadcast_queue q
JOIN broadcasts b ON q.broadcast_id = b.id
WHERE q.status = 'pending' 
  AND q.scheduled_at <= NOW()
  AND b.status = 'sending'
ORDER BY q.scheduled_at ASC 
LIMIT 1 
FOR UPDATE SKIP LOCKED;

-- If a record is returned, update it inside the transaction:
UPDATE broadcast_queue 
SET status = 'processing', processed_at = NOW() 
WHERE id = ?;

COMMIT;
```

### 9.3 Randomization Delay Logic

```typescript
// apps/api/src/services/QueueProcessor.ts
import { pool } from "../db.js";
import { WahaService } from "./WahaService.js";

export class QueueProcessor {
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(
    private readonly waha: WahaService,
    private readonly pollIntervalMs = 1000
  ) {}

  public start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.poll(), this.pollIntervalMs);
    console.log("SQL-polling Broadcast Queue Processor started.");
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async poll() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. Fetch the next executable task using row locks
      const [rows] = await connection.execute<any[]>(
        `SELECT q.id, q.broadcast_id, q.phone, q.message_body, q.media_url, q.retry_count,
                b.user_id, b.status as campaign_status
         FROM broadcast_queue q
         JOIN broadcasts b ON q.broadcast_id = b.id
         WHERE q.status = 'pending' 
           AND q.scheduled_at <= NOW()
           AND b.status = 'sending'
         ORDER BY q.scheduled_at ASC 
         LIMIT 1 
         FOR UPDATE SKIP LOCKED`
      );

      if (rows.length === 0) {
        await connection.commit();
        this.isProcessing = false;
        connection.release();
        return;
      }

      const task = rows[0];

      // 2. Lock the job to 'processing' status
      await connection.execute(
        `UPDATE broadcast_queue SET status = 'processing', processed_at = NOW() WHERE id = ?`,
        [task.id]
      );
      await connection.commit();
      connection.release();

      // 3. Process dispatch outside of the database transaction
      await this.dispatch(task);

    } catch (err) {
      console.error("[QueueProcessor] Error fetching task:", err);
      await connection.rollback();
      connection.release();
    } finally {
      this.isProcessing = false;
    }
  }

  private async dispatch(task: any) {
    try {
      // Fetch user's safe sending delay settings
      const delaySettings = await this.getBroadcastSettings(task.user_id);
      
      // Calculate delay (Fixed + Random)
      const delayMs = this.calculateDelay(
        delaySettings.minDelaySec, 
        delaySettings.maxDelaySec
      );

      // Sleep to enforce delay
      await new Promise((resolve) => setTimeout(resolve, delayMs));

      // Dispatch to WAHA
      await this.waha.sendText(task.user_id, task.phone, task.message_body);

      // Update task to completed
      await pool.execute(
        `UPDATE broadcast_queue SET status = 'completed' WHERE id = ?`,
        [task.id]
      );

      // Increment campaign success counter
      await pool.execute(
        `UPDATE broadcasts SET sent_count = sent_count + 1 WHERE id = ?`,
        [task.broadcast_id]
      );

    } catch (err: any) {
      console.error(`[QueueProcessor] Dispatch failed for task ${task.id}:`, err.message);
      
      const retryLimit = 3;
      if (task.retry_count < retryLimit) {
        // Schedule next retry with exponential backoff (e.g., retry after 5 mins)
        const nextTry = new Date(Date.now() + 5 * 60 * 1000);
        await pool.execute(
          `UPDATE broadcast_queue 
           SET status = 'pending', retry_count = retry_count + 1, last_error = ?, scheduled_at = ? 
           WHERE id = ?`,
          [err.message.substring(0, 255), nextTry, task.id]
        );
      } else {
        // Mark as failed permanently
        await pool.execute(
          `UPDATE broadcast_queue SET status = 'failed', last_error = ? WHERE id = ?`,
          [err.message.substring(0, 255), task.id]
        );
        await pool.execute(
          `UPDATE broadcasts SET failed_count = failed_count + 1 WHERE id = ?`,
          [task.broadcast_id]
        );
      }
    }
  }

  private calculateDelay(minSec: number, maxSec: number): number {
    const minMs = minSec * 1000;
    const maxMs = maxSec * 1000;
    return Math.floor(Math.random() * (maxMs - minMs + 1) + minMs);
  }

  private async getBroadcastSettings(userId: string) {
    const [rows] = await pool.execute<any[]>(
      `SELECT details FROM activity_logs 
       WHERE user_id = ? AND action = 'UPDATE_BROADCAST_SETTINGS' 
       ORDER BY created_at DESC LIMIT 1`
    );
    
    if (rows.length > 0) {
      try {
        return JSON.parse(rows[0].details);
      } catch {
        // Fallback to defaults
      }
    }
    return { minDelaySec: 20, maxDelaySec: 45 };
  }
}
```

---

## 10. Realtime Design (Socket.IO)

Realtime communication uses **Socket.IO** to handle events like incoming messages, typing indicators, connection health, and broadcast progress.

### 10.1 Connection Lifecycle & Security
1. **Handshake:** The Socket.IO client includes the HTTPOnly JWT cookie during connection setup.
2. **Authorization Middleware:** The backend extracts and validates the JWT. If invalid, the connection is rejected.
3. **Room Assignment:**
   - On successful connection, the server registers the socket session.
   - The socket joins a room specific to the authenticated user ID (`user:${userId}`). This prepares the architecture for future multi-user access.

### 10.2 Socket Event Contracts

#### `message.created` (Server -> Client)
Pushed when a new inbound message is ingested via a webhook, or when an outbound message is successfully sent.
```json
{
  "room": "user:usr_781290",
  "event": "message.created",
  "payload": {
    "id": "msg_90124",
    "chatId": "cht_102941",
    "direction": "inbound",
    "body": "I need info on the silk reeling machine.",
    "sentAt": "2026-07-07T05:00:00.000Z"
  }
}
```

#### `typing.status` (Client -> Server -> Client)
Transmits real-time typing indicators in chat windows.
- **Client Emits:** `typing.status` with `{ chatId: "cht_102941", isTyping: true }`
- **Server Broadcasts to User Room:**
  ```json
  {
    "event": "typing.status",
    "payload": {
      "chatId": "cht_102941",
      "isTyping": true
    }
  }
  ```

#### `broadcast.progress` (Server -> Client)
Sent by the SQL Queue Processor to notify the frontend of a campaign's sending progress.
```json
{
  "event": "broadcast.progress",
  "payload": {
    "broadcastId": "brd_55102",
    "sentCount": 14,
    "failedCount": 1,
    "totalCount": 20,
    "status": "sending"
  }
}
```

---

## 11. AI Layer (Gemini Integration)

Integrating **Gemini 2.5 Flash** (`gemini-2.5-flash`) provides automated conversations summaries, lead classification scoring, and response recommendation models.

### 11.1 Gemini Prompt Architecture & Templates

The system uses Structured Outputs (`responseSchema` configuration) to return JSON results from Gemini. This eliminates raw text parsing errors.

```typescript
// apps/api/src/services/GeminiService.ts
import { GoogleGenAI, Type } from "@google/genai";
import { pool } from "../db.js";

export class GeminiService {
  private ai: GoogleGenAI;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  /**
   * Generates summary, lead score, sentiment, and suggestions in a single API call
   */
  async analyzeConversation(
    chatId: string, 
    messages: Array<{ role: "customer" | "agent"; text: string }>
  ) {
    const formattedHistory = messages
      .map((m) => `${m.role === "customer" ? "Customer" : "Agent"}: ${m.text}`)
      .join("\n");

    const prompt = `
You are a CRM assistant for Resham Sutra, a company manufacturing silk reeling, spinning, and weaving machinery.
Analyze the following chat history and return a structured JSON analysis.

CRITERIA FOR LEAD SCORE (0 to 100):
- High score (>70): Customer displays clear purchase intent, asks about pricing, delivery timeline, machinery options, or leaves contact details.
- Medium score (30-70): General inquiry, checking product feasibility, asking general questions.
- Low score (<30): Spam, wrong number, complaints, or unrelated topics.

CHAT HISTORY:
${formattedHistory}
    `;

    const response = await this.ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { 
              type: Type.STRING, 
              description: "A concise 2-sentence summary of the customer's request and current status." 
            },
            sentiment: { 
              type: Type.STRING, 
              enum: ["positive", "neutral", "negative"],
              description: "Overall sentiment of the customer's last messages."
            },
            leadScore: { 
              type: Type.INTEGER, 
              description: "Lead score from 0 to 100 based on purchase intent." 
            },
            nextAction: { 
              type: Type.STRING, 
              description: "The recommended next action for the agent." 
            },
            suggestedReply: { 
              type: Type.STRING, 
              description: "A polite, professional response suggestion in Hindi/English matching the customer query." 
            }
          },
          required: ["summary", "sentiment", "leadScore", "nextAction", "suggestedReply"]
        }
      }
    });

    return JSON.parse(response.text);
  }
}
```

### 11.2 Cost & Performance Caching Strategy
- To reduce tokens and API expenses, analysis is only triggered when a "dirty state" is detected:
  - Calculate an MD5 hash of the latest 10 messages in the conversation thread.
  - Check the `ai_summaries` table for the target `chat_id`.
  - If the hash matches `last_message_hash`, skip the Gemini API call and return the cached values.
  - If the hashes differ (new messages received), call the Gemini API and update the cache.

---

## 12. Performance

### 12.1 Virtualized List Rendering (Frontend)
To support massive volumes of active chat items and messages without causing browser lag, the frontend uses `@tanstack/react-virtual` to virtualize render structures. Only the elements visible in the viewport are mounted in the DOM.

### 12.2 Paginated SQL Database Retrieval
Database fetches use pagination, specifying limits and index cursors to keep memory usage low:
```sql
SELECT * FROM whatsapp_messages 
WHERE chat_id = ? 
ORDER BY sent_at DESC 
LIMIT 50 OFFSET ?;
```
*Index support:* Composite indexes are placed on `(chat_id, sent_at)` to optimize pagination performance.

### 12.3 Route-Based Lazy Loading
Using `React.lazy()` and `React.Suspense` ensures that the routing bundle is split. Features like the Broadcast Wizard or Settings Module are loaded asynchronously only when the user navigates to those views.

---

## 13. Testing Strategy

```
┌──────────────────────────────────────────────────────────────┐
│                      Playwright E2E                          │
│  - Complete Broadcast Wizards flows, User Persona Switching  │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│                     Integration Testing                      │
│  - express endpoints, DB transactions, Webhook ingestions    │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│                        Unit Testing                          │
│  - WahaService call limits, safe sending delays calculation   │
└──────────────────────────────────────────────────────────────┘
```

### 13.1 Backend Integration Testing (with Mocked API Boundaries)
We use `Vitest` to verify server endpoints without making real calls to external services.

```typescript
// apps/api/src/__tests__/whatsappRoutes.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import { createWhatsappRouter } from "../routes/whatsappRoutes.js";

// Mock database and external dependencies
vi.mock("../db.js", () => ({
  pool: {
    execute: vi.fn().mockResolvedValue([[/* empty rows */]]),
    getConnection: vi.fn()
  }
}));

vi.mock("../services/WahaService.js");

const app = express();
app.use(express.json());
// Inject locals mock for auth validation bypass in test environments
app.use((req, res, next) => {
  res.locals.authUser = { id: "usr_test123", name: "Test User" };
  next();
});
app.use("/api/whatsapp", createWhatsappRouter());

describe("POST /api/whatsapp/send", () => {
  it("returns 400 when missing required body fields", async () => {
    const res = await request(app)
      .post("/api/whatsapp/send")
      .send({ to: "919876543210" }); // missing text field

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("required");
  });
});
```

### 13.2 Broadcast Load Testing
1. **Mock Node Execution Engine:** Start the local backend with a mock WAHA server that returns HTTP 200 after a simulated 50ms delay.
2. **Verify SQL Polling Worker Performance:** Insert 5,000 pending tasks into the `broadcast_queue` table.
3. **Log Throughput:** Run the worker and verify it processes tasks sequentially, respects delay rules, recovers after error limits, and does not block database connections.

---

## 14. Deployment

The application is deployed on DigitalOcean using Docker Compose and GitHub Actions.

### 14.1 Production Docker Compose Configuration

```yaml
# docker-compose.yml
version: '3.8'

services:
  database:
    image: mysql:8.0
    container_name: rs_db
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: ${DB_ROOT_PASSWORD}
      MYSQL_DATABASE: resham_sutra
      MYSQL_USER: resham_admin
      MYSQL_PASSWORD: ${DB_USER_PASSWORD}
    ports:
      - "3306:3306"
    volumes:
      - db_data:/var/lib/mysql

  waha:
    image: devlikeapro/waha
    container_name: rs_waha
    restart: always
    ports:
      - "3001:3001"
    environment:
      WAHA_API_KEY: ${WAHA_API_KEY}
      WHATSAPP_DEFAULT_ENGINE: NOWEB
    volumes:
      - waha_data:/app/.waha

  backend:
    build:
      context: ./apps/api
      dockerfile: Dockerfile
    container_name: rs_backend
    restart: always
    depends_on:
      - database
      - waha
    ports:
      - "3002:3000"
    environment:
      PORT: 3000
      DATABASE_URL: mysql://mysql_user:mysql_password@database:3306/resham_sutra
      WAHA_BASE_URL: http://waha:3001
      WAHA_API_KEY: ${WAHA_API_KEY}
      GEMINI_API_KEY: ${GEMINI_API_KEY}
      SESSION_SECRET: ${SESSION_SECRET}

  frontend:
    build:
      context: ./apps/web
      dockerfile: Dockerfile
    container_name: rs_frontend
    restart: always
    ports:
      - "80:80"
    depends_on:
      - backend

volumes:
  db_data:
  waha_data:
```

### 14.2 Production Environment Variables

| Variable | Description | Example Target |
|---|---|---|
| `DATABASE_URL` | MySQL connection string | `mysql://user:pass@host:3306/db` |
| `SESSION_SECRET` | Secret key used to sign JWT cookies | `40-char-hex-string` |
| `WAHA_BASE_URL` | WAHA engine REST API path | `http://waha:3001` |
| `WAHA_API_KEY` | Access token for the WAHA API | `waha_secret_api_key` |
| `GEMINI_API_KEY` | Google AI developer API token | `AIzaSy...` |
| `ENCRYPTION_KEY` | AES-256 key for database credential encryption | `32-byte-hex-string` |

---

## 15. Settings Module

The Settings Module operates as an independent module. It is accessible via the main sidebar navigation and manages system configurations.

### 15.1 Settings Sub-Panels
1. **Profile:** Handles user-specific configurations (Display Name, Email, timezone, default landing page, notifications).
2. **WhatsApp Settings:** Connects to WAHA. Shows connection status, session state (Connected, Disconnected, QR Scan needed). Provides buttons to Restart, Disconnect, or Test Connection.
3. **AI Settings:** Updates Gemini API key, enables model customization, modifies prompt templates, and shows daily token consumption metrics.
4. **Broadcast Settings:** Manages sending limits, default sending delays (min/max), retry attempts, and file attachment size limits.
5. **CRM Settings:** Defines custom pipeline stages, labels, default follow-up periods, and message templates.
6. **Integrations Panel:** Connects external APIs (Zoho Mail, Gemini, WAHA, n8n) and tracks sync status.
7. **Appearance Panel:** Customizes theme (Light/Dark/System), sidebar layout density, and default dashboard widgets.
8. **System Information Panel:** Displays uptime statistics, container build numbers, WAHA/Node versions, and Git hashes.
9. **Audit Log Panel:** A read-only, paginated grid showing user activity (login, settings changes, broadcast events).

---

### 15.2 Settings API Specification

#### `GET /api/settings`
- **Purpose:** Fetch the active system settings configuration.
- **Response (200 OK):**
  ```json
  {
    "profile": {
      "displayName": "Admin User",
      "timezone": "Asia/Kolkata",
      "theme": "dark"
    },
    "ai": {
      "model": "gemini-2.5-flash",
      "temperature": 0.3,
      "maxTokens": 1024
    },
    "broadcast": {
      "minDelaySec": 20,
      "maxDelaySec": 45,
      "dailyLimit": 1000
    }
  }
  ```

#### `PUT /api/settings`
- **Purpose:** Update application settings.
- **Request Body:**
  ```json
  {
    "profile": {
      "displayName": "Jane Doe"
    },
    "ai": {
      "temperature": 0.5
    }
  }
  ```
- **Response (200 OK):** Updates settings in the database, inserts an audit log entry, and returns the updated configuration.

---

## 16. Future Enhancements & Multi-User Architecture

To ensure the standalone Phase 1 codebase is ready for future multi-user requirements, follow these design practices:

1. **Implicit User Scoping:**
   - Every database query targeting `whatsapp_chats`, `whatsapp_messages`, or `broadcasts` **must** include a `user_id` constraint (e.g., `WHERE user_id = ?`).
   - Do not write global, unscoped queries. This ensures that when multi-user support is enabled, users will automatically only see their own data based on their JWT user ID.

2. **Database Schema Design:**
   - Every database table includes a `user_id` field.
   - The `user_credentials` table uses a unique `user_id` constraint. In V1, there will only be one credential record, but the system can easily support multiple users and sessions in the future.

3. **Room-Based Realtime Events:**
   - Real-time Socket.IO events are pushed to rooms named `user:${userId}` instead of using a global broadcast channel. This prevents messages from leaking to other users in a multi-user setup.

---

## 17. Development Roadmap

The development plan is divided into 5 sprints.

```mermaid
gantt
    title WAHA Control Center Development Timeline
    dateFormat  YYYY-MM-DD
    section Sprint 1
    Infra & Database Setup           :active, s1, 2026-07-08, 7d
    section Sprint 2
    WAHA Integration & Webhooks      : s2, after s1, 7d
    section Sprint 3
    CRM Inbox & AI Pane              : s3, after s2, 7d
    section Sprint 4
    Broadcast Engine (SQL Queue)     : s4, after s3, 7d
    section Sprint 5
    Settings Module & Verification   : s5, after s4, 7d
```

### Sprint 1: Infrastructure & Database (Priority: High)
- **Goal:** Set up directories, run database migrations, and implement JWT cookie authentication.
- **Deliverables:**
  - Database schema setup in MySQL.
  - Folder structures in React and Express.
  - JWT authentication and cookie session middleware.
- **Dependencies:** None.

### Sprint 2: WAHA Integration & Webhooks (Priority: High)
- **Goal:** Enable connections to WAHA, retrieve QR codes, and ingest incoming messages via webhooks.
- **Deliverables:**
  - `WahaService` for API calls.
  - Webhook ingest endpoint (`/api/webhook/waha`) with validation.
  - Socket.IO server initialization.
- **Dependencies:** Sprint 1.

### Sprint 3: CRM Inbox & AI Assist (Priority: High)
- **Goal:** Build the React chat interface and integrate the Gemini AI assistant.
- **Deliverables:**
  - Virtualized chat list and message feed UI.
  - Socket.IO real-time message updates.
  - `GeminiService` integration using `gemini-2.5-flash`.
- **Dependencies:** Sprint 2.

### Sprint 4: Safe Broadcast Engine (Priority: Medium)
- **Goal:** Implement the broadcast scheduler and SQL queue processor.
- **Deliverables:**
  - Broadcast wizard interface.
  - SQL row-locked queue polling worker in the backend.
  - Safe-sending delay logic (fixed/random) and pause/resume triggers.
- **Dependencies:** Sprint 3.

### Sprint 5: Settings Panel & Testing (Priority: Medium)
- **Goal:** Build the settings interface, connect integration toggles, and write test suites.
- **Deliverables:**
  - Settings panels (Profile, WAHA, AI, Broadcast, Integrations).
  - Express and React test suites (Vitest, Playwright).
  - Production deployment validation.
- **Dependencies:** Sprint 4.
