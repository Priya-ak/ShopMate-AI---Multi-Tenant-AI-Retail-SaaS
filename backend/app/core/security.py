import hashlib
from datetime import datetime, timedelta
from typing import Optional

def hash_password(password: str) -> str:
    """Hash a password using SHA-256 for simple cross-runtime compatibility."""
    return hashlib.sha256(password.encode("utf-8")).hexdigest()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return hash_password(plain_password) == hashed_password
