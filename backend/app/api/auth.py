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
    try:
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
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ send-otp failed: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Could not send OTP. Please try again.")
    
    # Send OTP via WhatsApp (track row so Admin → WhatsApp shows success/failure)
    from app.services.whatsapp.send_message import send_message

    otp_body = (
        f"🔐 Your Ekkilo verification code is: {otp}\n\n"
        f"This code expires in 10 minutes."
    )
    msg_row = await db.fetchrow("""
        INSERT INTO whatsapp_messages (phone, message, status)
        VALUES ($1, $2, 'PENDING')
        RETURNING id
    """, phone, otp_body)

    otp_sent = False
    wa_error = None
    try:
        otp_sent = bool(await send_message(phone, otp_body, msg_row["id"]))
        if otp_sent:
            print(f"✅ OTP sent to {phone}")
        else:
            err = await db.fetchval(
                "SELECT last_error FROM whatsapp_messages WHERE id = $1",
                msg_row["id"],
            )
            wa_error = err or "WhatsApp delivery failed"
            print(f"❌ OTP WhatsApp failed for {phone}: {wa_error}")
    except Exception as e:
        wa_error = str(e)
        print(f"❌ Failed to send OTP to {phone}: {e}")
        await db.execute("""
            UPDATE whatsapp_messages
            SET status = 'FAILED', last_error = $2, attempts = attempts + 1
            WHERE id = $1
        """, msg_row["id"], wa_error)

    response = {
        "status": "sent" if otp_sent else "failed",
        "phone": phone,
        "otp_sent": otp_sent,
    }

    # Include OTP in response ONLY in development mode (never in production)
    if DEV_MODE:
        response["otp"] = otp
        print(f"⚠️ DEV MODE: OTP for {phone}: {otp}")

    if not otp_sent:
        # Always include Meta's exact error — guessing (Hi / test list) is often wrong.
        detail = f"WhatsApp did not accept OTP for {phone}."
        if wa_error:
            detail += f" Meta says: {wa_error}"
        else:
            detail += " No error detail from Meta. Check Admin → WhatsApp → FAILED."
        raise HTTPException(status_code=502, detail=detail)

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
# 🆘 BREAK-GLASS ADMIN RECOVERY
# -----------------------------
@router.post("/auth/break-glass")
async def break_glass_admin(data: dict):
    """
    Emergency: promote a trusted phone to admin using BREAK_GLASS_SECRET.
    Set a long random secret in Render env. Does not require an existing admin session.
    Body: { secret, phone, password?, demote_others? }
    """
    expected = (os.getenv("BREAK_GLASS_SECRET") or "").strip()
    if not expected or len(expected) < 16:
        raise HTTPException(
            status_code=503,
            detail="Break-glass is not configured (set BREAK_GLASS_SECRET, min 16 chars)",
        )

    provided = str((data or {}).get("secret") or "")
    try:
        secret_ok = bool(provided) and secrets.compare_digest(provided, expected)
    except (TypeError, ValueError):
        secret_ok = False
    if not secret_ok:
        raise HTTPException(status_code=403, detail="Invalid break-glass secret")

    from app.utils.phone import normalize_phone

    phone = normalize_phone((data or {}).get("phone"))
    if not phone or len(phone) < 10:
        raise HTTPException(status_code=400, detail="Valid phone required")

    password = (data or {}).get("password") or None
    if password is not None and (not isinstance(password, str) or len(password) < 6):
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    demote_others = bool((data or {}).get("demote_others"))

    db = await get_db()
    user = await db.fetchrow("SELECT * FROM users WHERE phone = $1", phone)
    if not user:
        user = await db.fetchrow(
            """
            INSERT INTO users (phone, is_admin)
            VALUES ($1, TRUE)
            RETURNING *
            """,
            phone,
        )
        try:
            await db.execute(
                "INSERT INTO user_preferences (user_id) VALUES ($1) ON CONFLICT DO NOTHING",
                user["id"],
            )
        except Exception:
            pass
    else:
        await db.execute(
            "UPDATE users SET is_admin = TRUE, updated_at = NOW() WHERE id = $1",
            user["id"],
        )
        user = await db.fetchrow("SELECT * FROM users WHERE id = $1", user["id"])

    if password:
        await db.execute(
            "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2",
            hash_password(password),
            user["id"],
        )

    demoted = 0
    if demote_others:
        demoted = await db.fetchval(
            """
            WITH u AS (
              UPDATE users SET is_admin = FALSE, updated_at = NOW()
              WHERE COALESCE(is_admin, FALSE) = TRUE AND id <> $1
              RETURNING 1
            )
            SELECT COUNT(*) FROM u
            """,
            user["id"],
        )

    # Kill all sessions so stolen tokens die immediately
    deleted_sessions = await db.fetchval(
        "WITH d AS (DELETE FROM user_sessions RETURNING 1) SELECT COUNT(*) FROM d"
    )

    try:
        from app.services.staff_audit import log_staff_action

        await log_staff_action(
            actor={"id": user["id"], "phone": phone, "is_admin": True},
            action="admin.break_glass",
            entity_type="user",
            entity_id=user["id"],
            details={
                "demote_others": demote_others,
                "demoted": int(demoted or 0),
                "sessions_cleared": int(deleted_sessions or 0),
                "password_set": bool(password),
            },
            db=db,
        )
    except Exception:
        pass

    return {
        "status": "ok",
        "user_id": user["id"],
        "phone": phone,
        "is_admin": True,
        "demoted_others": int(demoted or 0),
        "sessions_cleared": int(deleted_sessions or 0),
        "message": "Admin restored. Log in with Staff Login (if password set) or OTP.",
    }


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
