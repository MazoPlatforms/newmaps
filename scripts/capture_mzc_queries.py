#!/usr/bin/env python3
"""Sequentially capture JSON from the documented mzc query interface only."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def parse_response(stdout: str) -> dict[str, Any]:
    try:
        payload = json.loads(stdout)
    except json.JSONDecodeError as exc:
        raise ValueError("mzc stdout was not valid JSON") from exc
    if not isinstance(payload, dict) or not isinstance(payload.get("results"), list):
        raise ValueError("mzc JSON response must contain a results array")
    if len(payload["results"]) > 500:
        raise ValueError("mzc response exceeded the requested 500-result limit")
    payload.setdefault("count", len(payload["results"]))
    return payload


def classify_cli_failure(returncode: int, stderr: str) -> str:
    """Return a non-sensitive, stable CLI failure label for query logs."""
    if "HTTP 429" in stderr:
        return "HTTP 429 rate limited"
    if "HTTP 5" in stderr:
        return "upstream HTTP server error"
    if "HTTP 4" in stderr:
        return "upstream HTTP client error"
    return f"mzc exited with status {returncode}"


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-")


def atomic_json(path: Path, value: Any) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def capture(plan_path: Path, output_dir: Path) -> dict[str, int]:
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    if not isinstance(plan, list):
        raise ValueError("Query plan must be a JSON array")
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = output_dir / "query-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else []
    entries = {row["query"]: row for row in manifest}
    succeeded = sum(row.get("status") == "success" for row in manifest)
    raw_rows = sum(int(row.get("count", 0)) for row in manifest if row.get("status") == "success")
    failed = sum(row.get("status") == "failed" for row in manifest)

    for item in plan:
        query = item.get("query")
        if not isinstance(query, str) or not query.strip():
            raise ValueError("Each planned query needs a non-empty query string")
        if item.get("limit") != 500 or item.get("country") != "lk":
            raise ValueError(f"Query must set limit=500 and country=lk: {query}")
        existing = entries.get(query)
        if existing and existing.get("status") == "success":
            continue
        key = f"{slug(item.get('town', 'district'))}--{slug(item.get('category', 'places'))}--{hashlib.sha256(query.encode()).hexdigest()[:8]}"
        row = {**item, "key": key, "attempts": existing.get("attempts", []) if existing else []}
        payload = None
        first_attempt = len(row["attempts"]) + 1
        for attempt_number in (first_attempt, first_attempt + 1):
            started = datetime.now(timezone.utc).isoformat()
            try:
                result = subprocess.run(
                    ["mzc", "-l", "500", "-c", "lk", "-t", str(item.get("timeout", 30)), query],
                    capture_output=True, text=True, timeout=int(item.get("timeout", 30)) + 15,
                    check=False,
                )
                if result.returncode != 0:
                    failure = classify_cli_failure(result.returncode, result.stderr)
                    row["attempts"].append({"attempt": attempt_number, "started_at": started,
                                            "error": failure})
                    # A rate-limit response is an explicit stop signal. Immediate
                    # retries amplify throttling and do not improve coverage.
                    if failure == "HTTP 429 rate limited":
                        row["failure_kind"] = "rate_limited"
                        break
                    continue
                payload = parse_response(result.stdout)
                row["attempts"].append({"attempt": attempt_number, "started_at": started, "status": "success"})
                break
            except (OSError, subprocess.TimeoutExpired, ValueError) as exc:
                row["attempts"].append({"attempt": attempt_number, "started_at": started,
                                        "error": str(exc) if isinstance(exc, ValueError) else type(exc).__name__})

        if payload is None:
            row.update({"status": "failed", "error": "Both documented CLI attempts failed"})
            failed += 1
        else:
            row.update({"status": "success", "count": len(payload["results"]),
                        "reported_count": payload.get("count"), "at_limit": len(payload["results"]) == 500,
                        "response_sha256": hashlib.sha256(json.dumps(payload, ensure_ascii=False,
                                                                      sort_keys=True).encode()).hexdigest()})
            atomic_json(output_dir / f"{key}.json", payload)
            succeeded += 1
            raw_rows += len(payload["results"])
        entries[query] = row
        manifest = list(entries.values())
        atomic_json(manifest_path, manifest)
        if (succeeded + failed) % 10 == 0:
            print(f"completed {succeeded + failed}/{len(plan)} planned prompts; successful={succeeded}; raw rows={raw_rows}; failed={failed}", flush=True)

    return {"planned_queries": len(plan), "successful_queries": succeeded,
            "failed_queries": failed, "retained_raw_rows": raw_rows}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    try:
        print(json.dumps(capture(args.plan, args.output_dir), indent=2))
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
