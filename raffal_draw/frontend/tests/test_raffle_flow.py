import sys
import json
import shutil
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(backend_dir))

import asyncio
import pandas as pd
from raffle_engine import RaffleEngine
from auth import create_access_token, verify_token, verify_credentials
from persistence import generate_result_pdf, load_json_with_recovery, atomic_save_json
import config

async def test_all_flows():
    print("========================================")
    print("STARTING RAFFLE FLOW & BEHAVIOR TESTS")
    print("========================================")

    # 1. Test Auth
    print("\n[TEST 1] Authentication...")
    assert verify_credentials("admin", "duetcsefest2026password") is True
    assert verify_credentials("admin", "wrongpassword") is False
    assert verify_credentials("unknown", "duetcsefest2026password") is False

    token = create_access_token("admin")
    payload = verify_token(token)
    assert payload["sub"] == "admin"
    assert payload["role"] == "controller"
    print("[PASS] Authentication test passed.")

    # 2. Test Engine Initialization and Recovery
    print("\n[TEST 2] Engine Initialization & Pool Integrity...")
    engine = RaffleEngine()
    initial_pos = engine.curr_pos
    initial_eligible = len(engine.df_eligible)
    initial_winners = len(engine.results)
    initial_ineligible = len(engine.ineligible)

    print(f"  Pos: {initial_pos}, Eligible: {initial_eligible}, Winners: {initial_winners}, Ineligible: {initial_ineligible}")
    assert initial_pos >= 0, f"Invalid pos: {initial_pos}"
    assert initial_winners >= 0, f"Invalid winners: {initial_winners}"
    assert initial_ineligible >= 0, f"Invalid ineligible: {initial_ineligible}"
    print("[PASS] Engine initialization verified.")

    # 3. Test Student vs Faculty/Guest ID Handling
    print("\n[TEST 3] Student vs Faculty/Guest ID handling rule & float sanitization...")
    student_row = pd.Series({
        "unique_id": "9999",
        "name": "Test Student",
        "student_id": 2404999.0, # Test float value from pandas excel
        "type": "student",
        "designation": "Student"
    })
    rec_student = engine._create_candidate_record(student_row, "9999")
    assert rec_student["student_id"] == "2404999", f"Expected '2404999', got '{rec_student['student_id']}'"

    faculty_row = pd.Series({
        "unique_id": "8888",
        "name": "Test Faculty",
        "student_id": "accidental_id_value",
        "type": "faculty",
        "designation": "Assistant Professor"
    })
    rec_faculty = engine._create_candidate_record(faculty_row, "8888")
    assert rec_faculty["student_id"] == "", f"Faculty student_id must be blank, got {rec_faculty['student_id']}"

    guest_row = pd.Series({
        "unique_id": "7777",
        "name": "Test Guest",
        "student_id": "123456",
        "type": "guests",
        "designation": "Special Guest"
    })
    rec_guest = engine._create_candidate_record(guest_row, "7777")
    assert rec_guest["student_id"] == "", f"Guest student_id must be blank, got {rec_guest['student_id']}"
    assert rec_guest["type"] == "guest"
    print("[PASS] ID sanitization & float formatting verified.")

    # 4. Test Selection Algorithm & Category Filtering
    print("\n[TEST 4] Pure Python Secure Selection Algorithm & Category Filters...")
    sample_df = pd.DataFrame([
        {"unique_id": "A", "name": "Alpha", "student_id": "1", "type": "student", "designation": "Student"},
        {"unique_id": "B", "name": "Beta", "student_id": "2", "type": "student", "designation": "Student"},
        {"unique_id": "C", "name": "Prof Gamma", "student_id": "", "type": "faculty", "designation": "Professor"},
        {"unique_id": "D", "name": "Guest Delta", "student_id": "", "type": "guest", "designation": "VIP Guest"},
    ])
    selected_id_all = engine._select_candidate_algorithm(sample_df, category="all")
    assert selected_id_all in ("A", "B", "C", "D")

    selected_id_faculty = engine._select_candidate_algorithm(sample_df, category="faculty")
    assert selected_id_faculty == "C"

    selected_id_guest = engine._select_candidate_algorithm(sample_df, category="guest")
    assert selected_id_guest == "D"

    selected_id_student = engine._select_candidate_algorithm(sample_df, category="student")
    assert selected_id_student in ("A", "B")

    counts = engine.get_category_counts()
    assert "all" in counts and "student" in counts and "faculty" in counts and "guest" in counts
    print(f"  Category counts: {counts}")
    print("[PASS] Selection algorithm & category filtering verified.")

    # 5. Test PDF Generation
    print("\n[TEST 5] PDF Generation matching ReportLab specification...")
    test_pdf_path = Path(__file__).resolve().parent / "test_raffle_output.pdf"
    pdf_path = generate_result_pdf(engine.results, test_pdf_path)
    assert pdf_path.exists()
    assert pdf_path.stat().st_size > 1000
    print(f"  Generated PDF size: {pdf_path.stat().st_size} bytes")
    # Clean up test pdf
    if test_pdf_path.exists():
        test_pdf_path.unlink()
    print("[PASS] PDF generation verified.")

    # 6. Test Corrupt File Recovery
    print("\n[TEST 6] Corrupted JSON Recovery from .bak...")
    temp_json = Path(__file__).resolve().parent / "temp_result.json"
    temp_bak = Path(__file__).resolve().parent / "temp_result.json.bak"

    valid_data = [{"position": 1, "name": "Winner 1", "unique_id": "1", "student_id": "111", "type": "student", "designation": "Student"}]
    atomic_save_json(valid_data, temp_json)
    shutil.copy2(temp_json, temp_bak)

    # Corrupt temp_json
    with open(temp_json, "w", encoding="utf-8") as f:
        f.write("CORRUPTED INVALID JSON {[[")

    recovered_data = load_json_with_recovery(temp_json, temp_bak)
    assert len(recovered_data) == 1
    assert recovered_data[0]["name"] == "Winner 1"

    # Cleanup temp files
    if temp_json.exists(): temp_json.unlink()
    if temp_bak.exists(): temp_bak.unlink()
    print("[PASS] Corrupt recovery verified.")

    print("\n========================================")
    print("ALL BACKEND TESTS PASSED SUCCESSFULLY!")
    print("========================================")

if __name__ == "__main__":
    asyncio.run(test_all_flows())
