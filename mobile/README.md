# Mobile Controller

Simple Expo controller for the NFC router.

## What it does

- Home screen with three large mode buttons:
  - `Destiny` -> `sequential`
  - `Nature` -> `random_no_repeat`
  - `Karma` -> `karma`
- Swipe right from the home screen to open the site editor
- Edit destinations, weights, campaign params, and `karmaMessage`
- Pull the live config from Cloudflare and push updates back to `/api/config`
- Preview the next redirect or reset the live flow

## Run it

```bash
cd mobile
npm install
npm start
```

Then open it in Expo Go, iOS Simulator, Android Emulator, or the web preview.

The app is currently wired directly to the live Cloudflare Pages deployment and uses a built-in admin token.
