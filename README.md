# OrbitDodge

A one-tap arcade dodger. Your ship orbits a planet — **tap / click / press Space** to switch between the inner and outer orbit. Asteroids drift along both orbits. If one is on your orbit at your position, you're space dust. Survive as long as you can.

Zero dependencies. Zero build step. Just open `index.html` in a browser.

## Play

- **Online demo:** *(deployed separately per release)*
- **Locally:** open `index.html` in any modern browser — desktop or mobile. No server, no bundler, no install.

## Controls

| Input | Action |
|---|---|
| Tap / click / Space / ↑ / W | Switch orbit (also: start game, restart after game over) |
| 🔊 button (top-right) | Mute / unmute |

## Features

- **One-button mechanic** — switch between inner and outer orbit with smooth animated transitions
- **Real game loop** — title screen with how-to → playing (live HUD: time + best) → explosion → game-over screen → tap to restart (with accidental-tap guard)
- **Scoring** — score = seconds survived; best score persisted in `localStorage`
- **Difficulty curve** — asteroid speed and spawn density ramp up the longer you survive; ship speed creeps up too
- **Fair spawns** — asteroids always spawn on the far side of the planet, never on top of you
- **Juice** — glowing planet, parallax starfield, engine trail, death particle burst, screen flash
- **Synthesized SFX** — WebAudio blips for orbit switch, noise-burst explosion, new-record fanfare. No audio files.
- **Mobile-first** — portrait 480×720 playfield letterboxed with preserved aspect ratio, `touch-action: none`, Pointer Events, thumb-sized tap targets, HUD readable at 390px width, no horizontal overflow

## Tech

- Plain HTML + CSS + JavaScript, Canvas 2D — no libraries, no CDN, no build tools
- Pure game logic (collision, spawn, difficulty curve) is DOM-free and unit-tested with `node:test`
- Automated headless playtest drives the real production script: title → play → switch → collide → game over → restart, asserting zero console errors

## Tests

```bash
node --test test/
```

- `test/logic.test.js` — 9 unit tests over the pure logic block, extracted verbatim from `index.html`
- `test/playtest.js` — 8 headless end-to-end tests driving the production page code in a stubbed DOM

## Project structure

```
orbitdodge/
├── index.html   # the entire game (inline CSS + JS)
├── test/
│   ├── logic.test.js    # unit tests (pure logic)
│   └── playtest.js      # headless automated playtest
├── README.md
├── LICENSE
└── .gitignore
```

## Limitations

- Best score lives in the browser's `localStorage` — per-device, no cloud sync, cleared if site data is wiped.
- Single endless mode; no levels, power-ups, or leaderboards (yet — see below).

## Future ideas

- Power-ups (shield, slow-mo), boss asteroids, daily seeded challenge mode, online leaderboard.

## License

MIT — see [LICENSE](LICENSE).
