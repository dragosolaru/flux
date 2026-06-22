-- Vehicle document metadata: expiry dates, plate numbers, for RCA/ITP/vignettes
CREATE TABLE IF NOT EXISTS vehicle_doc_meta (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  vehicle_id  uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  plate_number text,
  valid_from  date,
  valid_until date,
  issuer      text,
  amount_ron  numeric(10,2),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vehicle_doc_meta_vehicle_expiry
  ON vehicle_doc_meta (vehicle_id, valid_until);

ALTER TABLE vehicle_doc_meta ENABLE ROW LEVEL SECURITY;
-- No RLS policies needed — accessed exclusively via service role (admin client).
