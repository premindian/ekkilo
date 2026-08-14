"""Public catalog browse APIs (categories + products)."""
from fastapi import APIRouter

from app.services.catalog import ensure_catalog_schema, list_categories, list_products

router = APIRouter(prefix="/catalog", tags=["catalog"])


@router.get("/categories")
async def get_categories():
    await ensure_catalog_schema()
    return await list_categories()


@router.get("/products")
async def get_products(
    category: str = None,
    search: str = None,
    limit: int = 60,
    offset: int = 0,
):
    await ensure_catalog_schema()
    items = await list_products(
        category=category, search=search, limit=limit, offset=offset
    )
    return {"items": items, "count": len(items), "offset": offset, "limit": limit}
