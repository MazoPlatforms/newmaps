from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import import_mzc_places as importer
import plan_batticaloa_phase6_2 as phase6_2_plan
import capture_mzc_queries as mzc_capture
import places

ULID = "01AAAAAAAAAAAAAAAAAAAAAAAA"


def mzc_record(name, latitude=7.72, longitude=81.70, **extra):
    return {
        "name": name,
        "coordinates": {"latitude": latitude, "longitude": longitude},
        "address": "no.12, Main rd, Batticaloa",
        "categories": ["Restaurant"],
        **extra,
    }


def capture(input_dir: Path, records: list[dict], limit=500, country="lk"):
    input_dir.mkdir(parents=True, exist_ok=True)
    (input_dir / "query-manifest.json").write_text(json.dumps([{
        "key": "batticaloa--food", "query": "restaurants in Batticaloa, Sri Lanka",
        "limit": limit, "country": country, "count": len(records), "at_limit": False,
    }]), encoding="utf-8")
    (input_dir / "batticaloa--food.json").write_text(json.dumps({"results": records}), encoding="utf-8")


def write_tree(root: Path, records: list[dict], aliases: dict | None = None):
    shard = root / "data/places/0001"
    shard.mkdir(parents=True, exist_ok=True)
    for record in records:
        (shard / f"{record['id']}.json").write_text(json.dumps(record), encoding="utf-8")
    alias_file = root / "data/places/aliases.json"
    alias_file.write_text(json.dumps({"version": 1, "aliases": aliases or {}}), encoding="utf-8")


class MzcImportTests(unittest.TestCase):
    def analyze(self, temp: Path, candidates: list[dict], existing=None, aliases=None):
        input_dir = temp / "capture"
        capture(input_dir, candidates)
        root = temp / "repo"
        write_tree(root, existing or [], aliases)
        return importer.analyze(input_dir, importer.BOUNDARY_PATH, root)

    def test_required_country_and_limit_metadata_is_enforced(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)
            capture(path, [mzc_record("Public Library")], limit=499)
            with self.assertRaisesRegex(ValueError, "limit=500"):
                importer.read_captures(path)
            capture(path, [mzc_record("Public Library")], country="us")
            with self.assertRaisesRegex(ValueError, "country=lk"):
                importer.read_captures(path)

    def test_district_polygon_and_latitude_batches(self):
        boundary = importer.load_boundary()
        self.assertTrue(boundary.covers(importer.Point(81.70, 7.72)))
        self.assertFalse(boundary.covers(importer.Point(81.50, 7.40)))
        self.assertEqual(importer.region_for(mzc_record("Cafe", latitude=7.68)), "south")
        self.assertEqual(importer.region_for(mzc_record("Cafe", latitude=7.71)), "central-south")
        self.assertEqual(importer.region_for(mzc_record("Cafe", latitude=7.75)), "central-mid")
        self.assertEqual(importer.region_for(mzc_record("Cafe", latitude=7.80)), "central-north")
        self.assertEqual(importer.region_for(mzc_record("Cafe", latitude=7.90)), "north")

    def test_multi_band_batch_selection_is_geographic_and_does_not_change_all_counts(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)
            input_dir = path / "capture"
            capture(input_dir, [
                mzc_record("South Cafe", latitude=7.68),
                mzc_record("Central Cafe", latitude=7.75),
                mzc_record("North Cafe", latitude=7.80, longitude=81.60),
            ])
            root = path / "repo"
            write_tree(root, [])
            plan = importer.analyze(input_dir, importer.BOUNDARY_PATH, root,
                                    region={"central-mid", "central-north"})
            self.assertEqual({row["name"] for row in plan["new_records"]}, {"Central Cafe", "North Cafe"})
            self.assertEqual(plan["counts"]["new_public_candidate"], 3)

    def test_normalization_preserves_known_acronym_and_address_content(self):
        item = importer.group_candidates([{
            "query": {"key": "batticaloa--food"},
            "record": mzc_record("smr transport", address="no.12, Main rd, Batticaloa"),
        }])[0]
        self.assertEqual(item["record"]["name"], "SMR Transport")
        self.assertEqual(item["record"]["address"], "No. 12, Main Road, Batticaloa")
        self.assertEqual({row["field"] for row in item["format_changes"]}, {"name", "address"})
        self.assertNotIn("provenance", item["record"])

    def test_repeated_query_records_collapse_but_nearby_same_name_is_not_merged(self):
        rows = [
            {"query": {"key": "batticaloa--food"}, "record": mzc_record("Community Cafe")},
            {"query": {"key": "batticaloa--retail"}, "record": mzc_record(" community cafe ")},
            {"query": {"key": "batticaloa--food"}, "record": mzc_record("Community Cafe", latitude=7.725)},
        ]
        groups = importer.group_candidates(rows)
        self.assertEqual(len(groups), 2)
        self.assertEqual(sorted(len(group["members"]) for group in groups), [1, 2])

    def test_nearby_same_name_import_candidates_are_retained_as_conflict(self):
        with tempfile.TemporaryDirectory() as tmp:
            a = mzc_record("Amma Hotel", latitude=7.7690151, longitude=81.6139273,
                           address="QJ97+JH3, Main St, Eravur", categories=["Family restaurant"])
            b = mzc_record("Amma Hotel", latitude=7.769067, longitude=81.6138231,
                           address="QJ97+JGG, Trincomalee-Batticaloa Road, Eravur", categories=["Restaurant"])
            plan = self.analyze(Path(tmp), [a, b])
            self.assertEqual(len(plan["new_records"]), 2)
            self.assertEqual(len(plan["internal_nearby_pairs"]), 1)
            pair = plan["internal_nearby_pairs"][0]
            self.assertLess(pair["distance_m"], 15)
            self.assertIn("address", pair["differing_fields"])
            self.assertIn("categories", pair["differing_fields"])
            self.assertIn("Retain both", pair["decision"])

    def test_exact_existing_alias_is_duplicate_without_new_ulid(self):
        with tempfile.TemporaryDirectory() as tmp:
            temp = Path(tmp)
            old_id = "01BBBBBBBBBBBBBBBBBBBBBBBB"
            canonical_id = "01CCCCCCCCCCCCCCCCCCCCCCCC"
            alias_record = mzc_record("Community Cafe") | {"id": old_id}
            aliases = {old_id: {"canonical_id": canonical_id, "record": alias_record}}
            plan = self.analyze(temp, [mzc_record("Community Cafe")], aliases=aliases)
            self.assertEqual(plan["counts"]["existing_place_duplicate"], 1)
            self.assertEqual(plan["new_records"], [])
            self.assertEqual(plan["alias_ids"], {old_id})

    def test_address_conflict_and_nearby_same_name_are_review_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            temp = Path(tmp)
            existing = [{"id": ULID, **mzc_record("Community Cafe", address="No. 8, Beach Road, Batticaloa")}]
            plan = self.analyze(temp, [mzc_record("Community Cafe")], existing=existing)
            self.assertEqual(plan["counts"]["unresolved_existing_match"], 1)
            self.assertEqual(plan["counts"]["new_public_candidate"], 0)
            self.assertEqual(plan["reason_counts"]["existing_conflict_address"], 1)

    def test_existing_category_or_contact_conflict_is_not_silently_deduplicated(self):
        with tempfile.TemporaryDirectory() as tmp:
            existing = [{"id": ULID, **mzc_record("Community Cafe", categories=["Pharmacy"], phone="+94 65 222 1111")}]
            candidate = mzc_record("Community Cafe", phone="+94 65 333 2222")
            plan = self.analyze(Path(tmp), [candidate], existing=existing)
            self.assertEqual(plan["counts"]["unresolved_existing_match"], 1)
            self.assertIn("existing_conflict_phone", plan["reason_counts"])
            self.assertIn("existing_conflict_categories", plan["reason_counts"])

    def test_close_same_name_without_shared_address_or_contact_stays_unresolved(self):
        with tempfile.TemporaryDirectory() as tmp:
            existing = [{"id": ULID, **mzc_record("Community Cafe", latitude=7.72001,
                                                   address="No. 8, Other Road, Batticaloa",
                                                   phone="+94 65 111 1111")}]
            candidate = mzc_record("Community Cafe", address="No. 12, Main Road, Batticaloa",
                                   phone="+94 65 222 2222")
            plan = self.analyze(Path(tmp), [candidate], existing=existing)
            self.assertEqual(plan["counts"]["unresolved_existing_match"], 1)
            self.assertEqual(plan["counts"].get("existing_place_duplicate", 0), 0)

    def test_repeated_import_analysis_does_not_allocate_another_record(self):
        with tempfile.TemporaryDirectory() as tmp:
            temp = Path(tmp)
            candidate = mzc_record("Community Cafe")
            first = self.analyze(temp, [candidate])
            self.assertEqual(len(first["new_records"]), 1)
            active = {"id": ULID, **first["new_records"][0]}
            second = self.analyze(temp, [candidate], existing=[active])
            self.assertEqual(second["new_records"], [])
            self.assertEqual(second["counts"]["existing_place_duplicate"], 1)

    def test_out_of_district_and_uncertain_places_are_withheld(self):
        with tempfile.TemporaryDirectory() as tmp:
            plan = self.analyze(Path(tmp), [
                mzc_record("Community Cafe", latitude=7.40, longitude=81.50),
                mzc_record("M. Perera", latitude=7.72, longitude=81.70, categories=["Establishment"]),
            ])
            self.assertEqual(plan["counts"]["out_of_district"], 1)
            self.assertEqual(plan["counts"]["uncertain_public_eligibility"], 1)
            self.assertEqual(plan["new_records"], [])

    def test_private_residential_candidate_is_excluded_and_report_is_privacy_safe(self):
        with tempfile.TemporaryDirectory() as tmp:
            private = mzc_record("M. Perera's Home", categories=["Private residence"], address="No. 9, Private Lane")
            input_dir = Path(tmp) / "capture"
            capture(input_dir, [private])
            root = Path(tmp) / "repo"
            write_tree(root, [])
            plan = importer.analyze(input_dir, importer.BOUNDARY_PATH, root)
            report = importer.public_report(plan)
            serialized = json.dumps(report)
            self.assertEqual(plan["counts"]["excluded_confirmed_private"], 1)
            self.assertEqual(plan["new_records"], [])
            self.assertNotIn("Perera", serialized)
            self.assertNotIn("Private Lane", serialized)

    def test_import_analysis_does_not_modify_roads_or_speed_limits(self):
        def tree_hash(pattern):
            digest = hashlib.sha256()
            for path in sorted(places.ROOT.glob(pattern)):
                digest.update(path.relative_to(places.ROOT).as_posix().encode())
                digest.update(path.read_bytes())
            return digest.hexdigest()
        roads_before = tree_hash("data/roads/*/*.json")
        speeds_before = tree_hash("data/speed-limits/*/*.json")
        with tempfile.TemporaryDirectory() as tmp:
            self.analyze(Path(tmp), [mzc_record("Community Cafe")])
        self.assertEqual(tree_hash("data/roads/*/*.json"), roads_before)
        self.assertEqual(tree_hash("data/speed-limits/*/*.json"), speeds_before)

    def test_capture_query_results_never_exceed_500(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)
            capture(path, [mzc_record("Cafe") for _ in range(501)])
            with self.assertRaisesRegex(ValueError, "500-result cap"):
                importer.read_captures(path)

    def test_query_summary_counts_retries_and_preserves_safe_coverage_metadata(self):
        summary = importer.capture_summary([{
            "key": "vakarai--clothing-textiles",
            "query": "clothing shops and textile stores in Vakarai, Batticaloa District, Sri Lanka",
            "town": "Vakarai", "category": "clothing-textiles", "country": "lk", "limit": 500,
            "count": 3, "at_limit": False, "status": "success",
            "attempts": [
                {"attempt": 1, "error": "CLI invocation timed out"},
                {"attempt": 2, "status": "success"},
            ],
        }, {
            "key": "vakarai--food", "query": "restaurants in Vakarai", "town": "Vakarai",
            "category": "food", "country": "lk", "limit": 500, "status": "failed",
            "error": "CLI did not return valid JSON", "attempts": [{"attempt": 1, "error": "invalid JSON"}],
        }])
        self.assertEqual(summary["confirmed_cli_invocations_at_least"], 3)
        self.assertFalse(summary["exact_cli_invocation_total_available"])
        self.assertEqual(summary["successful_queries"], 1)
        self.assertEqual(summary["failed_queries"], 1)
        self.assertEqual(summary["failed_attempts"], 2)
        self.assertEqual(summary["successful_retries"], 1)
        self.assertEqual(summary["raw_candidates_returned_in_retained_json"], 3)
        self.assertEqual(summary["queries"][0]["town"], "Vakarai")
        self.assertEqual(summary["queries"][0]["category"], "clothing-textiles")

    def test_category_coverage_uses_family_name_without_query_hash(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            input_dir = root / "capture"
            capture(input_dir, [mzc_record("Community Hall")])
            manifest_path = input_dir / "query-manifest.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest[0]["key"] = "batticaloa--community-recreation--a1b2c3d4"
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            (input_dir / "batticaloa--community-recreation--a1b2c3d4.json").write_text(
                json.dumps({"results": [mzc_record("Community Hall")]}), encoding="utf-8")
            (input_dir / "batticaloa--food.json").unlink()
            repo = root / "repo"
            write_tree(repo, [])
            result = importer.analyze(input_dir, importer.BOUNDARY_PATH, repo)
            self.assertEqual(result["query_category_counts"]["community-recreation"]["new_public_candidate"], 1)
            self.assertNotIn("community-recreation--a1b2c3d4", result["query_category_counts"])

    def test_phase62_plan_skips_previous_queries_and_uses_required_mzc_parameters(self):
        repeated = phase6_2_plan.normalize_query(
            "public offices schools clinics and community facilities in Koralai Pattu, Batticaloa District, Sri Lanka"
        )
        plan = phase6_2_plan.build_plan({repeated})
        self.assertTrue(plan)
        normalized = [phase6_2_plan.normalize_query(row["query"]) for row in plan]
        self.assertNotIn(repeated, normalized)
        self.assertEqual(len(normalized), len(set(normalized)))
        self.assertTrue(all(row["limit"] == 500 and row["country"] == "lk" for row in plan))
        self.assertTrue(any(row["town"] == "Vellaveli" for row in plan))
        self.assertTrue(any("fishing supplies" in row["query"] for row in plan))

    def test_capture_resumes_failed_queries_with_bounded_backoff_and_preserves_successes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            output = root / "capture"
            output.mkdir()
            success_query = "successful saved query"
            failed_query = "recorded failed query"
            success_payload = {"results": [{"name": "Saved Cafe"}]}
            (output / "saved.json").write_text(json.dumps(success_payload), encoding="utf-8")
            (output / "query-manifest.json").write_text(json.dumps([
                {"query": success_query, "status": "success", "count": 1, "key": "saved"},
                {"query": failed_query, "status": "failed", "count": 0, "key": "failed",
                 "attempts": [{"attempt": 1, "error": "HTTP 429 rate limited"}]},
            ]), encoding="utf-8")
            plan = root / "plan.json"
            plan.write_text(json.dumps([
                {"query": success_query, "limit": 500, "country": "lk", "timeout": 30},
                {"query": failed_query, "limit": 500, "country": "lk", "timeout": 30},
            ]), encoding="utf-8")
            calls = []
            def fake_run(args, **kwargs):
                calls.append(args)
                if len(calls) == 1:
                    return subprocess.CompletedProcess(args, 1, "", "HTTP 429")
                return subprocess.CompletedProcess(args, 0, json.dumps({"results": [{"name": "New Cafe"}]}), "")
            with patch.object(mzc_capture.subprocess, "run", side_effect=fake_run), \
                 patch.object(mzc_capture.time, "sleep") as sleep:
                summary = mzc_capture.capture(plan, output)
            self.assertEqual(len(calls), 2)  # The saved success was not repeated.
            self.assertEqual(calls[0], ["mzc", "-l", "500", "-c", "lk", "-t", "30", failed_query])
            self.assertEqual(calls[1], calls[0])
            self.assertEqual(sleep.call_args_list, [unittest.mock.call(2)])
            self.assertEqual(summary["successful_queries"], 2)
            self.assertEqual(summary["failed_queries"], 0)
            self.assertEqual(json.loads((output / "saved.json").read_text()), success_payload)

    def test_capture_keeps_a_query_failed_after_three_bounded_attempts(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            plan = root / "plan.json"
            plan.write_text(json.dumps([{"query": "still blocked", "limit": 500,
                                         "country": "lk", "timeout": 30}]), encoding="utf-8")
            calls = []
            def fail(args, **kwargs):
                calls.append(args)
                return subprocess.CompletedProcess(args, 1, "", "HTTP 429")
            with patch.object(mzc_capture.subprocess, "run", side_effect=fail), \
                 patch.object(mzc_capture.time, "sleep") as sleep:
                summary = mzc_capture.capture(plan, root / "capture")
            self.assertEqual(len(calls), 3)
            self.assertEqual(sleep.call_args_list, [unittest.mock.call(2), unittest.mock.call(4)])
            self.assertEqual(summary["failed_queries"], 1)
            row = json.loads((root / "capture/query-manifest.json").read_text())[0]
            self.assertEqual(row["failure_kind"], "rate_limited")

    def test_capture_does_not_exceed_five_total_attempts_across_resumes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            output = root / "capture"
            output.mkdir()
            query = "already retried five times"
            (output / "query-manifest.json").write_text(json.dumps([{
                "query": query, "key": "blocked", "status": "failed", "count": 0,
                "attempts": [{"attempt": n, "error": "HTTP 429 rate limited"} for n in range(1, 6)],
            }]), encoding="utf-8")
            plan = root / "plan.json"
            plan.write_text(json.dumps([{"query": query, "limit": 500, "country": "lk"}]), encoding="utf-8")
            with patch.object(mzc_capture.subprocess, "run") as run:
                summary = mzc_capture.capture(plan, output)
            run.assert_not_called()
            self.assertEqual(summary["failed_queries"], 1)
    def test_mzc_capture_rejects_invalid_json_and_result_limit_overflow(self):
        with self.assertRaisesRegex(ValueError, "valid JSON"):
            mzc_capture.parse_response("not json")
        with self.assertRaisesRegex(ValueError, "500-result limit"):
            mzc_capture.parse_response(json.dumps({"results": [{} for _ in range(501)]}))
        self.assertEqual(mzc_capture.parse_response('{"results":[{}]}')["count"], 1)
        self.assertEqual(mzc_capture.classify_cli_failure(1, "Error: Request failed: HTTP 429"),
                         "HTTP 429 rate limited")
        self.assertEqual(mzc_capture.classify_cli_failure(1, "connection reset"),
                         "mzc exited with status 1")

    def test_mzc_capture_uses_bounded_backoff_for_rate_limit(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            plan_path = root / "plan.json"
            plan_path.write_text(json.dumps([{
                "query": "public services in Vakarai, Batticaloa District, Sri Lanka",
                "town": "Vakarai", "category": "public-services", "limit": 500,
                "country": "lk", "timeout": 30,
            }]), encoding="utf-8")
            rate_limited = subprocess.CompletedProcess(
                args=["mzc"], returncode=1, stdout="", stderr="Error: HTTP 429"
            )
            with patch.object(mzc_capture.subprocess, "run", return_value=rate_limited) as run, \
                 patch.object(mzc_capture.time, "sleep") as sleep:
                result = mzc_capture.capture(plan_path, root / "captures")
            self.assertEqual(run.call_count, 3)
            self.assertEqual(sleep.call_args_list, [unittest.mock.call(2), unittest.mock.call(4)])
            self.assertEqual(result["failed_queries"], 1)
            manifest = json.loads((root / "captures/query-manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest[0]["failure_kind"], "rate_limited")
            self.assertEqual([x["error"] for x in manifest[0]["attempts"]],
                             ["HTTP 429 rate limited"] * 3)
            self.assertEqual(run.call_args.args[0], [
                "mzc", "-l", "500", "-c", "lk", "-t", "30",
                "public services in Vakarai, Batticaloa District, Sri Lanka",
            ])

    def test_mzc_capture_resume_counts_final_manifest_state_once(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / "captures"
            output.mkdir()
            query = "public services in Vakarai, Batticaloa District, Sri Lanka"
            plan_path = root / "plan.json"
            plan_path.write_text(json.dumps([{
                "query": query, "town": "Vakarai", "category": "public-services",
                "limit": 500, "country": "lk", "timeout": 30,
            }]), encoding="utf-8")
            (output / "query-manifest.json").write_text(json.dumps([{
                "key": "vakarai--public-services--previous", "query": query,
                "town": "Vakarai", "category": "public-services", "limit": 500,
                "country": "lk", "status": "failed", "attempts": [{"attempt": 1, "error": "network"}],
            }]), encoding="utf-8")
            (output / "vakarai--public-services--previous.json").write_text(
                json.dumps({"results": []}), encoding="utf-8")
            response = subprocess.CompletedProcess(
                args=["mzc"], returncode=0, stdout='{"results":[{}]}', stderr=""
            )
            with patch.object(mzc_capture.subprocess, "run", return_value=response):
                result = mzc_capture.capture(plan_path, output)
            self.assertEqual(result, {
                "planned_queries": 1, "successful_queries": 1,
                "failed_queries": 0, "retained_raw_rows": 1,
            })


if __name__ == "__main__":
    unittest.main()
