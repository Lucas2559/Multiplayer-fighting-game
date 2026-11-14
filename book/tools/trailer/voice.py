"""Make the trailer narration with VoxCPM2.

Usage: voxcpm_env/bin/python voice.py OUT_DIR [--hook-only | LINE_NUMBERS...]
Writes h1.wav, h2.wav (the opening hook) and n1.wav ... n7.wav, and prints each
length. --hook-only makes just the hook, and LINE_NUMBERS (2-7) remake just those
lines; both clone an existing n1.wav.

Line 1 is made with voice design. Every other line clones line 1's voice, so
the whole trailer sounds like one person instead of seven slightly different ones.
"""
import sys, time
import soundfile as sf
import torch
from voxcpm import VoxCPM

# The description in parentheses sets the voice; VoxCPM2 doesn't read it aloud.
# A calm, matter-of-fact voice; the user found the documentary-narrator voice too dramatic.
VOICE = "(A calm adult woman speaking in a plain, even, everyday tone, relaxed and matter-of-fact, like reading aloud in class, not dramatic)"
LINES = [
    "Some foods look completely harmless.",
    "But some can make you sick. And some can even kill you.",
    "The World's Most Dangerous Foods. From mild to deadly.",
    "Every food gets a danger level, from one, mild, to five, deadly.",
    "Fifty foods, counting down from number fifty, all the way to number one.",
    "On every page: where it's found, what makes it dangerous, and how to stay safe. Plus lots of fun facts!",
    "Never eat a wild plant or mushroom unless an expert says it's safe. The World's Most Dangerous Foods. Read it before you eat it.",
]
# The opening hook, said in the same voice before line 1's scene.
HOOK = ["Which of these foods could kill you?", "All of them."]
STEPS = 25   # more diffusion steps: slower, but cleaner and smoother speech (default 10)
CFG = 1.8    # a little lower than the default 2.0 for less forced delivery

out = sys.argv[1]
t0 = time.time()
# On Apple Silicon the GPU ("mps") gives near-silent noise (VoxCPM 2.0.3, torch 2.15), so use the CPU.
model = VoxCPM.from_pretrained("openbmb/VoxCPM2", load_denoiser=False, device="cpu")
rate = model.tts_model.sample_rate
print(f"model loaded in {time.time() - t0:.0f}s, {rate} Hz", flush=True)

first = f"{out}/n1.wav"
only = [int(a) for a in sys.argv[2:] if a.isdigit()]
for n, line in enumerate([] if "--hook-only" in sys.argv else LINES, 1):
    if only and n not in only:
        continue
    t0 = time.time()
    torch.manual_seed(7)  # same delivery on every run
    if n == 1:
        wav = model.generate(text=VOICE + line, cfg_value=CFG, inference_timesteps=STEPS)
    else:
        wav = model.generate(text=line, prompt_wav_path=first, prompt_text=LINES[0], reference_wav_path=first,
                             cfg_value=CFG, inference_timesteps=STEPS)
    sf.write(f"{out}/n{n}.wav", wav, rate)
    print(f"n{n}: {len(wav) / rate:.2f}s audio, took {time.time() - t0:.0f}s", flush=True)

for n, line in enumerate([] if only else HOOK, 1):
    t0 = time.time()
    torch.manual_seed(7)
    wav = model.generate(text=line, prompt_wav_path=first, prompt_text=LINES[0], reference_wav_path=first,
                         cfg_value=CFG, inference_timesteps=STEPS)
    sf.write(f"{out}/h{n}.wav", wav, rate)
    print(f"h{n}: {len(wav) / rate:.2f}s audio, took {time.time() - t0:.0f}s", flush=True)
