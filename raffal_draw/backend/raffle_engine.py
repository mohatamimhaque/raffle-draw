import asyncio
import logging
import secrets
from pathlib import Path
from typing import List, Dict, Any, Optional, Callable, Awaitable
import pandas as pd

from config import (
    ORGANIZATION_NAME,
    EVENT_NAME,
    SEGMENT_NAME,
    TOTAL_WINNERS,
    DRAW_COUNTDOWN_SECONDS,
    SHUFFLE_PASSES,
    WINNER_REVEAL_SECONDS,
    NAME_ROLL_DURATION_MS,
    EXCEL_FILE,
    RESULT_FILE,
    RESULT_BACKUP_FILE,
    INELIGIBLE_FILE,
    INELIGIBLE_BACKUP_FILE,
    get_event_settings,
    save_event_settings,
)
from models import CandidateRecord, RaffleStateResponse, RaffleStateType
from persistence import (
    load_json_with_recovery,
    save_result_record,
    save_ineligible_record,
    backup_file,
    atomic_save_json,
)

logger = logging.getLogger("raffle.engine")

def normalize_participants_df(df: pd.DataFrame) -> pd.DataFrame:
    """
    Intelligently normalize any Excel participant DataFrame into a clean,
    standardized format compatible with the Raffle Engine.
    Handles arbitrary column naming conventions (e.g. ticket_no, id, name, full_name, etc.),
    removes empty rows, sanitizes float values (e.g. 2404999.0 -> '2404999'),
    and guarantees unique_id, name, student_id, type, designation.
    """
    import re
    df_clean = df.dropna(how="all").copy()
    if df_clean.empty:
        return pd.DataFrame(columns=["unique_id", "name", "student_id", "type", "designation"])

    col_map = {}
    for col in df_clean.columns:
        norm = re.sub(r"[^a-z0-9]", "", str(col).lower())
        col_map[norm] = col

    def find_col(candidates, exclude=set()):
        for cand in candidates:
            c_norm = re.sub(r"[^a-z0-9]", "", cand.lower())
            if c_norm in col_map and col_map[c_norm] not in exclude:
                return col_map[c_norm]
        return None

    # Column aliases
    id_col = find_col([
        "unique_id", "uniqueid", "id", "serial", "serial_no", "sl", "sl_no",
        "ticket", "ticket_no", "ticket_number", "token", "token_no",
        "roll", "reg_no", "registration_no", "student_id", "external_id", "code", "no"
    ])
    name_col = find_col([
        "name", "full_name", "fullname", "participant_name", "participant",
        "student_name", "member_name", "attendee_name", "person_name", "title"
    ])
    type_col = find_col([
        "type", "category", "group", "role", "ticket_type", "department", "designation"
    ])

    exclude_sec = {id_col} if id_col else set()
    sec_id_col = find_col([
        "student_id", "roll", "reg_no", "registration_no", "token", "ticket",
        "phone", "mobile", "contact", "email", "external_id"
    ], exclude=exclude_sec)

    exclude_desig = {type_col} if type_col else set()
    desig_col = find_col([
        "designation", "department", "organization", "company", "position", "role",
        "batch", "details", "info"
    ], exclude=exclude_desig)

    result = pd.DataFrame()

    # 1. Unique ID
    if id_col:
        ids = df_clean[id_col].astype(str).str.replace(r"\.0$", "", regex=True).str.strip()
        seen = set()
        clean_ids = []
        for i, val in enumerate(ids):
            if not val or val.lower() in ("nan", "none", ""):
                val = str(i + 1)
            elif val in seen:
                val = f"{val}_{i + 1}"
            seen.add(val)
            clean_ids.append(val)
        result["unique_id"] = clean_ids
    else:
        result["unique_id"] = [str(i + 1) for i in range(len(df_clean))]

    # 2. Name
    if name_col:
        result["name"] = df_clean[name_col].fillna("").astype(str).str.strip()
    else:
        text_cols = [c for c in df_clean.columns if c != id_col]
        if text_cols:
            result["name"] = df_clean[text_cols[0]].fillna("").astype(str).str.strip()
        else:
            result["name"] = [f"Participant {i + 1}" for i in range(len(df_clean))]

    # 3. Secondary ID / Student ID
    if sec_id_col:
        result["student_id"] = df_clean[sec_id_col].fillna("").astype(str).str.replace(r"\.0$", "", regex=True).str.strip()
    else:
        result["student_id"] = ""

    # 4. Type / Category
    if type_col:
        types = df_clean[type_col].fillna("general").astype(str).str.strip().str.lower()
        types = types.replace("", "general")
        result["type"] = types
    else:
        result["type"] = "general"

    # 5. Designation / Extra Info
    if desig_col:
        result["designation"] = df_clean[desig_col].fillna("").astype(str).str.strip()
    else:
        result["designation"] = ""

    # Preserve any additional columns
    for col in df_clean.columns:
        if col not in result.columns and str(col).lower() not in ["unique_id", "name", "student_id", "type", "designation"]:
            result[col] = df_clean[col]

    return result

class RaffleEngine:
    """
    Dynamic Authoritative Raffle Engine for Live Events.
    Controls all draw logic, candidate selection, state transitions,
    and pool management for arbitrary participant datasets.
    """

    def __init__(self, broadcast_callback: Optional[Callable[[str, Dict[str, Any]], Awaitable[None]]] = None):
        self.broadcast_callback = broadcast_callback
        self.lock = asyncio.Lock()

        settings = get_event_settings()
        self.organization_name: str = settings.get("organization_name", ORGANIZATION_NAME)
        self.event_name: str = settings.get("event_name", EVENT_NAME)
        self.segment_name: str = settings.get("segment_name", SEGMENT_NAME)
        self.total_winners: int = int(settings.get("total_winners", TOTAL_WINNERS))
        self.countdown_seconds: int = int(settings.get("draw_countdown_seconds", DRAW_COUNTDOWN_SECONDS))
        self.shuffle_passes: int = int(settings.get("shuffle_passes", SHUFFLE_PASSES))
        self.reveal_delay_seconds: int = int(settings.get("winner_reveal_seconds", WINNER_REVEAL_SECONDS))
        self.name_roll_duration_ms: int = int(settings.get("name_roll_duration_ms", NAME_ROLL_DURATION_MS))
        self.beep_enabled: bool = bool(settings.get("beep_enabled", True))
        self.confetti_enabled: bool = bool(settings.get("confetti_enabled", True))

        self.state: RaffleStateType = "IDLE"
        self.previous_state_before_pause: Optional[RaffleStateType] = None
        self.curr_pos: int = self.total_winners
        self.selected_category: str = "all"

        self.df_all: pd.DataFrame = pd.DataFrame()
        self.df_eligible: pd.DataFrame = pd.DataFrame()

        self.results: List[Dict[str, Any]] = []
        self.ineligible: List[Dict[str, Any]] = []

        self.current_candidate: Optional[Dict[str, Any]] = None
        self.current_countdown_remaining: Optional[int] = None
        self._is_drawing_task: Optional[asyncio.Task] = None

        # Initialize and load data
        self.initialize_engine()

    def set_broadcast_callback(self, callback: Callable[[str, Dict[str, Any]], Awaitable[None]]) -> None:
        self.broadcast_callback = callback

    async def broadcast(self, event_type: str, data: Dict[str, Any]) -> None:
        if self.broadcast_callback:
            try:
                await self.broadcast_callback(event_type, data)
            except Exception as e:
                logger.error(f"Error in broadcast callback: {e}")

    def initialize_engine(self, excel_path: Optional[Path] = None) -> None:
        """
        Load Excel and JSON files, filter pool, and determine current position.
        Gracefully normalizes any Excel columns and recovers session state.
        """
        logger.info("Initializing Raffle Engine...")

        # 1. Load Excel Data
        target_excel = excel_path or EXCEL_FILE
        if not target_excel.exists():
            logger.warning(f"Excel file not found at: {target_excel.resolve()}")
            self.df_all = pd.DataFrame(columns=["unique_id", "name", "student_id", "type", "designation"])
            self.df_eligible = self.df_all.copy()
            self.results = []
            self.ineligible = []
            self.curr_pos = self.total_winners
            self.state = "WAITING_FOR_START"
            return

        raw_df = pd.read_excel(target_excel)
        df = normalize_participants_df(raw_df)
        self.df_all = df.copy()

        # 2. Load JSON files with recovery
        self.results = load_json_with_recovery(RESULT_FILE, RESULT_BACKUP_FILE)
        self.ineligible = load_json_with_recovery(INELIGIBLE_FILE, INELIGIBLE_BACKUP_FILE)

        # 3. Determine the next winner position, drawing from the highest prize down.
        self.curr_pos = max(0, self.total_winners - len(self.results))

        # 4. Filter out previous winners from eligible pool
        winner_ids = {
            str(r["unique_id"]).strip()
            for r in self.results
            if r.get("unique_id") is not None
        }

        # 5. Filter out previous ineligibles from eligible pool
        ineligible_ids = {
            str(p["unique_id"]).strip()
            for p in self.ineligible
            if p.get("unique_id") is not None
        }

        excluded_ids = winner_ids.union(ineligible_ids)
        self.df_eligible = df[~df["unique_id"].astype(str).str.strip().isin(excluded_ids)].copy()

        # 6. Set initial state
        if self.curr_pos < 1 and len(self.results) >= self.total_winners:
            self.state = "COMPLETED"
        else:
            self.state = "WAITING_FOR_START"

        self.current_candidate = None
        self.current_countdown_remaining = None
        self.selected_category = "all"

        logger.info(
            f"[OK] Raffle Engine initialized. State: {self.state}, Position: {self.curr_pos}/{self.total_winners}, "
            f"Eligible: {len(self.df_eligible)}, Winners: {len(self.results)}, Ineligible: {len(self.ineligible)}"
        )

    def reload_data(self, excel_path: Optional[Path] = None) -> Dict[str, Any]:
        """Dynamically reload data from Excel file and update eligible pool."""
        self.initialize_engine(excel_path)
        return self.get_state_dict()

    def apply_settings(self, updates: Dict[str, Any]) -> Dict[str, Any]:
        """Apply dynamic event settings updates."""
        saved = save_event_settings(updates)
        self.organization_name = saved.get("organization_name", self.organization_name)
        self.event_name = saved.get("event_name", self.event_name)
        self.segment_name = saved.get("segment_name", self.segment_name)
        if "total_winners" in updates and updates["total_winners"] is not None:
            self.total_winners = int(updates["total_winners"])
            self.curr_pos = max(0, self.total_winners - len(self.results))
            if self.curr_pos < 1 and len(self.results) >= self.total_winners:
                self.state = "COMPLETED"
            elif self.state == "COMPLETED" and self.curr_pos > 0:
                self.state = "WAITING_FOR_START"
        if "draw_countdown_seconds" in updates and updates["draw_countdown_seconds"] is not None:
            self.countdown_seconds = int(updates["draw_countdown_seconds"])
        if "shuffle_passes" in updates and updates["shuffle_passes"] is not None:
            self.shuffle_passes = int(updates["shuffle_passes"])
        if "winner_reveal_seconds" in updates and updates["winner_reveal_seconds"] is not None:
            self.reveal_delay_seconds = int(updates["winner_reveal_seconds"])
        if "name_roll_duration_ms" in updates and updates["name_roll_duration_ms"] is not None:
            self.name_roll_duration_ms = int(updates["name_roll_duration_ms"])
        if "beep_enabled" in updates and updates["beep_enabled"] is not None:
            self.beep_enabled = bool(updates["beep_enabled"])
        if "confetti_enabled" in updates and updates["confetti_enabled"] is not None:
            self.confetti_enabled = bool(updates["confetti_enabled"])
        return self.get_state_dict()

    def get_category_counts(self) -> Dict[str, int]:
        """Get counts of eligible candidates broken down dynamically by category."""
        if self.df_eligible.empty:
            return {"all": 0, "student": 0, "faculty": 0, "guest": 0}
        types = self.df_eligible["type"].astype(str).str.strip().str.lower()
        unique_categories = sorted([c for c in types.unique() if c and c != "nan"])

        counts: Dict[str, int] = {"all": len(self.df_eligible)}
        for cat in unique_categories:
            counts[cat] = int((types == cat).sum())

        # Ensure standard keys for backward compatibility
        for standard in ("student", "faculty", "guest"):
            if standard not in counts:
                counts[standard] = 0

        return counts

    def _select_candidate_algorithm(self, df: pd.DataFrame, category: str = "all") -> str:
        """
        Pure, secure Python candidate selection algorithm ported from notebook.
        Uses secrets.randbelow() and Fisher-Yates shuffle with SHUFFLE_PASSES = 100.
        Supports filtering candidate pool by category (all, student, faculty, guest).
        """
        if df.empty:
            raise ValueError("No eligible candidates available in the pool.")

        target_cat = category.strip().lower()
        if target_cat != "all":
            if target_cat == "guest":
                df_filtered = df[df["type"].astype(str).str.strip().str.lower().isin(["guest", "guests"])]
            else:
                df_filtered = df[df["type"].astype(str).str.strip().str.lower() == target_cat]

            if df_filtered.empty:
                raise ValueError(f"No eligible candidates available in category '{category}'.")
            unique_ids = df_filtered["unique_id"].dropna().astype(str).str.strip().tolist()
        else:
            unique_ids = df["unique_id"].dropna().astype(str).str.strip().tolist()

        if not unique_ids:
            raise ValueError("No valid unique_ids available.")

        if len(unique_ids) != len(set(unique_ids)):
            raise ValueError("Duplicate unique_id detected in eligible pool.")

        # Fisher-Yates Shuffle passes
        for _ in range(self.shuffle_passes):
            for i in range(len(unique_ids) - 1, 0, -1):
                j = secrets.randbelow(i + 1)
                unique_ids[i], unique_ids[j] = unique_ids[j], unique_ids[i]

        secure_index = secrets.randbelow(len(unique_ids))
        selected_unique_id = unique_ids[secure_index]
        return selected_unique_id

    def _create_candidate_record(self, candidate_row: pd.Series, selected_unique_id: str) -> Dict[str, Any]:
        """
        Convert selected Pandas row into JSON-safe candidate dictionary.
        Enforces Section 20 rule:
          - student: keep student_id (clean integer string without trailing .0)
          - faculty / guests: student_id is blank string
        """
        raw_type = str(candidate_row.get("type", "")).strip().lower()
        candidate_type = "guest" if raw_type in ("guest", "guests") else raw_type

        if candidate_type == "student":
            val = candidate_row.get("student_id")
            if pd.notna(val) and str(val).strip() != "":
                val_str = str(val).strip()
                if val_str.endswith(".0"):
                    val_str = val_str[:-2]
                student_id = val_str
            else:
                student_id = ""
        else:
            # Faculty and guests never have student ID
            student_id = ""

        record = {
            "position": int(self.curr_pos),
            "unique_id": str(selected_unique_id).strip(),
            "name": str(candidate_row.get("name", "")).strip() if pd.notna(candidate_row.get("name")) else "",
            "student_id": student_id,
            "type": candidate_type,
            "designation": str(candidate_row.get("designation", "")).strip() if pd.notna(candidate_row.get("designation")) else ""
        }
        return record

    def _remove_candidate_from_pool(self, unique_id: str) -> None:
        """Remove a candidate from the active eligible DataFrame."""
        normalized_id = str(unique_id).strip()
        before_count = len(self.df_eligible)
        self.df_eligible = self.df_eligible[
            self.df_eligible["unique_id"].astype(str).str.strip() != normalized_id
        ].copy()
        after_count = len(self.df_eligible)
        removed_count = before_count - after_count

        if removed_count != 1:
            if removed_count == 0:
                raise RuntimeError(f"Candidate {normalized_id} was not found in eligible pool.")
            else:
                raise RuntimeError(f"Multiple records removed for unique_id {normalized_id}.")

    def get_state_response(self) -> RaffleStateResponse:
        """Generate authoritative state response model."""
        can_start = self.state in ("WAITING_FOR_START", "IDLE") and self.curr_pos >= 1 and not self.df_eligible.empty
        can_pause = self.state in ("COUNTDOWN", "SELECTING", "CANDIDATE_REVEALED")
        can_resume = self.state == "PAUSED"
        can_confirm = self.state == "CANDIDATE_REVEALED" and self.current_candidate is not None
        can_ignore = self.state == "CANDIDATE_REVEALED" and self.current_candidate is not None
        can_stop = self.state not in ("COMPLETED", "STOPPED")
        can_reset = self.state not in ("COUNTDOWN", "SELECTING")

        current_cand_model = (
            CandidateRecord(**self.current_candidate)
            if self.current_candidate
            else None
        )

        return RaffleStateResponse(
            organization=self.organization_name,
            event=self.event_name,
            segment=self.segment_name,
            state=self.state,
            current_position=self.curr_pos,
            total_winners=self.total_winners,
            eligible_count=len(self.df_eligible),
            winner_count=len(self.results),
            ineligible_count=len(self.ineligible),
            selected_category=self.selected_category,
            category_counts=self.get_category_counts(),
            current_candidate=current_cand_model,
            countdown_remaining=self.current_countdown_remaining,
            can_start=can_start,
            can_pause=can_pause,
            can_resume=can_resume,
            can_confirm=can_confirm,
            can_ignore=can_ignore,
            can_stop=can_stop,
            can_reset=can_reset
        )

    def get_state_dict(self) -> Dict[str, Any]:
        """Convenience dictionary for state responses."""
        return self.get_state_response().model_dump()

    def get_sample_pool_names(self, limit: int = 35, category: str = "all") -> List[str]:
        """
        Get a random sample of candidate names from the eligible pool
        for the client-side rolling animation. Supports category filtering.
        """
        if self.df_eligible.empty:
            return ["Participant"]
        df_target = self.df_eligible
        target_cat = category.strip().lower()
        if target_cat != "all":
            if target_cat == "guest":
                df_target = df_target[df_target["type"].astype(str).str.strip().str.lower().isin(["guest", "guests"])]
            else:
                df_target = df_target[df_target["type"].astype(str).str.strip().str.lower() == target_cat]

        if df_target.empty:
            df_target = self.df_eligible

        names = df_target["name"].dropna().astype(str).tolist()
        if len(names) <= limit:
            return names
        import random
        return random.sample(names, limit)

    # --------------------------------------------------------
    # --------------------------------------------------------
    # State Control Actions
    # --------------------------------------------------------

    def is_draw_in_progress(self) -> bool:
        """Check if a draw sequence is currently active."""
        return (
            self.state in ("COUNTDOWN", "SELECTING")
            or (self._is_drawing_task is not None and not self._is_drawing_task.done())
        )

    def launch_draw_task(self, category: str = "all") -> asyncio.Task:
        """
        Validate state synchronously and launch the background draw task safely,
        attaching an exception handler to prevent unretrieved task exceptions.
        """
        if self.is_draw_in_progress():
            raise ValueError(f"Cannot start draw: draw sequence is already active in state '{self.state}'.")

        if self.curr_pos < 1:
            self.state = "COMPLETED"
            raise ValueError("Raffle is already completed.")

        if self.df_eligible.empty:
            raise ValueError("No eligible candidates remain in the pool.")

        target_cat = category.strip().lower()
        if target_cat != "all":
            if target_cat == "guest":
                match_count = (self.df_eligible["type"].astype(str).str.strip().str.lower().isin(["guest", "guests"])).sum()
            else:
                match_count = (self.df_eligible["type"].astype(str).str.strip().str.lower() == target_cat).sum()
            if match_count == 0:
                raise ValueError(f"No eligible candidates remain in category '{category}'.")

        if self.state not in ("WAITING_FOR_START", "IDLE"):
            raise ValueError(f"Cannot start draw from state: {self.state}")

        # Set state synchronously to prevent concurrent race conditions
        self.state = "COUNTDOWN"
        self.selected_category = target_cat
        self.current_candidate = None

        task = asyncio.create_task(self._run_draw_sequence(category=target_cat))
        self._is_drawing_task = task

        def _task_done_callback(t: asyncio.Task):
            try:
                exc = t.exception()
                if exc:
                    logger.error(f"Draw task encountered error: {exc}", exc_info=exc)
            except asyncio.CancelledError:
                logger.info("Draw task was cancelled.")
            except Exception as e:
                logger.warning(f"Error checking draw task result: {e}")

        task.add_done_callback(_task_done_callback)
        return task

    async def _run_draw_sequence(self, category: str = "all") -> Dict[str, Any]:
        """Internal asynchronous draw execution loop."""
        try:
            target_cat = category.strip().lower()
            # Broadcast countdown started
            await self.broadcast("countdown_started", {
                "position": self.curr_pos,
                "seconds": self.countdown_seconds,
                "category": target_cat,
                "state": self.get_state_dict()
            })

            # Run countdown ticks
            for sec in range(self.countdown_seconds, 0, -1):
                if self.state != "COUNTDOWN":
                    # Interrupted / Paused
                    logger.info("Countdown interrupted.")
                    return self.get_state_dict()

                self.current_countdown_remaining = sec
                await self.broadcast("countdown_tick", {
                    "remaining": sec,
                    "position": self.curr_pos
                })
                await asyncio.sleep(1.0)

            if self.state != "COUNTDOWN":
                return self.get_state_dict()

            # Selection phase
            async with self.lock:
                self.state = "SELECTING"
                self.current_countdown_remaining = 0

            # Broadcast selecting state (triggers rolling animation on audience display)
            sample_names = self.get_sample_pool_names(30, category=target_cat)
            await self.broadcast("candidate_selecting", {
                "position": self.curr_pos,
                "duration_ms": self.name_roll_duration_ms,
                "sample_names": sample_names,
                "category": target_cat,
                "state": self.get_state_dict()
            })

            # Wait for rolling duration
            await asyncio.sleep(self.name_roll_duration_ms / 1000.0)

            if self.state != "SELECTING":
                return self.get_state_dict()

            # Authoritative Server-side selection using secrets.randbelow
            async with self.lock:
                selected_unique_id = self._select_candidate_algorithm(self.df_eligible, category=target_cat)
                normalized_id = str(selected_unique_id).strip()

                matching_rows = self.df_eligible[
                    self.df_eligible["unique_id"].astype(str).str.strip() == normalized_id
                ]

                if matching_rows.empty:
                    raise RuntimeError(f"Selected ID {normalized_id} not found in pool.")

                candidate_row = matching_rows.iloc[0]
                candidate_record = self._create_candidate_record(candidate_row, normalized_id)

                self.current_candidate = candidate_record
                self.state = "CANDIDATE_REVEALED"

            # Optional reveal pause if configured
            if self.reveal_delay_seconds > 0:
                await asyncio.sleep(self.reveal_delay_seconds)

            # Broadcast candidate revealed
            await self.broadcast("candidate_revealed", {
                "position": self.curr_pos,
                "candidate": self.current_candidate,
                "category": target_cat,
                "state": self.get_state_dict()
            })

            return self.get_state_dict()
        except asyncio.CancelledError:
            logger.info("Draw sequence was cancelled.")
            raise
        except Exception as e:
            logger.error(f"Draw sequence exception: {e}", exc_info=True)
            if self.state in ("COUNTDOWN", "SELECTING"):
                self.state = "WAITING_FOR_START"
            raise

    async def start_draw(self, category: str = "all") -> Dict[str, Any]:
        """
        Initiate a draw sequence for current position.
        Transitions: WAITING_FOR_START -> COUNTDOWN -> SELECTING -> CANDIDATE_REVEALED.
        """
        target_cat = category.strip().lower()
        if self.is_draw_in_progress():
            raise ValueError(f"Cannot start draw from state: {self.state}")

        async with self.lock:
            if self.curr_pos < 1:
                self.state = "COMPLETED"
                raise ValueError("Raffle is already completed.")

            if self.df_eligible.empty:
                raise ValueError("No eligible candidates remain in the pool.")

            if self.state not in ("WAITING_FOR_START", "IDLE"):
                raise ValueError(f"Cannot start draw from state: {self.state}")

            self.state = "COUNTDOWN"
            self.selected_category = target_cat
            self.current_candidate = None

        return await self._run_draw_sequence(category=target_cat)

    async def confirm_winner(self) -> Dict[str, Any]:
        """
        Confirm the currently selected candidate as the winner.
        Transitions: CANDIDATE_REVEALED -> WAITING_FOR_START (or COMPLETED).
        Increments CURR_POS.
        """
        async with self.lock:
            if self.state != "CANDIDATE_REVEALED" or not self.current_candidate:
                raise ValueError("No candidate is currently revealed to confirm.")

            winner_record = self.current_candidate.copy()
            unique_id = winner_record["unique_id"]

            # Save to result.json with backup
            self.results = save_result_record(winner_record, self.results)

            # Remove from pool
            self._remove_candidate_from_pool(unique_id)

            # Advance to the next lower prize position.
            self.curr_pos -= 1
            self.current_candidate = None

            if self.curr_pos < 1:
                self.state = "COMPLETED"
            else:
                self.state = "WAITING_FOR_START"

        logger.info(f"[OK] Winner confirmed: Position {winner_record['position']} - {winner_record['name']}")

        # Broadcast winner confirmed
        await self.broadcast("winner_confirmed", {
            "winner": winner_record,
            "next_position": self.curr_pos,
            "state": self.get_state_dict()
        })

        if self.state == "COMPLETED":
            await self.broadcast("raffle_completed", {
                "total_winners": len(self.results),
                "winners": self.results,
                "state": self.get_state_dict()
            })

        return self.get_state_dict()

    async def ignore_candidate(self) -> Dict[str, Any]:
        """
        Mark the currently selected candidate as absent / ineligible.
        Transitions: CANDIDATE_REVEALED -> WAITING_FOR_START.
        CURR_POS DOES NOT CHANGE.
        """
        async with self.lock:
            if self.state != "CANDIDATE_REVEALED" or not self.current_candidate:
                raise ValueError("No candidate is currently revealed to ignore.")

            ineligible_record = self.current_candidate.copy()
            unique_id = ineligible_record["unique_id"]

            # Save to ineligible.json with backup
            self.ineligible = save_ineligible_record(ineligible_record, self.ineligible)

            # Remove from pool
            self._remove_candidate_from_pool(unique_id)

            # CURRENT POSITION DOES NOT CHANGE
            self.current_candidate = None
            self.state = "WAITING_FOR_START"

        logger.info(f"[OK] Candidate marked ineligible: Position {ineligible_record['position']} preserved.")

        # Broadcast candidate ignored
        await self.broadcast("candidate_ignored", {
            "ineligible": ineligible_record,
            "preserved_position": self.curr_pos,
            "state": self.get_state_dict()
        })

        return self.get_state_dict()

    async def pause(self) -> Dict[str, Any]:
        """Safely pause the raffle without losing candidate or position."""
        async with self.lock:
            if self.state == "PAUSED":
                return self.get_state_dict()

            if self.state in ("COMPLETED", "STOPPED"):
                raise ValueError(f"Cannot pause raffle when in {self.state} state.")

            self.previous_state_before_pause = self.state
            self.state = "PAUSED"

        logger.info("⏸ Raffle paused.")
        await self.broadcast("raffle_paused", {
            "state": self.get_state_dict()
        })
        return self.get_state_dict()

    async def resume(self) -> Dict[str, Any]:
        """Resume raffle from paused state."""
        async with self.lock:
            if self.state != "PAUSED":
                raise ValueError("Raffle is not paused.")

            # Restore previous state
            target_state = self.previous_state_before_pause or "WAITING_FOR_START"
            if target_state in ("COUNTDOWN", "SELECTING"):
                # If paused during countdown/selecting, revert cleanly to WAITING_FOR_START
                target_state = "WAITING_FOR_START"

            self.state = target_state
            self.previous_state_before_pause = None

        logger.info(f"▶ Raffle resumed to {self.state}.")
        await self.broadcast("raffle_resumed", {
            "state": self.get_state_dict()
        })
        return self.get_state_dict()

    async def stop(self) -> Dict[str, Any]:
        """Stop the raffle."""
        async with self.lock:
            self.state = "STOPPED"

        logger.info("🛑 Raffle stopped.")
        await self.broadcast("raffle_stopped", {
            "state": self.get_state_dict()
        })
        return self.get_state_dict()

    async def reset_raffle(self) -> Dict[str, Any]:
        """Reset the raffle session, backing up current results and starting fresh from the highest prize position."""
        async with self.lock:
            # Create backups first
            backup_file(RESULT_FILE, RESULT_BACKUP_FILE)
            backup_file(INELIGIBLE_FILE, INELIGIBLE_BACKUP_FILE)

            # Clear result and ineligible files atomically
            self.results = []
            self.ineligible = []
            atomic_save_json([], RESULT_FILE)
            atomic_save_json([], INELIGIBLE_FILE)

            # Re-initialize engine from Excel
            self.initialize_engine()
            self.curr_pos = self.total_winners
            self.state = "WAITING_FOR_START"
            self.current_candidate = None
            self.current_countdown_remaining = None

        logger.info(f"[OK] Raffle session reset to Position {self.total_winners}.")
        await self.broadcast("raffle_reset", {
            "state": self.get_state_dict()
        })
        return self.get_state_dict()
