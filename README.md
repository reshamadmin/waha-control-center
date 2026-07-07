# WAHA Control Center

Standalone web-based management workspace and AI CRM console for the WAHA WhatsApp API.

## Project Structure

```
waha-control-center/
├── apps/
│   ├── waha-web/              # React / TypeScript / Vite Frontend
│   └── waha-api/              # Express / Node.js Backend API
├── docs/                      # Architectural, functional, and roadmap documentation
├── docker/                    # Docker build configurations
├── .github/
│   └── workflows/             # GitHub Actions CI workflow
├── scripts/                   # Workspace automation scripts
├── package.json               # Monorepo workspaces and script shortcuts
├── docker-compose.yml         # Container deployment configuration
├── README.md
├── CHANGELOG.md
├── LICENSE
└── .env.example
```

---

## Local Setup & Development

### 1. Requirements
- Node.js >= 20.0.0
- MySQL 8.0 or Docker
- WAHA Community Engine instance

### 2. Environmental Variables
Copy the template and configure your parameters:
```bash
cp .env.example .env
```
Ensure you provide a valid `GEMINI_API_KEY`, a 32-character `SESSION_SECRET`, and a 64-character hex `ENCRYPTION_KEY`.

### 3. Installation
Install and link monorepo workspaces:
```bash
npm install
```

### 4. Running Workspaces
Execute commands from the root directory:

- **Launch Frontend (`waha-web`):**
  ```bash
  npm run dev:web
  ```
  UI will be hosted at `http://localhost:3003`.

- **Launch Backend (`waha-api`):**
  ```bash
  npm run dev:api
  ```
  API will be available at `http://localhost:3000`.

- **Compile and Typecheck:**
  ```bash
  npm run lint
  ```

- **Compile Build Bundles:**
  ```bash
  npm run build
  ```

- **Run Tests:**
  ```bash
  npm run test
  ```

---

## Docker Deployment
Build and run the entire suite (Database, WAHA WhatsApp, Express backend, React frontend) using Docker Compose:
```bash
docker compose up --build
```
