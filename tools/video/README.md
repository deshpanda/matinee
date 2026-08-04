# The walkthrough film

Records the live site and cuts it into the assets linked from the project
README's press kit. Everything is reproducible: no editor, no manual timeline.

```bash
npm install playwright
node record.mjs    # drives https://deshpanda.github.io/matinee/ with eased scrolling
node cards.mjs     # renders intro/outro cards and captions using the site's CSS
./cut.sh           # burns captions in, assembles mp4 + square + gif into dist/
```

- `record.mjs` walks the demo print through every room and writes `timeline.json`,
  a mark per scene. Edit the scene list here to change what the film shows.
- `cards.mjs` holds the caption copy and the card text. It renders them in the
  site's own tokens so the cut and the product look like one piece.
- `captions.py` turns the marks into the ffmpeg overlay chain. Captions that
  follow a scroll wait for the glide to land; every caption clears before the
  next scene starts moving, so nothing narrates the wrong screen.
- `cut.sh` holds the pacing (`SPEED`), the caption dwell (`CAP_HOLD`), and the
  output formats.

Requirements: Node 20+, `ffmpeg` on PATH (the Playwright bundle is VP8-only and
cannot write mp4 or gif). The recorder points at the deployed site, so run it
after a deploy to capture current UI. Nothing personal appears on screen: the
film uses the committed demo print.
