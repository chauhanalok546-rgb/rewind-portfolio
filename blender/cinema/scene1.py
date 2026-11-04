import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
A = args(); sc = setup(A['scale'], A['frames'])
world_sky(sc, elevation=9, rotation=205, density=0.0, dust=2.2, strength=0.55)
HAZE = (0.62, 0.70, 0.84)
sun(2.6, (1.0, 0.72, 0.48), (79, 0, 205), angle=0.7)                       # low golden sun from behind the peaks on the right
random.seed(4)
# --- terrain: a river valley with high peaks in the distance
xs = np.linspace(-110, 110, 420); ys = np.linspace(-45, 150, 360); X, Y = np.meshgrid(xs, ys)
river_x = 6 * np.sin(Y * 0.045) + 2 * np.sin(Y * 0.11)
dist_r = np.abs(X - river_x)
valley = sstep(8, 55, np.abs(X - river_x * 0.2))
mount = ridged(X * 0.018 + 5, Y * 0.018, 6, 3) * 58 * sstep(35, 120, Y) + ridged(X * 0.03, Y * 0.03 + 9, 5, 7) * 26 * valley * sstep(10, 90, Y) + ridged(X * 0.02 + 3, Y * 0.02, 5, 11) * 55 * sstep(20, 70, np.abs(X)) * sstep(0, 80, Y)
hills = fbm(X * 0.05, Y * 0.05, 5, 21) * 6 * sstep(0, 40, Y) + fbm(X * 0.2, Y * 0.2, 3, 5) * 0.5
Z = mount + hills * valley * 0.9 + hills * 0.3 - 3.2 * np.exp(-(dist_r / 3.2) ** 2) + 0.0
grad = np.hypot(*np.gradient(Z, xs[1] - xs[0], ys[1] - ys[0])); h = Z
col = np.zeros(Z.shape + (3,), dtype=np.float32)
grass = np.array([0.075, 0.17, 0.045]); dry = np.array([0.22, 0.2, 0.1]); rock = np.array([0.10, 0.10, 0.12]); snow = np.array([0.93, 0.95, 1.0]); sand = np.array([0.35, 0.3, 0.22])
n = fbm(X * 0.4, Y * 0.4, 3, 9)[..., None]
base = grass * (0.8 + 0.5 * n) + dry * (n - 0.45).clip(0)[..., :]
rockw = sstep(0.4, 0.9, grad)[..., None]; snoww = (sstep(40, 54, h + fbm(X * 0.1, Y * 0.1, 3, 2) * 9) * (1 - sstep(0.7, 1.4, grad) * 0.5))[..., None]
col = base * (1 - rockw) + rock * rockw
col = col * (1 - snoww) + snow * snoww
col = col * (1 - np.exp(-(dist_r / 3.0) ** 2)[..., None] * 0.7) + sand * (np.exp(-(dist_r / 3.0) ** 2)[..., None] * 0.7)
tm = vertex_color_material("terrain_m", 0.95, 0.1); depth_haze(tm, HAZE, 55, 300, 0.25)
terr = grid_mesh("terrain", xs, ys, Z, col.reshape(-1, 3), tm)
# --- river
wm = mat("water", (0.04, 0.09, 0.12), rough=0.04, metal=0.0, spec=0.9, alpha=0.82)
rx = river_x[:, 0]; rv = []; rf = []
for i, y in enumerate(ys):
    rv += [(river_x[i, 0] - 4.2, y, -0.55), (river_x[i, 0] + 4.2, y, -0.55)]
    if i: rf.append((2 * i - 2, 2 * i - 1, 2 * i + 1, 2 * i))
obj_from("river", rv, rf, wm)
# --- pines (instanced)
bm = bmesh.new()
for k, (r, hgt, z0) in enumerate(((1.7, 2.8, 1.2), (1.3, 2.5, 2.6), (0.9, 2.2, 3.9))):
    bmesh.ops.create_cone(bm, cap_ends=True, segments=9, radius1=r, radius2=0.0, depth=hgt, matrix=__import__('mathutils').Matrix.Translation((0, 0, z0 + hgt / 2)))
bmesh.ops.create_cone(bm, cap_ends=True, segments=7, radius1=0.22, radius2=0.2, depth=1.3, matrix=__import__('mathutils').Matrix.Translation((0, 0, 0.65)))
pm = bpy.data.meshes.new("pine"); bm.to_mesh(pm); bm.free()
for p in pm.polygons: p.use_smooth = True
pmat = mat("pine_m", (0.045, 0.12, 0.05), rough=0.85, objcolor=True); depth_haze(pmat, HAZE, 40, 300, 0.25); pm.materials.append(pmat)
def height_at(x, y):
    xi = int(np.clip((x - xs[0]) / (xs[1] - xs[0]), 0, len(xs) - 1)); yi = int(np.clip((y - ys[0]) / (ys[1] - ys[0]), 0, len(ys) - 1)); return Z[yi, xi], grad[yi, xi]
placed = 0
for _ in range(5200):
    x = random.uniform(-100, 100); y = random.uniform(-30, 120)
    z, g = height_at(x, y); rd = abs(x - (6 * math.sin(y * 0.045) + 2 * math.sin(y * 0.11)))
    if z < -0.2 or z > 17 or g > 0.55 or rd < 7.5: continue
    if y < 14 and abs(x) < 22: continue
    if random.random() > 0.65 + 0.3 * (1 - min(abs(x) / 100, 1)): continue
    o = bpy.data.objects.new("pine", pm); link(o); s = random.uniform(0.45, 1.1) * (1 + 0.012 * max(y - 20, 0) * 0.25)
    o.location = (x, y, z - 0.2); o.scale = (s, s, s * random.uniform(0.9, 1.4)); o.rotation_euler[2] = random.uniform(0, 6.28)
    t = random.uniform(0.7, 1.15); o.color = (t, t * random.uniform(0.95, 1.1), t * 0.9, 1); placed += 1
print("pines", placed)
# --- a wooden house with a warm window
hx, hy = 14, 22; hz, _ = height_at(hx, hy)
wood = mat("wood", (0.12, 0.065, 0.035), rough=0.8); roof = mat("roof", (0.05, 0.045, 0.045), rough=0.7); warm = emission("window", (1.0, 0.62, 0.25), 18)
box("house", (6, 4.5, 3.2), (hx, hy, hz + 1.6), wood)
bm2 = bmesh.new(); bmesh.ops.create_cone(bm2, cap_ends=True, segments=4, radius1=4.9, radius2=0.2, depth=2.4, matrix=__import__('mathutils').Matrix.Rotation(math.radians(45), 4, 'Z') @ __import__('mathutils').Matrix.Translation((0, 0, 0)))
rm = bpy.data.meshes.new("roof"); bm2.to_mesh(rm); bm2.free(); rm.materials.append(roof); ro = bpy.data.objects.new("roof", rm); link(ro); ro.location = (hx, hy, hz + 4.3); ro.scale = (1.05, 0.8, 1)
box("window", (1.2, 0.08, 1.0), (hx - 1.2, hy - 2.28, hz + 1.8), warm); box("window2", (1.2, 0.08, 1.0), (hx + 1.2, hy - 2.28, hz + 1.8), warm)
point("window_light", (hx, hy - 4, hz + 2), 900, (1.0, 0.6, 0.3), 1.5)
# --- haze bands in the valley
cam = camera(sc, (-4, -36, 4.2), (1, -31, 4.6), (2, 40, 13), (6, 40, 14), lens=30, fstop=2.0, focus=60, frames=A['frames'])
render(sc, A['out'], A['only_frame'])
