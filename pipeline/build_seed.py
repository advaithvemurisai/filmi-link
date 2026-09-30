"""Build public/data/graph.json from the hand-curated seed list (no API key needed)."""

from datetime import date

from graph_io import write_graph
from seed_films import FILMS


def main() -> None:
    films, people, credits = {}, {}, {}
    person_ids: dict[str, str] = {}

    def pid(name: str) -> str:
        if name not in person_ids:
            person_ids[name] = f"p{len(person_ids) + 1}"
            people[person_ids[name]] = {"n": name, "i": None}
        return person_ids[name]

    for idx, (title, year, lang, directors, music, cast) in enumerate(FILMS, start=1):
        fid = f"f{idx}"
        films[fid] = {"t": title, "y": year, "l": lang, "p": None, "pop": 1.0}
        rows: list[list[str]] = []
        seen: set[tuple[str, str]] = set()
        for role, names in (("Director", directors), ("Music", music), ("Actor", cast)):
            for name in names:
                key = (pid(name), role)
                if key not in seen:
                    seen.add(key)
                    rows.append([key[0], role])
        credits[fid] = rows

    write_graph(films, people, credits, source="seed", generated=date.today().isoformat())


if __name__ == "__main__":
    main()
