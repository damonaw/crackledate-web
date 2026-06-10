# Advertising Integration Notes

Last reviewed: June 9, 2026

## Recommendation

Use Google AdSense first if Crackle Date only needs simple monetization for web archive play.
Google Ads is the advertiser product for buying ads, not the publisher product for earning from ads
shown on this site. Google Ad Manager is better when the site needs direct-sold campaigns, multiple
networks, granular inventory controls, or a larger ad-ops workflow.

For the "date older than a week" idea, there are two practical AdSense paths:

- AdSense Offerwall with a rewarded ad if archive access should be gated behind an explicit user
  choice to watch an ad.
- A normal AdSense display ad unit near archive play if the user should still access the older
  puzzle without a blocking choice.

Archive puzzles use stable `/date/YYYY-MM-DD` URLs. The app accepts `/?date=YYYY-MM-DD` as a
compatibility entry point and normalizes it to `/date/YYYY-MM-DD`; choosing today's puzzle
normalizes back to `/`. Use the dated route as the ad-targeting surface for archive-specific rules.

## Privacy Requirements

- Keep `/privacy/` accurate before ads launch and after the chosen ad provider is configured.
- Disclose that ad partners may use cookies, browser storage, IP address, device or browser details,
  web beacons, or similar identifiers for ad serving, measurement, frequency capping, fraud
  prevention, and personalization where allowed.
- For EEA, UK, and Switzerland traffic, Google requires a Google-certified consent management
  platform integrated with the IAB Transparency and Consent Framework when using AdSense, Ad
  Manager, or AdMob.
- For applicable US state privacy laws, support opt-out and restricted-data-processing flows when
  required, including Global Privacy Control where applicable.
- Keep anonymous solution submission records separate from ad identifiers. Do not add ad IDs,
  cookie IDs, or consent strings to `/api/submissions` unless there is a reviewed product and privacy
  reason.

## Security And Policy Checklist

- Load ad scripts only from official provider instructions and pin the integration to the selected
  provider.
- Review security headers before launch. The Go server currently sends basic hardening headers but
  does not define a Content-Security-Policy, so adding one later must account for any ad script,
  iframe, image, and reporting endpoints.
- Keep ads away from game controls, calendar buttons, submit buttons, and other high-interaction
  areas to reduce accidental clicks.
- Do not ask users to click ads or describe ad clicks as a way to support the site.
- Label manual ad slots only with neutral labels such as "Advertisement" or "Sponsored".
- Do not test by clicking live ads. Use provider test tools, preview modes, or test query parameters.
- Add `ads.txt` at the site root only after the real publisher ID is available. Do not commit fake
  publisher IDs.
