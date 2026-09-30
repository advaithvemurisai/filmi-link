# FilmiLink 🎬

**▶ Play: https://advaithvemurisai.github.io/filmi-link/**

**A daily Indian cinema puzzle.** You get two films, often from different industries, like *Wanted* (Hindi) → *Eega* (Telugu). Connect them through the actors, directors and music composers who worked on them, in as few links as possible.

Inspired by [FilmLink](https://www.filmlink.io/), rebuilt for Hindi, Tamil, Telugu, Malayalam, Kannada, Marathi and Bengali cinema.

## Features
- **Daily puzzle.** Everyone gets the same pair each day. Difficulty rises through the week (par 2 on Mon/Tue, par 4 at the weekend).
- **Verified par.** Every puzzle is checked solvable ahead of time. Par is the true shortest chain, found by a BFS over the film ↔ person graph.
- **Results screen.** Shows your chain next to an optimal one, plus a Wordle-style share card.
- **Hints** reveal the next step on a shortest route from wherever you are.
- **Hard mode** turns off hints and hides how many films each person has.
- **Random play** at easy, medium or hard, plus an **archive** of past dailies and **stats/streaks** saved in the browser.
- Mostly static: the only backend is a JSON graph built offline, so it deploys to any static host.

## Run it
```bash
npm install
npm run dev        # http://localhost:5173
npm test           # graph/BFS, schedule, and stats tests + checks every shipped puzzle
```

The repo includes a **hand-curated starter dataset** (121 films, 6 languages), so it works without an API key.

## Full dataset from TMDb (~3,000 films)
1. Get a free key: themoviedb.org → Settings → API. Copy the **API Read Access Token**.
2. Build the graph and a fresh puzzle schedule:
   ```bash
   export TMDB_READ_TOKEN=your_token
   python3 pipeline/fetch_tmdb.py              # add --scale 0.3 for a quick trial run
   python3 pipeline/generate_puzzles.py --epoch 2026-10-01
   npm test                                     # re-verifies every puzzle
   ```
   Posters and headshots appear automatically once the data comes from TMDb. Responses are cached in `pipeline/.cache/`, so re-runs are fast.

Per-language quotas, cast depth and which crew roles count are set at the top of `pipeline/fetch_tmdb.py`. The difficulty curve and endpoint cooldown are set at the top of `generate_puzzles.py`.

## How it works
```
pipeline/
  fetch_tmdb.py        TMDb discover (origin=IN, per language) → movie details + credits → graph.json
  build_seed.py        same output from the curated seed list (no key needed)
  generate_puzzles.py  BFS from random popular films → pick targets matching the weekday's par
public/data/
  graph.json           {films, people, credits}; compact, loaded once by the browser
  puzzles.json         {epoch, puzzles:[{s, e, par}]}; day N after epoch = puzzle N
src/
  lib/graph.ts         index + BFS shortest path (used for hints, results, and random puzzles)
  lib/daily.ts         date → puzzle number (uses the local calendar day)
  lib/storage.ts       results, in-progress state, streaks (localStorage)
  components/          Game, result screen, modals
```

**Graph model.** The graph is bipartite: films on one side, people on the other. A chain always alternates film → person → film. "Links" means the number of people in the chain. Directors and music composers count as connectors as well as cast, because composers such as A. R. Rahman, Anirudh Ravichander and M. M. Keeravani link films across languages.

## Deploy
Every push to `main` runs the tests, builds the site and deploys it to GitHub Pages (`.github/workflows/deploy.yml`).
For Vercel or Netlify, set `BASE_PATH=/` at build time.

---
Film data © TMDb contributors. This product uses the TMDb API but is not endorsed or certified by TMDb.
