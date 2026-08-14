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

## Sensitive: Make / remove admin

From **Admin → Users**, promoting or demoting admin now requires:

1. **Your** staff password (set one on your account first)
2. Typing the target user’s **phone**
3. Typing exactly `MAKE ADMIN` or `REMOVE ADMIN`

Plain “Make Admin” one-click is disabled on the API.

## Rules built into the app

- Cannot remove or block the **last** admin
- Demoting an admin kills their sessions
- Break-glass clears **all** sessions
