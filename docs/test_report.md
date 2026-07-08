# WAHA Control Center Release Candidate (RC1) - Testing & Sign-Off Report

This document records the operational, stability, and edge-case validation checklists for the **Release Candidate (RC1)**.

---

## 1. Testing Sign-Off Checklist

| Test Area | Status | Target Phase | Verification Method | Notes |
| :--- | :---: | :---: | :--- | :--- |
| **WAHA Reconnects** | ☐ | Phase 1 | Disconnect session / trigger reconnect events. | Verify QR code generation recovery. |
| **QR Code Regeneration** | ☐ | Phase 1 | Let QR code expire (local 20s timeout). | Verify client triggers auto-refresh. |
| **Conversations Ingestion** | ☐ | Phase 2 | Send incoming/outgoing messages. | Check MySQL records insertion. |
| **Attachments Pipeline** | ☐ | Phase 2 | Upload multiple images, PDFs, audio notes. | Verify sharp compression and lightbox zoom. |
| **Audio Notes Speed Toggle** | ☐ | Phase 2 | Play inbound audio notes. | Toggle speeds at 1x, 1.5x, and 2x. |
| **Campaign delays Engine** | ☐ | Phase 3 | Launch test campaign with delay rules. | Validate logs sleep timer values. |
| **Broadcast Overrides** | ☐ | Phase 3 | Click Pause / Resume / Stop actions. | Check database status columns updates. |
| **Emergency Safety Switch** | ☐ | Phase 3 | Trigger Emergency Stop mid-campaign. | Confirm active locks are cleared. |
| **AI Intelligence Worker** | ☐ | Phase 4 | Enqueue manual chat analysis jobs. | Confirm intent/priority/sentiment outputs. |
| **Suggested Replies Tones** | ☐ | Phase 4 | Trigger reply suggestions. | Verify 4 tones JSON strings list. |
| **Worker Life Cycles** | ☐ | Phase 5 | Let queue processor run for 10+ jobs. | Verify diagnostics average speed metric. |
| **Operational Failures** | ☐ | Phase 6 | Kill MySQL or API servers mid-task. | Confirm queue resumed cleanly on restart. |
| **Diagnostics Backups** | ☐ | Dev Console | Export and Import diagnostic schemas. | Check records integrity restored. |

---

## 2. Production Server Staging Activation Steps

1. **Environment Setup:** Ensure the production `.env` contains:
   - Valid `DATABASE_URL` (MySQL instance link).
   - Valid `WAHA_BASE_URL` (Docker/REST connection URL).
   - Real `GEMINI_API_KEY` (Flash model token link).
   - Cryptographic buffers (`SESSION_SECRET` and `ENCRYPTION_KEY`).
2. **Execute Docker Compose:** Launch container dependencies:
   ```bash
   docker-compose up -d --build
   ```
3. **Run Diagnostics Check:** Run a cURL request against:
   ```bash
   curl http://localhost:3000/health
   ```
   Confirm all components output `connected` in status payload.
