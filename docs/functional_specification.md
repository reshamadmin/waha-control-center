# FUNCTIONAL SPECIFICATION (FS)
## Project: WAHA Control Center (WhatsApp Module - V1 Standalone)
### Version: 1.0.0

---

## 1. User Interface & Layout Design

The WAHA Control Center features a fluid, responsive three-column grid layout designed for high-density operations in modern web browsers.

### 1.1 App Shell Workspace Layout (CRM Mode)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ App Sidebar │ Top Navigation Bar: [Active Persona Dropdown ▾]   [User Avatar 👤] [🔔]    │
├─────────────┼────────────────────────────┬─────────────────────────────┬───────────────┤
│ 📥 Inbox    │ Inbox List & Search        │ Active Chat Window          │ AI Assist     │
│ 📣 Broadcast│ ┌────────────────────────┐ │ ┌─────────────────────────┐ │ Pane          │
│ ⚙️ Settings │ │ 🔍 Search conversations│ │ │ 👤 Rahul Kumar          │ │ ┌───────────┐ │
│             │ └────────────────────────┘ │ │ 📱 +91 9876543210       │ │ │Lead Score │ │
│             │ ┌────────────────────────┐ │ ├─────────────────────────┤ │ │  [85 / 100]│ │
│             │ │ Rahul Kumar        10:15 │ │ [Inbound] 10:12 AM      │ │ └───────────┘ │
│             │ │ Reelers pricing query    │ │ I need info on the reel │ │ ┌───────────┐ │
│             │ ├────────────────────────┤ │ ├─────────────────────────┤ │ │Sentiment: │ │
│             │ │ Sita Devi          09:45 │ │ [Outbound] 10:15 AM     │ │ │Positive   │ │
│             │ │ Broadcast delivered    │ │ Sure! Sending catalog...│ │ └───────────┘ │
│             │ └────────────────────────┘ │ ├─────────────────────────┤ │ ┌───────────┐ │
│             │                            │ │ [Composer Box]          │ │ │Summary:   │ │
│             │                            │ │ [ 📎 Upload ]           │ │ │Reeling info│ │
│             │                            │ │ [ Write message...    ] │ │ └───────────┘ │
│             │                            │ │ [Send Button ➔]         │ │ [Use Reply ➔] │
└─────────────┴────────────────────────────┴─────────────────────────────┴───────────────┘
```

---

## 2. Detailed Functional Workflows

### 2.1 CRM Workspace Flow
1. **Persona Switcher:** 
   - A dropdown in the top-bar allows toggling between CRM, SERVICE, ADMIN, and CXO.
   - Changing modes updates page routing. In Phase 1, selecting CRM displays the Inbox, Broadcast, and Settings. Selecting other modes shows a "Coming Soon in Phase 2" screen.
2. **Inbox Sidebar:**
   - **Search Input:** Fires a debounced (300ms) query to search contact names or phone numbers.
   - **Sort/Filter Popover:** Lets users sort by "Latest Message" or "Unread First", and filter by Category Labels (e.g., "Leads", "Support", "Follow-up").
   - **Infinite Scroll:** Loads more chats in batches of 30 when the user scrolls near the bottom of the list.
3. **Chat Window Header & Actions:**
   - Displays the contact's name, WhatsApp phone number, and current connection status.
   - **Actions:**
     - *Link Customer:* Opens a dialog search grid to select and link a database customer record.
     - *Label Selector:* Opens a tag popover to add or remove category tags.
     - *Schedule Follow-up:* Opens a date-time picker dialog to set a follow-up reminder.
4. **Chat Feed:**
   - Displays a chronological list of inbound (left-aligned) and outbound (right-aligned) messages.
   - **Rich Media Support:**
     - *Voice Notes:* Custom audio player containing inline play/pause buttons, progress tracker, and speed controller (1x, 1.5x, 2x).
     - *Documents/PDFs:* Renders a file type icon, name, size badge, and download button.
     - *Images/Videos:* Renders inline thumbnails that expand into full-screen lightboxes on click.
5. **AI Assist Pane (Collapsible):**
   - Displays real-time insights updated via Socket.IO:
     - **Lead Score Meter:** Circular dial displaying values from 0–100.
     - **Sentiment Gauge:** Horizontal bar reflecting Positive, Neutral, or Negative sentiment.
     - **Summary Box:** Bullet points describing conversation history.
     - **Suggested Reply Card:** Displays a Gemini-generated suggested message. Clicking "Use Reply" inserts it into the main message composer.

---

### 2.2 Broadcast Wizard Flow

```
   ┌────────────────────────────────────────────────────────┐
   │ Step 1: Upload Targets                                 │
   │ [ Drag & Drop CSV / Excel or Select Contacts ]         │
   └───────────────────────────┬────────────────────────────┘
                               │ (File parsing & validation)
                               ▼
   ┌────────────────────────────────────────────────────────┐
   │ Step 2: Write Message                                  │
   │ [ Message Input ] ── Inject Tags: {{name}}, {{phone}}  │
   └───────────────────────────┬────────────────────────────┘
                               │ (Length & template compilation checks)
                               ▼
   ┌────────────────────────────────────────────────────────┐
   │ Step 3: Configure Safe Sending                         │
   │ [Min Delay: 20s]   [Max Delay: 45s]   [Limit: 1000/day]│
   └───────────────────────────┬────────────────────────────┘
                               │ (Value range checks)
                               ▼
   ┌────────────────────────────────────────────────────────┐
   │ Step 4: Run Campaign                                   │
   │ [Progress bar]   [ETA: 14 mins]   [Pause/Stop buttons] │
   └────────────────────────────────────────────────────────┘
```

1. **Target Upload (Step 1):**
   - User drags and drops a CSV/Excel file or manually selects checkboxes on a paginated contact list.
   - Frontend validates rows, columns, and numbers, displaying errors for invalid entries.
2. **Compose Message (Step 2):**
   - Message text field supports merging variables like `{{name}}`.
   - File upload interface lets users attach PDFs, documents, images, or audio files.
3. **Safe sending configuration (Step 3):**
   - Enforces sending delays to prevent WhatsApp blocks.
   - Minimum Delay: Minimum seconds to wait between messages.
   - Maximum Delay: Maximum seconds to wait between messages.
   - Limit: Maximum messages allowed per day.
4. **Execution Dashboard (Step 4):**
   - Pressing "Start Broadcast" closes the Wizard and displays the progress screen.
   - Real-time Socket.IO events update a progress bar showing Completed, Failed, and Total counters.
   - Displays dynamic calculations: `ETA = Remaining Messages * ((Min Delay + Max Delay) / 2)`.
   - Includes controls to Pause, Resume, or Cancel the campaign.

---

### 2.3 Settings Workspace Flow

The Settings Panel is accessible from the main navigation sidebar. It uses a split-pane layout to organize configuration sub-panels.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Settings Navigation Panel      │ Target Config Canvas                                  │
├────────────────────────────────┼───────────────────────────────────────────────────────┤
│ 👤 Profile Settings            │ WhatsApp WAHA Console Settings                        │
│ 🔌 WhatsApp Console            │ Connection Status: [ CONNECTED ]                      │
│ 🤖 AI Prompt Control           │ Active Session Name: session_usr_781290               │
│ 📣 Broadcast Controls          │ ┌───────────────────────────────────────────────────┐ │
│ 🏷️ CRM Pipelines              │ │ API Status: Healthy (Uptime: 2 days, 4 hours)     │ │
│ 🔗 External Integrations       │ └───────────────────────────────────────────────────┘ │
│ 🛡️ System & Audit Logs        │ [ Restart Session ]    [ Disconnect Connection ]      │
└────────────────────────────────┴───────────────────────────────────────────────────────┘
```

1. **Profile Settings:** Users configure details like display name, timezone selection, preferred persona landing page, and browser alert rules.
2. **WhatsApp Console:** Displays active connection states and session statistics. Includes buttons to Restart session, Disconnect session, or Regenerate QR code if disconnected.
3. **AI Prompt Control:** Provides fields to configure the Gemini API Key, model settings, and max token output limits. Includes a text area to modify system prompts for CRM lead scoring and summarization.
4. **Broadcast Controls:** Sets global boundaries for safe sending, including default min/max delays, batch sizes, daily limits, and attachment size limits.
5. **CRM Pipelines:** Customizes lead stages, categories, message templates, and conversation tags.
6. **External Integrations:** Allows connecting and testing integrations with Zoho Mail, Gemini, WAHA, and n8n.
7. **System & Audit Logs:** A read-only, paginated grid showing user activity (login, settings changes, broadcast events).

---

## 3. Form Validation Schemes

Input forms are validated on the client side using React Hook Form and Zod schemas before API requests are made.

### 3.1 Validation Rules Matrix

| Form Pane | Target Field | Input Type | Validation Rules | Error Message |
|---|---|---|---|---|
| **Login** | Email | Text | Required, must be a valid email string format | "Enter a valid email address." |
| | Password | Password | Required, minimum 8 characters | "Password must be at least 8 characters." |
| **Broadcast Wizard** | Target File | File | Max 10MB, must be `.csv`, `.xls`, or `.xlsx` | "Supported formats are CSV and Excel (max 10MB)." |
| | Message Body | Text | Required, max 2048 characters | "Message cannot exceed 2048 characters." |
| | Media Attachment | File | Max 25MB for images/PDFs, max 100MB for video | "File size exceeds allowed limits." |
| **Broadcast Delay** | Min Delay | Number | Integer, minimum 5 seconds, max 120 seconds | "Minimum delay must be between 5s and 120s." |
| | Max Delay | Number | Integer, must be greater than or equal to Min Delay | "Max delay must be greater than min delay." |
| | Daily Limit | Number | Integer, minimum 10, maximum 5000 | "Daily limit must be between 10 and 5000." |
| **AI Settings** | API Key | Password | Must match pattern `/^AIzaSy[A-Za-z0-9_-]{33}$/` | "Invalid Gemini API Key format." |
| | Temperature | Number | Float, minimum 0.0, maximum 2.0, default 0.3 | "Temperature must be between 0.0 and 2.0." |
| | Max Tokens | Number | Integer, minimum 1, maximum 8192 | "Max tokens must be between 1 and 8192." |

---

## 4. Error Handling & Toaster Event Mappings

Alerts and notifications are displayed to users via floating toaster banners.

### 4.1 Toaster Event Matrix

| Event Type | Condition | Color | Duration | Action Button |
|---|---|---|---|---|
| **Success** | Message sent | Emerald Green | 3s | None |
| **Success** | Broadcast campaign launched | Emerald Green | 4s | "View Monitor" |
| **Success** | Settings saved successfully | Emerald Green | 3s | None |
| **Warning** | WAHA Session state transitions to `SCAN_QR` | Amber Yellow | Persistent | "Scan Now" |
| **Warning** | Broadcast paused by user | Amber Yellow | 4s | "Resume" |
| **Error** | API Call Timeout / Network Down | Ruby Red | 5s | "Retry" |
| **Error** | WAHA API returns session disconnected error | Ruby Red | Persistent | "Reconnect" |
| **Error** | Media upload failed due to size | Ruby Red | 4s | None |
| **Error** | Gemini API quota limit reached | Ruby Red | 5s | "Settings" |

---

## 5. Mobile & Tablet Responsiveness

1. **Fluid Grid Wrapping:**
   - Under 768px (Mobile), the application transitions from a three-column layout to a tabbed interface (e.g., Chats Tab, Messages Tab, AI Pane Tab).
   - Under 1024px (Tablet), the collapsible right-aligned AI Pane is hidden by default and can be toggled using a top header icon.
2. **Touch Optimization:**
   - Swipe-left gestures on conversation items in the Inbox sidebar reveal quick actions (Archive, Assign, Add Label).
   - Touch targets for buttons, checkboxes, and menu selectors are designed with a minimum size of 44x44px.
