"""Product catalog images — persist in products.image_url (URL or data URL)."""
from __future__ import annotations

import base64
import re
from typing import Optional

from fastapi import HTTPException, UploadFile

# Keep under ~350KB so Postgres TEXT stays practical on Render.
MAX_BYTES = 350_000
ALLOWED_TYPES = {
    "image/jpeg": "jpeg",
    "image/jpg": "jpeg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
}


def _guess_type(filename: Optional[str], content_type: Optional[str]) -> str:
    ct = (content_type or "").split(";")[0].strip().lower()
    if ct in ALLOWED_TYPES:
        return ct
    name = (filename or "").lower()
    if name.endswith((".jpg", ".jpeg")):
        return "image/jpeg"
    if name.endswith(".png"):
        return "image/png"
    if name.endswith(".webp"):
        return "image/webp"
    if name.endswith(".gif"):
        return "image/gif"
    raise HTTPException(status_code=400, detail="Use JPEG, PNG, WebP, or GIF")


def validate_image_url(url: Optional[str]) -> Optional[str]:
    """Normalize pasted URL or data URL; empty clears."""
    if url is None:
        return None
    u = str(url).strip()
    if not u:
        return None
    if u.startswith("data:image/"):
        if len(u) > MAX_BYTES * 2:
            raise HTTPException(status_code=400, detail="Image too large")
        return u
    if re.match(r"^https?://", u, re.I):
        if len(u) > 2000:
            raise HTTPException(status_code=400, detail="URL too long")
        return u
    if u.startswith("/uploads/"):
        return u
    raise HTTPException(status_code=400, detail="Image must be http(s) URL or data URL")


async def file_to_data_url(upload: UploadFile) -> str:
    raw = await upload.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(raw) > MAX_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"Image too large (max {MAX_BYTES // 1000}KB). Compress or paste a URL.",
        )
    mime = _guess_type(upload.filename, upload.content_type)
    b64 = base64.b64encode(raw).decode("ascii")
    return f"data:{mime};base64,{b64}"
