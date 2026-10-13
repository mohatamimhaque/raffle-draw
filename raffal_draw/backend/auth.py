import hmac
import hashlib
import base64
import json
import time
from typing import Optional, Dict, Any
from fastapi import HTTPException, Security, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from config import CONTROLLER_USERNAME, CONTROLLER_PASSWORD, SECRET_KEY

security_scheme = HTTPBearer(auto_error=False)

def create_access_token(username: str, expires_in_seconds: int = 86400) -> str:
    """Create a tamper-proof HMAC-SHA256 signed bearer token."""
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": username,
        "role": "controller",
        "exp": int(time.time()) + expires_in_seconds,
        "iat": int(time.time())
    }

    encoded_header = base64.urlsafe_b64encode(json.dumps(header).encode()).decode().rstrip("=")
    encoded_payload = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")

    message = f"{encoded_header}.{encoded_payload}".encode()
    signature = hmac.new(SECRET_KEY.encode(), message, hashlib.sha256).digest()
    encoded_signature = base64.urlsafe_b64encode(signature).decode().rstrip("=")

    return f"{encoded_header}.{encoded_payload}.{encoded_signature}"

def verify_token(token: str) -> Dict[str, Any]:
    """Verify the signature and expiration of an access token."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            raise ValueError("Malformed token format.")

        encoded_header, encoded_payload, encoded_signature = parts

        # Re-verify signature
        message = f"{encoded_header}.{encoded_payload}".encode()
        expected_sig = hmac.new(SECRET_KEY.encode(), message, hashlib.sha256).digest()
        actual_sig = base64.urlsafe_b64decode(encoded_signature + "=" * (-len(encoded_signature) % 4))

        if not hmac.compare_digest(expected_sig, actual_sig):
            raise ValueError("Invalid signature.")

        # Decode payload
        payload_bytes = base64.urlsafe_b64decode(encoded_payload + "=" * (-len(encoded_payload) % 4))
        payload = json.loads(payload_bytes.decode())

        if payload.get("exp", 0) < time.time():
            raise ValueError("Token has expired.")

        return payload

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Unauthorized: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"}
        )

def authenticate_controller(credentials: Optional[HTTPAuthorizationCredentials] = Security(security_scheme)) -> Dict[str, Any]:
    """FastAPI dependency to protect controller routes."""
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication credentials.",
            headers={"WWW-Authenticate": "Bearer"}
        )
    return verify_token(credentials.credentials)

def verify_credentials(username: str, password: str) -> bool:
    """Validate username and password against server configuration."""
    username_valid = hmac.compare_digest(username.strip(), CONTROLLER_USERNAME.strip())
    password_valid = hmac.compare_digest(password.strip(), CONTROLLER_PASSWORD.strip())
    return username_valid and password_valid
