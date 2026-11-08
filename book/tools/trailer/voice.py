"""Make the trailer narration with VoxCPM2 voice design.

Usage: voxcpm_env/bin/python voice.py OUT_DIR [LINE_NUMBERS...]
Writes n1.wav ... n7.wav (or just the lines given) and prints each length.
"""
import sys, time
import soundfile as sf
import torch
from voxcpm import VoxCPM

# The description in parentheses sets the voice; VoxCPM2 doesn't read it aloud.
VOICE = "(A warm, friendly female narrator, clear and expressive, telling an exciting story to kids, slightly mysterious)"
LINES = [
    "Some foods look completely harmless.",
    "But some can make you sick. And some... can even kill you.",
    "A Guide to Foods. The world's most dangerous foods.",
    "Every food gets a danger level, from one, mild, to five, deadly.",
    "Fifty foods, counting down from number fifty, all the way to number one.",
    "On every page: where it's found, what makes it dangerous, and how to stay safe. Plus lots of fun facts!",
    "Never eat a wild plant or mushroom unless an expert says it's safe. A Guide to Foods. Read it before you eat it.",
]

out = sys.argv[1]
which = [int(n) for n in sys.argv[2:]] or range(1, len(LINES) + 1)
t0 = time.time()
# On Apple Silicon the GPU ("mps") gives near-silent noise (VoxCPM 2.0.3, torch 2.15), so use the CPU.
model = VoxCPM.from_pretrained("openbmb/VoxCPM2", load_denoiser=False, device="cpu")
rate = model.tts_model.sample_rate
print(f"model loaded in {time.time() - t0:.0f}s, {rate} Hz", flush=True)
for n in which:
    t0 = time.time()
    torch.manual_seed(7)  # same voice and delivery on every run
    wav = model.generate(text=VOICE + LINES[n - 1], cfg_value=2.0, inference_timesteps=10)
    sf.write(f"{out}/n{n}.wav", wav, rate)
    print(f"n{n}: {len(wav) / rate:.2f}s audio, took {time.time() - t0:.0f}s", flush=True)
