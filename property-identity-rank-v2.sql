DROP VIEW IF EXISTS v_property_rank_identity;
CREATE VIEW v_property_rank_identity AS
 WITH rr AS (SELECT list,rid,property_id,notion_key,raw_json FROM v_rank_active),
 ev AS (
 SELECT r.list,r.rid,i.canonical_id,i.property_id AS source_id,'direct_id' AS method FROM rr r JOIN v_property_identity i ON i.property_id=r.property_id WHERE i.retired_alias=0
 UNION ALL
 SELECT r.list,r.rid,i.canonical_id,i.property_id,'notion_namespaced_id' FROM rr r JOIN v_property_identity i ON i.property_id='notion:'||r.property_id AND i.source='notion' WHERE i.retired_alias=0
 UNION ALL
 SELECT r.list,r.rid,i.canonical_id,i.property_id,'notion_page' FROM rr r JOIN properties p ON p.source='notion' AND substr(lower(replace(p.notion_page,'-','')),-32)=lower(r.notion_key) JOIN v_property_identity i ON i.property_id=p.property_id WHERE i.retired_alias=0
 UNION ALL
 SELECT r.list,r.rid,i.canonical_id,i.property_id,'exact_ad' FROM rr r JOIN json_each(CASE WHEN json_valid(r.raw_json) THEN r.raw_json ELSE '{}' END,'$.links') j JOIN properties p ON p.source_url=json_extract(j.value,'$.url') JOIN v_property_identity i ON i.property_id=p.property_id WHERE i.identity_state IN ('exact_ad','confirmed_target') AND i.retired_alias=0
 ), agg AS (SELECT list,rid,count(DISTINCT canonical_id) n,min(canonical_id) cid,min(source_id) source_id,group_concat(DISTINCT method) methods FROM ev GROUP BY list,rid)
 SELECT r.list,r.rid,r.property_id,CASE WHEN a.n=1 THEN a.cid ELSE 'ranking:'||COALESCE(NULLIF(r.property_id,''),r.rid) END canonical_id,CASE WHEN a.n=1 THEN a.source_id ELSE NULL END matched_source_id,
 CASE WHEN a.n=1 THEN 'linked' WHEN a.n>1 THEN 'conflict_hold' ELSE 'unresolved' END identity_state,a.methods
 FROM rr r LEFT JOIN agg a ON r.list=a.list AND r.rid=a.rid;
