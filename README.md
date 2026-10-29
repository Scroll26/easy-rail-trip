# Rail Planner

A free trip planner for Interrail journeys through Europe. Put the places you want to see and the people you want to visit on a map, plan your days, and keep everything with you, even without internet.

**👉 Open the app: https://scroll26.github.io/rail-planner/**

- **Free.** No account, no ads, no subscription.
- **Works offline.** Once installed, it opens and works without signal (search and new map areas need internet).
- **Private.** Your trip is stored on your own device, not on any server. You can optionally sync it through your own Google Drive.
- **Phone and computer.** The same app runs on Android, iPhone, Windows and Mac.

---

## 1. Install it

Rail Planner is a *web app*: you open it in the browser once, then "install" it. After that it has its own icon and opens full-screen like any other app. You don't need an app store, and installing takes a few seconds.

> You can also just use it in a normal browser tab without installing. Installing makes it easier to find and better at working offline.

### Android (Chrome)

1. Open **https://scroll26.github.io/rail-planner/** in **Chrome**.
2. Tap the **⋮** menu (top right).
3. Tap **"Install app"** (on some phones: **"Add to Home screen"** → **"Install"**).
4. The Rail Planner icon is now on your home screen and in your app list.

### iPhone / iPad (Safari)

1. Open the link in **Safari** (it must be Safari).
2. Tap the **Share** button (the square with an arrow pointing up).
3. Scroll down and tap **"Add to Home Screen"**, then **"Add"**.

### Windows / Mac (Chrome or Edge)

1. Open the link in **Chrome** or **Microsoft Edge**.
2. Click the **install icon** at the right end of the address bar (a small screen with a down-arrow), or open the browser menu → **"Install Rail Planner"** (Edge: **Apps → Install this site as an app**).
3. It opens in its own window. You'll find it in the Start menu or Launchpad.

---

## 2. How to use it

The screen has two parts: the **map**, and the **panel** with the tabs *Trip*, *Places*, *Trains*, *Budget* and ⚙️ *Settings*.

- **On a computer**, the panel is on the left.
- **On a phone**, the panel sits at the bottom. **Drag the tab bar up or down** (or tap the little grey bar) to make it bigger or smaller.

### The map

| Button | What it does |
|---|---|
| 📍 **Places ▾** / 🧑 **People ▾** | Show or hide pins. The **▾** menu lets you hide names or single groups |
| 🗺️ **Map ▾** | **🎫 Interrail:** Highlight / Dim others / Off: which countries your pass covers (teal) · **🛤️ Railway lines** (on by default): switch each kind on or off (high-speed red, main lines orange, branch lines yellow, narrow gauge brown, other grey) and the station dots (tap one for its name) · **⛴️ Ferries:** ferries with an Interrail benefit, *included in the pass* (only Superfast Italy–Greece, it uses a travel day) and *discount with the pass* (Stena, Tallink Silja, Blue Star…), each switchable; tap a ferry for details · **⚙️ Other:** map text (All / Countries only / None), 🛣️ streets (off by default), 💱 currencies (colours each currency zone and shows what 1 € is worth there), 🎨 pins in group colours |
| 🧳 **View trip ▾** | One tap for a clean map: by default only your pins with names, country names and your connections. Tap again for everything else. The **▾** menu sets what stays on while it's on (places, people, names, connections, Interrail countries, railway lines, ferries, streets, currencies, direct-train results, map text); *Reset to default* brings back the clean default. While it's on, the 📍 Places / 🧑 People buttons switch its own Places / People options |
| **+ / −** and the **compass** | Zoom. The compass needle always points north; tap it to turn the map back to north |
| ◎ | Show where you are right now |

**Tip:** tap a city, station or sight on the map and choose **"+ Add to places"** or **"🚆 Direct trains"**.

### Trip

Your route as **stops** (where you sleep and for how many nights) and the **connections** between them. The dates work themselves out: set **Trip starts**, and every stop begins where the one before ends. **Stay a night longer and everything after it moves along.**

- **+ Stop:** pick a town from your places, or search for one. Each new stop gets a rough connection from the stop before.
- **Tap a stop** to fly to it; **🗺️** shows only that stop on the map (the town, your bed and your things to do, numbered, plus the connections in and out).
- **✏️ on a stop:** the number of nights (0 = just passing through), **where you sleep** (one of your places, a person you know, or any name) with an optional **price**, and **things to do**: your places (nearest first) and notes. Give them a day and time once you know; until then they sit under *Anytime*.
- **Fixed dates (optional):** give a stop an arrival date, or a connection a departure date (a booked train, a concert), and it stays put (📌). Everything after it follows from that date. If the stop before doesn't fit, you see *"2 unplanned nights"* or *"overlaps by 1 night"* and a button that fixes it in one tap (*"Stay 2 more nights in Vienna"*). Clear a fixed date with *"Leave when the stop before ends instead"*.
- **Drag** (⠿) stops and connections to reorder them.
- **Pass travel days:** enter how many travel days your pass has (leave it empty for a continuous pass). The trip counts the days you travel; a night train counts once.
- **Today:** during the trip a card at the top shows tonight's bed, your next train (with ⚠ if it needs a reservation), today's things to do and today's spending.

#### Connections

- **🧭 General plan** (dashed purple): roughly how you get from one stop to the next.
- **🚆 Train connection** (solid blue): a concrete train, drawn **along the actual tracks**, with its trains, times and stops, whether **Interrail covers** each one (✓ covered, ✓ domestic only, ✕ not covered like Italo or Flixtrain, ? not on the list), and reservation needs.
- Between two stops without a connection you'll see **"How do you get here?"**: tap **🧭 Rough plan** or **🚆 Find a train**.
- **🚆 on a connection** opens the Trains tab for exactly that trip: from that station, on that day, with the stations near your next stop listed first. Tap **Use** and the connection becomes that train.
- **Tap a connection on the map** to open it in the Trip tab. While it's open, the map draws **each train in its own colour** (matching its card) with the stations where you change; tap a section on the map to pick that train.
- **Each train in its own section:** a train connection lists its trains one by one (from where to where, how long, operator, Interrail coverage, reservations), with the changes in between (*⇄ Change · 6 min*). **Tap a train** to highlight just that part of the route on the map (pink), or **tap a station** (also the stops in between) to jump to it. Tap again to clear.
- **Change where a connection starts or ends:** in the connection, **✏️ Change** next to *From* / *To* lets you type: your places (the stops it joins first), train stations and towns. **📍 On map** lets you tap the new spot instead (a pin, a station, a town or any point). The route is looked up again.
- **✏️ on a connection:** departure date (optional, see fixed dates above), night train (arrives the next day), ticket or reservation **price**, notes, swap the direction.
- **🚫 Avoid countries:** train connections are routed around the countries in your default list (Settings), e.g. your **country of residence**, which Interrail covers only on the way out and back home. Change the list on any connection for just that one (e.g. leave it out on the way home), or add countries you simply don't want to go through. The connection shows the countries it runs through and *✓ Stays out of Germany*, or *⚠ Runs through Germany* if no route around it was found (e.g. Copenhagen → Amsterdam). A start or end in an avoided country is fine. In the Trains tab, destinations in an avoided country are marked.
- **〰️ Draw a connection on the map:** tap a start and a destination (a pin, a station dot, a town or any point). Station to station becomes a train connection.

### Places and People

**Places** are things you want to see or do: cities, sights, restaurants, hostels, stations. Switch to **People** at the top of the tab for friends and family you want to visit.

- **Add a place:** search for it at the top and tap **+ Add**, tap **+ Place** and then the map, or tap a name on the map.
- **Each row** has three buttons: 🗂️ **group**, ✏️ **edit**, 🗑️ **delete**. **Tap the row itself** to fly to it on the map. **Reorder** by dragging the **⠿** handle.
- **Groups** (e.g. "Museums", "Must-see") get a colour. The **⚲ filter** button shows only one group or one country.
- **Status is automatic:** a place in your trip is *Planned*, and *Visited* once that day has passed. Everything else is an *Idea* (you can mark it *Visited* yourself).
- **In a place's editor:** **+ New stop** adds it to the end of your trip; **+ To do in …** adds it to the nearest stop.
- **People:** enter their **city** (enough for the map) or their exact **address**. Tick **"I can stay with them"** and they get a green ring on the map, and they come first when you choose where to sleep.

### 🚆 Trains: where can I go without changing?

Choose a station (search it, tap a station dot on the map, or pick one of your places). If a town has no railway station, the **Direct trains** button is greyed out. Every station you can reach **without changing trains** appears as a coloured dot: green is close, red is far. The list shows the travel time to each one.

- **Leaving:** morning, midday or evening (evening includes night trains)
- **Up to:** 4, 8 or 12 hours of travel
- **Only trains without compulsory reservation:** handy with an Interrail pass
- Tap a destination (in the list or on the map) to see **which train** goes there and whether **Interrail covers it**.
- **Fade the rest of the map** (on by default) makes the destinations stand out. The dots and the fading only show while the Trains tab is open; switch tabs and the map is back to normal, switch back and your results are still there.
- Tap 🚆 next to a destination to see **its** direct trains and hop along your route; tap 📍 to add it to your places.
- **＋ Trip** adds that train to your trip, with a new stop at the destination. Opened from the Trip tab, the button says **Use** and fills in that connection.
- Opened from your trip, it searches your **travel day**. If that day is more than about 6 weeks away (timetables aren't published that far ahead), it searches a typical weekday instead and says so.

Times count from the departure time you chose, so they include waiting for the first train. The timetables are not live, so check with the railway before you travel. Lookups you've done before also work offline.

### Budget

Set a **daily goal** (for example 50 €) and log what you spend; the app tells you whether you're **under or over budget** so far.

- **Add an expense:** type the amount, pick the currency (CZK, PLN, HUF, CHF, …), optionally tap a category (tap it again to remove it), then tap **Add**. It's converted to euros with that day's exchange rate, which is kept with the expense. Offline it's converted later.
- **The headline** shows how much you're under or over in total since the budget started (days × goal − spent), your daily spending so far, your average per day, the **total including one-off costs**, and today's spending. Tap ⚙️ in that card to set the daily goal and the start date.
- **Per day:** one bar per day with the goal marked; days over the goal turn red with ⚠. Tap a day to see and edit its expenses.
- **One-off costs** (the pass, prepaid hostels…): tick *One-off cost* so they don't spoil your daily numbers. They're listed and totalled separately.
- The budget starts with your trip unless you set a start date (⚙️ in the headline card).
- **Local currency:** while you're on the trip, a new expense starts in the currency of the country you're in.
- **Whole trip:** days × your daily goal, plus one-off costs paid, plus **bookings not paid yet** (the bed and ticket prices from your stops and connections). Tap **✓ Paid** when you've paid one; it becomes a one-off expense.
- **Per stop:** what each stop cost you so far, in total and per day.

### Settings ⚙️

- **Sync with Google Drive** (see below)
- **Backup:** export your whole trip as a file, or import one
- **Countries to avoid:** the default for all train connections (e.g. your country of residence)
- **Interrail countries:** change which countries are highlighted

---

## 3. Your data

- Everything you enter is saved **automatically, on your device**. You don't need a save button.
- Nothing is sent to us, except a trip you choose to share (see below).
- **Uninstalling the app or clearing the browser data deletes your trip** unless you've synced it or exported a backup.
- ⚙️ **Settings → Data & storage** shows how much space the app uses, can clear saved map areas, and can **delete your trip** on this device or everywhere (incl. Google Drive). It tells you before deleting whether the data can be recovered.
- Full details: [Privacy policy](https://scroll26.github.io/rail-planner/privacy.html)

### Sync between phone and computer (Google Drive)

In ⚙️ **Settings → Sync**, tap **"Connect Google Drive"** and sign in. Your trip is then saved in a **hidden app folder in your own Google Drive**. Only Rail Planner can see that folder; it doesn't touch your other files. Do the same on your other devices and they all share one trip.

- Changes sync automatically when you're online, and changes made offline are merged later. Nothing gets overwritten, even if you edited on two devices at once.
- **You stay signed in.** A small sign-in helper (a free Cloudflare Worker, `auth-worker/`) renews Google's one-hour access in the background, so there's no popup. It holds the app's Google secret and gives your browser an encrypted key that only it can read; it stores nothing itself. If the helper can't be reached, or you cleared the browser's data, a small **"Tap to sync"** button appears instead, and one tap reconnects.

### Share your trip (read-only)

⚙️ **Settings → Share your trip** gives you a short link to send to family or friends. They see your trip **the way *View trip* shows it** (the same pins, lines and map options) plus the trip list, and can tap any stop or connection for its details (dates, bed, things to do, each train). They can't change anything, and they don't need the app or an account. Opening a shared link never touches your own trip, even on your own phone.

- The link is a **snapshot**: it shows the trip as it was when you made it. **🔄 Update** replaces it with the trip as it is now; the link stays the same.
- **Delete link** removes it, and it stops working for everyone. Otherwise it's deleted automatically **a year after the last update**.
- It needs Google Drive sync: the sign-in helper keeps the shared copy.
- **Not shared:** prices and your budget, pins hidden in View trip, and people's addresses and contact details (only their name and roughly where they live).

### Backup / move without Google

⚙️ **Settings → Export backup** saves a file. On the other device, **Import backup** adds everything from that file.

---

## 4. Problems?

| Problem | Fix |
|---|---|
| I don't see "Install app" | Use Chrome (Android/PC), Edge (PC) or Safari (iPhone). In-app browsers like Instagram's can't install apps |
| A new version isn't showing | Close the app completely and open it again while online, twice if needed |
| The map is grey offline | Only areas you looked at while online are saved for offline use. Browse your route once before leaving |
| Search doesn't work | Search needs internet. Offline you can still tap **+ Place** and then the map |
| Sync says "Tap to sync" | The background sign-in didn't work (offline helper, cleared browser data, or access removed in your Google account). Tap it once to reconnect |
| Does it need internet? | Your own trip (places, people, stops, connections, budget) always works offline. Internet is needed for: map areas you haven't looked at yet, search, new direct-train lookups and train routes, fresh exchange rates and sync. Things you already looked up stay available offline |
| How much storage does it use? | The trip itself is tiny. Saved map areas take the most space (usually tens of MB, at most a few hundred), are capped and cleaned up automatically, and can be cleared in Settings |

---

## Licence

Rail Planner is open source under the [MIT licence](LICENSE): you may use, change and share the code, as long as the copyright notice stays in it.

## For developers

```sh
cd app
npm install
npm run dev
```

React + TypeScript + Vite, MapLibre GL, Yjs (local storage in IndexedDB, merged through Google Drive's app data folder). Every push to `main` builds and publishes to GitHub Pages (`.github/workflows/deploy.yml`).

Map data © OpenStreetMap contributors · tiles by OpenFreeMap · railway lines by [OpenRailwayMap](https://openrailwaymap.app) · timetables by [Transitous](https://transitous.org) ([sources](https://transitous.org/sources/)) · borders from Natural Earth · geocoding by Nominatim · exchange rates by open.er-api.com
