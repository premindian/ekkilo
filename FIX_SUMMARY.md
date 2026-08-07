# Product Visibility Bug Fix

## Problem
Products were not showing up consistently in search results across all stores, even when available.

## Root Causes Identified

### 1. **Stores Without GPS Coordinates Were Completely Filtered Out**
- **Location**: `backend/app/api/routes.py` lines 329-330, 348-350
- **Impact**: Stores without lat/lng coordinates were excluded from ALL searches
- **Fix**: Changed to include stores without coordinates, just without distance calculation

### 2. **Out-of-Stock Products Were Effectively Hidden**
- **Location**: `backend/app/agents/pricing.py` line 77
- **Impact**: Products with stock=0 got a penalty of ₹100,000, making them invisible
- **Fix**: Reduced penalty to ₹500 to push them down but keep visible

### 3. **Product Matching Was Too Strict**
- **Location**: `backend/app/agents/matcher.py`
- **Impact**: When `search_products` function failed, no fallback existed
- **Fix**: Added three-tier fallback matching:
  1. Exact match
  2. Partial match (LIKE)
  3. Reverse match (product name in search query)

### 4. **Missing search_products Function**
- **Location**: Database
- **Impact**: Fuzzy matching wasn't working properly
- **Fix**: Created migration `004_improve_product_matching.sql` with proper fuzzy search

## Changes Made

### Backend Changes

#### 1. `backend/app/api/routes.py`
- ✅ Removed strict lat/lng filtering for stores
- ✅ Added CASE statement to calculate distance only when coordinates exist
- ✅ Added `available` flag to item response

#### 2. `backend/app/agents/pricing.py`
- ✅ Reduced out-of-stock penalty from ₹100,000 to ₹500
- ✅ Added detailed logging for each product option
- ✅ Shows stock status with emoji indicators

#### 3. `backend/app/agents/matcher.py`
- ✅ Added `_fallback_match()` method with three-tier matching
- ✅ Improved error handling with graceful degradation
- ✅ Better logging for debugging match issues

#### 4. `backend/migrations/004_improve_product_matching.sql`
- ✅ Created/improved `search_products()` function with pg_trgm
- ✅ Created `product_aliases` table for alternative names
- ✅ Added proper indexes for fast fuzzy matching

### Frontend Changes

#### 1. `frontend/src/pages/OrderPage.jsx`
- ✅ Added "⚠️ Limited" indicator for out-of-stock items
- ✅ Visual feedback when items have reduced availability

## Testing Checklist

Run these queries in pgAdmin4 to verify the fixes:

```sql
-- 1. Verify all stores are now included
SELECT name, 
       CASE WHEN lat IS NULL OR lng IS NULL THEN '❌ NO COORDS' ELSE '✅ HAS COORDS' END
FROM stores;

-- 2. Test product search
SELECT * FROM search_products('milk');

-- 3. Check all product options
SELECT 
    pr.name as product,
    s.name as store,
    sp.stock,
    sp.price
FROM products pr
JOIN store_products sp ON pr.id = sp.product_id
JOIN stores s ON sp.store_id = s.id
ORDER BY pr.name, s.name;
```

## Deployment Steps

1. ✅ Run migration: `004_improve_product_matching.sql` in pgAdmin4
2. ✅ Commit changes to git
3. ✅ Push to GitHub main branch
4. ✅ Deploy backend to Render
5. ✅ Test in production

## Expected Behavior After Fix

1. **All stores appear** in results, even without GPS coordinates
2. **Out-of-stock items** appear at bottom with "⚠️ Limited" indicator
3. **Product matching** is more flexible (handles typos, partial matches)
4. **Better logging** helps debug future issues

## Monitoring

Check Render logs for these indicators:
- `🔍 'milk': Found X options across stores` - Shows product coverage
- `✅ Store Name:` vs `❌ Store Name:` - Shows stock status
- `✓ Matched 'user_query' → 'product_name'` - Shows match quality
