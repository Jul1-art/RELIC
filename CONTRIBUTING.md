# Contributing to RELIC

Everyone is welcome to contribute. You can propose a feature, suggest a reliable dataset, improve a translation, report a bug, review a pull request or submit code.

## Start a discussion

Use [GitHub issues](https://github.com/Jul1-art/RELIC/issues) for reproducible bugs and improvement proposals. Describe the result you want, why it helps people explore, and any relevant constraints. For bugs, include the browser, device, steps to reproduce and expected behavior. Remove tokens and personal information from screenshots and logs.

For a substantial change, open an issue before investing in a large implementation so contributors can discuss the approach. Small fixes can go directly to a pull request.

## Submit a change

1. Fork the repository and create a branch for one focused change.
2. Follow the local setup in [README.md](README.md).
3. Make the change, retaining third-party notices and source credits.
4. Run the relevant checks and describe the results in your pull request.
5. Explain the concrete problem and resulting behavior. Add phone and desktop screenshots when they help reviewers assess a visual change.

Useful checks include:

```sh
python3 -m unittest discover -s tests -v
node --experimental-vm-modules --test tests/test_api_config.mjs tests/test_lunar_physics.mjs
node tools/build_static.mjs
```

Check both the full Python-server mode and the static fallback when your change affects data loading. For interface work, check narrow portrait and landscape layouts, touch targets, keyboard access and reduced-motion preferences. For key handling, verify missing, saved, cleared and unavailable-provider states without using a real credential in the test fixture.

## Scientific and historical additions

- Cite primary or otherwise reliable sources, including dates and the exact product or mission represented.
- Keep measurements, calculated ephemerides, approximate displays and fictional simulations distinguishable.
- Respect source resolution, timestamps, request policies and failure states. Do not present cached or unavailable data as current.
- Do not add unverified equipment locations or telemetry. A missing value is preferable to an invented measurement.
- Identify reconstructed imagery and illustrative footage accurately. Preserve rights and creator attribution when editing media.
- Keep English and French text consistent when changing shared interface or film content.

## Code, credentials and licensing

Keep credentials out of source, fixtures, commit messages, screenshots and issues. Browser-facing provider tokens belong in the local API-key panel. Server settings belong in an ignored local environment file or your hosting environment. Use the blank `.env.example` for documentation.

By submitting an original contribution for inclusion, you agree to license it under Apache 2.0. Identify any third-party material you introduce and supply its source, applicable license and required notices; the project's license does not override those terms.

Be specific, patient and respectful in reviews. Explain the behavior or evidence behind a suggestion, and help others reproduce your findings.
