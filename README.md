# NFC Router

Static NFC landing page with a tiny Cloudflare control plane.

## How it works

- Host the `site/` directory on Cloudflare Pages.
- The page calls `/api/resolve` on every visit.
- Cloudflare Functions + D1 decide the next redirect, so behavior is shared across all visitors instead of being tied to one browser.
- The Expo app updates `/api/config`, which resets the server-side state automatically.

## Config

Config shape:

- `mode`
  - `sequential`: A -> B -> C ... then hold on the last destination.
  - `random_no_repeat`: randomized weighted cycle with no repeats until exhausted, then reshuffle.
  - `karma`: pauses redirects and shows a message.
- `stateStore`
  - kept for backward compatibility with the old local fallback config format.
- `storageKeyPrefix`: namespace to isolate versions/configs.
- `karmaMessage`: text shown when `mode` is `karma`.
- `campaignParams`: query params appended to every destination URL (`utm_*` etc).
- `destinations`:
  - simple mode: `"https://example.com"`
  - weighted mode: `{ "url": "https://example.com", "weight": 3 }`
  - weights are mainly useful in `random_no_repeat`; higher weight appears more times in each full cycle.

## Cloudflare setup

1. Create a Cloudflare Pages project for this repo.
2. Create one D1 database.
3. Add the `ADMIN_TOKEN` secret.
4. Deploy with `wrangler` using `site/` as the Pages output directory.
5. Point your NFC card at the deployed root URL.

The Functions auto-create the required tables on first use, so the D1 binding is the only mandatory storage setup.

## API

- `GET /api/config`
  - returns the current config
- `PUT /api/config`
  - requires `Authorization: Bearer <ADMIN_TOKEN>`
  - saves config and resets routing state
- `GET /api/resolve`
  - returns the next redirect target
- `GET /api/resolve?preview=1`
  - returns the next redirect target without consuming it
- `GET /api/resolve?reset=1&preview=1`
  - requires admin auth
  - resets state and shows the next destination without consuming it

## Mobile app

An Expo app lives in `mobile/`.

- Page 1: big mode buttons `Destiny`, `Nature`, `Karma`
- Page 2: swipe right from the home screen to edit sites, weights, campaign params, and mode-related copy
- Save pushes config to `/api/config`

## Local quick check

```bash
wrangler pages dev
```

The Pages output directory is now `site/`, and the static page expects `/api/resolve` to exist.
