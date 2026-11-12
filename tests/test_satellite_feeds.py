import tempfile
import unittest
from pathlib import Path
from server.live_sources.satellites import SatelliteFeeds, TTL, MAX_AGE

TLE = ('ISS (ZARYA)\n'
       '1 25544U 98067A   26315.85209532  .00008096  00000+0  15318-3 0  9994\n'
       '2 25544  51.6324 289.3631 0007314  15.2015 344.9192 15.49321770594643\n')

class Response:
    def __init__(self, status=200, text=TLE):
        self.status_code = status
        self.text = text
        self.headers = {'Retry-After': '120'}
        self.closed = False
    def iter_content(self, size):
        yield self.text.encode()
    def close(self):
        self.closed = True

class FeedTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.time = 1800000000
        self.calls = []
        self.response = Response()
        def fetch(url, **kwargs):
            self.calls.append((url, kwargs))
            return self.response
        self.feeds = SatelliteFeeds(Path(self.temp.name), fetch=fetch, now=lambda: self.time)
    def test_cache_and_fixed_upstream(self):
        self.assertEqual(self.feeds.read('active')['state'], 'MISS')
        self.assertTrue(self.response.closed)
        self.assertEqual(self.feeds.read('active')['state'], 'HIT')
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(self.calls[0][0], 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle')
    def test_full_starlink_feed_is_allowed(self):
        self.assertEqual(self.feeds.read('starlink')['state'], 'MISS')
        self.assertIn('GROUP=starlink', self.calls[0][0])
    def test_stale_and_host_cooldown(self):
        self.feeds.read('stations')
        self.time += TTL + 1
        self.response = Response(429)
        self.assertEqual(self.feeds.read('stations')['state'], 'STALE-ERROR')
        with self.assertRaises(RuntimeError):
            self.feeds.read('active')
        self.assertEqual(len(self.calls), 2)
    def test_expired_cache_is_not_served(self):
        self.feeds.read('stations')
        self.time += MAX_AGE + 1
        self.response = Response(503)
        with self.assertRaises(RuntimeError):
            self.feeds.read('stations')
    def test_invalid_group_never_contacts_upstream(self):
        with self.assertRaises(ValueError):
            self.feeds.read('https://example.com')
        self.assertEqual(self.calls, [])
    def test_html_errors_are_not_cached(self):
        self.response = Response(200, '<html>Error</html>')
        with self.assertRaises(RuntimeError):
            self.feeds.read('active')
        self.assertEqual(list(Path(self.temp.name).glob('*.json')), [])

if __name__ == '__main__':
    unittest.main()
