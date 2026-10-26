import json
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import download_overture_roads


class OvertureDownloadTests(unittest.TestCase):
    def test_release_candidates_skip_future_and_old_releases(self):
        calendar = {"releases": [
            {"date": "2026-10-21", "dataVersion": "2026-10-21.0"},
            {"date": "2026-09-25", "dataVersion": "2026-09-23.1"},
            {"date": "2026-11-18", "dataVersion": "2026-11-18.0"},
            {"date": "2026-06-17", "dataVersion": "2026-06-17.0"},
        ]}
        self.assertEqual(download_overture_roads.release_candidates(calendar, date(2026, 10, 27)),
                         ["2026-10-21.0", "2026-09-23.1"])

    def test_download_falls_back_to_latest_queryable_release_and_records_checksum(self):
        calendar = {"releases": [
            {"date": "2026-10-21", "dataVersion": "2026-10-21.0"},
            {"date": "2026-09-25", "dataVersion": "2026-09-23.1"},
        ]}
        calls = []

        def extract(release, bbox):
            calls.append((release, bbox))
            if release == "2026-10-21.0":
                raise RuntimeError("temporarily unavailable")
            return [{"type": "Feature", "id": "road-id", "geometry": {
                "type": "LineString", "coordinates": [[81.7, 7.7], [81.71, 7.71]]},
                "properties": {"id": "road-id", "subtype": "road", "class": "residential"}}]

        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "segments.geojson"
            metadata_path = Path(tmp) / "release.json"
            result = download_overture_roads.download_latest(
                output, metadata_path, [81.7, 7.65, 81.77, 7.72], calendar=calendar,
                extractor=extract, today=date(2026, 10, 27))
            data = json.loads(output.read_text(encoding="utf-8"))
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            self.assertEqual([call[0] for call in calls], ["2026-10-21.0", "2026-09-23.1"])
            self.assertEqual(result["release"], "2026-09-23.1")
            self.assertEqual(data["features"][0]["id"], "road-id")
            self.assertEqual(metadata["sha256"], result["sha256"])
            self.assertEqual(metadata["feature_count"], 1)

    def test_empty_extract_fails_instead_of_creating_an_empty_refresh(self):
        calendar = {"releases": [{"date": "2026-10-21", "dataVersion": "2026-10-21.0"}]}
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(RuntimeError, "no road segments"):
                download_overture_roads.download_latest(
                    Path(tmp) / "segments.geojson", Path(tmp) / "release.json", [81.7, 7.65, 81.77, 7.72],
                    calendar=calendar, extractor=lambda *_: [], today=date(2026, 10, 27))


if __name__ == "__main__":
    unittest.main()
