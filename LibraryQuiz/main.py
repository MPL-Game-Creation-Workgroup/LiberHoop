# 3‑D video example: https://www.splats.tv/watch/514
# Tested with spatialstudio 1.1.0.41
# pip install spatialstudio librosa noise tqdm
from spatialstudio import splv
import numpy as np
import librosa
import math
import copy
import multiprocessing as mp
import hashlib
from tqdm import tqdm
from noise import pnoise2

# ────────────────────────── Utility ────────────────────────── #

def interpolate_color(colors, t):
    t %= 1.0
    n        = len(colors)
    t_scaled = t * n
    idx      = int(t_scaled) % n
    t_local  = t_scaled - idx
    c1, c2   = colors[idx], colors[(idx + 1) % n]
    r = int((1 - t_local) * c1[0] + t_local * c2[0])
    g = int((1 - t_local) * c1[1] + t_local * c2[1])
    b = int((1 - t_local) * c1[2] + t_local * c2[2])
    return r, g, b

def sdf_triangle(p, a, b, c):
    ba, pa = b - a, p - a
    cb, pb = c - b, p - b
    ac, pc = a - c, p - c
    nor    = np.cross(ba, ac)

    def dot2(v): return np.sum(v * v, axis=-1)

    sign   = (np.sign(np.sum(np.cross(ba, nor)[None] * pa, 1)) +
              np.sign(np.sum(np.cross(cb, nor)[None] * pb, 1)) +
              np.sign(np.sum(np.cross(ac, nor)[None] * pc, 1)))
    outside     = sign < 2
    ba_proj     = np.clip(np.dot(pa, ba) / np.sum(ba*ba), 0.0, 1.0)
    cb_proj     = np.clip(np.dot(pb, cb) / np.sum(cb*cb), 0.0, 1.0)
    ac_proj     = np.clip(np.dot(pc, ac) / np.sum(ac*ac), 0.0, 1.0)
    d0          = dot2(ba[None] * ba_proj[:, None] - pa)
    d1          = dot2(cb[None] * cb_proj[:, None] - pb)
    d2          = dot2(ac[None] * ac_proj[:, None] - pc)
    dist_edge   = np.minimum(np.minimum(d0, d1), d2)
    d_face      = (np.dot(pa, nor) ** 2) / np.sum(nor*nor)
    return np.sqrt(np.where(outside, dist_edge, d_face))

def rasterize_triangle(density, a, b, c, spacing, z_off):
    min_c = np.floor(np.min([a, b, c], 0)).astype(int)
    max_c = np.ceil (np.max([a, b, c], 0)).astype(int)
    xs, ys, zs = [np.arange(lo, hi + 1) for lo, hi in zip(min_c, max_c)]
    grid   = np.stack(np.meshgrid(xs + .5, ys + .5, zs + .5, indexing='ij'), -1)
    points = grid.reshape(-1, 3)
    mask   = sdf_triangle(points, a, b, c) < .5
    voxels = points[mask] - .5
    voxels[:, 2] -= z_off
    voxels        = np.round(voxels).astype(int)

    w, h, d = density
    x, y, z = voxels.T
    in_bounds = ((0 <= x) & (x < w) &
                 (0 <= y) & (y < h) &
                 (0 <= z) & (z < d))
    return voxels[in_bounds]

# ────────────────────────── Audio ────────────────────────── #

class AudioProcessor:
    def __init__(self, path, bands, sr=44_100, hop=512, thresh=0.5):
        self.sr, self.hop = sr, hop
        self.raw, _       = librosa.load(path, sr=sr)
        self.frames       = 1 + len(self.raw)//hop
        mag               = np.abs(librosa.stft(self.raw, hop_length=hop))
        basis             = librosa.filters.mel(sr=sr, n_fft=mag.shape[0]*2-2,
                                               n_mels=bands, fmin=50.0, fmax=20_000.0)
        db                = librosa.power_to_db(basis @ mag, ref=np.max)
        self.spec         = (db - db.min()) / (db.max()-db.min())
        self.thresh       = thresh

    def band_frame(self, idx):
        f = self.spec[:, idx]
        return np.where(f > self.thresh, (f - self.thresh) / (1 - self.thresh), 0)

    def pcm_frame(self, start, n):
        buf = np.clip(self.raw[start:start+n], -1, 1)
        pcm = (buf * 32_767).astype(np.int16)
        return pcm.tobytes()

# ────────────────────────── Visualiser ────────────────────────── #

class Visualizer:
    def __init__(self, octaves=4, scroll=0.25, decay=0.999):
        self.z_off = 0.0
        self.sun_off = 0.0
        self.octaves = octaves
        self.weights = np.zeros(octaves)
        self.scroll  = scroll
        self.decay   = decay

    # 3‑D "vaporwave" sun (flattened disc to save voxels)
    def create_sun(self, n):
        sun = splv.Frame(n, n, n)
        max_strip, min_strip = n//16, n//32
        flatten_factor = 0.4  # Make it more disc-like
        for x in range(n):
            for y in range(n):
                for z in range(n):
                    dx, dy, dz = x + .5 - n/2, y + .5 - n/2, z + .5 - n/2
                    # Flatten the sun by scaling the z dimension
                    distance = math.sqrt(dx*dx + dy*dy + (dz*flatten_factor)*(dz*flatten_factor))
                    if distance <= n/2:
                        y_norm = y / n
                        stripes = int(min_strip + y_norm*(max_strip-min_strip))
                        if (y // stripes) % 2 == 0:
                            sun.set_voxel(x, y, z,
                                interpolate_color([(255,94,0),(255,42,100),(180,0,255)], y_norm))
        return sun

    def update(self, dt, new_w):
        self.weights -= self.weights * (1 - self.decay**(1_000*dt))
        # More dramatic response by scaling the new weights
        enhanced_weights = new_w * 1.5  # Amplify the audio response
        self.weights = np.maximum(self.weights, enhanced_weights)
        # More dramatic scrolling based on audio intensity
        scroll_intensity = np.mean(new_w) * 2.0  # Double the scroll response
        self.z_off  += scroll_intensity * dt * self.scroll
        self.sun_off -= dt * 30

    def copy(self):
        c = copy.deepcopy(self)
        return c

    # height‑field → voxel indices
    def render(self, dims):
        w, h, d = dims
        spacing = int(min(w, d)/15)  # Increased spacing to reduce peaks
        noise_s = spacing * 0.7  # Reduce noise scale for smoother terrain
        v_size  = 1/np.array(dims)
        z_base  = self.z_off * d
        min_z   = (math.floor(z_base/spacing))*spacing
        max_z   = (math.ceil((z_base+d)/spacing))*spacing
        vox     = []

        def height(x, z):
            xn, zn = x/w, z/d
            n = 0
            for i in range(self.octaves):
                rand = int(hashlib.md5(f'{x}_{z}_{i}'.encode()).hexdigest()[:2],16)
                disable = rand < 160  # Slightly more peaks enabled
                scale = noise_s**(i+1)
                octave = abs(pnoise2(xn*scale, zn*scale, base=i))
                # More dramatic music response with higher weight multipliers
                weight_multiplier = 2.0 if disable else (3.0 * self.weights[i])
                n += octave * weight_multiplier * (0.3**i)  # Changed from 0.25 to 0.3 for more prominence
            return max(h * n * (math.cos(xn*2*math.pi)*.5 + .5), v_size[1]/2)

        for x in range(0, w, spacing):
            for z in range(min_z, max_z, spacing):
                p0 = np.array([x,               height(x,               z              ), z              ])
                p1 = np.array([x+spacing,       height(x+spacing,       z              ), z              ])
                p2 = np.array([x,               height(x,               z+spacing      ), z+spacing      ])
                p3 = np.array([x+spacing,       height(x+spacing,       z+spacing      ), z+spacing      ])
                vox += [
                    rasterize_triangle(dims, p0, p1, p3, spacing, z_base),
                    rasterize_triangle(dims, p0, p3, p2, spacing, z_base)
                ]
        return dims, np.concatenate(vox), spacing, z_base

    def present(self, render_out, sun_n, sun):
        dims, vox, spacing, z_base = render_out
        frame = splv.Frame(*dims)
        for x, y, z in vox:
            if int(z + z_base) % spacing == 0 or x % spacing == 0:
                col = interpolate_color(
                    [(25,214,252),(255,20,147),(232,103,23),(232,224,16)],
                    y/dims[1])
            else:
                col = (0,0,0)
            frame.set_voxel(x, y, z, col)

        # sun
        cx = dims[0]//2
        cy = int(dims[1]*0.5 + self.sun_off/dims[1])
        cz = int(dims[2]*0.9)
        frame.add(sun,
                  cx - sun_n//2,
                  cy - sun_n//2,
                  cz - sun_n//2)
        return frame

# ────────────────────────── Driver helpers ────────────────────────── #

def _render_job(args):
    vis, n = args
    return vis.render((n, n, n*2))

# ────────────────────────── Main ────────────────────────── #

def main():
    audio_path   = "resonance.mp3"  # your audio here
    density      = 128
    fps          = 30.0
    octaves      = 4
    sun_n        = 64

    vis   = Visualizer(octaves)
    audio = AudioProcessor(audio_path, octaves)
    sun   = vis.create_sun(sun_n)

    encoder = splv.Encoder(
        width=density, height=density, depth=density*2,
        framerate=fps,
        audioParams=(1, audio.sr, 2),
        gopSize=30, motionVectors="fast",
        vqRangeCutoff=0.05, 
        outputPath="./outputs/test.splv"
    )

    afps       = audio.sr / audio.hop        # audio frames per second
    ratio      = afps / fps                  # audio‑to‑video frame ratio
    smp_per_vf = int(audio.sr / fps)
    total_vf   = min(int(audio.frames / ratio), 300)

    batch = mp.cpu_count()
    bar   = tqdm(total=total_vf, unit="frames")

    with mp.Pool(batch) as pool:
        for b0 in range(0, total_vf, batch):
            b1 = min(b0+batch, total_vf)
            states, pcm_bufs = [], []
            for i in range(b0, b1):
                aud_idx = int(i * ratio)
                vis.update(1/fps, audio.band_frame(aud_idx))
                states.append(vis.copy())

                s0 = int(i * smp_per_vf)
                pcm_bufs.append(audio.pcm_frame(s0, smp_per_vf))

            renders = pool.map(_render_job, [(s, density) for s in states])

            for state, ro, pcm in zip(states, renders, pcm_bufs):
                frame = state.present(ro, sun_n, sun)
                encoder.encode(frame)
                encoder.encode_audio(list(pcm))
            bar.update(b1 - b0)

    bar.close()
    encoder.finish()

if __name__ == "__main__":
    main()