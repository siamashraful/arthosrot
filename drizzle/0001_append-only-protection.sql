-- Append-only enforcement for financial history tables (invariant 8).
-- ledger_entries, fills, order_events must never be updated or deleted;
-- corrections are new ADJUSTMENT rows. This trigger enforces it regardless of
-- the connecting role (production additionally drops UPDATE/DELETE grants).

CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is forbidden (invariant 8; corrections are new ADJUSTMENT rows)',
    TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'raise_exception';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entries_append_only
  BEFORE UPDATE OR DELETE ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER fills_append_only
  BEFORE UPDATE OR DELETE ON "fills"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER order_events_append_only
  BEFORE UPDATE OR DELETE ON "order_events"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
