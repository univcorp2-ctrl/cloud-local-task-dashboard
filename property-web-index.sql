CREATE INDEX IF NOT EXISTS idx_prop_web_first_seen ON properties(first_seen DESC,property_id) WHERE status='active' AND price_man>0;
