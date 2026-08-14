# Admin recovery (break-glass)

## Setup (once)

1. Generate a long secret (32+ chars), e.g. password manager.
2. Render → your web service → **Environment** → add:
   - `BREAK_GLASS_SECRET` = that secret
3. Redeploy.

## If admin is compromised

```powershell
# Promote YOUR phone, demote other admins, clear all sessions
curl -X POST https://ekkilo.onrender.com/api/auth/break-glass `
  -H "Content-Type: application/json" `
  -d "{\"secret\":\"YOUR_BREAK_GLASS_SECRET\",\"phone\":\"98XXXXXXXX\",\"password\":\"NewStaffPass123\",\"demote_others\":true}"
```

Then **Staff Login** with that phone + password (or OTP).

## From Admin UI (when you still have access)

**Admin → Dashboard → Security → Revoke all other sessions**

## Rules built into the app

- Cannot remove or block the **last** admin
- Demoting an admin kills their sessions
- Break-glass clears **all** sessions
