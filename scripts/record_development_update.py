"""Upsert public-safe development status after any repository change.

No new schedule. The modifying agent must call this before declaring a repo task
finished, then publish and verify the live #development page. Private GitHub repo
names/PR URLs live in Notion only, never in this static public catalog.
"""
from __future__ import annotations
import argparse
import json
import os
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CATALOG = ROOT / "public/data/development-progress.json"
PUBLIC_HOSTS = {
    "bukken-customer.pages.dev",
    "cloud-local-task-dashboard.pages.dev",
    "estateboard.pages.dev",
    "shinchiku-land-viewer.univcorp2.workers.dev",
}
KEYS = {
    "id", "title", "priority", "progressPercent", "confidence",
    "executionStatus", "nextAction", "lastActionResult",
    "inspectedAt", "phase", "links", "visibility",
}
REQUIRED = KEYS - {"links", "visibility"}
PRIVATE_PATTERN = re.compile(r"(?:github\.com/|github\.com%2F|ghp_[a-zA-Z0-9]+|github_pat_|\bBearer\s+)", re.I)


def validate(update: dict) -> dict:
    if not isinstance(update, dict) or REQUIRED - set(update):
        raise ValueError("Missing required public development update fields")
    if set(update) - KEYS:
        raise ValueError("Unknown public development fields")
    for field in REQUIRED - {"progressPercent"}:
        if not isinstance(update[field], str) or not update[field].strip():
            raise ValueError(f"Invalid field: {field}")
    if update.get("visibility", "public_alias_only") != "public_alias_only":
        raise ValueError("Private repository details are forbidden in public JSON")
    if not isinstance(update["progressPercent"], int) or not 0 <= update["progressPercent"] <= 100:
        raise ValueError("Progress must be 0..100")
    datetime.fromisoformat(update["inspectedAt"].replace("Z", "+00:00"))
    urls = update.get("links", [])
    if not isinstance(urls, list):
        raise ValueError("links must be an array")
    for link in urls:
        if not isinstance(link, dict) or set(link) != {"label", "url"}:
            raise ValueError("Invalid public link")
        target = urlparse(str(link["url"]))
        if target.scheme != "https" or target.netloc not in PUBLIC_HOSTS or target.username or target.password:
            raise ValueError("Only approved public application URLs may be displayed")
        if not isinstance(link["label"], str) or not link["label"]:
            raise ValueError("Public link needs a label")
    material = json.dumps(update, ensure_ascii=False)
    if PRIVATE_PATTERN.search(material):
        raise ValueError("Private repository/authorization link may not appear in public JSON")
    return {**update, "visibility": "public_alias_only"}


def upsert(catalog: dict, item: dict) -> dict:
    if catalog["coverage"]["public"] != len(catalog["publicProjects"]):
        raise ValueError("Repository coverage mismatch")
    projects = catalog.get("activeProjects")
    if not isinstance(projects, list):
        raise ValueError("Missing active project collection")
    matching = [i for i, value in enumerate(projects) if value["id"] == item["id"]]
    if len(matching) > 1:
        raise ValueError("Duplicate active-project IDs")
    if matching:
        projects[matching[0]] = item
    else:
        db = next((i for i, value in enumerate(projects) if value["id"] == "db"), 0)
        projects.insert(db + 1, item)
    # The 153-repository inventory was not re-audited here: keep its original timestamp.
    catalog["activeProjectsUpdatedAt"] = datetime.now(timezone.utc).isoformat()
    return catalog


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True, help="Public-safe JSON update file")
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    args = parser.parse_args()
    item = validate(json.loads(args.input.read_text(encoding="utf-8-sig")))
    catalog = json.loads(args.catalog.read_text(encoding="utf-8-sig"))
    updated = upsert(catalog, item)
    text = json.dumps(updated, indent=2, ensure_ascii=False) + "\n"
    fd, tmp_name = tempfile.mkstemp(prefix=".development-", dir=args.catalog.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            stream.write(text)
        os.replace(tmp_name, args.catalog)
    finally:
        if Path(tmp_name).exists():
            Path(tmp_name).unlink()
    print(json.dumps({"updated": item["id"], "activeProjects": len(updated["activeProjects"]),
                      "publicRepoCount": updated["coverage"]["public"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
