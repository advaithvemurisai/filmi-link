# CinematicLink 🎬

**▶ Play: https://cinematic-link.vercel.app**

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

The data covers **every Indian film on TMDb with at least one vote**: ~17,900 films and 16,000 people across 11 languages (Hindi, Tamil, Telugu, Malayalam, Kannada, Marathi, Bengali, Punjabi, Gujarati, Odia, Assamese). It's rebuilt weekly in the cloud.

## Rebuilding the data
1. Get a free key: themoviedb.org → Settings → API. Put the **API Read Access Token** in a git-ignored `.env` file:
   ```
   TMDB_READ_TOKEN=your_token
   ```
2. Build the graph and a fresh puzzle schedule:
   ```bash
   pip install certifi                          # macOS python.org builds lack SSL root certs
   python3 pipeline/fetch_tmdb.py              # ~10 min for ~18k films; add --limit 50 for a quick trial
   python3 pipeline/generate_puzzles.py --epoch 2026-09-01
   npm test                                     # re-verifies puzzle pars against the new graph
   ```
   Responses are cached in `pipeline/.cache/`, so re-runs are fast. For a small offline dataset with no key, use `python3 pipeline/build_seed.py`, which builds a hand-curated set of 121 films.

**Data cleaning notes**
- *Titles:* TMDb stores US English titles, but Indian audiences know *Taare Zameen Par*, not "Like Stars on Earth". The pipeline romanises each native-script original title using Unicode character names (e.g. తారే → "tare"). It keeps the English title unless an Indian alternative title is a much closer phonetic match, and it skips working titles ("Thalapathy 67") and dubbed-release names.
- *Music credits:* TMDb lists arrangers and one-song contributors under loose job names. So only "Original Music Composer" counts, with fallbacks when a film has none, and at most 3 composers per film.
- *Coverage:* there are no per-language caps, and the floor is 1 vote, because Kannada, Marathi and eastern-Indian films are thinly rated on TMDb. Only the ~800 most-voted films can be a puzzle's start or target; the rest appear as steps in a chain.
- *Size:* in lesser-known films, cast members who appear in no other film can't connect anything, so they're pruned. That takes graph.json from 6.4 MB to 1.7 MB gzipped.

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

## Deploy & data refresh
- **Vercel** hosts the site and redeploys on every push to `main` (`vercel.json` sets caching headers).
- **Weekly refresh:** `.github/workflows/refresh-data.yml` runs every Monday at 02:00 IST, or on demand from the Actions tab. It fetches TMDb using the `TMDB_READ_TOKEN` repo secret, extends the puzzle schedule, runs the tests and commits the new data, and Vercel picks it up. Published puzzles are never changed; only their par is recomputed.
- A **GitHub Pages mirror** (https://advaithvemurisai.github.io/filmi-link/) builds with `BASE_PATH=/filmi-link/`.

---
Film data © TMDb contributors. This product uses the TMDb API but is not endorsed or certified by TMDb.
