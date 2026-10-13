from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field

# Valid states for the raffle engine
RaffleStateType = Literal[
    "IDLE",
    "WAITING_FOR_START",
    "COUNTDOWN",
    "SELECTING",
    "CANDIDATE_REVEALED",
    "PAUSED",
    "COMPLETED",
    "STOPPED"
]

class CandidateRecord(BaseModel):
    position: int
    unique_id: str
    name: str
    student_id: str = ""
    type: str = "general"
    designation: str = ""
    details: Optional[str] = ""

class AudienceCandidateRecord(BaseModel):
    position: int
    unique_id: str
    name: str
    student_id: str = ""
    type: str = "general"
    designation: str = ""
    details: Optional[str] = ""

class EventSettingsRequest(BaseModel):
    organization_name: Optional[str] = None
    event_name: Optional[str] = None
    segment_name: Optional[str] = None
    total_winners: Optional[int] = None
    draw_countdown_seconds: Optional[int] = None
    shuffle_passes: Optional[int] = None
    winner_reveal_seconds: Optional[int] = None
    name_roll_duration_ms: Optional[int] = None
    beep_enabled: Optional[bool] = None
    confetti_enabled: Optional[bool] = None

class StartDrawRequest(BaseModel):
    category: str = "all"

class RaffleStateResponse(BaseModel):
    organization: str = ""
    event: str
    segment: str
    state: RaffleStateType
    current_position: int
    total_winners: int
    eligible_count: int
    winner_count: int
    ineligible_count: int
    selected_category: str = "all"
    category_counts: Dict[str, int] = Field(default_factory=dict)
    current_candidate: Optional[CandidateRecord] = None
    countdown_remaining: Optional[int] = None
    can_start: bool = False
    can_pause: bool = False
    can_resume: bool = False
    can_confirm: bool = False
    can_ignore: bool = False
    can_stop: bool = False
    can_reset: bool = True

class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    success: bool
    token: str
    username: str
    message: str = "Authentication successful"

class ApiResponse(BaseModel):
    success: bool
    message: str = ""
    data: Optional[Any] = None
    error: Optional[str] = None

class StatisticsResponse(BaseModel):
    event_name: str
    total_winners_target: int
    confirmed_winners_count: int
    ineligible_count: int
    remaining_eligible_count: int
    current_position: int
    state: RaffleStateType
    is_completed: bool
