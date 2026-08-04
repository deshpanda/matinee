#!/bin/bash
# Assembles the walkthrough: intro card, the recording with lower-third captions
# timed from timeline.json, then the outro card. Outputs mp4 (social) and gif.
set -e
cd "$(dirname "$0")"

FF=ffmpeg
SRC=$(ls out/*.webm | head -1)
SPEED=1.35     # tightens the pacing; caption marks are divided by this
CAP_HOLD=4.6   # seconds a caption stays up, before overlap trimming
W=1280
H=800

mkdir -p build dist
FILTER=$(python3 captions.py "$SPEED" "$CAP_HOLD")

echo "-> body with captions"
"$FF" -y -loglevel error -i "$SRC" \
  $(for i in $(seq 1 10); do printf -- "-i cards/c%s.png " "$i"; done) \
  -filter_complex "$FILTER" -map "[outv]" \
  -c:v libx264 -pix_fmt yuv420p -crf 19 -preset medium -r 30 build/body.mp4

echo "-> cards"
"$FF" -y -loglevel error -loop 1 -t 3.2 -i cards/intro.png \
  -vf "scale=$W:$H,fade=t=in:st=0:d=0.5,fade=t=out:st=2.7:d=0.5,format=yuv420p" \
  -c:v libx264 -pix_fmt yuv420p -crf 19 -preset medium -r 30 build/intro.mp4
"$FF" -y -loglevel error -loop 1 -t 4.2 -i cards/outro.png \
  -vf "scale=$W:$H,fade=t=in:st=0:d=0.5,fade=t=out:st=3.7:d=0.5,format=yuv420p" \
  -c:v libx264 -pix_fmt yuv420p -crf 19 -preset medium -r 30 build/outro.mp4

echo "-> concat"
printf "file 'intro.mp4'\nfile 'body.mp4'\nfile 'outro.mp4'\n" > build/list.txt
"$FF" -y -loglevel error -f concat -safe 0 -i build/list.txt -c copy \
  dist/matinee-walkthrough.mp4

echo "-> square cut for feeds (1080x1080, letterboxed)"
"$FF" -y -loglevel error -i dist/matinee-walkthrough.mp4 \
  -vf "scale=1080:-2,pad=1080:1080:0:(1080-ih)/2:color=black,format=yuv420p" \
  -c:v libx264 -crf 20 -preset medium dist/matinee-square.mp4

echo "-> gif teaser (the develop, 14s)"
"$FF" -y -loglevel error -ss 3.2 -t 14 -i dist/matinee-walkthrough.mp4 \
  -vf "fps=11,scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" \
  dist/matinee-teaser.gif

echo
for f in dist/*; do
  printf "%-34s %s\n" "$(basename "$f")" "$(du -h "$f" | cut -f1)"
done
"$FF" -i dist/matinee-walkthrough.mp4 2>&1 | grep Duration | sed 's/^ *//'
