"""Builds the ffmpeg filter chain that burns the lower-third captions in.

Timing rule: a caption that follows a page load can appear almost immediately,
but one that follows a scroll must wait for the glide to land, or it narrates
the screen the viewer is scrolling away from. Captions never overlap: each ends
before the next begins, and anything left shorter than a readable beat is cut.
"""

import json
import sys

speed = float(sys.argv[1])
hold = float(sys.argv[2])

marks = {m["label"]: m["t"] for m in json.load(open("timeline.json"))}

AFTER_LOAD = {"c1": 0.5, "c2": 0.7, "c7": 0.6, "c8": 0.6, "c10": 0.6}
AFTER_GLIDE = 2.6 / speed + 0.25  # the recorder's glide duration, sped up
MIN_READABLE = 1.4

labels = [f"c{i}" for i in range(1, 11)]
starts = {
    lab: marks[lab] / speed + AFTER_LOAD.get(lab, AFTER_GLIDE)
    for lab in labels
    if lab in marks
}
order = [lab for lab in labels if lab in starts]

# A caption must be gone before the NEXT scene starts moving, not merely before
# the next caption appears: the following scene begins at its own mark, and the
# glide toward it starts there too.
next_scene = {}
for i, lab in enumerate(order):
    if i + 1 < len(order):
        next_scene[lab] = marks[order[i + 1]] / speed
    else:
        next_scene[lab] = 1e9

parts = [f"[0:v]setpts=PTS/{speed},scale=1280:800,format=yuv420p[base]"]
prev = "base"
for i, lab in enumerate(order):
    start = starts[lab]
    end = min(start + hold, next_scene[lab] - 0.2)
    if end - start < MIN_READABLE:
        continue
    idx = labels.index(lab) + 1
    parts.append(f"[{idx}:v]scale=1280:150[cap{idx}]")
    parts.append(
        f"[{prev}][cap{idx}]overlay=x=0:y=H-172:"
        f"enable='between(t,{start:.2f},{end:.2f})'[v{idx}]"
    )
    prev = f"v{idx}"
parts.append(f"[{prev}]null[outv]")
print(";".join(parts))
