
CREATE TABLE IF NOT EXISTS property_observation_events (
 operation_id TEXT PRIMARY KEY, record_id TEXT NOT NULL, expected_hash TEXT NOT NULL, request_hash TEXT NOT NULL,
 result_hash TEXT NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)), observed_at TEXT NOT NULL,
 observed_day TEXT NOT NULL, created_day TEXT NOT NULL, agent TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_prop_observation_record ON property_observation_events(record_id,created_at);
CREATE TRIGGER IF NOT EXISTS property_observation_guard BEFORE INSERT ON property_observation_events
WHEN NOT EXISTS(SELECT 1 FROM property_observation_events WHERE operation_id=NEW.operation_id)
BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM properties WHERE property_id=NEW.record_id AND source<>'ai_observation') THEN RAISE(ABORT,'protected_source') END;
 SELECT CASE WHEN COALESCE((SELECT row_hash FROM properties WHERE property_id=NEW.record_id),'')<>NEW.expected_hash THEN RAISE(ABORT,'revision_conflict') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM properties WHERE property_id=NEW.record_id AND source_url IS NOT json_extract(NEW.payload,'$.fields.source_url')) THEN RAISE(ABORT,'identity_change') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM property_observation_events WHERE record_id=NEW.record_id AND observed_at>NEW.observed_at) THEN RAISE(ABORT,'stale_observation') END;
END;
CREATE TRIGGER IF NOT EXISTS property_observation_materialize AFTER INSERT ON property_observation_events BEGIN
 INSERT INTO properties(property_id,source,first_seen,last_seen,row_hash,raw_json,name,address,pref,city,town,station,line,walk_min,genre,price_man,gross_yield,rent_year_man,structure,built_year,land_m2,building_m2,units,road_width_m,road_type,frontage_m,rebuild_ok,hazard,listed_date,status,source_url)
 VALUES(NEW.record_id,'ai_observation',NEW.created_day,NEW.observed_day,NEW.result_hash,NEW.payload,json_extract(NEW.payload,'$.fields.name'),json_extract(NEW.payload,'$.fields.address'),json_extract(NEW.payload,'$.fields.pref'),json_extract(NEW.payload,'$.fields.city'),json_extract(NEW.payload,'$.fields.town'),json_extract(NEW.payload,'$.fields.station'),json_extract(NEW.payload,'$.fields.line'),json_extract(NEW.payload,'$.fields.walk_min'),json_extract(NEW.payload,'$.fields.genre'),json_extract(NEW.payload,'$.fields.price_man'),json_extract(NEW.payload,'$.fields.gross_yield'),json_extract(NEW.payload,'$.fields.rent_year_man'),json_extract(NEW.payload,'$.fields.structure'),json_extract(NEW.payload,'$.fields.built_year'),json_extract(NEW.payload,'$.fields.land_m2'),json_extract(NEW.payload,'$.fields.building_m2'),json_extract(NEW.payload,'$.fields.units'),json_extract(NEW.payload,'$.fields.road_width_m'),json_extract(NEW.payload,'$.fields.road_type'),json_extract(NEW.payload,'$.fields.frontage_m'),json_extract(NEW.payload,'$.fields.rebuild_ok'),json_extract(NEW.payload,'$.fields.hazard'),json_extract(NEW.payload,'$.fields.listed_date'),json_extract(NEW.payload,'$.fields.status'),json_extract(NEW.payload,'$.fields.source_url'))
 ON CONFLICT(property_id) DO UPDATE SET last_seen=excluded.last_seen,row_hash=excluded.row_hash,raw_json=excluded.raw_json,name=excluded.name,address=excluded.address,pref=excluded.pref,city=excluded.city,town=excluded.town,station=excluded.station,line=excluded.line,walk_min=excluded.walk_min,genre=excluded.genre,price_man=excluded.price_man,gross_yield=excluded.gross_yield,rent_year_man=excluded.rent_year_man,structure=excluded.structure,built_year=excluded.built_year,land_m2=excluded.land_m2,building_m2=excluded.building_m2,units=excluded.units,road_width_m=excluded.road_width_m,road_type=excluded.road_type,frontage_m=excluded.frontage_m,rebuild_ok=excluded.rebuild_ok,hazard=excluded.hazard,listed_date=excluded.listed_date,status=excluded.status,source_url=excluded.source_url;
END;
CREATE TABLE IF NOT EXISTS property_favorites (
 favorite_key TEXT PRIMARY KEY, source_id TEXT NOT NULL, source TEXT NOT NULL, label TEXT NOT NULL, selected INTEGER NOT NULL CHECK(selected IN(0,1)),
 revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_prop_favorites_selected ON property_favorites(selected,updated_at DESC);
