"""Offline checks for the server-side NASA refresh (no upstream network)."""
from __future__ import annotations

import csv
import io
import json
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import Mock, patch

from server.live_sources import horizons
from server.live_sources.planetary_ephemeris import PlanetaryEphemeris


CATALOGUE = json.loads((Path(__file__).resolve().parents[1] / "assets/ephemeris/planets-horizons.json").read_text())


class EphemerisTests(unittest.TestCase):
    def test_window_requests_utc_geometric_planet_center_and_parses_velocity_units(self):
        entry = CATALOGUE["bodies"]["earth"]
        stream = io.StringIO()
        writer = csv.writer(stream)
        for state in entry["states"][:5]:
            writer.writerow([state[0], "A.D. sample UTC", *state[1:], ""])
        result = "Target body name: Earth (399) {source: DE441}\n$$SOE\n" + stream.getvalue().rstrip() + "\n$$EOE"
        response = Mock()
        response.json.return_value = {"signature": {"version": "1.2"}, "result": result}
        at = datetime(2026, 10, 29, 12, 30, tzinfo=timezone.utc)
        with patch.object(horizons.requests, "get", return_value=response) as get:
            value = horizons.fetch_window("earth", at)
        params = get.call_args.kwargs["params"]
        self.assertEqual(params["COMMAND"], "'399'")
        self.assertEqual(params["TIME_TYPE"], "UT")
        self.assertEqual(params["OUT_UNITS"], "'KM-D'")
        self.assertEqual(params["CENTER"], "'500@10'")
        self.assertEqual(params["REF_PLANE"], "ECLIPTIC")
        self.assertEqual(params["VEC_CORR"], "NONE")
        self.assertEqual(params["START_TIME"], "'2026-10-29 11:30'")
        self.assertEqual(params["STOP_TIME"], "'2026-10-29 13:30'")
        self.assertEqual(value["states"], entry["states"][:5])

    def test_initial_endpoint_does_not_block_on_eight_nasa_requests_or_duplicate_refresh(self):
        service = PlanetaryEphemeris(Mock())
        with patch("server.live_sources.planetary_ephemeris.threading.Thread") as thread:
            first = service.snapshot()
            second = service.snapshot()
        self.assertTrue(first["refreshing"])
        self.assertEqual(first["bodies"], {})
        self.assertEqual(second["bodies"], {})
        thread.assert_called_once()
        thread.return_value.start.assert_called_once()
        self.assertTrue(thread.call_args.kwargs["daemon"])

    def test_cached_batch_refreshes_serially_and_reuses_each_ten_minute_window(self):
        cache = Mock()
        cache.get.side_effect = lambda _key, _ttl, loader: loader()
        service = PlanetaryEphemeris(cache)
        with patch.object(horizons, "fetch_window", side_effect=lambda body: {"body": body, **CATALOGUE["bodies"][body]}) as fetch:
            service._refresh()
        self.assertEqual(fetch.call_count, len(horizons.TARGETS))
        self.assertEqual([call.args[0] for call in fetch.call_args_list], list(horizons.TARGETS))
        self.assertTrue(all(call.args[1] == 600 for call in cache.get.call_args_list))
        self.assertEqual(set(service.bodies), set(horizons.TARGETS))
        self.assertFalse(service.refreshing)

    def test_changed_api_schema_and_unknown_targets_are_rejected(self):
        response = Mock()
        response.json.return_value = {"signature": {"version": "99.0"}, "result": ""}
        with patch.object(horizons.requests, "get", return_value=response):
            with self.assertRaises(ValueError):
                horizons.fetch_window("earth")
        with self.assertRaises(ValueError):
            horizons.fetch_window("unknown")


if __name__ == "__main__":
    unittest.main()
