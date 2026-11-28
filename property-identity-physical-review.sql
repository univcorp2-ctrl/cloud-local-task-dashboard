CREATE VIEW IF NOT EXISTS v_property_physical_review AS
WITH e AS (
 SELECT p.property_id,p.source,p.name,p.address,p.source_url,p.land_m2,p.building_m2,p.built_year,p.structure,p.genre,i.canonical_id,
 replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(trim(address),' ',''),'　',''),'−','-'),'－','-'),'丁目','-'),'番地','-'),'号',''),'０','0'),'１','1'),'２','2'),'３','3'),'４','4'),'５','5'),'６','6'),'７','7'),'８','8'),'９','9') AS address_key,
 CASE WHEN p.genre IN ('戸建','戸建て','中古戸建','新築戸建') THEN 'house' WHEN p.genre IN ('一棟アパート','アパート','一棟マンション') THEN 'whole' ELSE '' END AS kind
 FROM properties p JOIN v_property_identity i ON i.property_id=p.property_id
 WHERE p.status='active' AND i.retired_alias=0 AND p.land_m2>0 AND p.building_m2>0 AND p.built_year BETWEEN 1800 AND 2030 AND trim(COALESCE(p.structure,''))<>''
)
SELECT address_key,kind,round(land_m2,1) AS land_m2,round(building_m2,1) AS building_m2,built_year,structure,count(*) AS n_rows,count(DISTINCT canonical_id) AS n_ids,count(DISTINCT source) AS n_sources
FROM e WHERE kind<>'' AND address_key GLOB '*[0-9]-[0-9]*' GROUP BY address_key,kind,round(land_m2,1),round(building_m2,1),built_year,structure HAVING count(DISTINCT canonical_id)>1 AND count(DISTINCT source)>1;
