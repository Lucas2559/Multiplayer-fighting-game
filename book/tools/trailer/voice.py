"""Make the trailer narration with VoxCPM2.

Usage: voxcpm_env/bin/python voice.py OUT_DIR
Writes n1.wav ... n7.wav and prints each length.

Line 1 is made with voice design. Every other line clones line 1's voice, so
the whole trailer sounds like one person instead of seven slightly different ones.
"""
import sys, time
import soundfile as sf
import torch
from voxcpm import VoxCPM

# The description in parentheses sets the voice; VoxCPM2 doesn't read it aloud.
# A plain, relaxed description sounds more natural than an "exciting" one.
VOICE = "(A natural, relaxed young woman's voice, warm and conversational, like a friendly teacher talking to students)"
LINES = [
    "Some foods look completely harmless.",
    "But some can make you sick. And some can even kill you.",
    "A Guide to Foods. The world's most dangerous foods.",
    "Every food gets a danger level, from one, mild, to five, deadly.",
    "Fifty foods, counting down from number fifty, all the way to number one.",
    "On every page: where it's found, what makes it dangerous, and how to stay safe. Plus lots of fun facts!",
    "Never eat a wild plant or mushroom unless an expert says it's safe. A Guide to Foods. Read it before you eat it.",
]
STEPS = 25   # more diffusion steps: slower, but cleaner and smoother speech (default 10)
CFG = 1.8    # a little lower than the default 2.0 for less forced delivery

out = sys.argv[1]
t0 = time.time()
# On Apple Silicon the GPU ("mps") gives near-silent noise (VoxCPM 2.0.3, torch 2.15), so use the CPU.
model = VoxCPM.from_pretrained("openbmb/VoxCPM2", load_denoiser=False, device="cpu")
rate = model.tts_model.sample_rate
print(f"model loaded in {time.time() - t0:.0f}s, {rate} Hz", flush=True)

first = f"{out}/n1.wav"
for n, line in enumerate(LINES, 1):
    t0 = time.time()
    torch.manual_seed(7)  # same delivery on every run
    if n == 1:
        wav = model.generate(text=VOICE + line, cfg_value=CFG, inference_timesteps=STEPS)
    else:
        wav = model.generate(text=line, prompt_wav_path=first, prompt_text=LINES[0], reference_wav_path=first,
                             cfg_value=CFG, inference_timesteps=STEPS)
    sf.write(f"{out}/n{n}.wav", wav, rate)
    print(f"n{n}: {len(wav) / rate:.2f}s audio, took {time.time() - t0:.0f}s", flush=True)
