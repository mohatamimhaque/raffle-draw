import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

def test_imports():
    print("Testing backend imports...")
    import config
    import models
    import persistence
    import auth
    import websocket_manager
    import raffle_engine
    import main
    print("✓ All backend modules imported successfully!")

def test_engine_initialization():
    print("Testing RaffleEngine initialization...")
    import raffle_engine
    engine = raffle_engine.RaffleEngine()
    state = engine.get_state_dict()
    print(f"✓ Initialized! State: {state['state']}, Pos: {state['current_position']}/{state['total_winners']}")
    print(f"✓ Eligible count: {state['eligible_count']}, Winners: {state['winner_count']}, Ineligible: {state['ineligible_count']}")
    assert state['current_position'] >= 1, f"Invalid position: {state['current_position']}"
    assert state['winner_count'] >= 0, f"Invalid winner count: {state['winner_count']}"
    assert state['ineligible_count'] >= 0, f"Invalid ineligible count: {state['ineligible_count']}"
    print("✓ Engine tests passed!")

if __name__ == "__main__":
    test_imports()
    test_engine_initialization()
