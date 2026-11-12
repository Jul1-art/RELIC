# Earth satellites and the ISS

The Earth detailed globe (the main atlas and `pages/earth.html`) displays the
public CelesTrak catalogue using the satellite pipeline and design from
[God’s Eye View by Bilawal Sidhu](https://github.com/bilawalsidhu/gods-eye-view),
pinned at `10a788db78f0657e2eb5f8cdd830e6417aed354d`.

Open **Satellites** to filter the same six classes, search a satellite by name
or NORAD number, or locate ISS. Selecting an object shows its orbital ring and
current calculated position. **Follow** uses the reference project's camera
offsets. Touching the globe stops following so normal navigation takes over.
The ISS is red with a persistent label and orbit. Starlink and the rest of the
fleet are enabled by default; their positions are updated in bounded slices.

This is a catalogue of public elements, not a complete inventory of every
object in space. It includes the full `starlink` dense feed and `active` feed used by GEV Space Missions
and GEV's `stations`, `visual`, `gps-ops`, `glo-ops`, `galileo`, `geo`, `resource`,
`weather`, `planet`, `sar`, and `science` groups, deduplicated by NORAD number.
Class assignment uses GEV's name/group classifier; no UCS or SATCAT ownership
pack is imported. It cannot show objects for which those feeds publish no
recent orbital elements. Data-source failures are shown as partial, stale or
unavailable, never as an invented position.

The calculation uses TLE + satellite.js 6.0.2 SGP4, Greenwich sidereal time,
and geodetic / WGS84 Earth-fixed positions, as in GEV. It runs at the current
wall-clock time, independently of the atlas's simulated planetary date. The
card labels the calculated time and the element epoch separately. Elements
more than 14 days from the calculation time are rejected (GEV coverage policy).
No measured live ISS telemetry or fixed/demo orbital position is substituted.

The ISS and selected orbit are built synchronously and rotated by the change
in GMST, with a fresh bake after 30 minutes (GEV's rendering policy). Rendering
all thousands of orbital lines simultaneously would obscure the globe, so only
the ISS and selected satellite have orbit lines, as in the reference layer.

## Hosting

CelesTrak needs no API key, but does not supply browser CORS headers. The
same-origin `/api/celestrak/<group>` relay is required:

- Cloudflare Workers: `workers/index.js` and the `ASSETS` binding in
  `wrangler.toml` serve the relay alongside the existing static build.
- Existing Python server: `server/live_sources/satellites.py` provides the same
  route through `server/terrain_server.py`.
- A purely static GitHub Pages host cannot serve this relay. The UI reports
  that the source is unavailable; it does not bypass CORS with another service.

The relay accepts only the named groups, caches each feed for six hours,
coalesces requests, observes upstream retry cooldowns, and returns marked stale
copies on an upstream error. A bounded browser cache survives changing views.
No credentials or new cloud-service keys are needed. The browser stops its
fetches and timers when the view is destroyed and pauses rendering work when
hidden or suspended.

Original code, adaptation notes, checksums and the MIT notices are retained in
`vendor/gods-eye-view/satellites/PROVENANCE.json` and `vendor/satellite/`.

## Whole-constellation Starlink view

The dedicated `starlink` feed is loaded immediately after stations. Its full
catalogue is published and rendered before unrelated groups finish loading;
the `active` feed complements it rather than limiting Starlink membership.
Every valid Starlink record produces a point, with no representative subset.
The dense markers are cyan and four screen pixels wide so that the shell
remains readable against space and Earth imagery. Their positions retain the
SGP4-derived altitude: the visible shell is not a decorative circle.

**Starlink view** stops individual follow, shows the Starlink and stations
classes, and fits the globe plus the largest Starlink orbital apogee into both
screen dimensions. It collapses the catalogue panel to reveal the complete
globe, and works in portrait and landscape. The Earth overview
also leaves room for the low Earth orbit shell. The layer compares complete
catalogue snapshot identities, so newly arriving records are added even when
the existing ISS record remains the same object.
