# Security

## Report a vulnerability

Use GitHub's private vulnerability-reporting option on the repository's **Security** page when it is enabled. If a private channel is not available, open a minimal issue asking the maintainers for a private reporting route without publishing exploit details or credentials.

Include the affected version or commit, impact, a reproducible description and a minimal demonstration when appropriate. Remove access tokens, personal data and unrelated service information from your report.

Ordinary interface bugs and feature requests can use public issues.

## Provider tokens and local configuration

- Supply your own browser-facing, read-only Cesium ion token through the app's API-key settings. Restrict it to the deployment origins and access it needs.
- Local browser storage is not an encrypted credential vault. The browser must send its token to the provider to request tiles. Do not paste account-administration tokens or server-only secrets into the UI.
- Use the app's forget control to remove a saved token on a shared device. Revoke a token at its provider if it has been disclosed.
- Keep environment files, service-account credentials, certificates, caches and logs out of Git. `.gitignore` helps prevent accidental additions but does not remove content already committed.
- The blank `config/.env.example` documents the server's JPL contact setting. Choose your own public contact; do not copy another person's configuration.
- Do not add public endpoints that return server-only credentials, and do not cache credential-bearing responses in the application service worker.

If you accidentally publish a credential, revoke it first. Then remove it from the affected files and repository history as appropriate. Deleting the current line alone does not revoke the credential or erase an earlier commit.

## Hosted installations

Use HTTPS and an appropriate reverse proxy for a public server. Keep dependencies updated, limit upstream request concurrency and quotas, and retain the backend's validation and private-file access restrictions. A static deployment does not provide the Python endpoints; do not replace missing data with invented telemetry.
