"""
Ensure the Meta app is subscribed to the WABA so inbound `messages` webhooks fire.

UI checkbox for `messages` alone is not enough — must call:
  POST /{WABA_ID}/subscribed_apps

NOTE: META_WABA_ID is NOT the same as PHONE_NUMBER_ID / META_PHONE_NUMBER_ID.
"""
import os
import httpx

WHATSAPP_TOKEN = os.getenv("META_ACCESS_TOKEN") or os.getenv("WHATSAPP_TOKEN")
PHONE_NUMBER_ID = os.getenv("META_PHONE_NUMBER_ID") or os.getenv("PHONE_NUMBER_ID")
WABA_ID_ENV = (
    os.getenv("META_WABA_ID")
    or os.getenv("WHATSAPP_BUSINESS_ACCOUNT_ID")
    or os.getenv("WABA_ID")
)
GRAPH_VERSION = os.getenv("META_GRAPH_VERSION", "v21.0")


async def _get_waba_id(client: httpx.AsyncClient, token: str) -> tuple[str | None, str]:
    """
    Returns (waba_id, source_note).
    Ignores META_WABA_ID when it was mistakenly set to the Phone Number ID.
    """
    env_waba = (WABA_ID_ENV or "").strip()
    phone_id = (PHONE_NUMBER_ID or "").strip()

    # Common mistake: pasting Phone Number ID into META_WABA_ID
    if env_waba and env_waba != phone_id:
        return env_waba, "env:META_WABA_ID"

    if env_waba and env_waba == phone_id:
        print(
            "⚠️ META_WABA_ID equals PHONE_NUMBER_ID — that is wrong. "
            "Looking up real WhatsApp Business Account ID from Graph API..."
        )

    if not phone_id:
        return None, "missing_phone_number_id"

    # Resolve WABA from phone number id
    url = f"https://graph.facebook.com/{GRAPH_VERSION}/{phone_id}"
    resp = await client.get(
        url,
        params={
            "fields": "id,display_phone_number,verified_name,whatsapp_business_account{id,name}",
            "access_token": token,
        },
    )
    data = resp.json()
    print(f"📞 Phone number lookup: {data}")

    if data.get("error"):
        return None, f"phone_lookup_error:{data['error'].get('message')}"

    waba = data.get("whatsapp_business_account") or {}
    if isinstance(waba, dict) and waba.get("id"):
        return str(waba["id"]), "phone.whatsapp_business_account"

    # Fallback: list WABAs visible to this token
    resp = await client.get(
        f"https://graph.facebook.com/{GRAPH_VERSION}/me/whatsapp_business_accounts",
        params={"access_token": token, "fields": "id,name"},
    )
    listed = resp.json()
    print(f"📒 WABA list: {listed}")
    rows = listed.get("data") or []
    if rows and rows[0].get("id"):
        return str(rows[0]["id"]), "me/whatsapp_business_accounts"

    # Another common path for system users / business tokens
    resp = await client.get(
        f"https://graph.facebook.com/{GRAPH_VERSION}/debug_token",
        params={"input_token": token, "access_token": token},
    )
    dbg = resp.json()
    print(f"🔎 debug_token: {dbg}")

    return None, (
        "Could not resolve WABA. In Meta → WhatsApp → API Setup, copy "
        "**WhatsApp Business Account ID** (different from Phone number ID) "
        "into Render env META_WABA_ID."
    )


async def ensure_waba_subscribed() -> dict:
    """
    Subscribe this app to WABA webhooks. Safe to call repeatedly.
    Returns a status dict for logs / admin UI.
    """
    token = WHATSAPP_TOKEN
    if not token:
        return {"ok": False, "error": "META_ACCESS_TOKEN / WHATSAPP_TOKEN missing"}

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            waba_id, source = await _get_waba_id(client, token)
            if not waba_id:
                return {
                    "ok": False,
                    "error": source,
                    "phone_number_id": PHONE_NUMBER_ID,
                    "hint": (
                        "META_WABA_ID must be WhatsApp Business Account ID, "
                        "NOT Phone number ID. They look similar but are different."
                    ),
                }

            if waba_id == (PHONE_NUMBER_ID or "").strip():
                return {
                    "ok": False,
                    "error": "Resolved ID is still the Phone Number ID, not WABA ID",
                    "phone_number_id": PHONE_NUMBER_ID,
                    "waba_id": waba_id,
                    "source": source,
                }

            get_url = f"https://graph.facebook.com/{GRAPH_VERSION}/{waba_id}/subscribed_apps"

            before = await client.get(get_url, params={"access_token": token})
            before_data = before.json()
            print(f"🔔 WABA subscribed_apps (before): {before_data}")

            post = await client.post(get_url, params={"access_token": token})
            post_data = post.json()
            print(f"🔔 WABA subscribe result: {post.status_code} {post_data}")

            after = await client.get(get_url, params={"access_token": token})
            after_data = after.json()
            print(f"🔔 WABA subscribed_apps (after): {after_data}")

            ok = post.status_code == 200 and "error" not in post_data
            return {
                "ok": ok,
                "waba_id": waba_id,
                "source": source,
                "phone_number_id": PHONE_NUMBER_ID,
                "subscribe_response": post_data,
                "subscribed_apps": after_data.get("data", after_data),
                "error": None if ok else (
                    (post_data.get("error") or {}).get("message")
                    or "Subscribe failed"
                ),
            }
    except Exception as e:
        print(f"❌ ensure_waba_subscribed failed: {e}")
        import traceback
        traceback.print_exc()
        return {"ok": False, "error": str(e)}
