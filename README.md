# CinematicLink

**▶ Play: https://cinematic-link.vercel.app**

I made this because I love Indian movies. It's a daily game about how connected Indian cinema is, across Hindi, Tamil, Telugu, Malayalam, Kannada, Bengali and more.

## How to play
You get two films, like *Amaran* and *Black Friday*. Connect them through the actors, directors and music composers who worked on them:

*Film → person → film → person → … → target film*

Each person is one link. Match the shortest possible chain for a **Blockbuster**. Each extra link drops a tier: **Hit**, **Flop**, **Disaster**. Using a hint caps the day at a Hit.

## Features
- **Two dailies:** the India daily everyone shares, plus an optional home-cinema daily (Hindi, Tamil, Telugu, Malayalam or Kannada) built only from that industry's films.
- **Puzzles picked for players:** the generator scores candidate pairs on how familiar both films are, how many shortest routes exist, whether at least one uses top-billed people, and whether every route runs through the same few mega-stars. Every puzzle is verified solvable, and its target is the true shortest chain.
- **Weekly themes:** Released this week, language spotlights, decade weeks and composer weeks.
- **The reveal:** after solving, a "Did you know?" fact about someone on a shortest route (an actor who directed, a composer who acted, a 40-year span), the other shortest routes you missed, and your chain drawn against the shortest one.
- **Route rarity:** signed-in players see how many others took the same route that day, and a rare one earns a Cult Classic badge.
- **Your cast:** everyone you link through is collected, with progress toward the 100 most-connected stars.
- **Guided first game:** new players tap through a real 2-link example before their first daily. Returning players go straight to the game, with a countdown to the next puzzle.
- **Hard mode, random play, archive and stats:** no-hint play, endless chains, past puzzles, and streaks on a calendar.
- **Players and friends:** pick a name + 4-digit PIN to sync your streak across devices and see a friends leaderboard (routes stay hidden).

## Puzzle pipeline
`pipeline/fetch_tmdb.py` builds the film graph from TMDb, then `pipeline/generate_puzzles.py` writes `public/data/puzzles.json` and `puzzles-<lang>.json` (needs `numpy` and `scipy`). It also writes `pipeline/review.md`, the next two weeks with runner-ups. To pin a hand-picked pair to a date, add it to `pipeline/overrides.json`. A weekly GitHub Action refreshes both. Already-published puzzles never change.

## Run locally
```bash
npm install
npm run dev
```
`npm run dev` also serves the accounts API (`api/sync.ts`) from an in-memory store, so sign-in works locally.

## Accounts (free)
Players are stored in [Upstash Redis](https://upstash.com) (free tier) through one Vercel function, `api/sync.ts`. To enable it on Vercel, open **Storage → Create / Connect → Upstash for Redis** and connect it to this project. That injects `KV_REST_API_URL` / `KV_REST_API_TOKEN` (the `UPSTASH_REDIS_REST_*` names also work). Then redeploy. Streaks are never stored; they're computed from results, the same way offline.

---
Film data from [TMDb](https://www.themoviedb.org). This product uses the TMDb API but is not endorsed or certified by TMDb. Inspired by [FilmLink](https://www.filmlink.io/).
