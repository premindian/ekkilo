from fastapi import APIRouter, HTTPException, Depends
from app.db.database import get_db
import random
import secrets
from datetime import datetime, timedelta

router = APIRouter()


# -----------------------------
# 📱 SEND OTP
# -----------------------------
@router.post("/auth/send-otp")
async def send_otp(data: dict):
    """Send OTP to user's phone number"""
    phone = data.get("phone")
    
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number required")
    
    # Normalize phone number
    if not phone.startswith("91"):
        phone = "91" + phone
    
    db = await get_db()
    
    # Generate 6-digit OTP
    otp = str(random.randint(100000, 999999))
    
    # Store OTP (expires in 10 minutes)
    expires_at = datetime.now() + timedelta(minutes=10)
    
    await db.execute("""
        INSERT INTO otp_verifications (phone, otp, expires_at)
        VALUES ($1, $2, $3)
    """, phone, otp, expires_at)
    
    # TODO: Send OTP via SMS/WhatsApp
    # For now, we'll just return it in development
    print(f"🔐 OTP for {phone}: {otp}")
    
    # In production, send via SMS API
    # from app.services.whatsapp import send_message
    # await send_message(phone, f"Your Ekkilo OTP is: {otp}")
    
    return {
        "status": "sent",
        "phone": phone,
        "otp": otp  # Remove this in production!
    }


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
    
    # Normalize phone
    if not phone.startswith("91"):
        phone = "91" + phone
    
    db = await get_db()
    
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
    
    # Create session token
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now() + timedelta(days=30)
    
    await db.execute("""
        INSERT INTO user_sessions (user_id, token, expires_at)
        VALUES ($1, $2, $3)
    """, user["id"], token, expires_at)
    
    return {
        "status": "success",
        "token": token,
        "user": {
            "id": user["id"],
            "phone": user["phone"],
            "name": user["name"]
        }
    }


# -----------------------------
# 👤 GET CURRENT USER
# -----------------------------
async def get_current_user(token: str, db=None):
    """Get user from session token"""
    if not db:
        db = await get_db()
    
    session = await db.fetchrow("""
        SELECT us.*, u.* 
        FROM user_sessions us
        JOIN users u ON us.user_id = u.id
        WHERE us.token = $1 AND us.expires_at > NOW()
    """, token)
    
    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    return {
        "id": session["user_id"],
        "phone": session["phone"],
        "name": session["name"],
        "email": session["email"]
    }


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
