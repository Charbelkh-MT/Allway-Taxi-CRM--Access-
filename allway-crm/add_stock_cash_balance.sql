-- Run this once in your Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Adds the StockCashBalance column that tracks the "cash side" of total stock value.
-- This value comes from Access's tblStockCash and represents accumulated business
-- cash flow (increases by selling price on each sale, decreases by cost on each purchase).
-- Combined with physical stock cost it gives the ~$24,000 total stock value.

ALTER TABLE "tblInformation"
  ADD COLUMN IF NOT EXISTS "StockCashBalance" numeric DEFAULT 7339.33;

UPDATE "tblInformation"
  SET "StockCashBalance" = 7339.33
  WHERE "ID" = 1;
