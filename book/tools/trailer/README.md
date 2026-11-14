# Book trailer

`trailer.html` draws a 51-second, 1280x720 trailer. It opens with a 5-second hook: four harmless-looking foods, "Which of these foods could kill you?", then skull stamps on "All of them." `render(t)` shows the frame at `t` seconds; open `trailer.html?play` (served by `tools/serve.py`) to watch it without sound.

To make the MP4:

1. Narration: `voice.py` makes the hook lines `h1.wav`, `h2.wav` and `n1.wav` to `n7.wav` with VoxCPM2 (on the CPU; the Mac GPU gives silence). Line 1 uses voice design and the rest clone line 1, so it's one consistent voice. It takes about 30 minutes. Set up once with Python 3.12: `python3.12 -m venv voxcpm_env && voxcpm_env/bin/pip install voxcpm soundfile`. The first run downloads the model (about 5 GB). The earlier version used macOS `say` (voice Samantha, rate 165). The lines:
   1. Some foods look completely harmless.
   2. But some can make you sick. And some can even kill you.
   3. The World's Most Dangerous Foods. From mild to deadly.
   4. Every food gets a danger level, from one, mild, to five, deadly.
   5. Fifty foods, counting down from number fifty, all the way to number one.
   6. On every page: where it's found, what makes it dangerous, and how to stay safe. Plus lots of fun facts!
   7. Never eat a wild plant or mushroom unless an expert says it's safe. The World's Most Dangerous Foods. Read it before you eat it.
2. Capture frames at 30 fps with Playwright: for each frame `f`, call `render(f / 30)` and screenshot to `frames/%05d.jpg`.
3. Encode, starting each line 0.4 s into its scene (scene starts are in `SCENES`):

```
ffmpeg -f lavfi -i "aevalsrc='0.9*sin(2*PI*(48+90*exp(-t*28))*t)*exp(-t*10)+0.25*(random(0)-0.5)*exp(-t*60)':s=48000:d=0.6" -ac 1 thud.wav
ffmpeg -framerate 30 -i frames/%05d.jpg -i h1.wav -i h2.wav -i n1.wav ... -i n7.wav -i thud.wav \
  -filter_complex "[1]adelay=300:all=1[h1];[2]adelay=3300:all=1[h2];[3]adelay=5400:all=1[a1];[4]adelay=9000:all=1[a2];[5]adelay=14100:all=1[a3];[6]adelay=20000:all=1[a4];[7]adelay=26700:all=1[a5];[8]adelay=32800:all=1[a6];[9]adelay=41100:all=1[a7];[10]volume=0.55,asplit=4[t1][t2][t3][t4];[t1]adelay=3420:all=1[u1];[t2]adelay=3540:all=1[u2];[t3]adelay=3660:all=1[u3];[t4]adelay=3780:all=1[u4];[h1][h2][a1][a2][a3][a4][a5][a6][a7][u1][u2][u3][u4]amix=inputs=13:normalize=0,loudnorm=I=-16:TP=-1.5,aresample=48000,apad[a]" \
  -map 0:v -map "[a]" -c:v libx264 -pix_fmt yuv420p -crf 20 -c:a aac -shortest -movflags +faststart book_trailer.mp4
```

The animations inside each scene are timed to the narration's words. If the narration changes length, update `SCENES`/`LENGTH` in trailer.html and the `adelay` values (scene start + 0.4 s).
