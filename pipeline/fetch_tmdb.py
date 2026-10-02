"""Pull Indian films + credits from TMDb and write public/data/graph.json.

Auth (either works), via environment or a git-ignored .env at the repo root:
  TMDB_READ_TOKEN=...   # v4 "API Read Access Token" (preferred)
  TMDB_API_KEY=...      # v3 key

Usage:
  python pipeline/fetch_tmdb.py              # every Indian film with >= MIN_VOTES votes
  python pipeline/fetch_tmdb.py --limit 50   # quick trial

Raw responses are cached in pipeline/.cache so reruns are cheap.
This product uses the TMDb API but is not endorsed or certified by TMDb.
"""

import argparse
import json
import os
import re
import ssl
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from difflib import SequenceMatcher
from pathlib import Path

from graph_io import FILM_META_PATH, write_graph

API = "https://api.themoviedb.org/3"
CACHE = Path(__file__).resolve().parent / ".cache"

# Indian languages to pull. No per-language cap: every film with at least MIN_VOTES votes is kept.
# Obscure films only ever appear mid-chain; puzzle endpoints come from the most-voted films.
LANGUAGES = ["hi", "ta", "te", "ml", "kn", "mr", "bn", "pa", "gu", "or", "as"]
MIN_VOTES = 1
# New releases often sit at 0 votes for weeks or months, so films from last year onwards skip the vote floor.
# They still need a person shared with another film to survive pruning, which keeps the junk out.
MIN_RUNTIME = 60  # drops shorts among the unvoted new releases (TMDb runtime 0 = unknown, kept)
CAST_PER_FILM = 12
# Films outside the most-voted FULL_CREDITS_TOP only appear mid-chain; there, people with no other
# film can't connect anything, so they're pruned to keep graph.json small for phones.
FULL_CREDITS_TOP = 1500
# Music credits by priority: TMDb lists arrangers/one-song contributors under the looser jobs,
# so only fall back to them when a film has no "Original Music Composer".
MUSIC_JOBS = ["Original Music Composer", "Music Director", "Music"]
MAX_COMPOSERS = 3

# Load a git-ignored .env at the repo root, if present, without overriding real env vars.
_env = Path(__file__).resolve().parent.parent / ".env"
if _env.exists():
    for line in _env.read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

TOKEN = os.environ.get("TMDB_READ_TOKEN")
KEY = os.environ.get("TMDB_API_KEY")

# python.org builds on macOS ship without root certs; prefer certifi's bundle when available.
try:
    import certifi

    SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CTX = ssl.create_default_context()


def get(path: str, fresh: bool = False, **params) -> dict:
    """fresh=True skips the cached copy (listings and new releases change week to week)."""
    cache_file = CACHE / (path.strip("/").replace("/", "_") + "_" + urllib.parse.urlencode(sorted(params.items())) + ".json")
    if cache_file.exists() and not fresh:
        return json.loads(cache_file.read_text())

    if KEY and not TOKEN:
        params["api_key"] = KEY
    url = f"{API}{path}?{urllib.parse.urlencode(params)}"
    headers = {"accept": "application/json"}
    if TOKEN:
        headers["Authorization"] = f"Bearer {TOKEN}"

    for attempt in range(6):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=20, context=SSL_CTX) as r:
                data = json.loads(r.read())
            break
        except urllib.error.HTTPError as e:
            if e.code == 429 or e.code >= 500:
                time.sleep(1.5 * (attempt + 1))
                continue
            raise
        except urllib.error.URLError as e:
            if isinstance(e.reason, ssl.SSLError):
                raise SystemExit(f"SSL error talking to TMDb: {e.reason}\nFix: pip install certifi") from e
            time.sleep(1.5 * (attempt + 1))
    else:
        raise RuntimeError(f"gave up on {path}")

    CACHE.mkdir(exist_ok=True)
    cache_file.write_text(json.dumps(data))
    return data


def is_latin(text: str) -> bool:
    return all(ord(ch) < 0x250 for ch in text)


# Alternative-title types that aren't the name audiences use (working titles, dubbed releases…).
SKIP_ALT_TYPES = ("working", "tentative", "dub", "retroactive", "telugu", "tamil", "hindi", "malayalam",
                  "kannada", "bengali", "odia", "marathi")


def romanise(text: str) -> str:
    """Crude phonetic romanisation of any Indic script via Unicode character names.

    Good enough to tell which Latin title *sounds like* the original: "తారే జమీన్" → "tare jamin".
    """
    out: list[str] = []
    for ch in text:
        if ord(ch) < 0x250:
            out.append(ch.lower())
            continue
        name = unicodedata.name(ch, "")
        if " LETTER " in name:
            out.append(name.split(" LETTER ")[1].split()[0].lower())
        elif " VOWEL SIGN " in name:
            if out and out[-1].endswith("a"):
                out[-1] = out[-1][:-1]
            out.append(name.split(" VOWEL SIGN ")[1].split()[0].lower())
        elif name.endswith(("VIRAMA", "SIGN VIRAMA")) and out and out[-1].endswith("a"):
            out[-1] = out[-1][:-1]
        elif "ANUSVARA" in name or "CANDRABINDU" in name:
            out.append("n")
    return "".join(out)


def _sound(t: str) -> str:
    """Normalise spelling variants so 'Taare'/'tAre' and 'Zameen'/'jamIn' compare closely."""
    t = re.sub(r"[^a-z0-9 ]", "", t.lower())
    for a, b in (("aa", "a"), ("ee", "i"), ("oo", "u"), ("z", "j"), ("w", "v"), ("ph", "f"), ("h", "")):
        t = t.replace(a, b)
    return re.sub(r"(.)\1", r"\1", t)


def display_title(d: dict) -> str:
    """Indian audiences know films by their original names, not TMDb's US English titles.

    Keep TMDb's English title unless it's a translation: if some Indian Latin-script alternative
    sounds much closer to the romanised original, use that ("Like Stars on Earth" → "Taare Zameen Par").
    """
    if is_latin(d["original_title"]):
        return d["original_title"]
    alts = [
        t["title"] for t in d.get("alternative_titles", {}).get("titles", [])
        if t["iso_3166_1"] == "IN" and is_latin(t["title"]) and len(t["title"]) > 3
        and not any(k in (t.get("type") or "").lower() for k in SKIP_ALT_TYPES)
        and not t["title"].isupper()
    ]
    target = _sound(romanise(d["original_title"]))
    score = lambda t: SequenceMatcher(None, _sound(t), target).ratio()  # noqa: E731
    if not alts or score(d["title"]) >= 0.5:
        return d["title"]
    best = max(alts, key=score)
    first = lambda t: _sound(t).split(" ")[0]  # noqa: E731
    if first(best) == first(d["title"]):  # "RRR" vs "RRR - Roudram…": English title is already the name
        return d["title"]
    return best if score(best) >= 0.6 and score(best) - score(d["title"]) > 0.25 else d["title"]


def discover(lang: str, quota: float, **filters) -> list[dict]:
    filters = filters or {"vote_count.gte": MIN_VOTES}
    out, page = [], 1
    while len(out) < quota:
        res = get(
            "/discover/movie",
            fresh=True,
            with_origin_country="IN",
            with_original_language=lang,
            sort_by="vote_count.desc",
            include_adult="false",
            **filters,
            page=page,
        )
        out.extend(res["results"])
        if page >= min(res.get("total_pages", 1), 500):
            break
        page += 1
    return out if quota == float("inf") else out[: int(quota)]


def main() -> None:
    if not (TOKEN or KEY):
        sys.exit("Set TMDB_READ_TOKEN or TMDB_API_KEY (free at themoviedb.org/settings/api).")

    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None, help="max films per language (quick trial runs)")
    args = ap.parse_args()

    today = date.today()
    recent_since = date(today.year - 1, 1, 1).isoformat()
    window = {"primary_release_date.gte": recent_since, "primary_release_date.lte": today.isoformat()}
    ids: dict[int, str] = {}
    recent: set[int] = set()
    for lang in LANGUAGES:
        found = discover(lang, args.limit or float("inf"))
        new = [m for m in discover(lang, args.limit or float("inf"), **window) if m["vote_count"] < MIN_VOTES]
        for m in found + new:
            ids.setdefault(m["id"], lang)
        recent.update(m["id"] for m in new)
        recent.update(m["id"] for m in found if (m.get("release_date") or "") >= recent_since)
        print(f"{lang}: {len(found)} films + {len(new)} unvoted new releases")

    # Recent films' credits are still being filled in on TMDb, so refetch them rather than trust the cache.
    fetch = lambda mid: get(f"/movie/{mid}", fresh=mid in recent, append_to_response="credits,alternative_titles")  # noqa: E731
    with ThreadPoolExecutor(max_workers=12) as pool:
        details = list(pool.map(fetch, ids))

    films, people, credits, meta = {}, {}, {}, {}
    for d in details:
        # TMDb often leaves new Indian releases on "Post Production" after they're out, so a past release
        # date counts too. Rumored, Planned and Canceled films stay out whatever their date says.
        stale = d.get("status") in ("Post Production", "In Production") and (d.get("release_date") or "9999") <= today.isoformat()
        if d.get("status") != "Released" and not stale:
            continue
        if d.get("vote_count", 0) < MIN_VOTES and 0 < (d.get("runtime") or 0) < MIN_RUNTIME:
            continue
        fid = str(d["id"])
        year = int(d["release_date"][:4]) if d.get("release_date") else None
        meta[fid] = {"d": d.get("release_date") or None, "g": [g["name"] for g in d.get("genres", [])]}
        films[fid] = {
            "t": display_title(d),
            "y": year,
            "l": d.get("original_language") or ids[d["id"]],
            "p": d.get("poster_path"),
            "pop": round(float(d.get("vote_count", 0)), 1),
        }
        rows, seen = [], set()

        def add(person: dict, role: str) -> None:
            key = (str(person["id"]), role)
            if key in seen:
                return
            seen.add(key)
            rows.append(list(key))
            people.setdefault(key[0], {"n": person["name"], "i": person.get("profile_path")})

        crew = d["credits"]["crew"]
        for c in crew:
            if c["job"] == "Director":
                add(c, "Director")
        for job in MUSIC_JOBS:
            composers = [c for c in crew if c["job"] == job]
            if composers:
                for c in composers[:MAX_COMPOSERS]:
                    add(c, "Music")
                break
        for c in sorted(d["credits"]["cast"], key=lambda c: c["order"])[:CAST_PER_FILM]:
            add(c, "Actor")
        credits[fid] = rows

    film_count: dict[str, int] = {}
    for rows in credits.values():
        for pid, _ in rows:
            film_count[pid] = film_count.get(pid, 0) + 1
    keep_full = set(sorted(films, key=lambda f: -films[f]["pop"])[:FULL_CREDITS_TOP])
    pruned = 0
    for fid, rows in credits.items():
        if fid not in keep_full:
            kept = [r for r in rows if film_count[r[0]] > 1]
            pruned += len(rows) - len(kept)
            credits[fid] = kept
    # A film with no credits left can never be reached, so drop it.
    for fid in [f for f, rows in credits.items() if not rows]:
        del credits[fid], films[fid]
    used = {pid for rows in credits.values() for pid, _ in rows}
    people = {pid: v for pid, v in people.items() if pid in used}
    print(f"pruned {pruned} dead-end credits from lesser-known films")

    write_graph(films, people, credits, source="tmdb", generated=date.today().isoformat())
    # Release dates and genres only feed the puzzle generator, so they stay out of the browser's graph.json.
    FILM_META_PATH.write_text(json.dumps({f: meta[f] for f in films}, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    main()
