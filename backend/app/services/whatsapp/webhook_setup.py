"""
Ensure the Meta app is subscribed to the WABA so inbound `messages` webhooks fire.

UI checkbox for `messages` alone is not enough — must call:
  POST /{WABA_ID}/subscribed_apps
"""
import os
import httpx

WHATSAPP_TOKEN = os.getenv("META_ACCESS_TOKEN") or os.getenv("WHATSAPP_TOKEN")
PHONE_NUMBER_ID = os.getenv("META_PHONE_NUMBER_ID") or os.getenv("PHONE_NUMBER_ID")
WABA_ID = (
    os.getenv("META_WABA_ID")
    or os.getenv("WHATSAPP_BUSINESS_ACCOUNT_ID")
    or os.getenv("WABA_ID")
)
GRAPH_VERSION = os.getenv("META_GRAPH_VERSION", "v21.0")


async def _get_waba_id(client: httpx.AsyncClient, token: str) -> str | None:
    if WABA_ID:
        return WABA_ID

    if not PHONE_NUMBER_ID:
        return None

    # Resolve WABA from phone number id
    url = f"https://graph.facebook.com/{GRAPH_VERSION}/{PHONE_NUMBER_ID}"
    resp = await client.get(
        url,
        params={
            "fields": "id,display_phone_number,verified_name,whatsapp_business_account",
            "access_token": token,
        },
    )
    data = resp.json()
    print(f"📞 Phone number lookup: {data}")

    waba = data.get("whatsapp_business_account") or {}
    if isinstance(waba, dict) and waba.get("id"):
        return waba["id"]

    # Fallback: list WABAs visible to this token
    resp = await client.get(
        f"https://graph.facebook.com/{GRAPH_VERSION}/me/whatsapp_business_accounts",
        params={"access_token": token},
    )
    listed = resp.json()
    print(f"📒 WABA list: {listed}")
    rows = listed.get("data") or []
    if rows:
        return rows[0].get("id")
    return None


async def ensure_waba_subscribed() -> dict:
    """
    Subscribe this app to WABA webhooks. Safe to call repeatedly.
    Returns a status dict for logs / admin UI.
    """
    token = WHATSAPP_TOKEN
    if not token:
        return {"ok": False, "error": "META_ACCESS_TOKEN missing"}

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            waba_id = await _get_waba_id(client, token)
            if not waba_id:
                return {
                    "ok": False,
                    "error": "Could not resolve WABA ID. Set META_WABA_ID in Render env.",
                    "phone_number_id": PHONE_NUMBER_ID,
                }

            # Current subscriptions
            get_url = f"https://graph.facebook.com/{GRAPH_VERSION}/{waba_id}/subscribed_apps"
            before = await client.get(get_url, params={"access_token": token})
            before_data = before.json()
            print(f"🔔 WABA subscribed_apps (before): {before_data}")

            # Subscribe
            post = await client.post(
                get_url,
                params={"access_token": token},
            )
            post_data = post.json()
            print(f"🔔 WABA subscribe result: {post.status_code} {post_data}")

            # Also try phone-number level subscribe (supported on some setups)
            phone_result = None
            if PHONE_NUMBER_ID:
                phone_url = (
                    f"https://graph.facebook.com/{GRAPH_VERSION}/"
                    f"{PHONE_NUMBER_ID}/subscribed_apps"
                )
                phone_post = await client.post(
                    phone_url, params={"access_token": token}
                )
                phone_result = phone_post.json()
                print(f"🔔 Phone subscribe result: {phone_post.status_code} {phone_result}")

            after = await client.get(get_url, params={"access_token": token})
            after_data = after.json()
            print(f"🔔 WABA subscribed_apps (after): {after_data}")

            ok = post.status_code == 200 and (
                post_data.get("success") is True or "error" not in post_data
            )
            return {
                "ok": ok,
                "waba_id": waba_id,
                "phone_number_id": PHONE_NUMBER_ID,
                "subscribe_response": post_data,
                "phone_subscribe_response": phone_result,
                "subscribed_apps": after_data.get("data", after_data),
            }
    except Exception as e:
        print(f"❌ ensure_waba_subscribed failed: {e}")
        import traceback
        traceback.print_exc()
        return {"ok": False, "error": str(e)}
