import json
import os
import shutil
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime
import logging

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle
)
from reportlab.lib.units import mm

from config import (
    EVENT_NAME,
    SEGMENT_NAME,
    RESULT_FILE,
    RESULT_BACKUP_FILE,
    INELIGIBLE_FILE,
    INELIGIBLE_BACKUP_FILE,
    PDF_FILE
)

logger = logging.getLogger("raffle.persistence")

def backup_file(source_file: Path, backup_file: Path) -> None:
    """Create/replace a backup of an existing JSON file."""
    if source_file.exists():
        backup_file.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_file, backup_file)
        logger.info(f"[OK] Backup updated: {backup_file}")

def atomic_save_json(data: Any, file_path: Path) -> None:
    """
    Safely save JSON with atomic replacement.
    Data is first written to a temporary file, flushed, synced, and replaced.
    """
    file_path.parent.mkdir(parents=True, exist_ok=True)
    temp_file = file_path.with_suffix(".json.tmp")

    with temp_file.open("w", encoding="utf-8") as f:
        json.dump(
            data,
            f,
            indent=4,
            ensure_ascii=False,
            default=lambda obj: obj.item() if hasattr(obj, "item") else str(obj)
        )
        f.flush()
        os.fsync(f.fileno())

    temp_file.replace(file_path)

def load_json_with_recovery(file_path: Path, backup_path: Path) -> List[Dict[str, Any]]:
    """
    Load JSON from file_path.
    If corrupted or invalid, attempt recovery from backup_path.
    If neither exists, return an empty list and create the file.
    """
    if file_path.exists():
        try:
            with file_path.open("r", encoding="utf-8") as f:
                data = json.load(f)
            if not isinstance(data, list):
                raise ValueError(f"{file_path.name} must contain a JSON list.")
            return data
        except (json.JSONDecodeError, OSError, ValueError) as e:
            logger.warning(f"Problem reading {file_path.name}: {e}. Attempting recovery...")
            if backup_path.exists():
                try:
                    with backup_path.open("r", encoding="utf-8") as f:
                        data = json.load(f)
                    if isinstance(data, list):
                        shutil.copy2(backup_path, file_path)
                        logger.info(f"[OK] Recovered {file_path.name} from backup.")
                        return data
                except Exception as be:
                    logger.error(f"Backup is also unreadable: {be}")
            logger.error(f"Failed to recover {file_path.name}.")
            raise RuntimeError(f"Unable to read or recover {file_path.name}: {e}")
    else:
        # File doesn't exist yet, create empty list
        empty_data: List[Dict[str, Any]] = []
        atomic_save_json(empty_data, file_path)
        return empty_data

def save_result_record(record: Dict[str, Any], current_results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Safely add a confirmed winner to result.json with backup."""
    new_results = current_results.copy()
    new_results.append(record)

    # Backup current file before modification
    backup_file(RESULT_FILE, RESULT_BACKUP_FILE)

    # Safely save new version
    atomic_save_json(new_results, RESULT_FILE)
    logger.info(f"[OK] Saved winner record to {RESULT_FILE}")
    return new_results

def save_ineligible_record(record: Dict[str, Any], current_ineligible: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Safely add an ineligible/ignored candidate to ineligible.json with backup."""
    new_ineligible = current_ineligible.copy()
    new_ineligible.append(record)

    # Backup current file before modification
    backup_file(INELIGIBLE_FILE, INELIGIBLE_BACKUP_FILE)

    # Safely save new version
    atomic_save_json(new_ineligible, INELIGIBLE_FILE)
    logger.info(f"[OK] Saved ineligible candidate to {INELIGIBLE_FILE}")
    return new_ineligible

def generate_result_pdf(
    pdf_results: List[Dict[str, Any]],
    output_path: Optional[Path] = None,
    event_name: Optional[str] = None,
    segment_name: Optional[str] = None
) -> Path:
    """
    Generate the official raffle result PDF matching the exact styling
    from the original notebook, with dynamic event titles.
    """
    target_path = output_path or PDF_FILE
    target_event = event_name or EVENT_NAME
    target_segment = segment_name or SEGMENT_NAME
    target_path.parent.mkdir(parents=True, exist_ok=True)

    doc = SimpleDocTemplate(
        str(target_path),
        pagesize=A4,
        rightMargin=15 * mm,
        leftMargin=15 * mm,
        topMargin=15 * mm,
        bottomMargin=15 * mm
    )

    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "EventTitle",
        parent=styles["Title"],
        alignment=TA_CENTER,
        fontSize=20,
        leading=24,
        spaceAfter=6
    )

    subtitle_style = ParagraphStyle(
        "Subtitle",
        parent=styles["Normal"],
        alignment=TA_CENTER,
        fontSize=12,
        leading=16,
        spaceAfter=4
    )

    info_style = ParagraphStyle(
        "Info",
        parent=styles["Normal"],
        alignment=TA_CENTER,
        fontSize=9,
        leading=12,
        spaceAfter=12
    )

    story = []
    story.append(Paragraph(target_event, title_style))
    story.append(Paragraph(target_segment, subtitle_style))
    story.append(Paragraph("OFFICIAL RAFFLE DRAW — WINNERS", subtitle_style))
    story.append(Spacer(1, 4 * mm))

    generated_time = datetime.now().strftime("%d %B %Y, %I:%M:%S %p")
    story.append(Paragraph(
        f"Total Winners: {len(pdf_results)} &nbsp;&nbsp; Generated: {generated_time}",
        info_style
    ))

    table_data = [
        [
            "Position",
            "Unique ID",
            "Name",
            "Student ID",
            "Type",
            "Designation"
        ]
    ]

    for winner in pdf_results:
        participant_type = str(winner.get("type", "")).strip().lower()
        if participant_type == "student":
            student_id = str(winner.get("student_id", "")).strip()
        else:
            student_id = ""

        table_data.append([
            str(winner.get("position", "")),
            str(winner.get("unique_id", "")),
            str(winner.get("name", "")),
            student_id,
            participant_type.title(),
            str(winner.get("designation", "")).strip()
        ])

    table = Table(
        table_data,
        repeatRows=1,
        colWidths=[
            18 * mm,
            25 * mm,
            43 * mm,
            30 * mm,
            22 * mm,
            42 * mm
        ]
    )

    table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 8),
            ("ALIGN", (0, 0), (-1, 0), "CENTER"),
            ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
            ("FONTSIZE", (0, 1), (-1, -1), 8),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN", (0, 1), (1, -1), "CENTER"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ])
    )

    story.append(table)
    story.append(Spacer(1, 10 * mm))
    story.append(Paragraph(
        "Candidate must be present. All winners were confirmed through the official raffle controller.",
        info_style
    ))

    doc.build(story)
    logger.info(f"[OK] PDF generated successfully at {target_path}")
    return target_path
