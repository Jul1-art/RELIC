# Third-party notices

The [Apache License 2.0](LICENSE) applies to original RELIC code and original interface artwork. It does not replace the terms of the third-party materials below. Preserve upstream copyright notices, licenses, dataset credits and required on-screen provider attributions when sharing a modified build.

## Software

| Component | License / notice | Upstream |
| --- | --- | --- |
| CesiumJS 1.138.0 | Apache 2.0, with separately licensed dependencies documented in its full upstream license and dependency catalog. Preserve [CESIUM-LICENSE.txt](vendor/CESIUM-LICENSE.txt), [CESIUM-NOTICE.txt](vendor/CESIUM-NOTICE.txt) and [CESIUM-THIRD-PARTY.json](vendor/CESIUM-THIRD-PARTY.json). | [CesiumJS](https://github.com/CesiumGS/cesium) |
| Three.js r164 and OrbitControls | MIT; preserve [THREE-LICENSE.txt](vendor/THREE-LICENSE.txt) | [Three.js](https://github.com/mrdoob/three.js) |
| HLS.js 1.6.15 | Apache 2.0, with bundled derived-component notices; preserve `intro/assets/vendor/hls.LICENSE.txt` | [HLS.js](https://github.com/video-dev/hls.js) |
| Font Awesome Free icons | CC-BY 4.0 for the icon artwork; upstream code is MIT where applicable. Font files, if added, use SIL OFL 1.1. | [Font Awesome Free license](https://fontawesome.com/license/free) |
| Kokoro-82M voice model | Apache 2.0; model files are external build inputs | [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M) |
| kokoro-onnx | MIT; external narration-build dependency | [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx) |

Python dependencies such as NumPy, Pillow, Requests and SciPy retain the licenses distributed with their packages. Installing them does not relicense them as RELIC code.

The Cesium license file is the complete upstream `cesium@1.138.0/LICENSE.md`, including its dependency license texts; it is not only the Apache license heading. The accompanying `ThirdParty.json` lists 23 upstream components under Apache 2.0, MIT, BSD-3-Clause and ISC terms. DOMPurify's entry documents the upstream Apache 2.0 licensing option. Keep the full files rather than replacing them with a summary.

## Maps, scientific data and online services

- **NASA, JPL, USGS and mission partners:** Blue Marble, GIBS, Trek, SRTM, MOLA, LOLA, HiRISE and LROC products retain their source and creator credits. Much NASA-origin material is not subject to copyright in the United States, but separately credited partner material, marks and other restrictions still apply. Consult the [NASA media guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/), [JPL image-use policy](https://www.jpl.nasa.gov/jpl-image-use-policy/) and each dataset's source page. Do not claim all material is public domain worldwide.
- **Solar System Scope / INOVE textures:** CC-BY 4.0. Credit **Solar System Scope**, link the [source textures](https://www.solarsystemscope.com/textures/) and [CC-BY 4.0 license](https://creativecommons.org/licenses/by/4.0/), and identify recompression, conversion, cropping or other changes. These are visualization maps, with artistic processing, rather than unmodified live observations.
- **OurAirports runway data:** public-domain source data, with project-specific processing. See [OurAirports data](https://ourairports.com/data/). Any separately cited official aeronautical data retain their source conditions.
- **Photon / OpenStreetMap:** geocoding results derive from OpenStreetMap data, subject to the [OpenStreetMap attribution and database license](https://www.openstreetmap.org/copyright). The public Photon service has its own operational limits; see [Photon](https://github.com/komoot/photon).
- **Esri World Imagery:** an online service subject to Esri and imagery-provider terms and attribution. RELIC's code license grants no rights to redistribute its tiles. Preserve the credits supplied by the service.
- **Google Photorealistic 3D Tiles via Cesium ion:** subject to Google, Cesium and provider terms, quotas and eligibility. Preserve the required on-screen credits. A user's access token does not grant unrestricted rights to download or redistribute the tiles. See the [Cesium integration documentation](https://cesium.com/learn/cesiumjs-learn/cesiumjs-photorealistic-3d-tiles/).
- **NASA/JPL Horizons and NOAA SWPC:** calculated ephemerides and near-Earth space-weather data retain their source identification and timestamps. Respect the [JPL API usage policy](https://ssd-api.jpl.nasa.gov/doc/index.php), including the configured server contact and request limits.

## Documentary picture and archive recordings

The supplied documentary is an edited educational and historical compilation. **It is not an Apache-licensed stock-media collection.** Keep the film credits and source manifest with it. A fork can replace or omit the film while retaining the Apache-licensed application code.

| Material | Credit and applicable terms |
| --- | --- |
| NASA visualizations and mission footage | NASA and the individual centers, creators and partners identified in the source manifest. Apply NASA/JPL media guidance and item-specific notices; no endorsement is implied. |
| Sputnik museum flight-spare footage and Gagarin visual archive | © ESA. Educational, editorial and informational reuse under [ESA media terms](https://www.esa.int/ESA_Multimedia/Terms_and_conditions_of_use_of_images_and_videos_available_on_the_esa_website), with appropriate credit. These clips are not designated public domain. |
| Columbus installation footage | © ESA; historical mission footage within the ESA compilation. ESA media terms and source credits remain applicable. Original source-program music is not reused. |
| Webb separation footage | © ESA/Arianespace; camera: Réaltra Space Systems Engineering. ESA Standard Licence for educational, editorial and informational use. Commercial use requires separate authorization under the source terms. The source program's music is not reused. |
| Philae / Rosetta animation | DLR, [CC-BY 3.0 Germany](https://creativecommons.org/licenses/by/3.0/de/deed.en). Silent excerpts are cropped, retimed and edited; the source interviews and music are not reused. |
| Rosetta’s final descent, 30 September 2016 | © ESA / ATG medialab. [Visualising Rosetta’s descent](https://www.esa.int/esatv/Videos/2016/09/Visualising_Rosetta_s_descent), ESA Standard Licence. A scientific animation of the controlled descent, not a camera recording. Silent edited excerpt; the source soundtrack is not reused. Rosetta and Philae both remain on comet 67P. |
| Enterprise aboard the Boeing 747, 1977 | NASA / US National Archives, 330-DIMOC-VANDBRG00347. [Archive and context](https://unwritten-record.blogs.archives.gov/2020/04/09/the-space-shuttle-in-the-atmosphere/). US government public-domain footage of atmospheric flight tests; Enterprise did not fly in orbit. |
| STS-135 final landing, 21 July 2011 | NASA Kennedy Space Center. [Original archive](https://images.nasa.gov/details/ksc_072111_sts135_landing). NASA public-domain footage, cropped to remove embedded margins and edited into the documentary. |
| Soyuz TMA-22 launch, 14 November 2011 | NASA TV / Roscosmos, [Expedition 29 Launches to the Space Station](https://archive.org/details/nasa_tv-Expedition_29_Launches_to_the_Space_Station), original NASA video `-LwNaMMMFws`. The NASA archive and mission-partner credits remain applicable under [NASA media guidance](https://www.nasa.gov/nasa-brand-center/images-and-media/). Silent excerpt of the actual snowy Baikonur launch; the source commentary is not reused. |
| Laika historical portrait excerpt | The Vintage Space / Amy Shira Teitel. The documented source mirror identifies [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/). A silent excerpt is trimmed and mixed with new narration. |
| Forest dinosaur reconstruction | MostafaElTurkey36 / Pixabay, under the [Pixabay Content License](https://pixabay.com/service/license-summary/). Incorporated into the documentary; the original stock file is not supplied for standalone redistribution. |
| V1 and Universal Newsreel V2 footage | Source-specific CC0/public-domain notices recorded in the manifest; retain the historical source credits. |
| Kennedy, Apollo 11 countdown and Armstrong recordings | John F. Kennedy Presidential Library and Museum / NASA, as specified in the manifest. The documented recordings are public domain in the United States; the app does not synthesize these historical speakers. |
| Gagarin's short “Поехали” recording | Source: Wikimedia Commons. The source identifies the one-word recording as public domain in Russia; this is not a blanket worldwide public-domain claim for Soviet recordings. |
| Sputnik radio signal | Historical signal distributed by NASA NSSDCA. Preserve that attribution and the source-specific context; do not imply NASA created the Soviet signal. |
| Falcon launch and landing footage | NASA and U.S. Space Force creators identified in the manifest. The source-specific U.S. government media notices apply; no NASA or SpaceX endorsement is implied. |

The ESA and other non-Apache media conditions remain relevant when repurposing the complete film. The repository's code license does not remove those conditions or grant rights in the people, logos or trademarks appearing in footage.

## Music, sound and narration

- **“Helios” by Scott Buckley — released under CC-BY 4.0. www.scottbuckley.com.au.** [Source](https://www.scottbuckley.com.au/library/helios/) · [License](https://creativecommons.org/licenses/by/4.0/). Edited into long passages, mixed, normalized and attenuated beneath speech. This is not a film-studio soundtrack.
- **Typing:** Cassie-OrbitGames, [Typewriter Sounds](https://opengameart.org/content/typewriter-sounds), CC0 1.0.
- **Whoosh:** pyranostudios, [Air Whoosh](https://opengameart.org/content/air-whoosh), CC0 1.0.
- **Impact:** NenadSimic, [Muffled Distant Explosion](https://opengameart.org/content/muffled-distant-explosion), CC0 1.0.
- New English and French narration uses stock Kokoro synthetic voices. It is not a human-actor recording or a clone of a historical speaker. The historical excerpts retain their genuine recordings.

The asset and film source manifests record source URLs, credits, transformations, selected excerpts and checksums. Retain those records when redistributing the supplied assets; update them when replacing media.

## Static-host data fallback

- Calculated orbital distances and speeds use the NASA/JPL approximate planetary element model for 1800–2050, with source and model timestamps shown in the interface. They are estimates, not live telemetry: https://ssd.jpl.nasa.gov/planets/approx_pos.html .
- Solar-wind readings come from NOAA SWPC real-time summary data and carry their observation timestamp. Missing or expired readings are omitted rather than invented.
- Browser place-search fallback uses Photon / OpenStreetMap and the Open-Meteo geocoding API with GeoNames data. OpenStreetMap attribution and ODbL terms apply to its data; Open-Meteo and GeoNames data retain CC BY 4.0 terms. Preserve the displayed provider credits: https://open-meteo.com/en/docs/geocoding-api and https://www.geonames.org/ .
