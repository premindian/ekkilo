from fastapi import APIRouter, HTTPException, Depends
from app.db.database import get_db
import random
import secrets
import os
import hashlib
from datetime import datetime, timedelta

router = APIRouter()

# Development mode - set to False in production
DEV_MODE = os.getenv("DEV_MODE", "false").lower() == "true"


def hash_password(password: str, salt: str = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), 120000
    ).hex()
    return f"{salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    if not stored or "$" not in stored:
        return False
    salt, _ = stored.split("$", 1)
    return hash_password(password, salt) == stored


def _user_payload(user) -> dict:
    return {
        "id": user["id"],
        "phone": user["phone"],
        "name": user["name"],
        "is_admin": bool(user.get("is_admin")),
        "is_store_owner": bool(user.get("is_store_owner")),
        "store_id": user.get("store_id"),
        "has_password": bool(user.get("password_hash")),
    }


async def _create_session(db, user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now() + timedelta(days=30)
    await db.execute("""
        INSERT INTO user_sessions (user_id, token, expires_at)
        VALUES ($1, $2, $3)
    """, user_id, token, expires_at)
    return token


# -----------------------------
# 📱 SEND OTP
# -----------------------------
@router.post("/auth/send-otp")
async def send_otp(data: dict):
    """Send OTP to user's phone number"""
    phone = data.get("phone")
    
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number required")
    
    from app.utils.phone import normalize_phone
    from app.services.abuse import assert_otp_rate_limit, assert_phone_not_blocked

    phone = normalize_phone(phone)
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number required")
    
    db = await get_db()
    await assert_phone_not_blocked(phone, db=db)
    await assert_otp_rate_limit(phone, db=db)
    
    # Generate 6-digit OTP
    otp = str(random.randint(100000, 999999))
    
    # Store OTP (expires in 10 minutes)
    expires_at = datetime.now() + timedelta(minutes=10)
    
    await db.execute("""
        INSERT INTO otp_verifications (phone, otp, expires_at)
        VALUES ($1, $2, $3)
    """, phone, otp, expires_at)
    
    # Send OTP via WhatsApp
    from app.services.whatsapp.send_message import send_message
    
    otp_sent = False
    try:
        await send_message(phone, f"🔐 Your Ekkilo verification code is: {otp}\n\nThis code expires in 10 minutes.")
        print(f"✅ OTP sent to {phone}: {otp}")
        otp_sent = True
    except Exception as e:
        print(f"❌ Failed to send OTP to {phone}: {e}")
        print(f"📝 OTP for manual testing: {otp}")
        # Still allow registration to proceed even if SMS fails
    
    response = {
        "status": "sent" if otp_sent else "queued",
        "phone": phone,
        "otp_sent": otp_sent
    }
    
    # Include OTP in response ONLY in development mode (never in production)
    if DEV_MODE:
        response["otp"] = otp
        print("⚠️ DEV MODE: OTP included in response")
    elif not otp_sent:
        # Don't leak OTP — tell client to retry / check WhatsApp later
        response["message"] = "OTP generated. If you don't receive WhatsApp, try again in a minute."
    
    return response


# -----------------------------
# ✅ VERIFY OTP & LOGIN
# -----------------------------
@router.post("/auth/verify-otp")
async def verify_otp(data: dict):
    """Verify OTP and create/login user"""
    phone = data.get("phone")
    otp = data.get("otp")
    
    if not phone or not otp:
        raise HTTPException(status_code=400, detail="Phone and OTP required")
    
    from app.utils.phone import normalize_phone
    from app.services.abuse import assert_phone_not_blocked

    phone = normalize_phone(phone)
    db = await get_db()
    await assert_phone_not_blocked(phone, db=db)
    
    # Verify OTP
    otp_record = await db.fetchrow("""
        SELECT * FROM otp_verifications
        WHERE phone = $1 AND otp = $2 AND expires_at > NOW() AND verified = FALSE
        ORDER BY created_at DESC
        LIMIT 1
    """, phone, otp)
    
    if not otp_record:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")
    
    # Mark OTP as verified
    await db.execute("""
        UPDATE otp_verifications
        SET verified = TRUE
        WHERE id = $1
    """, otp_record["id"])
    
    # Get or create user
    user = await db.fetchrow("""
        SELECT * FROM users WHERE phone = $1
    """, phone)
    
    if not user:
        # Create new user
        user = await db.fetchrow("""
            INSERT INTO users (phone)
            VALUES ($1)
            RETURNING *
        """, phone)
        
        # Create default grocery list
        list_record = await db.fetchrow("""
            INSERT INTO grocery_lists (user_id, name, is_default)
            VALUES ($1, 'My Monthly List', TRUE)
            RETURNING id
        """, user["id"])
        
        # Create default preferences
        await db.execute("""
            INSERT INTO user_preferences (user_id)
            VALUES ($1)
        """, user["id"])
    
    token = await _create_session(db, user["id"])
    
    return {
        "status": "success",
        "token": token,
        "user": _user_payload(user)
    }


# -----------------------------
# 🔑 STAFF PASSWORD LOGIN (admin / store owner)
# -----------------------------
@router.post("/auth/staff-login")
async def staff_login(data: dict):
    """Password login for staff (admin or store owner)"""
    phone = data.get("phone")
    password = data.get("password")

    if not phone or not password:
        raise HTTPException(status_code=400, detail="Phone and password required")

    if not phone.startswith("91"):
        phone = "91" + phone

    db = await get_db()
    user = await db.fetchrow("SELECT * FROM users WHERE phone = $1", phone)

    if not user or not user.get("password_hash"):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not (user.get("is_admin") or user.get("is_store_owner")):
        raise HTTPException(status_code=403, detail="Staff access only. Use OTP login.")

    if not verify_password(password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = await _create_session(db, user["id"])
    return {
        "status": "success",
        "token": token,
        "user": _user_payload(user),
    }


# -----------------------------
# 🔑 SET / CHANGE OWN PASSWORD
# -----------------------------
@router.post("/auth/set-password")
async def set_password(data: dict, token: str):
    """Set password for current user (staff self-service)"""
    db = await get_db()
    user = await get_current_user(token, db)
    password = data.get("password")

    if not password or len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    # Only staff can set passwords
    row = await db.fetchrow(
        "SELECT is_admin, is_store_owner FROM users WHERE id = $1", user["id"]
    )
    if not row or not (row["is_admin"] or row["is_store_owner"]):
        raise HTTPException(status_code=403, detail="Only staff can set passwords")

    await db.execute("""
        UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2
    """, hash_password(password), user["id"])

    return {"status": "password_set"}


# -----------------------------
# 👤 GET CURRENT USER
# -----------------------------
async def get_current_user(token: str, db=None):
    """Get user from session token"""
    if not db:
        db = await get_db()
    
    row = await db.fetchrow("""
        SELECT u.*
        FROM user_sessions us
        JOIN users u ON us.user_id = u.id
        WHERE us.token = $1 AND us.expires_at > NOW()
    """, token)
    
    if not row:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    return _user_payload(row)


@router.get("/auth/me")
async def auth_me(token: str):
    """Validate session and return current user (used on app startup)."""
    db = await get_db()
    return await get_current_user(token, db)


# -----------------------------
# 👤 UPDATE PROFILE
# -----------------------------
@router.patch("/auth/profile")
async def update_profile(data: dict, token: str):
    """Update user profile"""
    db = await get_db()
    user = await get_current_user(token, db)
    
    name = data.get("name")
    email = data.get("email")
    
    await db.execute("""
        UPDATE users
        SET name = COALESCE($1, name),
            email = COALESCE($2, email),
            updated_at = NOW()
        WHERE id = $3
    """, name, email, user["id"])
    
    return {"status": "updated"}


# -----------------------------
# 🚪 LOGOUT
# -----------------------------
@router.post("/auth/logout")
async def logout(token: str):
    """Logout user by invalidating token"""
    db = await get_db()
    
    await db.execute("""
        DELETE FROM user_sessions WHERE token = $1
    """, token)
    
    return {"status": "logged_out"}
