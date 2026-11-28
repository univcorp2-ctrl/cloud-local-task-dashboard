CREATE TABLE IF NOT EXISTS property_analysis_snapshots (
 analysis_id TEXT PRIMARY KEY,
 canonical_id TEXT NOT NULL,
 property_id TEXT NOT NULL,
 source_row_hash TEXT NOT NULL,
 analysis_date TEXT NOT NULL,
 price_man REAL NOT NULL CHECK(price_man>0),
 rent_estimate_yen INTEGER CHECK(rent_estimate_yen>0),
 rent_reference_low_yen INTEGER,
 rent_reference_high_yen INTEGER,
 rent_method TEXT NOT NULL,
 market_yield_asking_low_pct REAL,
 market_yield_asking_high_pct REAL,
 market_yield_area_proxy_pct REAL,
 market_yield_closed_pct REAL,
 land_area_m2 REAL,
 land_closed_unit_yen_m2 REAL,
 land_asking_unit_yen_m2 REAL,
 land_value_man REAL,
 assumptions_json TEXT NOT NULL CHECK(json_valid(assumptions_json)),
 evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json)),
 scenarios_json TEXT NOT NULL CHECK(json_valid(scenarios_json)),
 verification_status TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_property_analysis_canonical_date ON property_analysis_snapshots(canonical_id,analysis_date DESC,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_property_analysis_property ON property_analysis_snapshots(property_id,analysis_date DESC);

