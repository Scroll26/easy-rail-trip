# Rail Planner

An offline-first trip planner for Interrail journeys across Europe. It is an installable web app (PWA) that runs on Android and Windows, with no server and no costs.

Live app: https://scroll26.github.io/rail-planner/

## What it does

- Map with the Interrail countries highlighted, currency zones with current euro rates, and a choice of how much map text to show
- Places and people with notes, groups (with colours), filters by group or country, and drag-to-reorder
- Tap a city or point of interest on the map to add it to your places
- Timeline with only the days you plan, collapsed gaps, trains, stays and notes, plus a one-day map view

Trip data is stored only on your own devices (IndexedDB) and is never uploaded to this repository.

## Development

```sh
cd app
npm install
npm run dev
```

Every push to `main` builds the app and publishes it to GitHub Pages (`.github/workflows/deploy.yml`).

Map data © OpenStreetMap contributors, tiles by OpenFreeMap, borders from Natural Earth.
