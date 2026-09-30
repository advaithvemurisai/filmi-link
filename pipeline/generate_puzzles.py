"""Generate a deterministic schedule of daily puzzles from graph.json.

Each puzzle is a (start film, end film) pair whose shortest chain — counted in
people ("links") — matches a weekday difficulty curve: easy early in the week,
harder at the weekend. Every puzzle is verified solvable by BFS, and `par` is
the optimal number of links.

Usage: python pipeline/generate_puzzles.py [--days 730] [--epoch 2026-09-01] [--seed 7]

Already-published puzzles (up to --keep-until, default tomorrow) are kept when an existing
puzzles.json has the same epoch, so a data refresh never changes today's or past puzzles.
Their par is recomputed against the new graph (new films can only make chains shorter).
"""

import argparse
import json
import random
from collections import Counter, deque
from datetime import date, timedelta

from graph_io import PUZZLES_PATH, adjacency, load_graph

# Target par by weekday (Mon=0 … Sun=6).
PAR_BY_WEEKDAY = [2, 2, 3, 3, 3, 4, 4]
POOL_SIZE = 800          # only the most-voted films are used as endpoints
COOLDOWN_DAYS = 45       # a film won't reappear as an endpoint within this window
CROSS_LANGUAGE_BIAS = 0.7


def link_distances(start: str, film_people: dict, person_films: dict) -> dict[str, int]:
    """BFS over the bipartite graph; distance = number of people on the path."""
    dist = {start: 0}
    seen_people: set[str] = set()
    q = deque([start])
    while q:
        f = q.popleft()
        for p in film_people[f]:
            if p in seen_people:
                continue
            seen_people.add(p)
            for g in person_films[p]:
                if g not in dist:
                    dist[g] = dist[f] + 1
                    q.append(g)
    return dist


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=730)
    ap.add_argument("--epoch", default=date.today().isoformat())
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--keep-until", default=(date.today() + timedelta(days=1)).isoformat())
    args = ap.parse_args()

    graph = load_graph()
    films = graph["films"]
    film_people, person_films = adjacency(graph)
    rng = random.Random(args.seed)
    epoch = date.fromisoformat(args.epoch)

    pool = sorted(films, key=lambda f: -films[f]["pop"])[:POOL_SIZE]
    last_used: dict[str, int] = {}
    puzzles = []

    kept = 0
    if PUZZLES_PATH.exists():
        old = json.loads(PUZZLES_PATH.read_text())
        if old.get("epoch") == args.epoch:
            keep_days = (date.fromisoformat(args.keep_until) - epoch).days + 1
            for day, p in enumerate(old["puzzles"][:max(0, keep_days)]):
                if p["s"] not in films or p["e"] not in films:
                    break
                d = link_distances(p["s"], film_people, person_films).get(p["e"])
                if d is None:
                    break
                puzzles.append({"s": p["s"], "e": p["e"], "par": d})
                last_used[p["s"]] = last_used[p["e"]] = day
            kept = len(puzzles)

    for day in range(kept, args.days):
        want = PAR_BY_WEEKDAY[(epoch + timedelta(days=day)).weekday()]
        fresh = [f for f in pool if day - last_used.get(f, -10**9) > COOLDOWN_DAYS] or pool
        for _ in range(200):
            start = rng.choice(fresh)
            dist = link_distances(start, film_people, person_films)
            cands = [f for f in fresh if f != start and f in dist and dist[f] >= 2]
            if not cands:
                continue
            # Closest achievable difficulty to the target par.
            best = min(abs(dist[f] - want) for f in cands)
            cands = [f for f in cands if abs(dist[f] - want) == best]
            cross = [f for f in cands if films[f]["l"] != films[start]["l"]]
            if cross and rng.random() < CROSS_LANGUAGE_BIAS:
                cands = cross
            end = rng.choice(cands)
            break
        else:
            raise SystemExit("graph too sparse to build puzzles")

        last_used[start] = last_used[end] = day
        puzzles.append({"s": start, "e": end, "par": dist[end]})

    PUZZLES_PATH.write_text(json.dumps({"epoch": args.epoch, "puzzles": puzzles}, separators=(",", ":")))
    pars = Counter(p["par"] for p in puzzles)
    cross = sum(films[p["s"]]["l"] != films[p["e"]]["l"] for p in puzzles)
    print(f"wrote {PUZZLES_PATH} — {len(puzzles)} puzzles from {args.epoch} ({kept} published puzzles kept)")
    print("par distribution:", dict(sorted(pars.items())), f"| cross-language: {cross / len(puzzles):.0%}")


if __name__ == "__main__":
    main()
