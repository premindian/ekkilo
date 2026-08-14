# Fresh slate — reset DB and rebuild with 2 stores

## What you get

| Piece | Path |
|--------|------|
| Clean + seed script | `backend/scripts/fresh_slate.py` |
| Same clean as SQL | `backend/scripts/fresh_slate.sql` |
| Store A prices sample | `backend/scripts/samples/store_a_inventory.csv` |
| Store B prices sample | `backend/scripts/samples/store_b_inventory.csv` |

**Keeps:** admin users (`is_admin = true`)  
**Deletes:** orders, customers, stores, inventory, catalog products (then re-seeds starter catalog)

---

## Step 0 — Backup (recommended)

In Render → Postgres → **External Database URL**, then:

```powershell
pg_dump "$env:DATABASE_URL" -f ekkilo-backup.sql
```

(or download a backup from the Render dashboard)

---

## Step 1 — Run fresh slate

```powershell
cd E:\BookOfKirana\project\kirana-prod
$env:DATABASE_URL = "postgresql://USER:PASSWORD@HOST/DB"   # paste External URL
pip install asyncpg
python backend/scripts/fresh_slate.py --yes
```

Wait until you see catalog `created …` and counts.

---

## Step 2 — Master product catalog

Already seeded by the script (~70 everyday SKUs).

Optional extras:

1. Open **Admin → Products**
2. **Download starter CSV** or **Load starter catalog** again
3. Or edit CSV in Excel → **Upload CSV**

---

## Step 3 — Create two stores

1. **Admin → Stores → + Add Store**

**Store A example**

- Name: `Kirana A — MVP Colony`
- Phone: your store WhatsApp number (with country code, e.g. `9198xxxxxxxx`)
- Lat / Lng: e.g. Vizag `17.6868` / `83.2185`
- Address: optional

**Store B example**

- Name: `Kirana B — Beach Road`
- Different phone
- Nearby lat/lng (slightly different)

---

## Step 4 — Make store owner logins

1. **Admin → Users**
2. For each store phone (user must exist — they can OTP-login once first, or you create via normal login):
   - Toggle **Store owner**
   - Assign the matching **store**
   - **Set password** (min 6 chars)
3. Store owners log in at `/store` with phone + password

---

## Step 5 — Upload store inventory (Excel / CSV)

1. Log in as Store A → **Products**
2. Download **Sample A CSV** (or open `backend/scripts/samples/store_a_inventory.csv`)
3. Open in Excel → change prices/stock if you want → **Save As → CSV UTF-8**
4. **Upload CSV**
5. Log out → Store B → upload **Sample B CSV**

CSV columns:

```text
name,brand,size,unit,price,stock
```

`name` must match a product in the **admin master catalog**.

---

## Step 6 — Smoke test

1. Customer app → **Shop** (see catalog)
2. **Prices** → search `milk, atta, oil`
3. Compare Store A vs B → checkout (UPI or pay at store)

---

## Notes

- Excel `.xlsx` is not uploaded directly — save as **CSV**.
- If import says unmatched, that product name is missing from Admin catalog — add it there first.
- Re-running `fresh_slate.py` wipes stores/orders again; keep a backup.
