import hashlib
import hmac
import io
import time
from datetime import datetime, timedelta, timezone

import qrcode


def generate_token(
    session_id: int,
    secret_key: str,
    ttl_seconds: int = 30,
) -> tuple[str, datetime]:
    """
    Generate an HMAC-SHA256 signed token for a session.
    Token format: HMAC-SHA256(f"{session_id}:{timestamp}", SECRET_KEY)
    Returns (token_string, expires_at_datetime).
    """
    timestamp = time.time()
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
    # Use exact float to ensure uniqueness across rapid generations
    message = f"{session_id}:{timestamp}"
    signature = hmac.new(
        secret_key.encode(),
        message.encode(),
        hashlib.sha256,
    ).hexdigest()
    token = f"{session_id}:{timestamp}:{signature}"
    return token, expires_at





def generate_qr_image(data: str) -> bytes:
    """
    Render a QR code as PNG bytes.
    Uses qrcode library to encode the data string.
    """
    buf = io.BytesIO()
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=4,
    )
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf.read()
