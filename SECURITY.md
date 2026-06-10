# Security Policy

## Reporting

Report security issues privately to the project owner. Do not include passwords, payment details,
private identifiers, or unrelated personal information in reports.

## Operational Notes

- The backend sends `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy` headers.
- `CLIENT_HASH_SECRET` should be set in production-like deployments so request-log client hashes
  rotate without being comparable across deployments.
- Submitted solution records are intended to stay anonymous gameplay records and should not be tied
  to accounts, ad identifiers, or support messages without a reviewed product and privacy reason.

## Advertising And Third-Party Scripts

Advertising integrations require a privacy and security review before launch.

- Use official provider instructions for any ad script, tag, iframe, or consent manager.
- Keep ad scripts out of the game logic and solution-submission payload.
- Review cookie, local storage, request logging, and consent behavior before enabling ads for users.
- If a Content-Security-Policy is added, include only the minimum script, frame, image, connect, and
  reporting sources needed by the selected ad provider.
- Do not click live ads during verification. Use provider preview or test tools.
