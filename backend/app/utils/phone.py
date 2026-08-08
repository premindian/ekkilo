import re


def digits_only(phone: str) -> str:
    return re.sub(r"\D", "", str(phone or ""))


def phone_tail(phone: str, n: int = 10) -> str:
    d = digits_only(phone)
    return d[-n:] if len(d) >= n else d


def normalize_phone(phone: str) -> str:
    """Normalize to WhatsApp Cloud API style: 91XXXXXXXXXX for Indian numbers."""
    d = digits_only(phone)
    if not d:
        return ""
    if len(d) == 10:
        return "91" + d
    if len(d) == 11 and d.startswith("0"):
        return "91" + d[1:]
    return d
