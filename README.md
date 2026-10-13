# 🏆 Live Event Raffle Draw & Remote Controller System

A broadcast-grade, real-time live event raffle draw system engineered for auditorium ceremonies, festivals, corporate galas, and conferences. Features a synchronized cyberpunk audience presentation stage, an authenticated operator controller console, dynamic Excel dataset ingestion, and a companion Android remote draw controller.

---

## 🌟 Key Features

* **Universal Dynamic Spreadsheet Engine**: Drop in **any** `.xlsx` file (`data.xlsx`) without renaming columns. The system automatically detects and maps IDs, names, categories, and secondary information.
* **100% Dynamic Event Branding**: Event Title, Ceremony Subtitle, Winner Targets, and Countdown Durations are fully configurable via `.env` or the live Controller settings UI without restarting the server.
* **Real-Time WebSocket Synchronization**: Sub-millisecond synchronization between the audience presentation screen and the operator controller.
* **Zero-Port Mobile Remote (Android)**: VIPs or stage hosts can trigger draws from their smartphone using the Android app connected via Supabase Realtime Broadcast.
* **Instant QR Code Mobile Pairing**: The authenticated controller generates an encrypted QR code for instant, zero-configuration mobile pairing.
* **Cryptographically Secure Selection**: Powered by Python's `secrets.randbelow()` and a 100-pass Fisher-Yates shuffle algorithm.
* **Authoritative Server Architecture**: The Python process is the single source of truth. Randomness, candidate selection, position management, and eligibility checks occur strictly server-side.
* **Dynamic Category Filtering**: Automatically discovers categories (e.g. *Students, Faculty, Guests, VIP, General*) and allows category-specific draws.
* **Printable Official Results PDF**: Generates branded, high-resolution ReportLab PDFs listing confirmed winners with timestamps.
* **Crash & Recovery Resilience**: Dual JSON persistence with atomic backups (`result.json.bak`) protects state against accidental power or network loss.

---

## ⚙️ How It Works (Draw State Machine)

The Python backend owns the raffle state and is the only component authorized to pick candidates and declare winners.

```text
Controller Login (JWT Bearer Auth)
    │
    ▼
Controller starts a draw OR an authorized Android remote tap arrives
    │
    ▼
FastAPI validates engine state & launches selection task
    │
    ▼
Countdown (5s) ──► Dynamic Name Rolling (1.5s) ──► Cryptographic Pick & Reveal
    │
    ▼
Controller reviews the revealed candidate on screen
    ├─────────────────────────────────┐
    ▼                                 ▼
[Confirm Winner]               [Ignore / Absent]
- Appends to result.json       - Appends to ineligible.json
- Advances prize position      - Preserves current prize position
- Triggers confetti & sounds   - Prepares for redrawing prize
    │                                 │
    └────────────────┬────────────────┘
                     ▼
  WebSocket broadcasts real-time updates to Stage & Console
```

The audience page receives presentation events through the local FastAPI WebSocket. The Android app never receives participant lists or winner details—it only sends requests and receives permission and lifecycle status signals.

---

## 📁 Repository Structure

```text
├── .env.example                     # Root template environment file
├── .gitignore                       # Production gitignore rules
├── data.example.xlsx                # Sample multi-category Excel participant dataset
├── README.md                        # Master comprehensive documentation (this file)
│
├── raffal_draw/                     # Web Application Root
│   ├── run.py                       # Main server entry point (FastAPI + Uvicorn)
│   ├── .env.example                 # Web application environment template
│   ├── .env                         # Active local configuration (create from .env.example)
│   ├── requirements.txt            # Python dependencies
│   │
│   ├── backend/                     # Authoritative State Engine & APIs
│   │   ├── config.py                # Configuration loader & dynamic settings manager
│   │   ├── raffle_engine.py         # Pure Python selection algorithm & schema normalizer
│   │   ├── main.py                  # FastAPI REST endpoints & WebSocket server
│   │   ├── models.py                # Pydantic data schemas & state models
│   │   ├── auth.py                  # JWT authentication & controller password hashing
│   │   ├── persistence.py           # Atomic JSON saving & ReportLab PDF generator
│   │   ├── remote_control.py        # Supabase transport state coordinator
│   │   └── websocket_manager.py     # Real-time WebSocket connection manager
│   │
│   ├── data/                        # Active Runtime Data
│   │   ├── data.xlsx                # Active participant spreadsheet (read by engine)
│   │   ├── data.example.xlsx        # Reference participant dataset
│   │   ├── settings.json            # Dynamic live-applied settings
│   │   ├── result.json              # Confirmed winners record
│   │   ├── ineligible.json          # Skipped / absent candidates record
│   │   └── raffle_result.pdf        # Generated PDF output
│   │
│   └── frontend/                    # Presentation Layer
│       ├── audience/                # Public Stage Presentation (Projector view)
│       │   ├── index.html           # Stage layout (Idle, Countdown, Rolling, Reveal)
│       │   ├── style.css            # Cyberpunk aesthetic, neon glows, glassmorphism
│       │   └── app.js               # WebAudio sound engine, animations & WebSocket sync
│       │
│       ├── controller/              # Protected Operator Dashboard
│       │   ├── index.html           # Operator console layout & settings modal
│       │   ├── style.css            # Operator controls & monitoring panels
│       │   └── app.js               # Console workflow stepper, hotkeys & file manager
│       │
│       └── tests/                   # Backend flow and integration tests
│           ├── test_backend_import.py
│           └── test_raffle_flow.py
│
└── android app/                     # Android Remote Mobile Trigger
    ├── app/                         # Native Android Application (Java + Material Design)
    │   └── src/main/
    │       ├── AndroidManifest.xml  # Manifest with camera permission for QR scanner
    │       ├── java/com/example/    # Supabase Realtime client & QR credential parser
    │       └── res/                 # Layouts, themes, and Raffle Draw vector assets
    └── build.gradle.kts             # Gradle build scripts
```

---

## 🚀 Quick Setup Guide

### 1. Prerequisites
* **Python 3.10+** (Tested on Python 3.10, 3.11, 3.12, 3.13)
* **Android Smartphone** (Optional; install the prebuilt `android app/app-release.apk` directly on your phone)

### 2. Clone & Install Dependencies
Open your terminal in the project directory:

```bash
# Navigate to web application folder
cd raffal_draw

# Create a Python virtual environment (recommended)
python -m venv .venv

# Activate virtual environment:
# On Windows PowerShell:
.\.venv\Scripts\Activate.ps1
# On Linux / macOS:
source .venv/bin/activate

# Upgrade pip and install required packages
pip install --upgrade pip
pip install -r requirements.txt
```

### 3. Configure Environment Variables
Copy `.env.example` to create your local `.env`:

```bash
# On Windows PowerShell:
Copy-Item .env.example .env

# On Linux / macOS:
cp .env.example .env
```

Open `.env` and configure your event details (see the [Environment Variables](#-environment-variables-reference) section).

### 4. Start the Application
Run the startup script:

```bash
python run.py
```

Or run via Uvicorn directly:

```bash
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

The system will start on **`http://localhost:8000`**:

| Interface | URL | Description |
| :--- | :--- | :--- |
| **Audience Stage** | `http://localhost:8000/audience/` | Public projector view with sound effects and animations |
| **Controller Console** | `http://localhost:8000/controller/` | Operator dashboard to trigger and manage draws |
| **API Documentation** | `http://localhost:8000/docs` | Interactive Swagger API docs |
| **Official PDF** | `http://localhost:8000/api/results/pdf` | One-click official winners PDF export |

* **Default Controller Login**:
  * **Username**: `admin`
  * **Password**: `change_this_secure_password` *(configurable in `.env`)*

---

## 📊 Using Your Own Excel Data (`data.xlsx`)

The system works with **any participant spreadsheet**. You can name your columns however you prefer; the normalizer automatically recognizes standard variations:

### Supported Column Names:
| Field | Automatically Recognized Column Names | Fallback / Default |
| :--- | :--- | :--- |
| **Unique ID** | `ticket_no`, `ticket`, `token`, `id`, `serial`, `sl`, `unique_id`, `roll`, `reg_no`, `code` | Auto-generates sequential IDs (`1, 2, 3...`) |
| **Full Name** | `name`, `full_name`, `fullname`, `participant_name`, `student_name`, `member_name` | First available text column or `Participant N` |
| **Category** | `category`, `type`, `group`, `role`, `tier`, `department` | `"General"` |
| **Secondary ID** | `student_id`, `roll`, `phone`, `mobile`, `email`, `registration_no` | Blank |
| **Details** | `designation`, `department`, `organization`, `batch`, `company`, `details` | Blank |

### Two Ways to Update Participant Data:

#### Method A: Direct File Placement
1. Save your spreadsheet as **`raffal_draw/data/data.xlsx`**.
2. In the Controller Console, click **"Data & Settings"** (`tune` icon).
3. Click **"Reload data.xlsx from Disk"**. The engine will immediately reload and display the updated participant counts and detected categories.

#### Method B: Browser Upload (Drag-and-Drop)
1. Open the Controller Console at `http://localhost:8000/controller/`.
2. Click **"Data & Settings"** -> **"Upload New Excel File"**.
3. Select any `.xlsx` or `.xls` file. The server automatically archives the previous dataset, validates the new file, and syncs the new pool live to all screens.

---

## ⚙️ Environment Variables Reference

Edit `raffal_draw/.env` to configure event parameters:

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `ORGANIZATION_NAME` | `""` | Top header pill on stage (University, Organization, or Company name) |
| `EVENT_NAME` | `"Annual Grand Raffle 2026"` | Main event title displayed on stage, console, and PDF |
| `SEGMENT_NAME` | `"Grand Lucky Draw Ceremony"` | Subtitle / Ceremony name |
| `TOTAL_WINNERS` | `10` | Total number of prize winners to draw |
| `DRAW_COUNTDOWN_SECONDS`| `5` | Stage countdown timer duration (in seconds) |
| `SHUFFLE_PASSES` | `100` | Number of cryptographic Fisher-Yates shuffle passes |
| `NAME_ROLL_DURATION_MS` | `1500` | Milliseconds the names spin on screen before revealing |
| `BEEP_ENABLED` | `true` | Audio sound effects on countdown and reveal |
| `CONFETTI_ENABLED` | `true` | Confetti fireworks on winner confirmation |
| `CONTROLLER_USERNAME` | `admin` | Controller login username |
| `CONTROLLER_PASSWORD` | `change_this_secure_password` | Controller login password |
| `SECRET_KEY` | *(Random String)* | Secret key for JWT session tokens |
| `HOST` | `0.0.0.0` | Server bind host (`0.0.0.0` allows local network access) |
| `PORT` | `8000` | Server HTTP port |
| `REMOTE_SESSION_ID` | `RAFFLE26` | Realtime channel identifier for Android pairing |
| `SUPABASE_URL` | `""` | Supabase project URL for mobile remote control |
| `SUPABASE_ANON_KEY` | `""` | Supabase anon public key for mobile remote control |

---

## 📱 How to Setup Supabase & Connect the Android App

The Android app communicates with the PC controller using **Supabase Realtime Broadcast**. This allows zero-latency mobile control over cellular or Wi-Fi without configuring port forwarding or local network firewall exceptions.

### Step 1: Create a Free Supabase Project
1. Go to [https://supabase.com](https://supabase.com) and sign in (free tier is 100% sufficient).
2. Click **New Project**, choose any name (e.g. `RaffleRemote`), and set a database password.
3. Once the project is ready, navigate to **Project Settings** (gear icon) -> **API**.
4. Copy the following two values:
   * **Project URL** (e.g. `https://xyzcompany.supabase.co`)
   * **Project API Keys -> `anon` / `public`** (starts with `ey...`)

### Step 2: Add Supabase Credentials to `.env`
In `raffal_draw/.env`:
```dotenv
REMOTE_SESSION_ID=RAFFLE26
SUPABASE_URL="https://xyzcompany.supabase.co"
SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```
*(Restart the server or apply via Controller Settings to load new values).*

### Step 3: Install Prebuilt APK & Pair Mobile
No Android Studio or compilation setup is required! A production-ready APK is included directly in the repository:

1. Transfer or download **[`android app/app-release.apk`](android%20app/app-release.apk)** onto your Android smartphone.
2. Tap the APK file on your phone and select **Install** (enable "Install unknown apps" if prompted by Android).
3. Open the **Raffle Remote** app.
4. On your PC, open the **Controller Console** (`http://localhost:8000/controller/`).
5. In the **Remote Mobile Control** section:
   * Toggle **Mobile Remote Control** to **ON**.
   * A pairing QR code will appear on the PC screen.
6. On the Android phone, tap **SCAN QR** and scan the QR code from the PC screen.
7. The phone will immediately display **CONNECTED • WAITING FOR PC**.

### Step 4: The Live Draw Flow with Android
1. When you are ready for a draw on stage, click **Allow Mobile for Next Draw** in the PC Controller Console.
2. The Android screen instantly illuminates neon cyan and displays **READY TO DRAW • TAP TO TRIGGER**.
3. Hand the phone to the guest or host.
4. When they tap the large button:
   * The button animates into **DRAWING**.
   * The stage immediately initiates the synchronized countdown, sound effects, name shuffling, and candidate reveal.
   * Permission automatically locks until the operator approves or ignores the candidate.

### Remote Protocol & Permission Gates

```text
mobile_remote_enabled = false  ──► Android button unavailable / locked
next_draw_allowed = false      ──► Android button unavailable / locked
draw_in_progress = true        ──► Android button shows "Drawing..."
all required values true        ──► Android button lights up "TAP TO TRIGGER"
```

* **Channel naming**: `raffle_remote:<session-from-QR>`. Android never hardcodes the session or channel name.
* **Broadcast envelope**: Supabase Broadcast event `message`.
* **Message types**: `sync_request`, `draw_request`, `draw_permission`, `draw_ack`, `draw_status`, `draw_started`, and `draw_completed`.
* **Request uniqueness**: The mobile app generates a fresh UUID `request_id` per tap to prevent duplicate replay triggers.
* **Privacy constraint**: Participant lists and winner identity data are **never** transmitted to the mobile client.

---

## 🌐 Full API Endpoint Reference

### Public Endpoints:
* `GET /api/audience/status` — Live status of current draw, prize position, eligible pool counts, category distribution, and revealed candidate.
* `GET /api/results` — Array of all confirmed winners with prize rank and timestamps.
* `GET /api/pool/sample?limit=45` — Randomized sample of remaining candidate names for the audience background ticker.
* `GET /api/results/pdf` — Generates and downloads the branded official ReportLab PDF.
* `WS /ws/audience` — WebSocket endpoint for live stage projector synchronization.

### Authenticated Controller Endpoints (`Authorization: Bearer <token>`):
* `POST /api/auth/login` — Sign in with operator credentials; returns JWT token.
* `GET /api/controller/status` — Complete operator state including remote control metadata.
* `POST /api/controller/start` — Triggers a new draw for the current prize rank (accepts optional `{ "category": "..." }`).
* `POST /api/controller/confirm` — Confirms the revealed candidate as official winner.
* `POST /api/controller/ignore` — Marks the candidate absent/ineligible and retains current prize position.
* `POST /api/controller/pause` — Pauses an in-progress countdown.
* `POST /api/controller/resume` — Resumes a paused countdown.
* `POST /api/controller/stop` — Aborts an active draw.
* `POST /api/controller/reset` — Backs up current results and re-initializes a fresh raffle session.
* `GET /api/controller/settings` — Retrieves runtime configurable parameters.
* `POST /api/controller/settings` — Updates event title, segment title, winner count, countdowns, and Supabase config live.
* `POST /api/controller/reload-data` — Reloads `data/data.xlsx` directly from disk.
* `POST /api/controller/upload-data` — Uploads and activates a new Excel spreadsheet.
* `GET /api/ineligible` — List of all skipped / absent candidates.
* `GET /api/statistics` — Draw statistics and eligible pool metrics.
* `GET /api/controller/remote/config` — Generates QR code pairing payload and Supabase connection parameters.
* `POST /api/controller/remote/enabled` — Toggles mobile remote control on or off.
* `POST /api/controller/remote/permission` — Grants or revokes permission for the Android remote to trigger the next draw.
* `POST /api/controller/remote/message` — Relays Supabase broadcast messages into the server state tracker.
* `POST /api/controller/remote/draw` — Processes verified remote draw trigger requests.
* `WS /ws/controller` — Authenticated WebSocket for real-time operator updates.

---

## 🎮 Operator Keyboard Shortcuts

The Controller Console includes rapid-fire keyboard shortcuts for live operators:

| Key | Action | Description |
| :---: | :--- | :--- |
| `[SPACE]` | **Start Draw** | Triggers the countdown sequence for the current prize |
| `[ENTER]` | **Confirm Winner** | Confirms revealed candidate as winner and advances prize position |
| `[ESC]` | **Ignore / Absent** | Marks candidate ineligible and preserves the current prize position |
| `[P]` | **Pause / Resume** | Pauses or resumes an active draw countdown |
| `[R]` | **Reset Raffle** | Opens the reset confirmation modal to start a fresh draw |

---

## 🧪 Testing & Verification

Run the automated Python engine and API test suite:

```powershell
# From raffal_draw directory
python frontend/tests/test_raffle_flow.py
```

Check frontend JavaScript syntax:

```powershell
node --check frontend/controller/app.js
node --check frontend/audience/app.js
```

The test suite validates:
1. Controller JWT login and token expiration.
2. Excel schema dynamic normalization across diverse column naming styles.
3. Cryptographic candidate selection and category filtering.
4. Winner confirmation, position advancement, and ineligible archiving.
5. Official results PDF generation.
6. Corrupt JSON detection and automatic `.bak` recovery.

---

## 🔒 Security & Data Integrity

* **Dual-Layer Atomic Backups**: All mutations to `result.json` and `ineligible.json` are written to temporary files, fsynced to disk, atomically replaced, and copied to `.bak` snapshots.
* **Corrupt File Auto-Recovery**: If a power loss interrupts a file write, the engine automatically detects JSON corruption and restores state from the `.bak` file.
* **Authoritative Server Architecture**: The client UI and mobile apps are presentation layers. All randomness, shuffling, and position increments are computed authoritatively on the Python backend.
* **Safe Credential Management**: `.env` and actual participant sheets are excluded from Git via `.gitignore`. Template examples (`.env.example`, `data.example.xlsx`) are provided for easy onboarding.

---

## 📄 License
Released under the MIT License. Developed for automated live ceremony raffle execution.
