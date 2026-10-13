import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional, Dict, Any, List

import re
from fastapi import (
    FastAPI,
    Request,
    Depends,
    HTTPException,
    WebSocket,
    WebSocketDisconnect,
    Query,
    status,
    Body,
    UploadFile,
    File
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from config import (
    EVENT_NAME,
    SEGMENT_NAME,
    TOTAL_WINNERS,
    PDF_FILE,
    FRONTEND_DIR,
    HOST,
    PORT,
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    REMOTE_SESSION_ID,
    EXCEL_FILE,
    get_event_settings,
    save_event_settings,
)
from models import (
    LoginRequest,
    LoginResponse,
    ApiResponse,
    RaffleStateResponse,
    StatisticsResponse,
    StartDrawRequest,
    EventSettingsRequest,
)
from auth import (
    create_access_token,
    verify_credentials,
    authenticate_controller,
    verify_token
)
from persistence import generate_result_pdf
from websocket_manager import ws_manager
from raffle_engine import RaffleEngine
from remote_control import RemoteControl

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("raffle.server")

# Global RaffleEngine instance
engine: Optional[RaffleEngine] = None
remote = RemoteControl()

@asynccontextmanager
async def lifespan(app: FastAPI):
    global engine
    logger.info("Initializing application and Raffle Engine...")
    engine = RaffleEngine()

    async def broadcast_engine_event(event_type: str, data: Dict[str, Any]) -> None:
        await ws_manager.broadcast(event_type, data)
        if event_type == "countdown_started":
            await remote.set_next_draw_allowed(False, engine.is_draw_in_progress())
        elif event_type in {"candidate_revealed", "winner_confirmed", "candidate_ignored", "raffle_completed", "raffle_reset"}:
            await remote.publish_state(engine.is_draw_in_progress())

    engine.set_broadcast_callback(broadcast_engine_event)
    remote.set_broadcast_callback(ws_manager.broadcast)
    logger.info("[OK] Application started successfully.")
    yield
    logger.info("Application shutting down...")

app = FastAPI(
    title="DUET CSE Fest 2026 — Raffle System API",
    description="Authoritative backend and real-time state engine for DUET CSE Fest 2026 Raffle Draw",
    version="2.0.0",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_no_cache_headers(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/controller") or request.url.path.startswith("/audience"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

# ------------------------------------------------------------
# AUTHENTICATION ENDPOINTS
# ------------------------------------------------------------

@app.post("/api/auth/login", response_model=LoginResponse)
async def login(req: LoginRequest):
    """Authenticate raffle controller operator and issue bearer token."""
    if not verify_credentials(req.username, req.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid controller credentials."
        )

    token = create_access_token(username=req.username)
    return LoginResponse(
        success=True,
        token=token,
        username=req.username,
        message="Login successful."
    )

# ------------------------------------------------------------
# PUBLIC / AUDIENCE ENDPOINTS
# ------------------------------------------------------------

@app.get("/api/audience/status", response_model=RaffleStateResponse)
async def get_audience_status():
    """Get current public raffle state."""
    if not engine:
        raise HTTPException(status_code=500, detail="Raffle engine is not initialized.")
    return engine.get_state_response()

@app.get("/api/results", response_model=ApiResponse)
async def get_results():
    """Get list of confirmed winners from result.json."""
    if not engine:
        raise HTTPException(status_code=500, detail="Raffle engine is not initialized.")
    return ApiResponse(
        success=True,
        data=engine.results,
        message=f"{len(engine.results)} confirmed winners."
    )

@app.get("/api/pool/sample")
async def get_pool_sample(limit: int = 30, category: str = "all"):
    """Get a random subset of eligible candidate names for rolling visualization."""
    if not engine:
        raise HTTPException(status_code=500, detail="Raffle engine is not initialized.")
    names = engine.get_sample_pool_names(limit, category=category)
    return {"success": True, "names": names}

@app.get("/api/results/pdf")
async def download_results_pdf():
    """Generate and return official raffle results PDF."""
    if not engine:
        raise HTTPException(status_code=500, detail="Raffle engine is not initialized.")

    pdf_path = generate_result_pdf(
        engine.results,
        PDF_FILE,
        event_name=engine.event_name,
        segment_name=engine.segment_name
    )
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="PDF generation failed.")

    safe_event_filename = re.sub(r'[^a-zA-Z0-9_\-]', '_', engine.event_name).strip('_')
    return FileResponse(
        path=str(pdf_path),
        filename=f"{safe_event_filename}_Raffle_Winners.pdf",
        media_type="application/pdf"
    )

# ------------------------------------------------------------
# CONTROLLER ENDPOINTS (PROTECTED)
# ------------------------------------------------------------

@app.get("/api/controller/status", response_model=RaffleStateResponse)
async def get_controller_status(user: Dict[str, Any] = Depends(authenticate_controller)):
    """Get full state for the controller dashboard."""
    if not engine:
        raise HTTPException(status_code=500, detail="Raffle engine is not initialized.")
    return engine.get_state_response()

@app.post("/api/controller/start", response_model=ApiResponse)
async def controller_start(
    req: Optional[StartDrawRequest] = None,
    category: Optional[str] = Query(None),
    user: Dict[str, Any] = Depends(authenticate_controller)
):
    """Trigger the draw sequence for the current position with optional category targeting."""
    if not engine:
        raise HTTPException(status_code=500, detail="Raffle engine is not initialized.")

    selected_cat = "all"
    if req and req.category:
        selected_cat = req.category
    elif category:
        selected_cat = category

    try:
        # Launch draw task safely via engine
        engine.launch_draw_task(category=selected_cat)
        return ApiResponse(
            success=True,
            message=f"Draw countdown initiated for category '{selected_cat}'.",
            data=engine.get_state_dict()
        )
    except ValueError as ve:
        return JSONResponse(
            status_code=400,
            content={"success": False, "error": str(ve)}
        )
    except Exception as e:
        logger.error(f"Draw error: {e}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": f"Internal draw error: {str(e)}"}
        )

@app.post("/api/controller/pause", response_model=ApiResponse)
async def controller_pause(user: Dict[str, Any] = Depends(authenticate_controller)):
    """Pause the current raffle draw."""
    if not engine:
        raise HTTPException(status_code=500, detail="Raffle engine is not initialized.")
    try:
        state = await engine.pause()
        return ApiResponse(success=True, message="Raffle paused.", data=state)
    except Exception as e:
        return JSONResponse(status_code=400, content={"success": False, "error": str(e)})

@app.post("/api/controller/resume", response_model=ApiResponse)
async def controller_resume(user: Dict[str, Any] = Depends(authenticate_controller)):
    """Resume a paused raffle draw."""
    if not engine:
        raise HTTPException(status_code=500, detail="Raffle engine is not initialized.")
    try:
        state = await engine.resume()
        return ApiResponse(success=True, message="Raffle resumed.", data=state)
    except Exception as e:
        return JSONResponse(status_code=400, content={"success": False, "error": str(e)})

@app.post("/api/controller/confirm", response_model=ApiResponse)
async def controller_confirm(user: Dict[str, Any] = Depends(authenticate_controller)):
    """Confirm revealed candidate as winner and increment position."""
    if not engine:
        raise HTTPException(status_code=500, detail="Raffle engine is not initialized.")
    try:
        state = await engine.confirm_winner()
        return ApiResponse(success=True, message="Winner confirmed.", data=state)
    except Exception as e:
        return JSONResponse(status_code=400, content={"success": False, "error": str(e)})

@app.post("/api/controller/ignore", response_model=ApiResponse)
async def controller_ignore(user: Dict[str, Any] = Depends(authenticate_controller)):
    """Mark revealed candidate as ineligible/absent. Current position is preserved."""
    if not engine:
        raise HTTPException(status_code=500, detail="Raffle engine is not initialized.")
    try:
        state = await engine.ignore_candidate()
        return ApiResponse(
            success=True,
            message="Candidate marked ineligible. Position preserved for next draw.",
            data=state
        )
    except Exception as e:
        return JSONResponse(status_code=400, content={"success": False, "error": str(e)})

@app.post("/api/controller/stop", response_model=ApiResponse)
async def controller_stop(user: Dict[str, Any] = Depends(authenticate_controller)):
    """Stop the raffle."""
    if not engine:
        raise HTTPException(status_code=500, detail="Raffle engine is not initialized.")
    try:
        state = await engine.stop()
        return ApiResponse(success=True, message="Raffle stopped.", data=state)
    except Exception as e:
        return JSONResponse(status_code=400, content={"success": False, "error": str(e)})

@app.post("/api/controller/reset", response_model=ApiResponse)
async def controller_reset(user: Dict[str, Any] = Depends(authenticate_controller)):
    """Reset the raffle session, backup existing results, and restart from Position 1."""
    if not engine:
        raise HTTPException(status_code=500, detail="Raffle engine is not initialized.")
    try:
        state = await engine.reset_raffle()
        return ApiResponse(success=True, message="Raffle reset to Position 1.", data=state)
    except Exception as e:
        return JSONResponse(status_code=400, content={"success": False, "error": str(e)})

@app.get("/api/ineligible", response_model=ApiResponse)
async def get_ineligible(user: Dict[str, Any] = Depends(authenticate_controller)):
    """Get list of ineligible/skipped candidates."""
    if not engine:
        raise HTTPException(status_code=500, detail="Raffle engine is not initialized.")
    return ApiResponse(
        success=True,
        data=engine.ineligible,
        message=f"{len(engine.ineligible)} ineligible candidates."
    )

@app.get("/api/statistics", response_model=StatisticsResponse)
async def get_statistics(user: Dict[str, Any] = Depends(authenticate_controller)):
    """Get summary statistics for controller dashboard."""
    if not engine:
        raise HTTPException(status_code=500, detail="Raffle engine is not initialized.")
    return StatisticsResponse(
        event_name=engine.event_name,
        total_winners_target=engine.total_winners,
        confirmed_winners_count=len(engine.results),
        ineligible_count=len(engine.ineligible),
        remaining_eligible_count=len(engine.df_eligible),
        current_position=engine.curr_pos,
        state=engine.state,
        is_completed=engine.state == "COMPLETED"
    )

@app.get("/api/controller/settings")
async def get_controller_settings(user: Dict[str, Any] = Depends(authenticate_controller)):
    """Get current event configuration settings and data file metadata."""
    if not engine:
        raise HTTPException(status_code=500, detail="Raffle engine is not initialized.")

    file_exists = EXCEL_FILE.exists()
    file_stat = EXCEL_FILE.stat() if file_exists else None
    import datetime
    mod_time = datetime.datetime.fromtimestamp(file_stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S") if file_stat else None

    return {
        "success": True,
        "settings": {
            "organization_name": engine.organization_name,
            "event_name": engine.event_name,
            "segment_name": engine.segment_name,
            "total_winners": engine.total_winners,
            "draw_countdown_seconds": engine.countdown_seconds,
            "shuffle_passes": engine.shuffle_passes,
            "winner_reveal_seconds": engine.reveal_delay_seconds,
            "name_roll_duration_ms": engine.name_roll_duration_ms,
            "beep_enabled": getattr(engine, "beep_enabled", True),
            "confetti_enabled": getattr(engine, "confetti_enabled", True)
        },
        "file_info": {
            "filename": EXCEL_FILE.name,
            "exists": file_exists,
            "modified_at": mod_time,
            "total_rows": len(engine.df_all),
            "eligible_rows": len(engine.df_eligible),
            "columns": list(engine.df_all.columns) if not engine.df_all.empty else [],
            "category_counts": engine.get_category_counts()
        }
    }

@app.post("/api/controller/settings", response_model=ApiResponse)
async def update_controller_settings(
    req: EventSettingsRequest,
    user: Dict[str, Any] = Depends(authenticate_controller)
):
    """Update event configuration dynamically and broadcast new state."""
    if not engine:
        raise HTTPException(status_code=500, detail="Raffle engine is not initialized.")
    try:
        updated_dict = req.model_dump(exclude_unset=True)
        new_state = engine.apply_settings(updated_dict)
        await ws_manager.broadcast("raffle_state", new_state)
        return ApiResponse(
            success=True,
            message="Event settings updated successfully.",
            data=new_state
        )
    except Exception as e:
        logger.error(f"Failed to update settings: {e}")
        return JSONResponse(status_code=400, content={"success": False, "error": str(e)})

@app.post("/api/controller/reload-data", response_model=ApiResponse)
async def controller_reload_data(user: Dict[str, Any] = Depends(authenticate_controller)):
    """Reload data.xlsx from disk, update participant pool, and sync state."""
    if not engine:
        raise HTTPException(status_code=500, detail="Raffle engine is not initialized.")
    try:
        new_state = engine.reload_data()
        await ws_manager.broadcast("raffle_state", new_state)
        return ApiResponse(
            success=True,
            message=f"Data reloaded successfully! {len(engine.df_all)} participants loaded ({len(engine.df_eligible)} eligible).",
            data={
                "state": new_state,
                "total_participants": len(engine.df_all),
                "eligible": len(engine.df_eligible),
                "categories": engine.get_category_counts()
            }
        )
    except Exception as e:
        logger.error(f"Failed to reload data: {e}")
        return JSONResponse(status_code=400, content={"success": False, "error": str(e)})

@app.post("/api/controller/upload-data", response_model=ApiResponse)
async def controller_upload_data(
    file: UploadFile = File(...),
    user: Dict[str, Any] = Depends(authenticate_controller)
):
    """Upload a new Excel (.xlsx / .xls) dataset, save as data.xlsx, and reload pool."""
    if not engine:
        raise HTTPException(status_code=500, detail="Raffle engine is not initialized.")

    if not file.filename.lower().endswith((".xlsx", ".xls")):
        return JSONResponse(
            status_code=400,
            content={"success": False, "error": "Only Excel (.xlsx, .xls) files are accepted."}
        )

    try:
        content = await file.read()
        if len(content) < 100:
            return JSONResponse(status_code=400, content={"success": False, "error": "Uploaded file is too small or empty."})

        # Test readability with pandas before replacing current file
        import io
        import pandas as pd
        test_df = pd.read_excel(io.BytesIO(content))
        if test_df.empty:
            return JSONResponse(status_code=400, content={"success": False, "error": "The uploaded spreadsheet contains no data rows."})

        # Backup existing file if exists
        if EXCEL_FILE.exists():
            backup_path = EXCEL_FILE.with_suffix(".xlsx.bak")
            import shutil
            shutil.copy2(EXCEL_FILE, backup_path)

        # Write new file
        EXCEL_FILE.parent.mkdir(parents=True, exist_ok=True)
        temp_excel = EXCEL_FILE.with_suffix(".xlsx.tmp")
        with open(temp_excel, "wb") as f:
            f.write(content)
        temp_excel.replace(EXCEL_FILE)

        # Reload engine
        new_state = engine.reload_data()
        await ws_manager.broadcast("raffle_state", new_state)

        return ApiResponse(
            success=True,
            message=f"Uploaded '{file.filename}' successfully! Loaded {len(engine.df_all)} participants ({len(engine.df_eligible)} eligible).",
            data={
                "state": new_state,
                "filename": file.filename,
                "total_participants": len(engine.df_all),
                "eligible": len(engine.df_eligible),
                "categories": engine.get_category_counts()
            }
        )
    except Exception as e:
        logger.error(f"Failed to process uploaded file: {e}")
        return JSONResponse(status_code=400, content={"success": False, "error": f"Failed to parse Excel file: {str(e)}"})

# ------------------------------------------------------------
# REMOTE MOBILE CONTROL (SUPABASE IS TRANSPORT ONLY)
# ------------------------------------------------------------

@app.get("/api/controller/remote/config")
async def get_remote_config(user: Dict[str, Any] = Depends(authenticate_controller)):
    """Return only public Supabase browser configuration and current remote state."""
    if not engine:
        raise HTTPException(status_code=500, detail="Raffle engine is not initialized.")
    return {
        "supabase_url": SUPABASE_URL,
        "supabase_anon_key": SUPABASE_ANON_KEY,
        "session_id": REMOTE_SESSION_ID,
        "state": remote.state(engine.is_draw_in_progress()),
    }


@app.post("/api/controller/remote/enabled")
async def set_remote_enabled(
    enabled: bool = Body(..., embed=True),
    user: Dict[str, Any] = Depends(authenticate_controller)
):
    if not engine:
        raise HTTPException(status_code=500, detail="Raffle engine is not initialized.")
    state = await remote.set_enabled(enabled, engine.is_draw_in_progress())
    logger.info("[REMOTE] Remote control %s", "enabled" if enabled else "disabled")
    return {"success": True, "state": state}


@app.post("/api/controller/remote/permission")
async def set_remote_permission(
    allowed: bool = Body(..., embed=True),
    user: Dict[str, Any] = Depends(authenticate_controller)
):
    if not engine:
        raise HTTPException(status_code=500, detail="Raffle engine is not initialized.")
    state = await remote.set_next_draw_allowed(allowed, engine.is_draw_in_progress())
    return {"success": True, "state": state}


@app.post("/api/controller/remote/message")
async def receive_remote_message(
    payload: Dict[str, Any] = Body(...),
    user: Dict[str, Any] = Depends(authenticate_controller)
):
    """Validate a transport message before the controller relays state."""
    if not engine:
        raise HTTPException(status_code=500, detail="Raffle engine is not initialized.")
    result = await remote.handle_message(payload, engine.is_draw_in_progress())
    if result == "UNAUTHORIZED":
        return {"success": False, "status": "rejected", "reason": result}
    return {"success": True, "status": result, "state": remote.state(engine.is_draw_in_progress())}


@app.post("/api/controller/remote/draw")
async def remote_draw(
    payload: Dict[str, Any] = Body(...),
    user: Dict[str, Any] = Depends(authenticate_controller)
):
    """Authoritatively validate and invoke the existing draw path."""
    if not engine:
        raise HTTPException(status_code=500, detail="Raffle engine is not initialized.")
    request_id = payload.get("request_id")
    reason = await remote.claim_request(request_id, engine.is_draw_in_progress())
    if reason != "ACCEPTED":
        logger.info("[REMOTE] Request rejected: %s", reason)
        return {"success": False, "status": "rejected", "request_id": request_id, "reason": reason}

    try:
        task = engine.launch_draw_task(category="all")
    except Exception:
        await remote.set_next_draw_allowed(False, engine.is_draw_in_progress())
        return {"success": False, "status": "rejected", "request_id": request_id, "reason": "PC_NOT_READY"}

    draw_number = engine.curr_pos
    logger.info("[REMOTE] Request accepted; permission consumed")
    await ws_manager.broadcast("remote_draw_event", {
        "type": "draw_started",
        "draw_number": draw_number,
        "request_id": request_id,
    })
    await ws_manager.broadcast("remote_draw_event", {
        "type": "draw_status",
        "draw_number": draw_number,
        "status": "running",
        "message": f"Draw #{draw_number} in progress...",
    })
    await remote.publish_state(engine.is_draw_in_progress())

    async def publish_completion() -> None:
        try:
            await task
        except Exception:
            return
        await ws_manager.broadcast("remote_draw_event", {
            "type": "draw_completed",
            "draw_number": draw_number,
            "next_draw_allowed": False,
        })
        await remote.publish_state(engine.is_draw_in_progress())

    asyncio.create_task(publish_completion())
    return {
        "success": True,
        "status": "accepted",
        "request_id": request_id,
        "state": remote.state(engine.is_draw_in_progress()),
    }

# ------------------------------------------------------------
# WEBSOCKET ENDPOINTS
# ------------------------------------------------------------

@app.websocket("/ws/audience")
async def ws_audience_endpoint(websocket: WebSocket):
    """Public WebSocket connection for audience display."""
    await ws_manager.connect_audience(websocket)
    try:
        # Send initial state snapshot upon connection
        if engine:
            await websocket.send_json({
                "type": "connected",
                "data": engine.get_state_dict()
            })
        while True:
            # Keep socket alive; audience doesn't send commands
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect_audience(websocket)
    except Exception as e:
        logger.warning(f"Audience WebSocket exception: {e}")
        ws_manager.disconnect_audience(websocket)

@app.websocket("/ws/controller")
async def ws_controller_endpoint(websocket: WebSocket, token: Optional[str] = Query(None)):
    """Authenticated WebSocket connection for raffle controller."""
    # Authenticate token from query param
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    try:
        verify_token(token)
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await ws_manager.connect_controller(websocket)
    try:
        # Send initial full state upon connection
        if engine:
            await websocket.send_json({
                "type": "connected",
                "data": engine.get_state_dict()
            })
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect_controller(websocket)
    except Exception as e:
        logger.warning(f"Controller WebSocket exception: {e}")
        ws_manager.disconnect_controller(websocket)

# ------------------------------------------------------------
# FRONTEND STATIC FILES & ROUTING
# ------------------------------------------------------------

controller_dir = FRONTEND_DIR / "controller"
audience_dir = FRONTEND_DIR / "audience"

if controller_dir.exists():
    app.mount("/controller", StaticFiles(directory=str(controller_dir), html=True), name="controller")

if audience_dir.exists():
    app.mount("/audience", StaticFiles(directory=str(audience_dir), html=True), name="audience")

@app.get("/")
async def root():
    """Root redirects to the public Audience presentation view."""
    return RedirectResponse(url="/audience/")
