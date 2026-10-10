"""List people who may be one person split across two TMDb ids, for a human to confirm.

Writes pipeline/merge_candidates.md: same-name pairs, most likely duplicates first (same home industry,
overlapping careers), each with TMDb links and best-known films. Confirmed pairs go in
pipeline/person_merges.json and take effect on the next fetch_tmdb.py run. Namesakes are common in
Indian cinema (Siddique the actor and Siddique the director), so nothing is merged automatically.

Usage: python pipeline/merge_candidates.py
"""

from collections import Counter, defaultdict
from pathlib import Path

from graph_io import load_graph

OUT = Path(__file__).resolve().parent / "merge_candidates.md"
TMDB = "https://www.themoviedb.org/person/"


def main() -> None:
    g = load_graph()
    films_of: dict[str, list[str]] = defaultdict(list)
    for fid, rows in g["credits"].items():
        for pid, _ in rows:
            if fid not in films_of[pid]:
                films_of[pid].append(fid)
    by_name: dict[str, list[str]] = defaultdict(list)
    for pid, p in g["people"].items():
        if films_of.get(pid):
            by_name[p["n"].strip().lower()].append(pid)

    def profile(pid: str):
        fs = films_of[pid]
        langs = Counter(g["films"][f]["l"] for f in fs)
        years = [g["films"][f]["y"] for f in fs if g["films"][f]["y"]]
        top = sorted(fs, key=lambda f: -g["films"][f]["pop"])[:3]
        return langs.most_common(1)[0][0], (min(years), max(years)) if years else None, top

    rows = []
    for name, ids in by_name.items():
        if len(ids) < 2:
            continue
        ids = sorted(ids, key=lambda i: -len(films_of[i]))
        main_id, (lang, span, _) = ids[0], profile(ids[0])
        for other in ids[1:]:
            olang, ospan, _ = profile(other)
            overlap = bool(span and ospan and ospan[0] <= span[1] + 2 and span[0] <= ospan[1] + 2)
            likely = (olang == lang) + overlap
            rows.append((likely, len(films_of[main_id]) + len(films_of[other]), main_id, other))
    rows.sort(key=lambda r: (-r[0], -r[1]))

    lines = ["# Possible duplicate people", "",
             "Same-name pairs, most likely duplicates first. Check both TMDb pages; if they're one person, add",
             '`"<duplicate id>": "<canonical id>"` to `pipeline/person_merges.json`. Many are real namesakes.', ""]
    for likely, _, a, b in rows[:120]:
        verdict = ["probably different", "maybe", "likely the same"][likely]
        lines.append(f"## {g['people'][a]['n']}: {verdict}")
        for pid, tag in ((a, "canonical"), (b, "duplicate?")):
            lang, span, top = profile(pid)
            yrs = f"{span[0]}–{span[1]}" if span else "?"
            films = ", ".join(g["films"][f]["t"] for f in top)
            lines.append(f"- {tag} [{pid}]({TMDB}{pid}): {len(films_of[pid])} films, {lang}, {yrs}: {films}")
        lines.append("")
    OUT.write_text("\n".join(lines))
    print(f"wrote {OUT.name}: {len(rows)} pairs, {sum(r[0] == 2 for r in rows)} likely the same")


if __name__ == "__main__":
    main()
