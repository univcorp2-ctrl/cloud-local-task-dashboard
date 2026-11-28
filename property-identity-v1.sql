
-- Additive identity index. Existing property, score, history and Notion decision rows are untouched.
CREATE INDEX IF NOT EXISTS idx_prop_identity_url ON properties(source_url) WHERE source_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prop_notion_page_key ON properties(substr(lower(replace(notion_page,'-','')),-32)) WHERE source='notion';
CREATE TABLE IF NOT EXISTS property_listing_groups(url TEXT PRIMARY KEY,n_rows INTEGER NOT NULL,n_sources INTEGER NOT NULL,conflict INTEGER NOT NULL CHECK(conflict IN(0,1)));
CREATE TABLE IF NOT EXISTS property_notion_retired_pages(page_key TEXT PRIMARY KEY,target_page_key TEXT NOT NULL,target_id TEXT NOT NULL,alias_id TEXT,evidence_url TEXT NOT NULL,reason TEXT NOT NULL,verified_at TEXT NOT NULL, CHECK(page_key<>target_page_key));
CREATE INDEX IF NOT EXISTS idx_prop_retired_alias ON property_notion_retired_pages(alias_id);
CREATE INDEX IF NOT EXISTS idx_prop_retired_target ON property_notion_retired_pages(target_id);
INSERT INTO property_listing_groups(url,n_rows,n_sources,conflict)
 SELECT source_url,COUNT(*),COUNT(DISTINCT source),CASE WHEN COUNT(DISTINCT NULLIF(trim(address),''))>1 OR COUNT(DISTINCT NULLIF(trim(pref),''))>1 OR COUNT(DISTINCT NULLIF(trim(city),''))>1 OR COUNT(DISTINCT CASE WHEN land_m2>0 THEN round(land_m2,1) END)>1 OR COUNT(DISTINCT CASE WHEN building_m2>0 THEN round(building_m2,1) END)>1 OR COUNT(DISTINCT CASE WHEN built_year BETWEEN 1800 AND 2030 THEN built_year END)>1 OR COUNT(DISTINCT CASE WHEN units>0 THEN units END)>1 OR (COUNT(DISTINCT price_man)>1 AND COUNT(DISTINCT NULLIF(trim(address),''))=0) THEN 1 ELSE 0 END FROM properties WHERE (source_url IS NOT NULL AND length(source_url) BETWEEN 35 AND 220 AND instr(source_url,'?')=0 AND instr(source_url,'#')=0 AND (
 (substr(source_url,1,39)='https://www.rakumachi.jp/syuuekibukken/' AND instr(source_url,'/dim')>0 AND substr(source_url,-10)='/show.html')
 OR (substr(source_url,1,26)='https://www.kenbiya.com/pp' AND instr(source_url,'/s/')>0 AND instr(source_url,'/re_')>0 AND substr(source_url,-1)='/')
 OR (substr(source_url,1,17)='https://suumo.jp/' AND instr(source_url,'/sc_')>0 AND instr(source_url,'/nc_')>0 AND substr(source_url,-1)='/')
 OR (substr(source_url,1,25)='https://www.athome.co.jp/' AND substr(source_url,-12,1)='/' AND substr(source_url,-1)='/' AND substr(source_url,-11,10) NOT GLOB '*[^0-9]*')
 OR (substr(source_url,1,38)='https://picks-agent.terass.com/search/' AND instr(source_url,'/reins/')>0 AND substr(source_url,instr(source_url,'/reins/')+7)<>'' AND substr(source_url,instr(source_url,'/reins/')+7) NOT GLOB '*[^0-9]*')
 OR (substr(source_url,1,55)='https://estate-board.com/property-publication/received/' AND substr(source_url,56)<>'' AND substr(source_url,56) NOT GLOB '*[^0-9]*'))) GROUP BY source_url HAVING COUNT(*)>1
 ON CONFLICT(url) DO UPDATE SET n_rows=excluded.n_rows,n_sources=excluded.n_sources,conflict=excluded.conflict
 WHERE n_rows IS NOT excluded.n_rows OR n_sources IS NOT excluded.n_sources OR conflict IS NOT excluded.conflict;
CREATE TRIGGER IF NOT EXISTS property_listing_group_insert AFTER INSERT ON properties WHEN (NEW.source_url IS NOT NULL AND length(NEW.source_url) BETWEEN 35 AND 220 AND instr(NEW.source_url,'?')=0 AND instr(NEW.source_url,'#')=0 AND (
 (substr(NEW.source_url,1,39)='https://www.rakumachi.jp/syuuekibukken/' AND instr(NEW.source_url,'/dim')>0 AND substr(NEW.source_url,-10)='/show.html')
 OR (substr(NEW.source_url,1,26)='https://www.kenbiya.com/pp' AND instr(NEW.source_url,'/s/')>0 AND instr(NEW.source_url,'/re_')>0 AND substr(NEW.source_url,-1)='/')
 OR (substr(NEW.source_url,1,17)='https://suumo.jp/' AND instr(NEW.source_url,'/sc_')>0 AND instr(NEW.source_url,'/nc_')>0 AND substr(NEW.source_url,-1)='/')
 OR (substr(NEW.source_url,1,25)='https://www.athome.co.jp/' AND substr(NEW.source_url,-12,1)='/' AND substr(NEW.source_url,-1)='/' AND substr(NEW.source_url,-11,10) NOT GLOB '*[^0-9]*')
 OR (substr(NEW.source_url,1,38)='https://picks-agent.terass.com/search/' AND instr(NEW.source_url,'/reins/')>0 AND substr(NEW.source_url,instr(NEW.source_url,'/reins/')+7)<>'' AND substr(NEW.source_url,instr(NEW.source_url,'/reins/')+7) NOT GLOB '*[^0-9]*')
 OR (substr(NEW.source_url,1,55)='https://estate-board.com/property-publication/received/' AND substr(NEW.source_url,56)<>'' AND substr(NEW.source_url,56) NOT GLOB '*[^0-9]*'))) BEGIN
 DELETE FROM property_listing_groups WHERE url=NEW.source_url AND (SELECT count(*) FROM properties WHERE source_url=NEW.source_url)<2;
 INSERT INTO property_listing_groups(url,n_rows,n_sources,conflict)
 SELECT source_url,COUNT(*),COUNT(DISTINCT source),CASE WHEN COUNT(DISTINCT NULLIF(trim(address),''))>1 OR COUNT(DISTINCT NULLIF(trim(pref),''))>1 OR COUNT(DISTINCT NULLIF(trim(city),''))>1 OR COUNT(DISTINCT CASE WHEN land_m2>0 THEN round(land_m2,1) END)>1 OR COUNT(DISTINCT CASE WHEN building_m2>0 THEN round(building_m2,1) END)>1 OR COUNT(DISTINCT CASE WHEN built_year BETWEEN 1800 AND 2030 THEN built_year END)>1 OR COUNT(DISTINCT CASE WHEN units>0 THEN units END)>1 OR (COUNT(DISTINCT price_man)>1 AND COUNT(DISTINCT NULLIF(trim(address),''))=0) THEN 1 ELSE 0 END FROM properties WHERE (source_url IS NOT NULL AND length(source_url) BETWEEN 35 AND 220 AND instr(source_url,'?')=0 AND instr(source_url,'#')=0 AND (
 (substr(source_url,1,39)='https://www.rakumachi.jp/syuuekibukken/' AND instr(source_url,'/dim')>0 AND substr(source_url,-10)='/show.html')
 OR (substr(source_url,1,26)='https://www.kenbiya.com/pp' AND instr(source_url,'/s/')>0 AND instr(source_url,'/re_')>0 AND substr(source_url,-1)='/')
 OR (substr(source_url,1,17)='https://suumo.jp/' AND instr(source_url,'/sc_')>0 AND instr(source_url,'/nc_')>0 AND substr(source_url,-1)='/')
 OR (substr(source_url,1,25)='https://www.athome.co.jp/' AND substr(source_url,-12,1)='/' AND substr(source_url,-1)='/' AND substr(source_url,-11,10) NOT GLOB '*[^0-9]*')
 OR (substr(source_url,1,38)='https://picks-agent.terass.com/search/' AND instr(source_url,'/reins/')>0 AND substr(source_url,instr(source_url,'/reins/')+7)<>'' AND substr(source_url,instr(source_url,'/reins/')+7) NOT GLOB '*[^0-9]*')
 OR (substr(source_url,1,55)='https://estate-board.com/property-publication/received/' AND substr(source_url,56)<>'' AND substr(source_url,56) NOT GLOB '*[^0-9]*'))) AND source_url=NEW.source_url GROUP BY source_url HAVING COUNT(*)>1
 ON CONFLICT(url) DO UPDATE SET n_rows=excluded.n_rows,n_sources=excluded.n_sources,conflict=excluded.conflict
 WHERE n_rows IS NOT excluded.n_rows OR n_sources IS NOT excluded.n_sources OR conflict IS NOT excluded.conflict;
END;
CREATE TRIGGER IF NOT EXISTS property_listing_group_delete AFTER DELETE ON properties WHEN (OLD.source_url IS NOT NULL AND length(OLD.source_url) BETWEEN 35 AND 220 AND instr(OLD.source_url,'?')=0 AND instr(OLD.source_url,'#')=0 AND (
 (substr(OLD.source_url,1,39)='https://www.rakumachi.jp/syuuekibukken/' AND instr(OLD.source_url,'/dim')>0 AND substr(OLD.source_url,-10)='/show.html')
 OR (substr(OLD.source_url,1,26)='https://www.kenbiya.com/pp' AND instr(OLD.source_url,'/s/')>0 AND instr(OLD.source_url,'/re_')>0 AND substr(OLD.source_url,-1)='/')
 OR (substr(OLD.source_url,1,17)='https://suumo.jp/' AND instr(OLD.source_url,'/sc_')>0 AND instr(OLD.source_url,'/nc_')>0 AND substr(OLD.source_url,-1)='/')
 OR (substr(OLD.source_url,1,25)='https://www.athome.co.jp/' AND substr(OLD.source_url,-12,1)='/' AND substr(OLD.source_url,-1)='/' AND substr(OLD.source_url,-11,10) NOT GLOB '*[^0-9]*')
 OR (substr(OLD.source_url,1,38)='https://picks-agent.terass.com/search/' AND instr(OLD.source_url,'/reins/')>0 AND substr(OLD.source_url,instr(OLD.source_url,'/reins/')+7)<>'' AND substr(OLD.source_url,instr(OLD.source_url,'/reins/')+7) NOT GLOB '*[^0-9]*')
 OR (substr(OLD.source_url,1,55)='https://estate-board.com/property-publication/received/' AND substr(OLD.source_url,56)<>'' AND substr(OLD.source_url,56) NOT GLOB '*[^0-9]*'))) BEGIN
 DELETE FROM property_listing_groups WHERE url=OLD.source_url AND (SELECT count(*) FROM properties WHERE source_url=OLD.source_url)<2;
 INSERT INTO property_listing_groups(url,n_rows,n_sources,conflict)
 SELECT source_url,COUNT(*),COUNT(DISTINCT source),CASE WHEN COUNT(DISTINCT NULLIF(trim(address),''))>1 OR COUNT(DISTINCT NULLIF(trim(pref),''))>1 OR COUNT(DISTINCT NULLIF(trim(city),''))>1 OR COUNT(DISTINCT CASE WHEN land_m2>0 THEN round(land_m2,1) END)>1 OR COUNT(DISTINCT CASE WHEN building_m2>0 THEN round(building_m2,1) END)>1 OR COUNT(DISTINCT CASE WHEN built_year BETWEEN 1800 AND 2030 THEN built_year END)>1 OR COUNT(DISTINCT CASE WHEN units>0 THEN units END)>1 OR (COUNT(DISTINCT price_man)>1 AND COUNT(DISTINCT NULLIF(trim(address),''))=0) THEN 1 ELSE 0 END FROM properties WHERE (source_url IS NOT NULL AND length(source_url) BETWEEN 35 AND 220 AND instr(source_url,'?')=0 AND instr(source_url,'#')=0 AND (
 (substr(source_url,1,39)='https://www.rakumachi.jp/syuuekibukken/' AND instr(source_url,'/dim')>0 AND substr(source_url,-10)='/show.html')
 OR (substr(source_url,1,26)='https://www.kenbiya.com/pp' AND instr(source_url,'/s/')>0 AND instr(source_url,'/re_')>0 AND substr(source_url,-1)='/')
 OR (substr(source_url,1,17)='https://suumo.jp/' AND instr(source_url,'/sc_')>0 AND instr(source_url,'/nc_')>0 AND substr(source_url,-1)='/')
 OR (substr(source_url,1,25)='https://www.athome.co.jp/' AND substr(source_url,-12,1)='/' AND substr(source_url,-1)='/' AND substr(source_url,-11,10) NOT GLOB '*[^0-9]*')
 OR (substr(source_url,1,38)='https://picks-agent.terass.com/search/' AND instr(source_url,'/reins/')>0 AND substr(source_url,instr(source_url,'/reins/')+7)<>'' AND substr(source_url,instr(source_url,'/reins/')+7) NOT GLOB '*[^0-9]*')
 OR (substr(source_url,1,55)='https://estate-board.com/property-publication/received/' AND substr(source_url,56)<>'' AND substr(source_url,56) NOT GLOB '*[^0-9]*'))) AND source_url=OLD.source_url GROUP BY source_url HAVING COUNT(*)>1
 ON CONFLICT(url) DO UPDATE SET n_rows=excluded.n_rows,n_sources=excluded.n_sources,conflict=excluded.conflict
 WHERE n_rows IS NOT excluded.n_rows OR n_sources IS NOT excluded.n_sources OR conflict IS NOT excluded.conflict;
END;
CREATE TRIGGER IF NOT EXISTS property_listing_group_update AFTER UPDATE OF source_url,address,pref,city,land_m2,building_m2,built_year,units,price_man ON properties WHEN (OLD.source_url IS NOT NEW.source_url OR OLD.address IS NOT NEW.address OR OLD.pref IS NOT NEW.pref OR OLD.city IS NOT NEW.city OR OLD.land_m2 IS NOT NEW.land_m2 OR OLD.building_m2 IS NOT NEW.building_m2 OR OLD.built_year IS NOT NEW.built_year OR OLD.units IS NOT NEW.units OR OLD.price_man IS NOT NEW.price_man) AND ((OLD.source_url IS NOT NULL AND length(OLD.source_url) BETWEEN 35 AND 220 AND instr(OLD.source_url,'?')=0 AND instr(OLD.source_url,'#')=0 AND (
 (substr(OLD.source_url,1,39)='https://www.rakumachi.jp/syuuekibukken/' AND instr(OLD.source_url,'/dim')>0 AND substr(OLD.source_url,-10)='/show.html')
 OR (substr(OLD.source_url,1,26)='https://www.kenbiya.com/pp' AND instr(OLD.source_url,'/s/')>0 AND instr(OLD.source_url,'/re_')>0 AND substr(OLD.source_url,-1)='/')
 OR (substr(OLD.source_url,1,17)='https://suumo.jp/' AND instr(OLD.source_url,'/sc_')>0 AND instr(OLD.source_url,'/nc_')>0 AND substr(OLD.source_url,-1)='/')
 OR (substr(OLD.source_url,1,25)='https://www.athome.co.jp/' AND substr(OLD.source_url,-12,1)='/' AND substr(OLD.source_url,-1)='/' AND substr(OLD.source_url,-11,10) NOT GLOB '*[^0-9]*')
 OR (substr(OLD.source_url,1,38)='https://picks-agent.terass.com/search/' AND instr(OLD.source_url,'/reins/')>0 AND substr(OLD.source_url,instr(OLD.source_url,'/reins/')+7)<>'' AND substr(OLD.source_url,instr(OLD.source_url,'/reins/')+7) NOT GLOB '*[^0-9]*')
 OR (substr(OLD.source_url,1,55)='https://estate-board.com/property-publication/received/' AND substr(OLD.source_url,56)<>'' AND substr(OLD.source_url,56) NOT GLOB '*[^0-9]*'))) OR (NEW.source_url IS NOT NULL AND length(NEW.source_url) BETWEEN 35 AND 220 AND instr(NEW.source_url,'?')=0 AND instr(NEW.source_url,'#')=0 AND (
 (substr(NEW.source_url,1,39)='https://www.rakumachi.jp/syuuekibukken/' AND instr(NEW.source_url,'/dim')>0 AND substr(NEW.source_url,-10)='/show.html')
 OR (substr(NEW.source_url,1,26)='https://www.kenbiya.com/pp' AND instr(NEW.source_url,'/s/')>0 AND instr(NEW.source_url,'/re_')>0 AND substr(NEW.source_url,-1)='/')
 OR (substr(NEW.source_url,1,17)='https://suumo.jp/' AND instr(NEW.source_url,'/sc_')>0 AND instr(NEW.source_url,'/nc_')>0 AND substr(NEW.source_url,-1)='/')
 OR (substr(NEW.source_url,1,25)='https://www.athome.co.jp/' AND substr(NEW.source_url,-12,1)='/' AND substr(NEW.source_url,-1)='/' AND substr(NEW.source_url,-11,10) NOT GLOB '*[^0-9]*')
 OR (substr(NEW.source_url,1,38)='https://picks-agent.terass.com/search/' AND instr(NEW.source_url,'/reins/')>0 AND substr(NEW.source_url,instr(NEW.source_url,'/reins/')+7)<>'' AND substr(NEW.source_url,instr(NEW.source_url,'/reins/')+7) NOT GLOB '*[^0-9]*')
 OR (substr(NEW.source_url,1,55)='https://estate-board.com/property-publication/received/' AND substr(NEW.source_url,56)<>'' AND substr(NEW.source_url,56) NOT GLOB '*[^0-9]*')))) BEGIN
 DELETE FROM property_listing_groups WHERE url=OLD.source_url AND (SELECT count(*) FROM properties WHERE source_url=OLD.source_url)<2;
 INSERT INTO property_listing_groups(url,n_rows,n_sources,conflict)
 SELECT source_url,COUNT(*),COUNT(DISTINCT source),CASE WHEN COUNT(DISTINCT NULLIF(trim(address),''))>1 OR COUNT(DISTINCT NULLIF(trim(pref),''))>1 OR COUNT(DISTINCT NULLIF(trim(city),''))>1 OR COUNT(DISTINCT CASE WHEN land_m2>0 THEN round(land_m2,1) END)>1 OR COUNT(DISTINCT CASE WHEN building_m2>0 THEN round(building_m2,1) END)>1 OR COUNT(DISTINCT CASE WHEN built_year BETWEEN 1800 AND 2030 THEN built_year END)>1 OR COUNT(DISTINCT CASE WHEN units>0 THEN units END)>1 OR (COUNT(DISTINCT price_man)>1 AND COUNT(DISTINCT NULLIF(trim(address),''))=0) THEN 1 ELSE 0 END FROM properties WHERE (source_url IS NOT NULL AND length(source_url) BETWEEN 35 AND 220 AND instr(source_url,'?')=0 AND instr(source_url,'#')=0 AND (
 (substr(source_url,1,39)='https://www.rakumachi.jp/syuuekibukken/' AND instr(source_url,'/dim')>0 AND substr(source_url,-10)='/show.html')
 OR (substr(source_url,1,26)='https://www.kenbiya.com/pp' AND instr(source_url,'/s/')>0 AND instr(source_url,'/re_')>0 AND substr(source_url,-1)='/')
 OR (substr(source_url,1,17)='https://suumo.jp/' AND instr(source_url,'/sc_')>0 AND instr(source_url,'/nc_')>0 AND substr(source_url,-1)='/')
 OR (substr(source_url,1,25)='https://www.athome.co.jp/' AND substr(source_url,-12,1)='/' AND substr(source_url,-1)='/' AND substr(source_url,-11,10) NOT GLOB '*[^0-9]*')
 OR (substr(source_url,1,38)='https://picks-agent.terass.com/search/' AND instr(source_url,'/reins/')>0 AND substr(source_url,instr(source_url,'/reins/')+7)<>'' AND substr(source_url,instr(source_url,'/reins/')+7) NOT GLOB '*[^0-9]*')
 OR (substr(source_url,1,55)='https://estate-board.com/property-publication/received/' AND substr(source_url,56)<>'' AND substr(source_url,56) NOT GLOB '*[^0-9]*'))) AND source_url=OLD.source_url GROUP BY source_url HAVING COUNT(*)>1
 ON CONFLICT(url) DO UPDATE SET n_rows=excluded.n_rows,n_sources=excluded.n_sources,conflict=excluded.conflict
 WHERE n_rows IS NOT excluded.n_rows OR n_sources IS NOT excluded.n_sources OR conflict IS NOT excluded.conflict;
 DELETE FROM property_listing_groups WHERE url=NEW.source_url AND (SELECT count(*) FROM properties WHERE source_url=NEW.source_url)<2;
 INSERT INTO property_listing_groups(url,n_rows,n_sources,conflict)
 SELECT source_url,COUNT(*),COUNT(DISTINCT source),CASE WHEN COUNT(DISTINCT NULLIF(trim(address),''))>1 OR COUNT(DISTINCT NULLIF(trim(pref),''))>1 OR COUNT(DISTINCT NULLIF(trim(city),''))>1 OR COUNT(DISTINCT CASE WHEN land_m2>0 THEN round(land_m2,1) END)>1 OR COUNT(DISTINCT CASE WHEN building_m2>0 THEN round(building_m2,1) END)>1 OR COUNT(DISTINCT CASE WHEN built_year BETWEEN 1800 AND 2030 THEN built_year END)>1 OR COUNT(DISTINCT CASE WHEN units>0 THEN units END)>1 OR (COUNT(DISTINCT price_man)>1 AND COUNT(DISTINCT NULLIF(trim(address),''))=0) THEN 1 ELSE 0 END FROM properties WHERE (source_url IS NOT NULL AND length(source_url) BETWEEN 35 AND 220 AND instr(source_url,'?')=0 AND instr(source_url,'#')=0 AND (
 (substr(source_url,1,39)='https://www.rakumachi.jp/syuuekibukken/' AND instr(source_url,'/dim')>0 AND substr(source_url,-10)='/show.html')
 OR (substr(source_url,1,26)='https://www.kenbiya.com/pp' AND instr(source_url,'/s/')>0 AND instr(source_url,'/re_')>0 AND substr(source_url,-1)='/')
 OR (substr(source_url,1,17)='https://suumo.jp/' AND instr(source_url,'/sc_')>0 AND instr(source_url,'/nc_')>0 AND substr(source_url,-1)='/')
 OR (substr(source_url,1,25)='https://www.athome.co.jp/' AND substr(source_url,-12,1)='/' AND substr(source_url,-1)='/' AND substr(source_url,-11,10) NOT GLOB '*[^0-9]*')
 OR (substr(source_url,1,38)='https://picks-agent.terass.com/search/' AND instr(source_url,'/reins/')>0 AND substr(source_url,instr(source_url,'/reins/')+7)<>'' AND substr(source_url,instr(source_url,'/reins/')+7) NOT GLOB '*[^0-9]*')
 OR (substr(source_url,1,55)='https://estate-board.com/property-publication/received/' AND substr(source_url,56)<>'' AND substr(source_url,56) NOT GLOB '*[^0-9]*'))) AND source_url=NEW.source_url GROUP BY source_url HAVING COUNT(*)>1
 ON CONFLICT(url) DO UPDATE SET n_rows=excluded.n_rows,n_sources=excluded.n_sources,conflict=excluded.conflict
 WHERE n_rows IS NOT excluded.n_rows OR n_sources IS NOT excluded.n_sources OR conflict IS NOT excluded.conflict;
END;
-- Explicitly retired Notion pages may not overwrite the current canonical page through a shared property_id.
CREATE TRIGGER IF NOT EXISTS property_retired_notion_insert BEFORE INSERT ON properties WHEN NEW.source='notion' AND EXISTS(SELECT 1 FROM property_notion_retired_pages WHERE page_key=substr(lower(replace(NEW.notion_page,'-','')),-32)) BEGIN SELECT RAISE(IGNORE); END;
CREATE TRIGGER IF NOT EXISTS property_retired_notion_update BEFORE UPDATE OF notion_page ON properties WHEN NEW.source='notion' AND EXISTS(SELECT 1 FROM property_notion_retired_pages WHERE page_key=substr(lower(replace(NEW.notion_page,'-','')),-32)) BEGIN SELECT RAISE(IGNORE); END;
CREATE VIEW IF NOT EXISTS v_property_identity AS
 SELECT p.property_id,p.source,p.source_url,p.notion_page,
 CASE WHEN a.target_id IS NOT NULL THEN 'confirmed:'||a.target_id
 WHEN EXISTS(SELECT 1 FROM property_notion_retired_pages t WHERE t.target_id=p.property_id AND t.alias_id IS NOT NULL AND t.alias_id<>t.target_id) THEN 'confirmed:'||p.property_id
 WHEN (p.source_url IS NOT NULL AND length(p.source_url) BETWEEN 35 AND 220 AND instr(p.source_url,'?')=0 AND instr(p.source_url,'#')=0 AND (
 (substr(p.source_url,1,39)='https://www.rakumachi.jp/syuuekibukken/' AND instr(p.source_url,'/dim')>0 AND substr(p.source_url,-10)='/show.html')
 OR (substr(p.source_url,1,26)='https://www.kenbiya.com/pp' AND instr(p.source_url,'/s/')>0 AND instr(p.source_url,'/re_')>0 AND substr(p.source_url,-1)='/')
 OR (substr(p.source_url,1,17)='https://suumo.jp/' AND instr(p.source_url,'/sc_')>0 AND instr(p.source_url,'/nc_')>0 AND substr(p.source_url,-1)='/')
 OR (substr(p.source_url,1,25)='https://www.athome.co.jp/' AND substr(p.source_url,-12,1)='/' AND substr(p.source_url,-1)='/' AND substr(p.source_url,-11,10) NOT GLOB '*[^0-9]*')
 OR (substr(p.source_url,1,38)='https://picks-agent.terass.com/search/' AND instr(p.source_url,'/reins/')>0 AND substr(p.source_url,instr(p.source_url,'/reins/')+7)<>'' AND substr(p.source_url,instr(p.source_url,'/reins/')+7) NOT GLOB '*[^0-9]*')
 OR (substr(p.source_url,1,55)='https://estate-board.com/property-publication/received/' AND substr(p.source_url,56)<>'' AND substr(p.source_url,56) NOT GLOB '*[^0-9]*'))) AND COALESCE(g.conflict,0)=0 THEN 'ad:'||p.source_url
 ELSE 'row:'||p.property_id END AS canonical_id,
 CASE WHEN a.target_id IS NOT NULL THEN 'confirmed_retired_alias'
 WHEN EXISTS(SELECT 1 FROM property_notion_retired_pages t WHERE t.target_id=p.property_id AND t.alias_id IS NOT NULL AND t.alias_id<>t.target_id) THEN 'confirmed_target'
 WHEN (p.source_url IS NOT NULL AND length(p.source_url) BETWEEN 35 AND 220 AND instr(p.source_url,'?')=0 AND instr(p.source_url,'#')=0 AND (
 (substr(p.source_url,1,39)='https://www.rakumachi.jp/syuuekibukken/' AND instr(p.source_url,'/dim')>0 AND substr(p.source_url,-10)='/show.html')
 OR (substr(p.source_url,1,26)='https://www.kenbiya.com/pp' AND instr(p.source_url,'/s/')>0 AND instr(p.source_url,'/re_')>0 AND substr(p.source_url,-1)='/')
 OR (substr(p.source_url,1,17)='https://suumo.jp/' AND instr(p.source_url,'/sc_')>0 AND instr(p.source_url,'/nc_')>0 AND substr(p.source_url,-1)='/')
 OR (substr(p.source_url,1,25)='https://www.athome.co.jp/' AND substr(p.source_url,-12,1)='/' AND substr(p.source_url,-1)='/' AND substr(p.source_url,-11,10) NOT GLOB '*[^0-9]*')
 OR (substr(p.source_url,1,38)='https://picks-agent.terass.com/search/' AND instr(p.source_url,'/reins/')>0 AND substr(p.source_url,instr(p.source_url,'/reins/')+7)<>'' AND substr(p.source_url,instr(p.source_url,'/reins/')+7) NOT GLOB '*[^0-9]*')
 OR (substr(p.source_url,1,55)='https://estate-board.com/property-publication/received/' AND substr(p.source_url,56)<>'' AND substr(p.source_url,56) NOT GLOB '*[^0-9]*'))) AND COALESCE(g.conflict,0)=0 THEN 'exact_ad'
 WHEN (p.source_url IS NOT NULL AND length(p.source_url) BETWEEN 35 AND 220 AND instr(p.source_url,'?')=0 AND instr(p.source_url,'#')=0 AND (
 (substr(p.source_url,1,39)='https://www.rakumachi.jp/syuuekibukken/' AND instr(p.source_url,'/dim')>0 AND substr(p.source_url,-10)='/show.html')
 OR (substr(p.source_url,1,26)='https://www.kenbiya.com/pp' AND instr(p.source_url,'/s/')>0 AND instr(p.source_url,'/re_')>0 AND substr(p.source_url,-1)='/')
 OR (substr(p.source_url,1,17)='https://suumo.jp/' AND instr(p.source_url,'/sc_')>0 AND instr(p.source_url,'/nc_')>0 AND substr(p.source_url,-1)='/')
 OR (substr(p.source_url,1,25)='https://www.athome.co.jp/' AND substr(p.source_url,-12,1)='/' AND substr(p.source_url,-1)='/' AND substr(p.source_url,-11,10) NOT GLOB '*[^0-9]*')
 OR (substr(p.source_url,1,38)='https://picks-agent.terass.com/search/' AND instr(p.source_url,'/reins/')>0 AND substr(p.source_url,instr(p.source_url,'/reins/')+7)<>'' AND substr(p.source_url,instr(p.source_url,'/reins/')+7) NOT GLOB '*[^0-9]*')
 OR (substr(p.source_url,1,55)='https://estate-board.com/property-publication/received/' AND substr(p.source_url,56)<>'' AND substr(p.source_url,56) NOT GLOB '*[^0-9]*'))) AND g.conflict=1 THEN 'conflict_hold'
 ELSE 'unresolved_source' END AS identity_state,
 CASE WHEN a.target_id IS NOT NULL THEN 1 ELSE 0 END AS retired_alias,
 COALESCE(g.n_rows,1) AS ad_rows,COALESCE(g.n_sources,1) AS ad_sources
 FROM properties p LEFT JOIN property_listing_groups g ON p.source_url=g.url
 LEFT JOIN property_notion_retired_pages a ON a.alias_id=p.property_id AND a.alias_id<>a.target_id;
CREATE VIEW IF NOT EXISTS v_property_identity_review AS
 SELECT match_key,count(*) AS n_rows,count(DISTINCT source) AS n_sources, count(DISTINCT source_url) AS n_urls
 FROM properties WHERE match_key IS NOT NULL AND match_key<>'' GROUP BY match_key HAVING count(*)>1;
CREATE VIEW IF NOT EXISTS v_property_rank_identity AS
 WITH rr AS (SELECT list,rid,property_id,notion_key,raw_json FROM v_rank_active),
 ev AS (
 SELECT r.list,r.rid,i.canonical_id,i.property_id AS source_id,'direct_id' AS method FROM rr r JOIN v_property_identity i ON i.property_id=r.property_id WHERE i.retired_alias=0
 UNION ALL
 SELECT r.list,r.rid,i.canonical_id,i.property_id,'notion_page' FROM rr r JOIN properties p ON p.source='notion' AND substr(lower(replace(p.notion_page,'-','')),-32)=lower(r.notion_key) JOIN v_property_identity i ON i.property_id=p.property_id WHERE i.retired_alias=0
 UNION ALL
 SELECT r.list,r.rid,i.canonical_id,i.property_id,'exact_ad' FROM rr r JOIN json_each(CASE WHEN json_valid(r.raw_json) THEN r.raw_json ELSE '{}' END,'$.links') j JOIN properties p ON p.source_url=json_extract(j.value,'$.url') JOIN v_property_identity i ON i.property_id=p.property_id WHERE i.identity_state IN ('exact_ad','confirmed_target') AND i.retired_alias=0
 ), agg AS (SELECT list,rid,count(DISTINCT canonical_id) n,min(canonical_id) cid,min(source_id) source_id,group_concat(DISTINCT method) methods FROM ev GROUP BY list,rid)
 SELECT r.list,r.rid,r.property_id,CASE WHEN a.n=1 THEN a.cid ELSE 'ranking:'||COALESCE(NULLIF(r.property_id,''),r.rid) END canonical_id,CASE WHEN a.n=1 THEN a.source_id ELSE NULL END matched_source_id,
 CASE WHEN a.n=1 THEN 'linked' WHEN a.n>1 THEN 'conflict_hold' ELSE 'unresolved' END identity_state,a.methods
 FROM rr r LEFT JOIN agg a ON r.list=a.list AND r.rid=a.rid;
