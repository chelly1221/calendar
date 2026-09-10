"""Run with Radicale's Python environment and server/ on PYTHONPATH."""
import unittest
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'server'))
import sitecustomize  # noqa: F401
import vobject


class AppleLocationTests(unittest.TestCase):
    def test_geo_uri_preserves_both_coordinates_on_repeated_roundtrips(self):
        for parameter in ("", ";VALUE=URI"):
            text = "\r\n".join([
                "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//test//EN",
                "BEGIN:VEVENT", "UID:test", "DTSTAMP:20260911T000000Z",
                "DTSTART:20260911T090000Z", "DTEND:20260911T100000Z",
                r"SUMMARY:Meeting\, lunch",
                f"X-APPLE-STRUCTURED-LOCATION{parameter};X-TITLE=Park:geo:37.5,127.0",
                "END:VEVENT", "END:VCALENDAR", "",
            ])
            for _ in range(3):
                parsed = vobject.readOne(text)
                self.assertEqual(parsed.vevent.contents['x-apple-structured-location'][0].value, "geo:37.5,127.0")
                self.assertEqual(parsed.vevent.summary.value, "Meeting, lunch")
                text = parsed.serialize()
                self.assertIn(":geo:37.5,127.0\r\n", text)


if __name__ == "__main__":
    unittest.main()
