# Project layout

`index.html` is the main entry point at the repository root. Paths work both at a domain root and below a deployment prefix such as `/RELIC/`.

```text
index.html             Solar System entry point
pages/                 Earth and planetary terrain pages
src/
  atlas/               Solar System, orbital data and atlas styles
  worlds/              Earth and planetary renderers, terrain and imagery
  ui/                  Shared controls, settings, dialogs, navigation and styles
  core/                Provider configuration, requests, application paths and bootstrap
  search/              Place search and coordinate parsing
intro/                 Documentary player, captions, styles and published film media
server/
  live_sources/        JPL and NOAA clients and server cache
  terrain_server.py    HTTP server and generated terrain/imagery endpoints
  earth_surface.py     Runway corrections and Earth surface helpers
  planetary_patches.py Local scientific terrain and imagery products
  place_search.py      Backend geocoding
assets/                Images, identity and packaged terrain datasets
vendor/                Third-party browser libraries and their licenses
tools/                 Static build, asset preparation and film production tools
tests/                 JavaScript and Python checks
docs/                  Architecture and branding documentation
```

## Run and build

Activate your Python environment, install `requirements.txt`, then run `python -m server` from the repository root. The server serves that root and implements the `/api/` routes. A generic HTTP server provides the static experience.

`node tools/build_static.mjs` assembles `dist/` from the entry point, pages, browser modules and deployable assets. Backend sources, documentation, tests, local configuration files and development environments are excluded. `dist/` is generated and is not committed.

`sw.js` remains at the root so its scope covers the whole application. `manifest.webmanifest`, repository documentation, license notices and deployment configuration also retain their conventional root locations. The movie's media URLs remain under `intro/assets/` for stream and offline-cache consistency.

## Working on the application

Use relative module imports between source folders. Use `appURL()` from `src/core/paths.js` for document-independent page, asset and API URLs. Ordinary CSS files live beside the feature they style.

The private and public editions share this layout. Each edition keeps its own `src/core/api-config.js` and provider interface. Preserve that separation when synchronizing changes.

Run `node --experimental-vm-modules --test tests/*.mjs`, `python -m unittest discover -s tests -v` and the static build after changing paths or deployment behavior.

The default Python suite uses local fixtures. Set `NASA_ATLAS_LIVE_TESTS=1` to enable upstream NASA/NOAA integration checks; JPL also requires `NASA_ATLAS_CONTACT`. Symbolic-link checks report a skip when the operating system cannot create their fixtures.
