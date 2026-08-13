"""Public QC benchmark compare (sampled estimates, not live prices)."""
from fastapi import APIRouter

from app.services.qc_benchmark import compare_items

router = APIRouter(tags=["qc-benchmarks"])


@router.post("/qc-benchmarks/compare")
async def qc_compare(data: dict):
    """
    Body: { "items": ["milk", "rice"], "city": "Visakhapatnam", "source": "blinkit" }
    source optional — omit to use latest sample for city.
    """
    items = (data or {}).get("items") or []
    if isinstance(items, str):
        items = [x.strip() for x in items.replace("\n", ",").split(",") if x.strip()]
    city = (data or {}).get("city")
    source = (data or {}).get("source")
    return await compare_items(items, city=city, source=source)
