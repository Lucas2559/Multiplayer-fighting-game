# Book trailer

`trailer.html` draws a 43.5-second, 1280x720 trailer. `render(t)` shows the frame at `t` seconds; open `trailer.html?play` (served by `tools/serve.py`) to watch it without sound.

To make the MP4:

1. Narration: `voice.py` makes `n1.wav` to `n7.wav` with VoxCPM2 (on the CPU; the Mac GPU gives silence). Line 1 uses voice design and the rest clone line 1, so it's one consistent voice. It takes about 30 minutes. Set up once with Python 3.12: `python3.12 -m venv voxcpm_env && voxcpm_env/bin/pip install voxcpm soundfile`. The first run downloads the model (about 5 GB). The earlier version used macOS `say` (voice Samantha, rate 165). The lines:
   1. Some foods look completely harmless.
   2. But some can make you sick. And some can even kill you.
   3. A Guide to Foods. The world's most dangerous foods.
   4. Every food gets a danger level, from one, mild, to five, deadly.
   5. Fifty foods, counting down from number fifty, all the way to number one.
   6. On every page: where it's found, what makes it dangerous, and how to stay safe. Plus lots of fun facts!
   7. Never eat a wild plant or mushroom unless an expert says it's safe. A Guide to Foods. Read it before you eat it.
2. Capture frames at 30 fps with Playwright: for each frame `f`, call `render(f / 30)` and screenshot to `frames/%05d.jpg`.
3. Encode, starting each line 0.4 s into its scene (scene starts are in `SCENES`):

```
ffmpeg -framerate 30 -i frames/%05d.jpg -i n1.wav ... -i n7.wav \
  -filter_complex "[1]adelay=400:all=1[a1];[2]adelay=3900:all=1[a2];[3]adelay=8800:all=1[a3];[4]adelay=14000:all=1[a4];[5]adelay=19800:all=1[a5];[6]adelay=25300:all=1[a6];[7]adelay=33800:all=1[a7];[a1][a2][a3][a4][a5][a6][a7]amix=inputs=7:normalize=0,loudnorm=I=-16:TP=-1.5,aresample=48000,apad[a]" \
  -map 0:v -map "[a]" -c:v libx264 -pix_fmt yuv420p -crf 20 -c:a aac -shortest -movflags +faststart book_trailer.mp4
```

The animations inside each scene are timed to the narration's words. If the narration changes length, update `SCENES`/`LENGTH` in trailer.html and the `adelay` values (scene start + 0.4 s).
