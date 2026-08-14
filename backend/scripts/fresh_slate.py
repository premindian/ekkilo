#!/usr/bin/env python3
"""
Fresh slate for Ekkilo Postgres.

1) Wipes orders / stores / inventory / non-admin users / catalog
2) Seeds the built-in starter product catalog

Usage:

  # PowerShell
  $env:DATABASE_URL = "postgresql://USER:PASS@HOST/DB"
  python backend/scripts/fresh_slate.py --yes

Requires: pip install asyncpg
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

try:
    import asyncpg
except ImportError:
    print("Install asyncpg first:  pip install asyncpg")
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"

OPTIONAL_TRUNCATE = [
    "order_items",
    "store_order_events",
    "final_order_events",
    "store_orders",
    "final_orders",
    "refund_requests",
    "grocery_list_items",
    "grocery_lists",
    "user_favorite_stores",
    "store_products",
    "store_settings",
    "store_owner_details",
    "staff_audit_events",
    "otp_verifications",
    "staff_login_challenges",
    "user_sessions",
    "whatsapp_messages",
    "abuse_events",
    "no_show_events",
    "customer_trust",
    "qc_benchmark_prices",
    "qc_benchmark_runs",
]


def _normalize_dsn(url: str) -> str:
    url = (url or "").strip()
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    return url


async def table_exists(conn, name: str) -> bool:
    return bool(
        await conn.fetchval(
            """
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = $1
            """,
            name,
        )
    )


async def cleanup(conn) -> None:
    await conn.execute(
        """
        UPDATE users
        SET is_store_owner = FALSE, store_id = NULL
        WHERE COALESCE(is_admin, FALSE) = FALSE
        """
    )
    await conn.execute(
        """
        UPDATE users SET store_id = NULL
        WHERE COALESCE(is_admin, FALSE) = TRUE
        """
    )

    for t in OPTIONAL_TRUNCATE:
        if await table_exists(conn, t):
            await conn.execute(f'TRUNCATE TABLE "{t}" RESTART IDENTITY CASCADE')
            print(f"   truncated {t}")

    if await table_exists(conn, "stores"):
        await conn.execute("DELETE FROM stores")
        print("   deleted stores")

    if await table_exists(conn, "products"):
        await conn.execute("DELETE FROM products")
        print("   deleted products")

    if await table_exists(conn, "user_preferences"):
        await conn.execute(
            """
            DELETE FROM user_preferences
            WHERE user_id NOT IN (
              SELECT id FROM users WHERE COALESCE(is_admin, FALSE) = TRUE
            )
            """
        )

    await conn.execute(
        """
        DELETE FROM users
        WHERE COALESCE(is_admin, FALSE) = FALSE
        """
    )
    print("   kept admin users only")


async def print_counts(conn) -> None:
    rows = await conn.fetch(
        """
        SELECT 'users' AS entity, COUNT(*)::text AS c FROM users
        UNION ALL SELECT 'admins', COUNT(*)::text FROM users WHERE is_admin = TRUE
        UNION ALL SELECT 'stores', COUNT(*)::text FROM stores
        UNION ALL SELECT 'products', COUNT(*)::text FROM products
        UNION ALL SELECT 'store_products', COUNT(*)::text FROM store_products
        """
    )
    for r in rows:
        print(f"   {r['entity']}: {r['c']}")


async def seed_catalog(dsn: str) -> dict:
    sys.path.insert(0, str(BACKEND))
    os.environ["DATABASE_URL"] = dsn
    from app.db.database import get_db
    from app.services.catalog import ensure_catalog_schema
    from app.services.product_import import seed_starter_catalog

    db = await get_db()
    await ensure_catalog_schema(db)
    return await seed_starter_catalog(db)


async def run(yes: bool) -> None:
    dsn = _normalize_dsn(os.getenv("DATABASE_URL") or "")
    if not dsn:
        print("ERROR: Set DATABASE_URL first.")
        print('  PowerShell:  $env:DATABASE_URL = "postgresql://..."')
        print("  Render → Postgres → External Database URL")
        sys.exit(1)

    print("=" * 60)
    print("Ekkilo FRESH SLATE")
    print("=" * 60)
    print("DELETE: orders, refunds, lists, sessions, stores, inventory,")
    print("        catalog products, non-admin users, audit/WhatsApp logs")
    print("KEEP:   admin users (is_admin = true)")
    print("=" * 60)

    if not yes:
        ans = input("Type YES to continue: ").strip()
        if ans != "YES":
            print("Aborted.")
            sys.exit(0)

    conn = await asyncpg.connect(dsn)
    try:
        print("\n1/2 Cleaning database…")
        async with conn.transaction():
            await cleanup(conn)
        print("Counts after clean:")
        await print_counts(conn)
    finally:
        await conn.close()

    print("\n2/2 Seeding starter product catalog…")
    result = await seed_catalog(dsn)
    print(
        f"   created {result.get('created', 0)}, "
        f"skipped {result.get('skipped', 0)}, "
        f"failed {result.get('failed_count', 0)}"
    )

    conn = await asyncpg.connect(dsn)
    try:
        print("Counts after seed:")
        await print_counts(conn)
    finally:
        await conn.close()

    print(
        """
Done.

Next UI steps:
  1. Login as admin → /admin
  2. Stores → Add two stores (need lat/lng, e.g. Vizag 17.6868, 83.2185)
  3. Users → for each store phone: Store Owner + link store + set password
  4. Login as each store → /store → Products → Upload inventory CSV
     Samples:
       backend/scripts/samples/store_a_inventory.csv
       backend/scripts/samples/store_b_inventory.csv
  5. Test Shop + Prices (search: milk, atta, oil)

Excel tip: open CSV in Excel → edit prices → Save As → CSV UTF-8 → upload.
"""
    )


def main() -> None:
    p = argparse.ArgumentParser(description="Wipe Ekkilo DB and seed starter catalog")
    p.add_argument("--yes", action="store_true", help="Skip confirmation prompt")
    args = p.parse_args()
    asyncio.run(run(yes=args.yes))


if __name__ == "__main__":
    main()
