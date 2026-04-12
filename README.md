# NFC Router (static)

Super-simple static router for NFC scans.

## How it works

- Host `index.html` and `router-config.json` on your domain (example: `id.priyavkaneria.com`).
- Each visit chooses one destination and immediately redirects.
- State is stored in browser storage, so the same browser can progress through a sequence or random cycle.

## Config

Edit `router-config.json`:

- `mode`
  - `sequential`: A -> B -> C ... then always last destination.
  - `random_no_repeat`: randomized cycle with no repeats until exhausted, then reshuffle/reset.
- `stateStore`
  - `local` (default): persists across browser restarts.
  - `session`: resets when tab/session is closed.
- `storageKeyPrefix`: namespace to isolate versions/configs.
- `campaignParams`: query params appended to every destination URL (`utm_*` etc).
- `destinations`:
  - simple mode: `"https://example.com"`
  - weighted mode: `{ "url": "https://example.com", "weight": 3 }`
  - weights are mainly useful in `random_no_repeat`; higher weight appears more times in each full cycle.

## Admin URLs

- `/?preview=1` => show next destination without redirecting.
- `/?reset=1` => clear router state keys, then continue normally.
- `/?reset=1&preview=1` => clear state and do not redirect.

## Local quick check

```bash
python -m http.server 8080
curl -i "http://127.0.0.1:8080/?preview=1"
curl -i "http://127.0.0.1:8080/?reset=1&preview=1"
```

Note: redirect logic is JavaScript-driven, so `curl` validates delivery of the page/status text, not browser storage behavior.
