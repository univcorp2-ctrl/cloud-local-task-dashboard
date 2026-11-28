CREATE TABLE IF NOT EXISTS kanashin_mcp_revisions (
 target TEXT NOT NULL,
 revision INTEGER NOT NULL CHECK(revision>0),
 payload TEXT NOT NULL CHECK(json_valid(payload)),
 op_id TEXT NOT NULL UNIQUE,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY(target,revision)
);