"""Shared read/write helpers for the film–person graph.

graph.json shape (kept compact because the browser downloads it):
  films:   {film_id: {t: title, y: year, l: lang, p: poster_path|None, pop: float}}
  people:  {person_id: {n: name, i: profile_path|None}}
  credits: {film_id: [[person_id, role], ...]}   role ∈ Director | Music | Actor
"""

import json
from collections import defaultdict
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "public" / "data"
GRAPH_PATH = DATA_DIR / "graph.json"
PUZZLES_PATH = DATA_DIR / "puzzles.json"


def write_graph(films: dict, people: dict, credits: dict, *, source: str, generated: str) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "meta": {"source": source, "generated": generated, "films": len(films), "people": len(people)},
        "films": films,
        "people": people,
        "credits": credits,
    }
    GRAPH_PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    print(f"wrote {GRAPH_PATH} — {len(films)} films, {len(people)} people")


def load_graph() -> dict:
    return json.loads(GRAPH_PATH.read_text())


def adjacency(graph: dict) -> tuple[dict[str, set[str]], dict[str, set[str]]]:
    """Return (film -> people, person -> films)."""
    film_people: dict[str, set[str]] = {}
    person_films: dict[str, set[str]] = defaultdict(set)
    for fid, rows in graph["credits"].items():
        film_people[fid] = {p for p, _ in rows}
        for p, _ in rows:
            person_films[p].add(fid)
    return film_people, person_films
