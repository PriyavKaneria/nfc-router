# Mobile Controller

Simple Expo controller for the NFC router.

## What it does

- Home screen with three large mode buttons:
  - `Destiny` -> `sequential`
  - `Nature` -> `random_no_repeat`
  - `Karma` -> `karma`
- Swipe right from the home screen to open the site and connection editor
- Edit destinations, weights, campaign params, `karmaMessage`, API base URL, and admin token
- Pull the live config from Cloudflare and push updates back to `/api/config`
- Preview the next redirect or reset the live flow

## Run it

```bash
cd mobile
npm install
npm start
```

Then open it in Expo Go, iOS Simulator, Android Emulator, or the web preview.

## Required backend values

- `apiBaseUrl`: your deployed Pages domain, for example `https://id.example.com`
- `adminToken`: must match the `ADMIN_TOKEN` Cloudflare environment variable
