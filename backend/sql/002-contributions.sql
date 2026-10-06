CREATE TABLE IF NOT EXISTS "Contributions" (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id text NOT NULL UNIQUE,
  request_hash text NOT NULL,
  contributor_type text NOT NULL CHECK (contributor_type IN ('Apartment', 'Corporate')),
  tower text,
  apartment text,
  corporate_name text,
  contribution_type text NOT NULL CHECK (contribution_type IN ('Donation', 'Sponsorship')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  paid_date date NOT NULL,
  event_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (contributor_type = 'Apartment' AND tower IS NOT NULL AND apartment IS NOT NULL AND corporate_name IS NULL)
    OR
    (contributor_type = 'Corporate' AND corporate_name IS NOT NULL AND tower IS NULL AND apartment IS NULL)
  )
);
