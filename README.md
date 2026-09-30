# CinematicLink 🎬

**▶ Play: https://cinematic-link.vercel.app**

I made this because I love Indian movies. It's a daily game about how connected Indian cinema is, across Hindi, Tamil, Telugu, Malayalam, Kannada, Bengali and more.

## How to play
You get two films, like *Amaran* and *Black Friday*. Connect them through the actors, directors and music composers who worked on them:

*Film → person → film → person → … → target film*

Each person is one link. Try to match **par**, the shortest possible chain.

## Features
- **Daily puzzle:** everyone gets the same pair each day, and difficulty rises through the week.
- **Verified par:** every puzzle is checked solvable in advance, and par is the true shortest chain.
- **Results screen:** see your chain next to an optimal one, and share a Wordle-style result card.
- **Hints:** reveal the next step on a shortest route from wherever you are.
- **Hard mode:** no hints, and no film counts next to people.
- **Random play:** endless chains at easy, medium or hard.
- **Archive and stats:** replay past puzzles and track your streaks.

## Run locally
```bash
npm install
npm run dev
```

---
Film data from [TMDb](https://www.themoviedb.org). This product uses the TMDb API but is not endorsed or certified by TMDb. Inspired by [FilmLink](https://www.filmlink.io/).
