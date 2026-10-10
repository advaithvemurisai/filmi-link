"""Generate deterministic daily puzzle schedules from graph.json.

Two kinds of track:
  all                    the pan-India daily everyone shares (puzzles.json)
  hi, ta, te, ml, kn     an optional home-industry daily (puzzles-<lang>.json)

A puzzle is a (start film, end film) pair, and par is the true shortest chain in links (people).
Which pair gets picked is scored on what makes a puzzle fun, not just on par:

  * familiar endpoints  popularity ranked within each language too, so non-Hindi hits aren't buried
  * a band of routes    enough shortest routes to be fair, few enough to be a puzzle; the band
                        narrows through the week as par rises
  * findable routes     at least one shortest route uses only people the game puts up front
                        (directors, composers, top-billed cast)
  * no hub fatigue      routes that all run through a handful of mega-stars are penalised, and the
                        person carrying most routes goes on a cooldown
  * a reveal            a surprising "Did you know?" link on a shortest route, plus alternate routes
  * weekly themes       Released this week, language spotlights, decade weeks, composer weeks

Each day about STARTS_PER_DAY x ENDS_PER_START pairs are scored and the best kept. pipeline/review.md
lists the next two weeks with runner-ups; pipeline/overrides.json pins a hand-picked pair to a date:
  {"all": {"2026-10-12": {"s": "<film id>", "e": "<film id>", "theme": "optional label"}}}

Usage: python pipeline/generate_puzzles.py [--days 400] [--epoch 2026-09-01] [--seed 7] [--tracks all,ta]

Already-published puzzles (up to --keep-until, default tomorrow) are kept when an existing file has the
same epoch, so a data refresh never changes today's or past puzzles. Their par is recomputed against the
new graph (new films can only make chains shorter).
"""

import argparse
import json
import math
import random
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

import numpy as np
from scipy import sparse

from graph_io import DATA_DIR, FILM_META_PATH, RETIRED_LANGUAGES, load_graph, puzzles_path

HERE = Path(__file__).resolve().parent
OVERRIDES_PATH = HERE / "overrides.json"
REVIEW_PATH = HERE / "review.md"

TRACKS = ["all", "hi", "ta", "te", "ml", "kn"]
LANG_NAMES = {"hi": "Hindi", "ta": "Tamil", "te": "Telugu", "ml": "Malayalam", "kn": "Kannada",
              "mr": "Marathi", "bn": "Bengali", "pa": "Punjabi", "gu": "Gujarati"}

# The weekly ladder (Mon=0 … Sun=6). Well-known films sit only 2-3 links apart, so length alone can't make
# a hard puzzle: midweek benches the most-connected people, and the weekend allows only directors and
# composers, which stretches chains to 3-5 links and rewards knowing who made what.
PAR_BY_WEEKDAY = [3, 3, 3, 3, 4, 4, 4]
RULE_BY_WEEKDAY = [None, None, "nostars", "nostars", "crew", "crew", "crew"]
STAR_BENCH = 1000        # "No Superstars": this many most-connected people can't be used
CREW_ROLES = {"Director", "Music"}
# Acceptable number of distinct shortest routes, by weekday: forgiving early, tight at the weekend.
ROUTE_BAND = [(8, 120), (6, 90), (5, 60), (4, 45), (3, 30), (2, 20), (2, 14)]

COOLDOWN_DAYS = 45       # a film won't reappear as an endpoint within this window
CARRIER_COOLDOWN = 14    # nor will the person carrying most routes
FAIR_BILLING = 6         # actors billed this high (plus directors, composers) count as findable
HUB_COUNT = 20           # the most-connected people; routes leaning on them feel samey
STARTS_PER_DAY = 5
ENDS_PER_START = 4
MAX_ROUTES = 300         # routes enumerated per candidate (for carrier, reveal and alternates)
MAX_LINKS = 6
# Endpoints must be films a common player could know: mainstream casts, no documentaries or silents.
MIN_STAR_POWER = 15      # mean film count of the top 3 billed actors
MIN_YEAR = 1960
MIN_CONNECTED_PEOPLE = 6  # people with another film: the landing page offers them as a first move
SKIP_GENRES = {"Documentary", "TV Movie"}
# How widely each industry's films are watched across India; scales familiarity on the shared daily
# so language rotation doesn't keep reaching for little-seen films from smaller industries.
NATIONAL_REACH = {"hi": 1.0, "ta": 0.92, "te": 0.92, "ml": 0.88, "kn": 0.85, "mr": 0.6}
# Rough share of shared-daily endpoints per industry; recent overuse of a language is penalised.
LANG_TARGET = {"hi": 0.33, "ta": 0.18, "te": 0.17, "ml": 0.16, "kn": 0.1, "mr": 0.06}

# Weekly theme rotations (weeks start on Monday).
THEMES = {"all": ["released", "language", "decade", "composer", "crossover"], "lang": ["released", "decade", "composer", None]}
SPOTLIGHT = ["ml", "ta", "te", "kn", "mr", "hi"]
DECADES = [1990, 2000, 1980, 2010]


class Graph:
    """The film–person graph as sparse incidence matrices, plus per-film and per-person facts."""

    def __init__(self, g: dict, meta: dict[str, dict]):
        films, people = g["films"], g["people"]
        self.fids, self.pids = list(films), list(people)
        self.fi = {f: i for i, f in enumerate(self.fids)}
        self.pi = {p: i for i, p in enumerate(self.pids)}
        F, P = len(self.fids), len(self.pids)
        self.title = [films[f]["t"] for f in self.fids]
        self.year = [films[f]["y"] for f in self.fids]
        self.lang = [films[f]["l"] for f in self.fids]
        self.name = [people[p]["n"] for p in self.pids]
        self.pop = np.array([films[f]["pop"] for f in self.fids], float)
        self.released = [meta.get(f, {}).get("d") for f in self.fids]
        genres = [set(meta.get(f, {}).get("g", [])) for f in self.fids]

        self.roles: dict[tuple[int, int], set[str]] = {}
        fair: set[tuple[int, int]] = set()
        for fid, rows in g["credits"].items():
            fi, billed = self.fi[fid], 0
            for pid, role in rows:
                key = (fi, self.pi[pid])
                self.roles.setdefault(key, set()).add(role)
                if role != "Actor" or billed < FAIR_BILLING:
                    fair.add(key)
                billed += role == "Actor"

        self.fair = fair
        edges = list(self.roles)
        rows_ = np.array([e[0] for e in edges])
        cols_ = np.array([e[1] for e in edges])
        degree = np.bincount(cols_, minlength=P)
        self.degree = degree
        self.deg_pct = degree.argsort().argsort() / max(1, P - 1)
        hub = np.zeros(P, bool)
        hub[np.argsort(-degree)[:HUB_COUNT]] = True
        self.hub = hub

        self._rows, self._cols, self._shape = rows_, cols_, (F, P)
        self._keeps = {
            "all": np.ones(len(edges), bool),
            "fair": np.array([e in fair for e in edges]),
            "nohub": ~hub[cols_],
            "nomusic": np.array([bool(self.roles[e] - {"Music"}) for e in edges]),
        }
        self._crew = np.array([bool(self.roles[e] & CREW_ROLES) for e in edges])
        # People with at least this many films sit out a "No Superstars" day; the app applies the same cut.
        self.ban = int(np.sort(degree)[::-1][STAR_BENCH - 1])
        self._rule_cache: dict = {}
        self.mats = self.rule_mats(None)
        self.B, self.Bt = self.mats["all"]

        # Person facts for "Did you know?": home language, usual role, career span.
        self.home: list[tuple[str, float]] = []
        self.role_share: list[Counter] = []
        for p in range(P):
            fs = self.Bt.indices[self.Bt.indptr[p]:self.Bt.indptr[p + 1]]
            langs = Counter(self.lang[f] for f in fs)
            top, n = langs.most_common(1)[0]
            self.home.append((top, n / len(fs)))
            rc = Counter(r for f in fs for r in self.roles[(f, p)])
            total = sum(rc.values())
            self.role_share.append(Counter({r: c / total for r, c in rc.items()}))

        # Star power: how established the top-billed cast is. TMDb votes alone favour festival films
        # international viewers rate; a mainstream cast is what makes a film familiar at home.
        self.star = np.zeros(F)
        for fid, rows in g["credits"].items():
            leads = [self.pi[p] for p, r in rows if r == "Actor"][:3]
            if leads:
                self.star[self.fi[fid]] = degree[leads].mean()
        # Anyone in only this film is a dead end, so a film needs enough connected people to start from.
        connected = np.asarray(self.B @ (degree > 1).astype(float)).ravel()
        self.eligible = np.array([
            self.star[i] >= MIN_STAR_POWER and (self.year[i] or 0) >= MIN_YEAR and not genres[i] & SKIP_GENRES
            and connected[i] >= MIN_CONNECTED_PEOPLE and self.lang[i] not in RETIRED_LANGUAGES
            for i in range(F)
        ])

        # Familiarity: votes within the film's own language, blended with star power.
        pct = lambda a: a.argsort().argsort() / max(1, len(a) - 1)
        self.lang_pct = np.zeros(F)
        for l in set(self.lang):
            idx = np.array([i for i in range(F) if self.lang[i] == l])
            self.lang_pct[idx] = pct(self.pop[idx])
        # Older classics are revered but less often watched by today's players.
        age = np.array([0.8 if (y or 0) < 1975 else 1.0 for y in self.year])
        self.familiarity = (0.5 * self.lang_pct + 0.5 * pct(self.star)) * age

    def rule_mats(self, rule: str | None, ban: int | None = None) -> dict:
        """Incidence matrices (all, fair, nohub, nomusic) keeping only the credits a day's rule allows."""
        key = (rule, ban)
        if key not in self._rule_cache:
            if rule == "nostars":
                allow = self.degree[self._cols] < (ban or self.ban)
            elif rule == "crew":
                allow = self._crew
            else:
                allow = np.ones(len(self._cols), bool)

            def mat(keep):
                keep = keep & allow
                m = sparse.csr_matrix((np.ones(keep.sum()), (self._rows[keep], self._cols[keep])), shape=self._shape)
                return m, m.T.tocsr()

            self._rule_cache[key] = {k: mat(v) for k, v in self._keeps.items()}
        return self._rule_cache[key]

    def people_of(self, f: int) -> np.ndarray:
        return self.B.indices[self.B.indptr[f]:self.B.indptr[f + 1]]

    def films_of(self, p: int) -> np.ndarray:
        return self.Bt.indices[self.Bt.indptr[p]:self.Bt.indptr[p + 1]]

    def forward(self, s: int, mats: dict | None = None):
        """Layered BFS from film s over the credits in `mats` (a day's rule). Returns film/person link-distances
        and, for every film, the number of shortest routes to it: in total, using only findable credits,
        avoiding hubs, avoiding music."""
        mats = mats or self.mats
        B_all, Bt_all = mats["all"]
        F, P = len(self.fids), len(self.pids)
        dist_f = np.full(F, -1, np.int16)
        dist_p = np.full(P, -1, np.int16)
        dist_f[s] = 0
        counts = {k: np.zeros(F) for k in mats}
        for k in counts:
            counts[k][s] = 1
        front = {k: counts[k].copy() for k in mats}
        for k in range(1, MAX_LINKS + 1):
            reach_p = Bt_all @ front["all"]
            new_p = (reach_p > 0) & (dist_p < 0)
            if not new_p.any():
                break
            dist_p[new_p] = k
            people = {name: np.where(new_p, Bt @ front[name], 0) for name, (_, Bt) in mats.items()}
            reach_f = B_all @ people["all"]
            new_f = (reach_f > 0) & (dist_f < 0)
            if not new_f.any():
                break
            dist_f[new_f] = k
            front = {name: np.where(new_f, B @ people[name], 0) for name, (B, _) in mats.items()}
            for name in counts:
                counts[name][new_f] = front[name][new_f]
        return dist_f, dist_p, counts

    def routes(self, s: int, e: int, dist_f, dist_p, rng: random.Random, mats: dict | None = None) -> list[list[int]]:
        """Up to MAX_ROUTES shortest routes s→e as [film, person, film, …] index lists, under a day's rule."""
        out: list[list[int]] = []
        B, Bt = (mats or self.mats)["all"]
        people_of = lambda f: B.indices[B.indptr[f]:B.indptr[f + 1]]  # noqa: E731
        films_of = lambda p: Bt.indices[Bt.indptr[p]:Bt.indptr[p + 1]]  # noqa: E731

        def back(film: int, k: int, tail: list[int]) -> None:
            if len(out) >= MAX_ROUTES:
                return
            if k == 0:
                out.append([film] + tail)
                return
            ps = [p for p in people_of(film) if dist_p[p] == k]
            rng.shuffle(ps)
            for p in ps:
                gs = [g for g in films_of(p) if dist_f[g] == k - 1]
                rng.shuffle(gs)
                for g in gs:
                    back(g, k - 1, [p, film] + tail)
                    if len(out) >= MAX_ROUTES:
                        return

        back(e, int(dist_f[e]), [])
        return out

    def is_fair(self, route: list[int]) -> bool:
        return all((route[j], route[i]) in self.fair for i in range(1, len(route), 2) for j in (i - 1, i + 1))

    # ---- the reveal -------------------------------------------------------------------------
    def film_ref(self, f: int) -> str:
        return f"{self.title[f]} ({self.year[f]})" if self.year[f] else self.title[f]

    def surprises(self, a: int, p: int, b: int):
        """Candidate "Did you know?" lines about person p linking films a and b, as (score, text)."""
        # Only well-known people make a fun fact: role switches need a regular, the rest a star.
        if self.degree[p] < 12:
            return
        star = self.degree[p] >= 25
        name, fame, share = self.name[p], float(self.deg_pct[p]), self.role_share[p]
        for f in (a, b):
            roles = self.roles[(f, p)]
            if share["Actor"] >= 0.75 and "Director" in roles:
                yield 3 + fame, f"{name}, best known as an actor, directed {self.film_ref(f)}."
            if share["Actor"] >= 0.75 and "Music" in roles:
                yield 3 + fame, f"{name}, best known as an actor, composed the music for {self.film_ref(f)}."
            if share["Music"] >= 0.75 and "Actor" in roles:
                yield 3 + fame, f"{name}, usually behind the music, acted in {self.film_ref(f)}."
            if share["Director"] >= 0.75 and "Actor" in roles:
                yield 2.5 + fame, f"Director {name} appears on screen in {self.film_ref(f)}."
            home, home_share = self.home[p]
            if (star and home_share >= 0.6 and self.lang[f] != home
                    and home in LANG_NAMES and self.lang[f] in LANG_NAMES):
                verb = "directed" if "Director" in roles else "scored" if roles == {"Music"} else "acted in"
                yield 2 + fame, (f"{name}, a {LANG_NAMES[home]} cinema regular, {verb} the "
                                 f"{LANG_NAMES[self.lang[f]]} film {self.film_ref(f)}.")
        ya, yb = self.year[a], self.year[b]
        if star and ya and yb and abs(ya - yb) >= 20:
            gap = abs(ya - yb)
            yield 1 + gap / 20 + fame, (f"{name} links {self.film_ref(a)} and {self.film_ref(b)}, "
                                        f"{gap} years apart.")

    def spot(self, routes: list[list[int]]):
        best, seen = None, set()
        for r in routes:
            for i in range(1, len(r) - 1, 2):
                trip = (r[i - 1], r[i], r[i + 1])
                if trip in seen:
                    continue
                seen.add(trip)
                for score, text in self.surprises(*trip):
                    if not best or score > best[0]:
                        best = (score, r[i], text)
        return best

    def alternates(self, routes: list[list[int]], n: int = 3) -> list[list[int]]:
        """Distinct, recognisable routes: findable ones first, then by fame of the people on them."""
        def fame(r):
            return sum(self.deg_pct[r[i]] for i in range(1, len(r), 2))
        ranked = sorted(routes, key=lambda r: (not self.is_fair(r), -fame(r)))
        picked: list[list[int]] = []
        for r in ranked:
            people = set(r[1::2])
            if all(len(people & set(q[1::2])) <= len(people) // 2 for q in picked):
                picked.append(r)
            if len(picked) == n:
                break
        return picked


def difficulty(par: int, total: float, fair: float, rule: str | None = None) -> int:
    """1 easy, 2 medium, 3 hard: longer chains, fewer shortest routes, fewer findable ones and a rule day are harder."""
    h = (par - 2) + (total < 10) + (fair < 3) + (total < 4) + (rule is not None)
    return 1 if h <= 0 else 2 if h <= 2 else 3


def band_score(x: float, lo: int, hi: int) -> np.ndarray:
    x = np.maximum(x, 1)
    return np.where(x < lo, -0.8 * np.log2(lo / x), np.where(x > hi, -0.8 * np.log2(x / hi), 0.0))


def pool_for(G: Graph, track: str) -> list[int]:
    # Unvoted new releases only ever appear mid-chain, never as a day's endpoints.
    order = [f for f in np.argsort(-G.pop) if G.eligible[f] and G.pop[f] > 0]
    if track != "all":
        return [f for f in order if G.lang[f] == track][:400]
    pool: set[int] = set()
    for l, n in [("hi", 250), ("ta", 150), ("te", 150), ("ml", 150), ("kn", 100), ("mr", 30)]:
        pool.update([f for f in order if G.lang[f] == l][:n])
    return sorted(pool, key=lambda f: -G.pop[f])


def theme_for(track: str, day: date, epoch: date):
    """(kind, param) for the week this day falls in, or None."""
    rot = THEMES["all" if track == "all" else "lang"]
    w = (day - (epoch - timedelta(days=epoch.weekday()))).days // 7
    kind = rot[w % len(rot)]
    cycle = w // len(rot)
    if kind == "language":
        langs = [l for l in SPOTLIGHT if l != track]
        return kind, langs[cycle % len(langs)]
    if kind == "decade":
        return kind, DECADES[cycle % len(DECADES)]
    return (kind, None) if kind else None


def theme_film_ok(G: Graph, theme, f: int, day: date) -> bool:
    """Whether film f satisfies a film-level theme."""
    kind, param = theme
    if kind == "language":
        return G.lang[f] == param
    if kind == "decade":
        return G.year[f] is not None and param <= G.year[f] < param + 10
    if kind == "released":
        r = G.released[f]
        if not r or int(r[:4]) >= day.year:
            return False
        try:
            md = date(day.year, int(r[5:7]), int(r[8:10]))
        except ValueError:      # 29 Feb
            return False
        return abs((md - day).days) <= 3
    return True


def theme_label(G: Graph, theme, s: int, e: int, day: date) -> str:
    kind, param = theme
    if kind == "language":
        return f"{LANG_NAMES[param]} Spotlight"
    if kind == "decade":
        return f"'{str(param)[2:]}s Week" if param < 2000 else f"{param}s Week"
    if kind == "composer":
        return "Composer Week"
    if kind == "crossover":
        return "Crossover Week"
    f = s if theme_film_ok(G, theme, s, day) else e
    return f"Released this week: {G.film_ref(f)}"


class Scheduler:
    def __init__(self, G: Graph, track: str, epoch: date, rng: random.Random):
        self.G, self.track, self.epoch, self.rng = G, track, epoch, rng
        self.pool = pool_for(G, track)
        reach = np.array([NATIONAL_REACH.get(l, 0.6) for l in G.lang])
        self.fam = G.familiarity * reach if track == "all" else G.familiarity
        self.last_used: dict[int, int] = {}
        self.carrier_used: dict[int, int] = {}
        self.recent_langs: list[tuple[int, str]] = []
        self.review: list[dict] = []

    def describe(self, s: int, e: int, dist_f, dist_p, counts, mats: dict | None = None) -> dict:
        """Everything the app and the review need about a chosen pair."""
        G = self.G
        routes = G.routes(s, e, dist_f, dist_p, self.rng, mats)
        carrier = Counter(p for r in routes for p in r[1::2]).most_common(1)[0][0]
        spot = G.spot(routes)
        return {
            "routes": routes, "carrier": carrier, "spot": spot,
            "alts": G.alternates(routes),
            "total": counts["all"][e], "fair": counts["fair"][e], "nohub": counts["nohub"][e],
        }

    def record(self, day: int, s: int, e: int, carrier: int) -> None:
        self.last_used[s] = self.last_used[e] = day
        self.carrier_used[carrier] = day
        self.recent_langs += [(day, self.G.lang[s]), (day, self.G.lang[e])]

    def puzzle(self, s: int, e: int, info: dict, theme: str | None, rule: str | None = None, ban: int | None = None) -> dict:
        G = self.G
        par = int((len(info["routes"][0]) - 1) // 2)
        pz = {"s": G.fids[s], "e": G.fids[e], "par": par, "d": difficulty(par, info["total"], info["fair"], rule)}
        if theme:
            pz["theme"] = theme
        if rule:
            pz["rule"] = rule
        if rule == "nostars":
            pz["ban"] = ban
        if info["spot"]:
            _, p, text = info["spot"]
            pz["spot"] = {"p": G.pids[p], "t": text}
        if info["alts"]:
            pz["alts"] = [[(G.fids if i % 2 == 0 else G.pids)[n] for i, n in enumerate(r)] for r in info["alts"]]
        return pz

    def fixed(self, day: int, s_id: str, e_id: str, theme: str | None, rule: str | None = None, ban: int | None = None) -> dict | None:
        """A known pair (already published, or a hand-picked override), re-verified on the current graph
        under the rule it was published with."""
        G = self.G
        if s_id not in G.fi or e_id not in G.fi:
            return None
        s, e = G.fi[s_id], G.fi[e_id]
        mats = G.rule_mats(rule, ban)
        dist_f, dist_p, counts = G.forward(s, mats)
        if dist_f[e] < 1:
            return None
        info = self.describe(s, e, dist_f, dist_p, counts, mats)
        self.record(day, s, e, info["carrier"])
        return self.puzzle(s, e, info, theme, rule, ban)

    def pick(self, day: int) -> dict:
        G, rng = self.G, self.rng
        d = self.epoch + timedelta(days=day)
        want = PAR_BY_WEEKDAY[d.weekday()]
        lo, hi = ROUTE_BAND[d.weekday()]
        fresh = [f for f in self.pool if day - self.last_used.get(f, -10**9) > COOLDOWN_DAYS] or self.pool
        fresh_arr = np.array(fresh)
        window = [l for t, l in self.recent_langs if day - t < 14]
        recent = {l: c / max(1, len(window)) for l, c in Counter(window).items()}

        week_theme = theme_for(self.track, d, self.epoch)
        day_rule = RULE_BY_WEEKDAY[d.weekday()]
        # Keep the day's rule if at all possible; drop the theme first, the rule only as a last resort.
        tries = [(t, day_rule) for t in ([week_theme, None] if week_theme else [None])]
        if day_rule:
            tries.append((None, None))
        for theme, rule in tries:
            ban = G.ban if rule == "nostars" else None
            mats = G.rule_mats(rule, ban)
            cands = self._candidates(day, d, theme, fresh, fresh_arr, want, lo, hi, recent, mats)
            if cands:
                break
        else:
            raise SystemExit(f"graph too sparse to build a puzzle for {self.track} on {d}")

        cands.sort(key=lambda c: -c["score"])
        best = cands[0]
        s, e = best["s"], best["e"]
        label = theme_label(G, theme, s, e, d) if theme else None
        # Themed starts are drawn from the theme's films; flip half of them so the theme isn't always on the left.
        if theme and theme[0] not in ("composer", "crossover") and rng.random() < 0.5:
            s, e = e, s
            best["info"]["routes"] = [r[::-1] for r in best["info"]["routes"]]
            best["info"]["alts"] = [r[::-1] for r in best["info"]["alts"]]
        self.record(day, s, e, best["info"]["carrier"])
        pz = self.puzzle(s, e, best["info"], label, rule, ban)
        self.review.append({"date": d, "pz": pz, "best": best, "runners": cands[1:3]})
        return pz

    def crossover(self, s: int, e: int, carrier: int) -> bool:
        """Crossover Week: the person carrying the routes is a regular of a third industry, a guest in both films' worlds."""
        home, share = self.G.home[carrier]
        return share >= 0.6 and home not in (self.G.lang[s], self.G.lang[e])

    def _candidates(self, day, d, theme, fresh, fresh_arr, want, lo, hi, recent, mats) -> list[dict]:
        G, rng = self.G, self.rng
        film_theme = theme and theme[0] in ("language", "decade", "released")
        starts_from = [f for f in fresh if theme_film_ok(G, theme, f, d)] if film_theme else fresh
        if not starts_from:
            return []
        if film_theme and len(starts_from) > 4:
            # The themed film is the day's headline, so draw it from the better-known half.
            starts_from = sorted(starts_from, key=lambda f: -self.fam[f])[:max(4, len(starts_from) // 2)]
        cands = []
        for s in rng.sample(starts_from, min(STARTS_PER_DAY, len(starts_from))):
            dist_f, dist_p, counts = G.forward(s, mats)
            ends = fresh_arr[fresh_arr != s]
            dist = dist_f[ends].astype(float)
            total = counts["all"][ends]
            ok = (dist >= 2) & (counts["fair"][ends] >= 1)
            if theme and theme[0] == "decade":
                ok &= np.array([theme_film_ok(G, theme, f, d) for f in ends])
            if theme and theme[0] == "composer":
                ok &= (total - counts["nomusic"][ends]) >= 1
            if not ok.any():
                continue
            # The weekday's chain length is a requirement, not a preference: famous films are nearly
            # always 2 links apart, so a soft penalty let every day collapse to par 2. Relax only to the
            # nearest length this start can actually reach.
            gap = np.where(ok, np.abs(dist - want), np.inf)
            ok &= gap == gap.min()
            hub_share = 1 - counts["nohub"][ends] / np.maximum(total, 1)
            # Where the chain can't be as long as the day wants (within one language it rarely can),
            # make it harder another way: insist on few shortest routes and few findable ones.
            short = np.maximum(0, want - dist)
            score = (
                -1.5 * np.abs(dist - want)
                + 4.0 * (self.fam[s] + self.fam[ends]) / 2
                + (1 + 2.5 * short) * band_score(total, lo, hi)
                + short * band_score(counts["fair"][ends], 1, max(1, lo // 2))
                - 2.0 * np.maximum(0, hub_share - 0.5)
                + 0.5 * counts["fair"][ends] / np.maximum(total, 1)
            )
            if self.track == "all":
                langs = np.array([G.lang[f] for f in ends])
                score += 0.3 * (langs != G.lang[s])
                over = lambda l: max(0.0, recent.get(l, 0) - LANG_TARGET.get(l, 0.03))
                score -= 4.0 * (over(G.lang[s]) + np.array([over(l) for l in langs]))
            score = np.where(ok, score, -np.inf)
            # Crossover pairs are rarer, so look further down the list for them.
            for i in np.argsort(-score)[:ENDS_PER_START * (4 if theme and theme[0] == "crossover" else 1)]:
                if not np.isfinite(score[i]):
                    break
                e = int(ends[i])
                info = self.describe(s, e, dist_f, dist_p, counts, mats)
                if theme and theme[0] == "crossover" and not self.crossover(s, e, info["carrier"]):
                    continue
                full = float(score[i])
                if day - self.carrier_used.get(info["carrier"], -10**9) <= CARRIER_COOLDOWN:
                    full -= 1.0
                if info["spot"]:
                    full += 0.4
                cands.append({"s": s, "e": e, "score": full, "info": info})
        return cands


def build_track(G: Graph, track: str, args, overrides: dict) -> Scheduler:
    rng = random.Random(f"{args.seed}:{track}")
    epoch = date.fromisoformat(args.epoch)
    sch = Scheduler(G, track, epoch, rng)
    path = puzzles_path(track)
    puzzles: list[dict] = []

    if path.exists():
        old = json.loads(path.read_text())
        if old.get("epoch") == args.epoch:
            keep_days = (date.fromisoformat(args.keep_until) - epoch).days + 1
            for day, p in enumerate(old["puzzles"][:max(0, keep_days)]):
                pz = sch.fixed(day, p["s"], p["e"], p.get("theme"), p.get("rule"), p.get("ban"))
                if not pz:
                    break
                puzzles.append(pz)
    kept = len(puzzles)

    pinned = overrides.get(track, {})
    for day in range(kept, args.days):
        d = (epoch + timedelta(days=day)).isoformat()
        pz = sch.fixed(day, pinned[d]["s"], pinned[d]["e"], pinned[d].get("theme")) if d in pinned else None
        if d in pinned and not pz:
            print(f"  ! override for {d} isn't a connected pair in the current graph; generating instead")
        puzzles.append(pz or sch.pick(day))

    path.write_text(json.dumps({"epoch": args.epoch, "puzzles": puzzles}, ensure_ascii=False, separators=(",", ":")))
    report(G, track, path, puzzles, kept)
    sch.kept = kept
    return sch


def report(G: Graph, track: str, path: Path, puzzles: list[dict], kept: int) -> None:
    fresh = puzzles[kept:]
    pars = Counter(p["par"] for p in puzzles)
    themes = Counter((p.get("theme") or "none").split(":")[0] for p in fresh)
    langs = Counter(G.lang[G.fi[f]] for p in fresh for f in (p["s"], p["e"]))
    cross = sum(G.lang[G.fi[p["s"]]] != G.lang[G.fi[p["e"]]] for p in fresh)
    n = max(1, len(fresh))
    print(f"[{track}] wrote {path.name}: {len(puzzles)} puzzles ({kept} published kept)")
    print(f"  par {dict(sorted(pars.items()))} | spot {sum('spot' in p for p in fresh) / n:.0%}"
          f" | alternates {sum(len(p.get('alts', [])) >= 2 for p in fresh) / n:.0%}"
          f" | cross-language {cross / n:.0%}")
    print(f"  themes {dict(themes)}")
    print(f"  endpoint languages {dict(langs.most_common(8))}")


def write_review(G: Graph, schedulers: list[Scheduler], today: date) -> None:
    lines = ["# Puzzle review", "",
             "Next 14 generated days per track. Pin a different pair in `pipeline/overrides.json`.", ""]
    for sch in schedulers:
        rows = [r for r in sch.review if today <= r["date"] < today + timedelta(days=14)]
        if not rows:
            continue
        lines += [f"## {sch.track}", ""]
        for r in rows:
            pz, info = r["pz"], r["best"]["info"]
            s, e = G.fi[pz["s"]], G.fi[pz["e"]]
            hub_share = 1 - info["nohub"] / max(1, info["total"])
            lines.append(f"- **{r['date']:%a %d %b}** {G.film_ref(s)} → {G.film_ref(e)} · par {pz['par']}"
                         f" · {int(info['total'])} routes ({int(info['fair'])} findable, {hub_share:.0%} via hubs)"
                         f" · carrier {G.name[info['carrier']]}" + (f" · _{pz['theme']}_" if "theme" in pz else ""))
            if "spot" in pz:
                lines.append(f"  - Did you know? {pz['spot']['t']}")
            for c in r["runners"]:
                lines.append(f"  - runner-up ({c['score']:.2f}): {G.film_ref(c['s'])} → {G.film_ref(c['e'])}")
        lines.append("")
    REVIEW_PATH.write_text("\n".join(lines))
    print(f"wrote {REVIEW_PATH}")


LANDING_DAYS = 21  # the weekly refresh rewrites it, so three weeks leaves slack for a missed run


def write_landing(g: dict, ban_by_day: dict | None = None) -> None:
    """A tiny landing.json so a first visit can show today's films and first move before the 6 MB graph
    arrives on a slow phone. Faces follow the app's startFaces(): director, composer, then billed cast,
    allowed by the day's rule, with another film to go to, at most 8 (none if fewer than 3)."""
    data = json.loads(puzzles_path("all").read_text())
    epoch = date.fromisoformat(data["epoch"])
    credit_count: Counter = Counter(pid for rows in g["credits"].values() for pid, _ in rows)
    films_of: dict[str, set] = {}
    for fid, rows in g["credits"].items():
        for pid, _ in rows:
            films_of.setdefault(pid, set()).add(fid)
    order = {"Director": 0, "Music": 1, "Actor": 2}
    out = {"days": {}, "films": {}, "people": {}}
    today = date.today()
    for n in range(-1, LANDING_DAYS):
        d = today + timedelta(days=n)
        i = (d - epoch).days
        if i < 0 or i >= len(data["puzzles"]):
            continue
        pz = data["puzzles"][i]
        rule, ban = pz.get("rule"), pz.get("ban")

        def allowed(pid: str, role: str) -> bool:
            if rule == "nostars":
                return len(films_of.get(pid, ())) < ban
            if rule == "crew":
                return role != "Actor"
            return True

        faces, seen = [], set()
        for pid, role in sorted(g["credits"].get(pz["s"], []), key=lambda r: order[r[1]]):
            if allowed(pid, role) and credit_count[pid] > 1 and pid not in seen:
                seen.add(pid)
                faces.append([pid, role])
        faces = faces[:8] if len(faces) >= 3 else []
        out["days"][d.isoformat()] = {"faces": faces}
        for fid in (pz["s"], pz["e"]):
            out["films"][fid] = g["films"][fid]
        for pid, _ in faces:
            out["people"][pid] = g["people"][pid]
    (DATA_DIR / "landing.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    print(f"wrote landing.json: {len(out['days'])} days")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=400)
    ap.add_argument("--epoch", default=date.today().isoformat())
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--keep-until", default=(date.today() + timedelta(days=1)).isoformat())
    ap.add_argument("--tracks", default=",".join(TRACKS))
    args = ap.parse_args()

    meta = json.loads(FILM_META_PATH.read_text()) if FILM_META_PATH.exists() else {}
    if not meta:
        print("no pipeline/film_meta.json (run fetch_tmdb.py): no release-week themes or genre filtering")
    G = Graph(load_graph(), meta)
    overrides = json.loads(OVERRIDES_PATH.read_text()) if OVERRIDES_PATH.exists() else {}
    schedulers = [build_track(G, t, args, overrides) for t in args.tracks.split(",")]
    write_review(G, schedulers, date.today())
    write_landing(load_graph())


if __name__ == "__main__":
    main()
