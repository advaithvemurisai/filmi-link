# CinematicLink

**▶ Play: https://cinematic-link.vercel.app**

A daily game about how connected Indian cinema is. Think Wordle, but for movie lovers.

## Why I made this
This is a passion project. I love Indian cinema: the Hindi blockbusters, the Tamil and Telugu mass entertainers, Malayalam's quiet brilliance, Kannada, Bengali, Marathi and everything in between. I wanted a small daily ritual that celebrates how tangled and wonderful that world is, and that is fun to play even if you only half remember who directed what.

The idea comes from [FilmLink](https://www.filmlink.io/), which I loved and which inspired this project. CinematicLink is my own take, built around Indian film industries.

## How to play
You get two films, like *Amaran* and *Black Friday*. Connect them through the actors, directors and music composers who worked on them:

*Film → person → film → person → … → target film*

Each person is one link. Match the shortest possible chain for a **Blockbuster**. Each extra link drops a tier: **Hit**, **Flop**, **Disaster**. Using a hint caps the day at a Hit.

## What makes it different
Most of the work went into making the puzzles fair and interesting, not just solvable.

- **A puzzle generator that scores for fun.** Every day's pair is chosen from about 20 candidates by a scoring model, not picked at random. It weighs how familiar both films are, how many shortest routes exist (forgiving on Monday, tight on Sunday), whether at least one route uses people the game shows up front, and whether every route runs through the same few mega-stars. Par is always the true shortest chain.
- **Graph maths on sparse matrices.** The film–person graph (about 18,900 films and 17,000 people) is held as scipy sparse incidence matrices, so counting shortest routes for thousands of candidates is fast.
- **Fair across industries.** Popularity is ranked within each language, so a Malayalam hit isn't buried under Hindi vote counts. The shared daily keeps rough per-industry shares and penalises recent overuse of a language. Cooldowns stop a film (45 days) or a route-carrying star (14 days) from repeating.
- **Home-cinema dailies.** Besides the India daily everyone shares, there is an optional daily for Hindi, Tamil, Telugu, Malayalam or Kannada, built only from that industry's films.
- **Weekly themes.** Released this week, language spotlights, decade weeks and composer weeks.
- **Deterministic and stable.** Schedules are generated hundreds of days ahead from a seed. Published puzzles never change when the data refreshes, and a hand-picked pair can be pinned to a date through `pipeline/overrides.json`. `pipeline/review.md` lists the next two weeks with runner-ups.
- **Self-updating data.** A weekly GitHub Action refetches TMDb, rebuilds the graph, extends the schedule and commits, and Vercel redeploys.
- **Accounts with no sign-up friction.** A name and 4-digit PIN syncs your streak across devices and unlocks a friends leaderboard (routes stay hidden). It runs on one Vercel function and Upstash Redis, with hashed PINs, lockout, and the first result of the day winning. Streaks are never stored. They're computed from results, the same way offline.

## The game
- **The reveal:** after solving, a "Did you know?" fact about someone on a shortest route, the routes you missed, and your chain drawn against the shortest one.
- **Route rarity:** signed-in players see how many others took the same route that day, and a rare one earns a Cult Classic badge.
- **Your cast:** everyone you link through is collected, with progress toward the 100 most-connected stars.
- **Try it on the landing page:** a live 2-link example plays right on the home page. Finishing it goes straight to the daily. Returning players skip the landing page and see a countdown to the next puzzle.
- **Challenge links:** share a result or a challenge, and it unfurls with a preview image.
- **Hard mode, random play, archive and stats:** no-hint play, endless chains, past puzzles, and streaks on a calendar.

## Tech
- **Frontend:** React 18, TypeScript and Vite, with hand-written CSS and no UI framework. React is the only runtime dependency.
- **Backend:** one Vercel serverless function (`api/sync.ts`) on Upstash Redis.
- **Pipeline:** Python with numpy and scipy. `pipeline/fetch_tmdb.py` builds the graph from TMDb, and `pipeline/generate_puzzles.py` writes `public/data/puzzles.json` and `puzzles-<lang>.json`.
- **Quality:** Vitest tests for the graph logic and the sync API, ESLint, and a strict TypeScript build.

## Run locally
```bash
npm install
npm run dev
```
`npm run dev` also serves the accounts API from an in-memory store, so sign-in works locally.

## Accounts setup (free)
Players are stored in [Upstash Redis](https://upstash.com) (free tier) through `api/sync.ts`. To enable it on Vercel, open **Storage → Create / Connect → Upstash for Redis** and connect it to this project. That injects `KV_REST_API_URL` / `KV_REST_API_TOKEN` (the `UPSTASH_REDIS_REST_*` names also work). Then redeploy.

---
Film data from [TMDb](https://www.themoviedb.org). This product uses the TMDb API but is not endorsed or certified by TMDb. Inspired by [FilmLink](https://www.filmlink.io/).
