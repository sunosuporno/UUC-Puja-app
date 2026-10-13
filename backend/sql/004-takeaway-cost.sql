-- Additive migration: never changes historical Bookings or Booking Items.
-- Keep legacy total-price columns for compatibility during deployment.
BEGIN;
LOCK TABLE "Food Menu" IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE "Food Menu" ADD COLUMN IF NOT EXISTS "Takeaway Cost" numeric(14,2);
-- Initialize every meal, including Season Pass, with the agreed Rs. 30 fee.
-- Preserve later admin edits when this migration is rerun.
UPDATE "Food Menu" SET "Takeaway Cost" = 30
WHERE "Takeaway Cost" IS NULL;
ALTER TABLE "Food Menu" ALTER COLUMN "Takeaway Cost" SET DEFAULT 30;
ALTER TABLE "Food Menu" ALTER COLUMN "Takeaway Cost" SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"Food Menu"'::regclass AND conname = 'food_menu_takeaway_cost_check') THEN
    ALTER TABLE "Food Menu" ADD CONSTRAINT food_menu_takeaway_cost_check CHECK ("Takeaway Cost" >= 0 AND "Takeaway Cost" <= 100000);
  END IF;
END $$;
COMMIT;
