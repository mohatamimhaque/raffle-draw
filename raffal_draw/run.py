import os
import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent / "backend"
sys.path.insert(0, str(backend_dir))

import uvicorn
from config import HOST, PORT, init_settings_from_env, get_event_settings

if __name__ == "__main__":
    # Generate / overwrite data/settings.json freshly from active .env
    settings = init_settings_from_env()
    event_title = settings.get("event_name", "RAFFLE DRAW SYSTEM").upper()
    print("=" * 65)
    print(f"  {event_title} — OFFICIAL RAFFLE DRAW SYSTEM")
    print("=" * 65)
    print(f"  Audience Display   : http://localhost:{PORT}/audience/")
    print(f"  Controller Panel   : http://localhost:{PORT}/controller/")
    print(f"  Swagger API Docs   : http://localhost:{PORT}/docs")
    print(f"  Download PDF       : http://localhost:{PORT}/api/results/pdf")
    print("=" * 65)
    print(f"Starting server on http://{HOST}:{PORT} ...\n")
    uvicorn.run("backend.main:app", host=HOST, port=PORT, reload=False)
