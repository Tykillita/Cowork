# Synthesized soundtrack for the Cowork tour: music bed + SFX, timed to index.html.
# 120 BPM: every scene boundary falls on a half-second beat. Based on the isTargetSleeping tour.
#   python docs/video/source/soundtrack.py docs/video/source/out/soundtrack.wav
import sys
import numpy as np
from scipy.signal import butter, sosfilt, sosfilt_zi, fftconvolve
from scipy.io import wavfile

SR = 48000
DUR = 77.0
N = int(SR * DUR)
rng = np.random.default_rng(7)
BEAT = 0.5

music = np.zeros((N, 2))
sfx = np.zeros((N, 2))
duck = np.ones(N)          # sidechain from the kick
verb_send = np.zeros((N, 2))


def tt(d):
    return np.arange(int(d * SR)) / SR


def add(bus, at, sig, pan=0.0, gain=1.0, send=0.0):
    if sig.ndim == 1:
        l, r = np.sqrt(0.5 * (1 - pan)), np.sqrt(0.5 * (1 + pan))
        sig = np.stack([sig * l, sig * r], 1) * np.sqrt(2)
    i = int(at * SR)
    if i >= N:
        return
    j = min(N, i + len(sig))
    if i < 0:
        sig, i = sig[-i:], 0
    bus[i:j] += sig[: j - i] * gain
    if send:
        verb_send[i:j] += sig[: j - i] * gain * send


def filt(x, kind, f, order=2):
    f = np.clip(f, 20, SR / 2 - 100)
    sos = butter(order, f, btype=kind, fs=SR, output='sos')
    return sosfilt(sos, x, axis=0)


def sweep_filter(x, kind, f_of_t, chunk=256, q_band=None):
    """Time-varying Butterworth filter (cutoff from a function of time, chunked)."""
    out = np.zeros_like(x)
    zi = None
    for s in range(0, len(x), chunk):
        f = float(np.clip(f_of_t(s / SR), 30, SR / 2 - 200))
        if kind == 'band':
            sos = butter(1, [f / q_band, min(f * q_band, SR / 2 - 100)], btype='band', fs=SR, output='sos')
        else:
            sos = butter(2, f, btype=kind, fs=SR, output='sos')
        if zi is None:
            zi = np.zeros((sos.shape[0], 2) + x.shape[1:])
        out[s:s + chunk], zi = sosfilt(sos, x[s:s + chunk], axis=0, zi=zi)
    return out


def env_ad(n, a, d, curve=4.0):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4))
    return e * np.exp(-np.maximum(0, t - a) * curve / max(d, 1e-4))


def mtof(m):
    return 440 * 2 ** ((m - 69) / 12)


def saw(f, t, phase=0):
    return 2 * ((f * t + phase) % 1) - 1

# ---------------------------------------------------------------- instruments


def pad(notes, dur, att=1.2, rel=1.8, bright=1400):
    t = tt(dur + rel)
    x = np.zeros((len(t), 2))
    for m in notes:
        f = mtof(m)
        for k, det in enumerate((-0.11, 0, 0.12)):
            ph = rng.random()
            v = saw(f * 2 ** (det / 12), t, ph)
            x[:, 0] += v * (0.6 if k == 0 else 0.4)
            x[:, 1] += v * (0.6 if k == 2 else 0.4)
    x = filt(filt(x, 'low', bright, 2), 'high', 140, 2)
    e = np.minimum(1, t / att) * np.where(t < dur, 1, np.exp(-(t - dur) * 4 / rel))
    return x * e[:, None] / (len(notes) * 1.5)


def bass(m, dur):
    t = tt(dur)
    f = mtof(m)
    x = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t) + 0.15 * saw(f, t)
    x = np.tanh(1.6 * x)
    return filt(x, 'low', 380) * env_ad(len(t), 0.006, dur, 2.5)


def kick():
    t = tt(0.45)
    f = 45 + 110 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) * np.exp(-t * 7) + 0.3 * filt(rng.standard_normal(len(t)), 'high', 2500) * np.exp(-t * 120)
    return np.tanh(1.4 * x)


def hat(open_=False):
    t = tt(0.25 if open_ else 0.06)
    x = filt(rng.standard_normal(len(t)), 'high', 7500)
    return x * np.exp(-t * (14 if open_ else 70))


def clap():
    t = tt(0.3)
    n = filt(rng.standard_normal(len(t)), 'band', [900, 2600])
    e = sum(np.exp(-np.maximum(0, t - d) * 60) * (t >= d) for d in (0, 0.012, 0.024)) * 0.5 + np.exp(-t * 18) * (t >= 0.024)
    return n * e * 0.8


def bell(f, dur=1.2, index=2.5, ratio=3.5, decay=5):
    t = tt(dur)
    e = np.exp(-t * decay)
    mod = np.sin(2 * np.pi * f * ratio * t) * index * np.exp(-t * decay * 1.6)
    return np.sin(2 * np.pi * f * t + mod) * e * np.minimum(1, t / 0.002)


def pluck(f, dur=0.35):
    t = tt(dur)
    x = saw(f, t) * 0.6 + np.sin(2 * np.pi * f * t)
    x = sweep_filter(x[:, None], 'low', lambda s: 300 + 4200 * np.exp(-s * 18))[:, 0]
    return x * env_ad(len(t), 0.002, dur, 5)


def whoosh(dur=0.8, f0=250, f1=4000, peak=0.55):
    t = tt(dur)
    n = rng.standard_normal((len(t), 2))
    k = t / dur
    fc = lambda s: f0 * (f1 / f0) ** np.sin(np.pi * min(1, s / dur))
    x = sweep_filter(n, 'band', fc, q_band=1.6)
    e = np.where(k < peak, (k / peak) ** 2, ((1 - k) / (1 - peak)) ** 1.5)
    pan = np.linspace(-0.7, 0.7, len(t))
    x[:, 0] *= np.sqrt(0.5 * (1 - pan)) * 1.4
    x[:, 1] *= np.sqrt(0.5 * (1 + pan)) * 1.4
    return x * e[:, None]


def impact(size=1.0):
    t = tt(3.5)
    f = 32 + 70 * np.exp(-t * 9)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.3)
    crack = filt(rng.standard_normal(len(t)), 'low', 2500) * np.exp(-t * 9)
    body = filt(rng.standard_normal(len(t)), 'band', [80, 400]) * np.exp(-t * 3)
    x = np.tanh(1.8 * (sub * 1.1 + crack * 0.5 * size + body * 0.6))
    return x


def riser(dur=2.0, f0=300, f1=7000):
    t = tt(dur)
    n = rng.standard_normal((len(t), 2))
    x = sweep_filter(n, 'band', lambda s: f0 * (f1 / f0) ** (s / dur), q_band=1.4)
    tone = sum(saw(mtof(50 + o) * 2 ** (2 * t / dur), t, rng.random()) for o in (0, 7, 12))
    tone = filt(tone, 'low', 2500)[:, None] * 0.25
    e = (t / dur) ** 2.2
    return (x + tone) * e[:, None]


def reverse_swell(dur=1.2):
    t = tt(dur)
    x = filt(rng.standard_normal((len(t), 2)), 'high', 3000)
    return x * ((t / dur) ** 3)[:, None]


def pop(f=700, dur=0.09):
    t = tt(dur)
    fr = f * (1 + 0.8 * np.exp(-t * 60))
    return np.sin(2 * np.pi * np.cumsum(fr) / SR) * env_ad(len(t), 0.001, dur, 6)


def tick(f=3200, dur=0.03):
    t = tt(dur)
    return (np.sin(2 * np.pi * f * t) * 0.6 + filt(rng.standard_normal(len(t)), 'high', 4000) * 0.4) * np.exp(-t * 180)


def beep(f=1000, dur=0.11):
    t = tt(dur)
    return np.sin(2 * np.pi * f * t) * np.minimum(1, t / 0.004) * np.minimum(1, (dur - t) / 0.02)


def power(up=True, dur=0.7):
    t = tt(dur)
    k = t / dur
    f = 70 * (8 ** k) if up else 520 * (0.12 ** k)
    x = sum(saw(f * m, t, rng.random()) for m in (1, 1.005, 2.01)) / 3
    x = filt(x, 'low', 1800)
    e = (np.minimum(1, k * 6) * (1 - k) ** 0.6) if up else (1 - k) ** 1.3
    return x * e


def snore(dur=1.1):
    t = tt(dur)
    x = filt(rng.standard_normal(len(t)), 'band', [120, 700]) * (0.6 + 0.4 * np.sin(2 * np.pi * 38 * t))
    return x * np.sin(np.pi * t / dur) ** 2


def crunch():
    t = tt(0.07)
    return filt(rng.standard_normal(len(t)), 'band', [1500, 6000]) * np.exp(-t * 50) * (rng.random(len(t)) > 0.3)


def brush(dur=0.25):
    t = tt(dur)
    x = sweep_filter(rng.standard_normal((len(t), 1)), 'band', lambda s: 1500 + 3000 * s / dur, q_band=1.8)[:, 0]
    return x * np.sin(np.pi * t / dur) ** 1.5


def shimmer(dur=1.5, base=2000, n=18, rise=True):
    t = tt(dur)
    x = np.zeros((len(t), 2))
    for i in range(n):
        at = (i / n) * dur * 0.8
        f = base * 2 ** (rng.random() * 1.6 + (i / n if rise else 0))
        s = bell(f, 0.5, index=1.2, ratio=2.0, decay=8) * 0.3
        add_local(x, at, s, rng.uniform(-0.8, 0.8))
    return x


def add_local(buf, at, sig, pan=0.0):
    l, r = np.sqrt(0.5 * (1 - pan)), np.sqrt(0.5 * (1 + pan))
    i = int(at * SR)
    j = min(len(buf), i + len(sig))
    buf[i:j, 0] += sig[: j - i] * l * 1.41
    buf[i:j, 1] += sig[: j - i] * r * 1.41


def chime(notes, gap=0.07, gain=0.4):
    x = np.zeros((int(SR * (1.4 + gap * len(notes))), 2))
    for i, m in enumerate(notes):
        add_local(x, i * gap, bell(mtof(m), 1.3, index=1.6, ratio=2.0, decay=4) * gain, (i - len(notes) / 2) * 0.25)
    return x

# ---------------------------------------------------------------- music

D, F, A, Bb, C, E, G = 62, 65, 69, 58, 60, 64, 67
CHORDS = [  # (root midi for bass, pad notes)
    (38, [D, F, A, 74]),          # Dm
    (34, [Bb, D, F, 69]),         # Bb
    (41, [F, A, 72, 76]),         # F (add9-ish)
    (36, [C, E, G, 74]),          # C
]


def chord_at(t):
    if t < 13:
        return CHORDS[0]
    return CHORDS[int((t - 13) // 4) % 4]


# Intro + problem: low drone Dm
add(music, 0.0, pad([50, 57, 62, 65], 6.2, att=2.5, rel=1.0, bright=700), gain=0.9)
add(music, 6.0, pad([50, 53, 57, 62], 7.0, att=1.0, rel=0.8, bright=900), gain=0.9)
# Progression from the reveal to the outro
for k, s in enumerate(np.arange(13, 72, 4)):
    root, notes = chord_at(s)
    add(music, s, pad(notes, min(4, 72 - s), att=0.5, rel=1.2, bright=2600 if s >= 21 else 1600), gain=0.8, send=0.3)

# Sub pulse: quarters in the problem, eighths from the reveal
for b in np.arange(6.0, 13.0, BEAT):
    add(music, b, bass(38, 0.4), gain=0.26)
for b in np.arange(13.0, 71.9, BEAT / 2):
    root, _ = chord_at(b)
    oct_ = 12 if (int(b * 4) % 4 == 3) else 0
    add(music, b, bass(root + oct_, 0.22), gain=0.30 if b >= 21 else 0.22)

# Drums
for b in np.arange(21.0, 71.9, BEAT):
    add(music, b, kick(), gain=0.52)
    i = int(b * SR)
    n = min(N - i, int(0.35 * SR))
    duck[i:i + n] = np.minimum(duck[i:i + n], 1 - 0.55 * np.exp(-np.arange(n) / SR / 0.11))
for b in np.arange(13.0, 21.0, 2 * BEAT):   # softer half-time pulse after the reveal
    add(music, b, kick(), gain=0.4)
for b in np.arange(31.0, 71.9, BEAT):
    add(music, b + BEAT / 2, hat(open_=(int(b) % 4 == 3)), pan=0.3, gain=0.18)
    add(music, b + BEAT / 4, hat(), pan=-0.3, gain=0.07)
    add(music, b + 3 * BEAT / 4, hat(), pan=-0.3, gain=0.07)
for b in np.arange(31.5, 71.9, 2 * BEAT):
    if 48.5 <= b < 54.5:
        continue
    add(music, b, clap(), gain=0.32, send=0.4)

# Arpeggio plucks (16ths) from the summary; bells during the review and the feature cards
PATTERN = [0, 1, 2, 3, 2, 1, 2, 3]
for k, b in enumerate(np.arange(21.0, 71.9, BEAT / 2)):
    _, notes = chord_at(b)
    m = notes[PATTERN[k % 8]] + 12
    if 54.5 <= b < 68.5:
        add(music, b, bell(mtof(m), 0.5, index=1.0, ratio=2.0, decay=7), pan=0.35 * np.sin(k * 0.7), gain=0.12, send=0.5)
    else:
        add(music, b, pluck(mtof(m)), pan=0.4 * np.sin(k * 0.9), gain=0.10, send=0.35)

# Build into the outro: snare roll
for k, b in enumerate(np.arange(70.0, 72.0, BEAT / 4)):
    add(music, b, clap(), gain=0.08 + 0.3 * k / 16)

# Final chord: D major, cinematic
add(music, 72.0, pad([50, 57, 62, 66, 69, 74, 78], 3.0, att=0.02, rel=2.0, bright=2400), gain=1.1, send=0.6)
add(music, 72.0, bass(26, 3.5), gain=0.6)
for i, m in enumerate([74, 78, 81, 86]):
    add(music, 72.05 + i * 0.09, bell(mtof(m), 3.0, index=1.4, ratio=2.0, decay=1.6), pan=(i - 1.5) * 0.3, gain=0.18, send=0.6)

# ---------------------------------------------------------------- SFX


def wh(at, dur=0.8, gain=0.35, **kw):
    add(sfx, at, whoosh(dur, **kw), gain=gain, send=0.25)


# 1 · Intro: the mark draws itself, its three nodes pop, the name lands
add(sfx, 0.0, impact(0.4), gain=0.35)
add(sfx, 0.2, shimmer(1.4, 1800), gain=0.5, send=0.5)
wh(0.25, 1.1, 0.2, f0=300, f1=2600)
for i, (at, pan) in enumerate(((1.15, -0.4), (1.27, -0.4), (1.39, 0.4))):
    add(sfx, at, pop(500 + i * 160, 0.1), pan=pan, gain=0.4)
    add(sfx, at, tick(2400 + i * 300, 0.04), pan=pan, gain=0.3)
wh(2.5, 0.9, 0.25)
add(sfx, 2.98, impact(0.6), gain=0.5, send=0.4)
add(sfx, 2.98, chime([74, 81, 86], 0.06, 0.4), gain=0.8, send=0.5)
for i in range(6):
    add(sfx, 2.9 + i * 0.05, tick(3000 + i * 180, 0.02), pan=(i - 2.5) / 4, gain=0.18)
for at, m in ((3.9, 79), (4.6, 76), (5.3, 72)):
    add(sfx, at, bell(mtof(m), 0.6, index=0.6, ratio=1.0, decay=6), pan=0.4, gain=0.16, send=0.5)

# 2 · Problem: notes pop up everywhere, then get pulled together
wh(5.65, 0.75, 0.4)
add(sfx, 6.0, impact(0.5), gain=0.45)
for i in range(6):
    at = 6 + 1.3 + i * 0.45
    add(sfx, at, pop(420 + (i % 3) * 140, 0.11), pan=[-0.7, 0.7, -0.5, 0.5, 0.0, 0.8][i], gain=0.32)
    add(sfx, at + 0.03, beep(880 if i % 2 else 660, 0.07), pan=[-0.7, 0.7, -0.5, 0.5, 0.0, 0.8][i], gain=0.07)
add(sfx, 11.2, riser(1.8), gain=0.35)
add(sfx, 11.4, whoosh(1.4, 3500, 300, 0.25), gain=0.25)

# 3 · One space per project: the window rises
add(sfx, 13.0, impact(1.0), gain=0.75, send=0.4)
wh(12.7, 0.7, 0.35)
wh(13.8, 1.1, 0.3, f0=200, f1=2500)
for i in range(3):
    add(sfx, 13 + 2.4 + i * 0.25, pop(900 + i * 120, 0.08), pan=-0.5 + i * 0.2, gain=0.25)
add(sfx, 15.0, chime([74, 78, 81, 86, 90], 0.08, 0.4), gain=0.5, send=0.5)

# 4 · Summary: five callouts
wh(20.7, 0.7, 0.35)
wh(21.2, 1.0, 0.3, f0=200, f1=2500)
for i in range(5):
    at = 21 + 1.2 + i * 1.85
    wh(at - 0.05, 0.55, 0.16, f0=800, f1=5000)
    add(sfx, at + 0.05, pop(1100 + i * 90, 0.08), pan=0.6, gain=0.22, send=0.3)

# 5 · Board: a card is lifted and dropped, the task panel slides in, it saves
add(sfx, 31.0, impact(0.5), gain=0.4)
wh(30.7, 0.7, 0.35)
add(sfx, 32.0, pop(1100, 0.08), pan=0.6, gain=0.22)
add(sfx, 32.5, pop(700, 0.09), pan=0.2, gain=0.3)                  # lift
wh(32.6, 0.5, 0.14, f0=500, f1=2500)
add(sfx, 33.1, pop(260, 0.14), pan=0.4, gain=0.35)                 # drop
add(sfx, 34.8, whoosh(0.7, 400, 3200, 0.3), pan=0.6, gain=0.3)     # panel
add(sfx, 35.0, pop(1200, 0.08), pan=0.6, gain=0.22)
for k in range(3):                                                  # checks
    add(sfx, 36.0 + k * 0.22, tick(3400, 0.03), pan=0.6, gain=0.28)
add(sfx, 38.0, pop(1300, 0.08), pan=0.6, gain=0.22)
add(sfx, 38.4, chime([81, 86], 0.08, 0.4), pan=0.5, gain=0.4, send=0.4)   # saved

# 6 · Branches
wh(40.7, 0.7, 0.35)
for i in range(3):
    at = 41 + 1.0 + i * 2.2
    wh(at - 0.05, 0.55, 0.16, f0=800, f1=5000)
    add(sfx, at + 0.05, pop(1000 + i * 110, 0.08), pan=0.6, gain=0.22, send=0.3)
add(sfx, 46.7, power(True, 0.7), gain=0.25, send=0.3)              # created on GitHub
add(sfx, 47.3, chime([79, 86], 0.08, 0.4), pan=0.4, gain=0.35, send=0.4)

# 7 · Code: typing "board" after T, the clone menu
wh(48.2, 0.7, 0.35)
add(sfx, 49.3, pop(1100, 0.08), pan=0.6, gain=0.22)
add(sfx, 51.1, beep(1320, 0.06), gain=0.2)                         # T
for k in range(5):
    add(sfx, 51.3 + k * 0.09 + rng.uniform(0, 0.02), tick(2800 + rng.uniform(-400, 400), 0.02), pan=rng.uniform(-0.2, 0.4), gain=0.3)
add(sfx, 51.85, pop(1400, 0.07), pan=0.5, gain=0.22)
add(sfx, 52.9, pop(900, 0.09), pan=0.6, gain=0.28)                 # menu
add(sfx, 53.4, tick(4200, 0.02), pan=0.6, gain=0.25)

# 8 · Review: proposed, then committed to GitHub
wh(54.2, 0.7, 0.35)
add(sfx, 54.5, impact(0.4), gain=0.35)
add(sfx, 55.5, pop(1000, 0.08), pan=0.6, gain=0.22)
add(sfx, 56.0, crunch(), pan=-0.2, gain=0.2)
add(sfx, 57.9, pop(1100, 0.08), pan=0.6, gain=0.22)
add(sfx, 58.7, power(True, 0.6), gain=0.3, send=0.3)
add(sfx, 58.95, chime([81, 85, 88, 93], 0.06, 0.4), pan=0.5, gain=0.5, send=0.5)
add(sfx, 59.0, shimmer(0.8, 3000, 8), pan=0.5, gain=0.3, send=0.4)

# 9 · Feature cards
add(sfx, 60.5, impact(0.5), gain=0.4)
wh(60.2, 0.7, 0.35)
SCALE = [62, 64, 66, 69, 71, 74, 76, 78]
for i in range(8):
    col = i % 4
    add(sfx, 61.8 + i * 0.32 + 0.1, pop(mtof(SCALE[i]) * 0.5, 0.1), pan=(col - 1.5) * 0.35, gain=0.28)
    add(sfx, 61.8 + i * 0.32 + 0.1, bell(mtof(SCALE[i] + 12), 0.4, index=0.8, ratio=2, decay=9), pan=(col - 1.5) * 0.35, gain=0.08)
add(sfx, 65.4, shimmer(1.6, 2500), gain=0.45, send=0.5)

# 10 · Your data
wh(68.2, 0.7, 0.35)
add(sfx, 68.9, impact(0.35), gain=0.3)
for i in range(3):
    add(sfx, 68.5 + 1.5 + i * 0.25, pop(900 + i * 140, 0.08), pan=(i - 1) * 0.5, gain=0.25)
add(sfx, 70.0, riser(2.0, 250, 9000), gain=0.45)
add(sfx, 70.8, reverse_swell(1.2), gain=0.25)

# 11 · Outro
add(sfx, 72.0, impact(1.2), gain=0.9, send=0.5)
crash_t = tt(3.5)
add(sfx, 72.0, filt(rng.standard_normal((len(crash_t), 2)), 'high', 4000) * np.exp(-crash_t * 1.6)[:, None], gain=0.12, send=0.4)
wh(72.05, 1.0, 0.25, f0=300, f1=3500)
add(sfx, 72.9, pop(900, 0.1), gain=0.25)
add(sfx, 73.4, pop(1100, 0.08), gain=0.2)
add(sfx, 73.65, pop(1300, 0.08), gain=0.18)
add(sfx, 73.4, shimmer(1.2, 3000, 10), gain=0.35, send=0.5)

# ---------------------------------------------------------------- mix

t_all = np.arange(N) / SR


def music_cutoff(s):
    if s < 6:
        return 350 * (40 ** (s / 6))          # intro opens up
    return 19000


music *= duck[:, None]
music = sweep_filter(music, 'low', music_cutoff, chunk=512)


def reverb(x, secs=2.4, wet=0.35):
    n = int(secs * SR)
    t = np.arange(n) / SR
    ir = rng.standard_normal((n, 2)) * np.exp(-t * 6.9 / secs)[:, None]
    ir = filt(ir, 'low', 6000)
    ir[: int(0.012 * SR)] = 0
    ir /= np.sqrt((ir ** 2).sum(0))
    y = np.stack([fftconvolve(x[:, c], ir[:, c])[: len(x)] for c in range(2)], 1)
    return y * wet


verb = reverb(verb_send + music * 0.25, 2.6, 0.5)
mix = music * 0.85 + sfx * 1.0 + verb
mix = filt(mix, 'high', 28, 2)
mix = mix + 0.35 * filt(mix, 'high', 2500, 1)

# Fade in/out
fade_in = np.minimum(1, t_all / 0.05)
fade_out = np.clip((DUR - t_all) / 3.0, 0, 1) ** 1.5
mix *= (fade_in * fade_out)[:, None]

# Soft limiter
peak = np.max(np.abs(mix))
mix = np.tanh(mix / peak * 1.4) / np.tanh(1.4) * 0.92
wavfile.write(sys.argv[1] if len(sys.argv) > 1 else 'soundtrack.wav', SR, (mix * 32767).astype(np.int16))
print('ok', DUR, 'peak', peak)
