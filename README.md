# CinematicLink

**▶ Play: https://cinematic-link.vercel.app**

A daily game about how connected Indian cinema is. Think Wordle, but for movie lovers.

## Why I made this
This is a passion project. I love Indian cinema: the Hindi blockbusters, the Tamil and Telugu mass entertainers, Malayalam's quiet brilliance, Kannada, Marathi and everything in between. I wanted a small daily ritual that celebrates how tangled and wonderful that world is, and that is fun to play even if you only half remember who directed what.

The idea comes from [FilmLink](https://www.filmlink.io/), which I loved and which inspired this project. CinematicLink is my own take, built around Indian film industries.

## How to play
You get two films, like *Amaran* and *Black Friday*. Connect them through the actors, directors and music composers who worked on them:

*Film → person → film → person → … → target film*

Each person is one link. Match the shortest possible chain for a **Blockbuster**. Each extra link drops a tier: **Hit**, **Flop**, **Disaster**. Using a hint caps the day at a Hit.

Every puzzle is graded **Easy**, **Medium** or **Hard**, and the week gets harder as it goes:

| Day | Rule |
|---|---|
| Monday to Friday | Normal rules. The number of shortest routes tightens through the week, from 10 to 150 on Monday down to 2 to 12 on Friday. |
| Saturday | **No Superstars.** Each industry's 10 biggest heroes and 5 biggest heroines sit out. |
| Sunday | **Crew Call.** The chain must use two crew links: a director or composer who connects films on either side of them. |

**Score (0 to 1000).** Links earn up to 700, and every link over the shortest chain costs points. Each hint costs 100. A fast solve earns up to 100, Hard mode (no hints or aids, chosen before your first pick) up to 100, and a rare shortest route another 100. Speed and Hard mode bonuses shrink with the links points, so a quick but long wander can't make up for itself.

## What makes it different
Most of the work went into making the puzzles fair and interesting, not just solvable.

- **A puzzle generator that scores for fun.** Every day's pair is chosen from about 20 candidates by a scoring model, not picked at random. It weighs how familiar both films are, how many shortest routes exist, whether at least one route uses people the game shows up front, and whether every route runs through the same few mega-stars. Par is always the true shortest chain, and the generator, hints and the shortest-chain reveal all follow the day's rule.
- **Real difficulty, measured.** Well-known Indian films are only 2 or 3 links apart, so chain length alone can't make a puzzle hard. The weekday route bands and the weekend rules do it instead, and every puzzle carries a grade. On the India daily the mean grade rises from 1.78 on Monday to 2.12 on Friday.
- **Stars ranked per industry.** No Superstars benches each industry's leads by top billing (films they were billed first in), not by film count, so Prabhas, Allu Arjun and Yash sit out while prolific character actors and composers stay in play. The generator (Python) and the app (TypeScript) compute the same ranking.
- **Graph maths on sparse matrices.** The film–person graph (about 18,200 films and 16,200 people across 11 languages) is held as scipy sparse incidence matrices, so counting shortest routes for thousands of candidates is fast.
- **Clean people data.** TMDb sometimes splits one person across two ids. A script lists likely duplicates, and hand-confirmed ones are merged (40 so far). Real namesakes stay separate, and people who share a name show their best-known film.
- **Fair across industries.** Popularity is ranked within each language, so a Malayalam hit isn't buried under Hindi vote counts. The shared daily keeps rough per-industry shares, penalises recent overuse of a language, and boosts any industry missing for 6 days. Cooldowns stop a film (45 days) or a route-carrying star (14 days) from repeating.
- **Home-cinema dailies.** Besides the India daily everyone shares, there is an optional daily for Hindi, Tamil, Telugu, Malayalam or Kannada, built only from that industry's films.
- **Weekly themes.** Released this week, language spotlights, decade weeks, composer weeks, and Crossover Week, where the India daily runs through a star from a third industry.
- **Fast on a budget phone.** The landing page draws from a 14 KB preview file and fetches the 6 MB graph only after it. The first move is playable in about 2 seconds on throttled budget 4G, down from 11.4 seconds.
- **Deterministic and stable.** Schedules are generated hundreds of days ahead from a seed. Published puzzles never change when the data refreshes, and a hand-picked pair can be pinned to a date through `pipeline/overrides.json`. `pipeline/review.md` lists the next two weeks with runner-ups.
- **Self-updating data.** A weekly GitHub Action refetches TMDb, rebuilds the graph, extends the schedule and commits, and Vercel redeploys.
- **Accounts with no sign-up friction.** A name and 4-digit PIN syncs your streak across devices and unlocks a friends leaderboard (routes stay hidden). It runs on Upstash Redis, with hashed PINs, lockout, and the first result of the day winning. Streaks are never stored. They're computed from results, the same way offline. Two open tabs never overwrite each other's results.
- **Daily reminders, no account needed.** Opt in to a Web Push reminder each evening. A daily cron skips anyone who has already played in their own time zone, nudges players whose streak is at stake, and removes subscriptions the push service reports as gone.
- **Product metrics without personal data.** Anonymous events (visit, puzzle start, finish, give-up, hint) measure return visits and where players drop off. No names or routes are sent.

## The game
- **The reveal:** after solving, a "Did you know?" fact about someone on a shortest route, the routes you missed, and your chain drawn against the shortest one.
- **Route rarity:** signed-in players see how many others took the same route that day, and a rare one earns a Cult Classic badge.
- **Your cast:** everyone you link through is collected, with progress toward the 100 most-connected stars.
- **Try it on the landing page:** a live 2-link example plays right on the home page. Finishing it goes straight to the daily. Returning players skip the landing page and see a countdown to the next puzzle.
- **Challenge links:** share a result or a challenge, and it unfurls with a preview image.
- **Hard mode, random play, archive and stats:** no-hint play chosen up front, endless chains, past puzzles with their grades and an Unplayed filter, and streaks on a calendar.
- **Built for phones:** the next options scroll into view after each pick, long chains fit the result card and route map, and share links of any length open the right puzzle.

## Tech
- **Frontend:** React 18, TypeScript and Vite, with hand-written CSS and no UI framework. The only other runtime dependency is Vercel Analytics.
- **Backend:** two Vercel serverless functions on Upstash Redis: `api/sync.ts` for accounts and results, and `api/remind.ts` for the daily Web Push reminder, run by Vercel Cron.
- **Pipeline:** Python with numpy and scipy. `pipeline/fetch_tmdb.py` builds the graph from TMDb, and `pipeline/generate_puzzles.py` writes `public/data/puzzles.json`, `puzzles-<lang>.json` and the landing preview.
- **Quality:** 75 Vitest tests for the graph logic, scoring, the sync API and reminders, ESLint, and a strict TypeScript build.

## Run locally
```bash
npm install
npm run dev
```
`npm run dev` also serves the accounts API from an in-memory store, so sign-in works locally.

## Accounts setup (free)
Players are stored in [Upstash Redis](https://upstash.com) (free tier) through `api/sync.ts`. To enable it on Vercel, open **Storage → Create / Connect → Upstash for Redis** and connect it to this project. That injects `KV_REST_API_URL` / `KV_REST_API_TOKEN` (the `UPSTASH_REDIS_REST_*` names also work). Then redeploy.

Daily reminders also need a VAPID key pair (`npx web-push generate-vapid-keys`): set `VITE_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`, plus `CRON_SECRET` so only Vercel Cron can trigger `api/remind.ts`. Without the keys, the reminder option simply doesn't appear.

---
Film data from [TMDb](https://www.themoviedb.org). This product uses the TMDb API but is not endorsed or certified by TMDb. Inspired by [FilmLink](https://www.filmlink.io/).
