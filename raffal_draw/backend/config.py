import os
from pathlib import Path
from dotenv import load_dotenv

# Project Root is the parent of the backend directory
BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent

# Load .env file from project root
env_file = PROJECT_ROOT / ".env"
if env_file.exists():
    load_dotenv(dotenv_path=env_file, override=True)
else:
    load_dotenv(override=True)

# Configuration Settings
ORGANIZATION_NAME: str = os.getenv("ORGANIZATION_NAME", "")
EVENT_NAME: str = os.getenv("EVENT_NAME", "Annual Grand Raffle 2026")
SEGMENT_NAME: str = os.getenv("SEGMENT_NAME", "Grand Lucky Draw & Award Ceremony")
TOTAL_WINNERS: int = int(os.getenv("TOTAL_WINNERS", "10"))
DRAW_COUNTDOWN_SECONDS: int = int(os.getenv("DRAW_COUNTDOWN_SECONDS", "3"))
SHUFFLE_PASSES: int = int(os.getenv("SHUFFLE_PASSES", "100"))
WINNER_REVEAL_SECONDS: int = int(os.getenv("WINNER_REVEAL_SECONDS", "2"))
NAME_ROLL_DURATION_MS: int = int(os.getenv("NAME_ROLL_DURATION_MS", "1500"))
BEEP_ENABLED: bool = os.getenv("BEEP_ENABLED", "true").lower() in ("true", "1", "yes")
CONFETTI_ENABLED: bool = os.getenv("CONFETTI_ENABLED", "true").lower() in ("true", "1", "yes")

CONTROLLER_USERNAME: str = os.getenv("CONTROLLER_USERNAME", "admin")
CONTROLLER_PASSWORD: str = os.getenv("CONTROLLER_PASSWORD", "duetcsefest2026password")
SECRET_KEY: str = os.getenv("SECRET_KEY", "duet-cse-fest-2026-secure-secret-key-raffle-system")

HOST: str = os.getenv("HOST", "0.0.0.0")
PORT: int = int(os.getenv("PORT", "8000"))

# Supabase Realtime remote-control configuration.
SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
SUPABASE_ANON_KEY: str = os.getenv("SUPABASE_ANON_KEY", "")
REMOTE_SESSION_ID: str = os.getenv("REMOTE_SESSION_ID", "RAFFLE26")

# File paths
DATA_DIR: Path = Path(os.getenv("DATA_DIR", str(PROJECT_ROOT / "data"))).resolve()
EXCEL_FILE: Path = DATA_DIR / "data.xlsx"
RESULT_FILE: Path = DATA_DIR / "result.json"
RESULT_BACKUP_FILE: Path = DATA_DIR / "result.json.bak"
INELIGIBLE_FILE: Path = DATA_DIR / "ineligible.json"
INELIGIBLE_BACKUP_FILE: Path = DATA_DIR / "ineligible.json.bak"
PDF_FILE: Path = DATA_DIR / "raffle_result.pdf"
SETTINGS_FILE: Path = DATA_DIR / "settings.json"

FRONTEND_DIR: Path = PROJECT_ROOT / "frontend"

def init_settings_from_env() -> dict:
    """
    Generate and overwrite data/settings.json directly from active .env on every run.
    Ensures .env is the single authoritative source of truth.
    """
    import json
    settings = {
        "organization_name": ORGANIZATION_NAME,
        "event_name": EVENT_NAME,
        "segment_name": SEGMENT_NAME,
        "total_winners": TOTAL_WINNERS,
        "draw_countdown_seconds": DRAW_COUNTDOWN_SECONDS,
        "shuffle_passes": SHUFFLE_PASSES,
        "winner_reveal_seconds": WINNER_REVEAL_SECONDS,
        "name_roll_duration_ms": NAME_ROLL_DURATION_MS,
        "beep_enabled": BEEP_ENABLED,
        "confetti_enabled": CONFETTI_ENABLED
    }
    SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    temp_file = SETTINGS_FILE.with_suffix(".json.tmp")
    with open(temp_file, "w", encoding="utf-8") as f:
        json.dump(settings, f, indent=4)
        f.flush()
        os.fsync(f.fileno())
    temp_file.replace(SETTINGS_FILE)
    return settings

def get_event_settings() -> dict:
    """Load persisted dynamic settings from settings.json or defaults."""
    import json
    defaults = {
        "organization_name": ORGANIZATION_NAME,
        "event_name": EVENT_NAME,
        "segment_name": SEGMENT_NAME,
        "total_winners": TOTAL_WINNERS,
        "draw_countdown_seconds": DRAW_COUNTDOWN_SECONDS,
        "shuffle_passes": SHUFFLE_PASSES,
        "winner_reveal_seconds": WINNER_REVEAL_SECONDS,
        "name_roll_duration_ms": NAME_ROLL_DURATION_MS,
        "beep_enabled": BEEP_ENABLED,
        "confetti_enabled": CONFETTI_ENABLED
    }
    if SETTINGS_FILE.exists():
        try:
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f)
                defaults.update({k: v for k, v in saved.items() if v is not None})
        except Exception:
            pass
    return defaults

def save_event_settings(updates: dict) -> dict:
    """Save updated dynamic settings to settings.json."""
    import json
    current = get_event_settings()
    current.update({k: v for k, v in updates.items() if v is not None})
    SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    temp_file = SETTINGS_FILE.with_suffix(".json.tmp")
    with open(temp_file, "w", encoding="utf-8") as f:
        json.dump(current, f, indent=4)
        f.flush()
        os.fsync(f.fileno())
    temp_file.replace(SETTINGS_FILE)
    return current
