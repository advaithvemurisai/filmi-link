"""Pull Indian films + credits from TMDb and write public/data/graph.json.

Auth (either works):
  export TMDB_READ_TOKEN=...   # v4 "API Read Access Token" (preferred)
  export TMDB_API_KEY=...      # v3 key

Usage:
  python pipeline/fetch_tmdb.py            # default per-language quotas
  python pipeline/fetch_tmdb.py --scale 0.5

Raw responses are cached in pipeline/.cache so reruns are cheap.
This product uses the TMDb API but is not endorsed or certified by TMDb.
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

from graph_io import write_graph

API = "https://api.themoviedb.org/3"
CACHE = Path(__file__).resolve().parent / ".cache"

# Films per original language, ranked by TMDb vote count.
QUOTAS = {"hi": 900, "ta": 600, "te": 600, "ml": 500, "kn": 250, "mr": 100, "bn": 100}
MIN_VOTES = 15
CAST_PER_FILM = 12
MUSIC_JOBS = {"Original Music Composer", "Music", "Music Director", "Songs"}

TOKEN = os.environ.get("TMDB_READ_TOKEN")
KEY = os.environ.get("TMDB_API_KEY")


def get(path: str, **params) -> dict:
    cache_file = CACHE / (path.strip("/").replace("/", "_") + "_" + urllib.parse.urlencode(sorted(params.items())) + ".json")
    if cache_file.exists():
        return json.loads(cache_file.read_text())

    if KEY and not TOKEN:
        params["api_key"] = KEY
    url = f"{API}{path}?{urllib.parse.urlencode(params)}"
    headers = {"accept": "application/json"}
    if TOKEN:
        headers["Authorization"] = f"Bearer {TOKEN}"

    for attempt in range(6):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=20) as r:
                data = json.loads(r.read())
            break
        except urllib.error.HTTPError as e:
            if e.code == 429 or e.code >= 500:
                time.sleep(1.5 * (attempt + 1))
                continue
            raise
        except urllib.error.URLError:
            time.sleep(1.5 * (attempt + 1))
    else:
        raise RuntimeError(f"gave up on {path}")

    CACHE.mkdir(exist_ok=True)
    cache_file.write_text(json.dumps(data))
    return data


def discover(lang: str, quota: int) -> list[dict]:
    out, page = [], 1
    while len(out) < quota:
        res = get(
            "/discover/movie",
            with_origin_country="IN",
            with_original_language=lang,
            sort_by="vote_count.desc",
            include_adult="false",
            **{"vote_count.gte": MIN_VOTES},
            page=page,
        )
        out.extend(res["results"])
        if page >= min(res.get("total_pages", 1), 500):
            break
        page += 1
    return out[:quota]


def main() -> None:
    if not (TOKEN or KEY):
        sys.exit("Set TMDB_READ_TOKEN or TMDB_API_KEY (free at themoviedb.org/settings/api).")

    ap = argparse.ArgumentParser()
    ap.add_argument("--scale", type=float, default=1.0, help="multiply every language quota")
    args = ap.parse_args()

    ids: dict[int, str] = {}
    for lang, quota in QUOTAS.items():
        found = discover(lang, max(1, int(quota * args.scale)))
        for m in found:
            ids.setdefault(m["id"], lang)
        print(f"{lang}: {len(found)} films")

    with ThreadPoolExecutor(max_workers=8) as pool:
        details = list(pool.map(lambda mid: get(f"/movie/{mid}", append_to_response="credits"), ids))

    films, people, credits = {}, {}, {}
    for d in details:
        fid = str(d["id"])
        year = int(d["release_date"][:4]) if d.get("release_date") else None
        films[fid] = {
            "t": d["title"],
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
        for c in crew:
            if c["job"] in MUSIC_JOBS:
                add(c, "Music")
        for c in sorted(d["credits"]["cast"], key=lambda c: c["order"])[:CAST_PER_FILM]:
            add(c, "Actor")
        credits[fid] = rows

    write_graph(films, people, credits, source="tmdb", generated=date.today().isoformat())


if __name__ == "__main__":
    main()
