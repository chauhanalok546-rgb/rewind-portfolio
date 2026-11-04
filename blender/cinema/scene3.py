import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
A = args(); sc = setup(A['scale'], A['frames']); random.seed(14)
world_sky(sc, elevation=1.5, rotation=185, density=0.0, strength=0.35, dust=3.0)
sun(0.9, (1.0, 0.5, 0.28), (88, 0, 185), angle=1.5)
HAZE = (0.55, 0.42, 0.55)
road = mat("road", (0.035, 0.035, 0.04), rough=0.16, spec=0.9, coat=0.4); walk = mat("walk", (0.14, 0.13, 0.13), rough=0.7)
rm = box("road", (16, 340, 0.2), (0, 110, -0.1), road); depth_haze(road, HAZE, 40, 300, 0.15)
box("walkL", (6, 340, 0.35), (-11, 110, 0.0), walk); box("walkR", (6, 340, 0.35), (11, 110, 0.0), walk)
for i in range(30): box("line", (0.25, 3, 0.02), (0, -10 + i * 8, 0.11), emission("line", (1, 0.85, 0.5), 3.5))
# the hills of Dehradun in the distance
xs = np.linspace(-260, 260, 200); ys = np.linspace(230, 420, 60); X, Y = np.meshgrid(xs, ys)
Z = ridged(X * 0.012, Y * 0.012, 5, 5) * 95 * sstep(230, 300, Y) + 8
hm = mat("hills", (0.05, 0.05, 0.10), rough=1.0); depth_haze(hm, HAZE, 230, 420, 0.5); grid_mesh("hills", xs, ys, Z, None, hm)
# buildings with lit windows
wm_on = emission("win_on", (1.0, 0.68, 0.3), 14); wm_cool = emission("win_cool", (0.6, 0.8, 1.0), 10); wm_off = mat("win_off", (0.02, 0.025, 0.035), rough=0.2)
plane_me = []
for k, m in enumerate((wm_on, wm_cool, wm_off)):
    me = bpy.data.meshes.new("w%d" % k); me.from_pydata([(-0.5, 0, -0.6), (0.5, 0, -0.6), (0.5, 0, 0.6), (-0.5, 0, 0.6)], [], [(0, 1, 2, 3)]); me.materials.append(m); plane_me.append(me)
paints = [mat("b%d" % i, c, rough=0.8) for i, c in enumerate(((0.32, 0.25, 0.22), (0.36, 0.32, 0.28), (0.22, 0.22, 0.26), (0.40, 0.28, 0.24), (0.27, 0.30, 0.34)))]
for p in paints: depth_haze(p, HAZE, 30, 280, 0.2)
for side in (-1, 1):
    y = -18
    while y < 250:
        d = random.uniform(9, 16); hgt = random.uniform(10, 34); w = random.uniform(11, 20); x = side * (14 + w / 2 + random.uniform(0, 3))
        b = box("bld", (w, d, hgt), (x, y + d / 2, hgt / 2), random.choice(paints))
        fx = x - side * w / 2 - side * 0.02                                         # the facade that faces the road
        for r in range(int(hgt // 3.2)):
            for c in range(int(d // 3.0)):
                me = plane_me[0] if random.random() < 0.42 else (plane_me[1] if random.random() < 0.15 else plane_me[2])
                o = bpy.data.objects.new("win", me); link(o); o.location = (fx, y + 1.8 + c * 3.0, 2.6 + r * 3.2); o.rotation_euler[2] = math.radians(90 if side == 1 else -90); o.scale = (1.5, 1, 1.2)
                o.rotation_euler[2] = math.radians(-90 if side == 1 else 90)
        y += d + random.uniform(0.3, 1.5)
# street lamps
lampm = emission("lamp", (1.0, 0.72, 0.38), 40); pole = mat("pole", (0.06, 0.06, 0.07), rough=0.5, metal=0.8)
for i in range(14):
    for side in (-1, 1):
        y = 4 + i * 16; cyl("pole", 0.12, 7, (side * 9, y, 3.5), pole, 8); sphere("lamp", 0.45, (side * 9 - side * 0.8, y, 7.1), lampm, 12)
        if i < 7: point("lamp%d" % i, (side * 8.2, y, 6.9), 2600, (1.0, 0.68, 0.35), 0.4)
# a bus and cars on the road
busgrp = bpy.data.objects.new("busgrp", None); link(busgrp)
busp = mat("bus", (0.4, 0.015, 0.01), rough=0.5, spec=0.3); busdark = mat("busdark", (0.03, 0.05, 0.08), rough=0.05, spec=1.0)
parts = [box("busbody", (3.1, 9.5, 2.2), (-3.6, 18, 1.55), busp), box("busroof", (3.0, 9.3, 0.9), (-3.6, 18, 3.1), busp),
         box("busglass1", (3.14, 8.6, 0.85), (-3.6, 18, 2.15), busdark), box("busglass2", (3.14, 0.1, 1.5), (-3.6, 22.8, 2.4), busdark), box("busband", (3.14, 9.4, 0.18), (-3.6, 18, 1.1), mat("busband", (0.95, 0.9, 0.85), rough=0.4)),
         box("lampL", (0.5, 0.1, 0.3), (-4.4, 22.78, 0.9), emission("hl", (1, 0.95, 0.8), 30)), box("lampR", (0.5, 0.1, 0.3), (-2.8, 22.78, 0.9), emission("hl2", (1, 0.95, 0.8), 30)),
         box("btl1", (0.4, 0.1, 0.2), (-4.4, 13.25, 0.9), emission("btl", (1, 0.1, 0.05), 10)), box("btl2", (0.4, 0.1, 0.2), (-2.8, 13.25, 0.9), emission("btl", (1, 0.1, 0.05), 10))]
tyre0 = mat("tyre0", (0.02, 0.02, 0.025), rough=0.8)
for sx in (-1, 1):
    for fy in (-3.0, 3.2): parts.append(cyl("bw", 0.55, 0.35, (-3.6 + sx * 1.55, 18 + fy, 0.55), tyre0, 20, (0, 1.5708, 0)))
for o in parts: o.parent = busgrp
busgrp.location = (0, 0, 0); busgrp.keyframe_insert('location', frame=1); busgrp.location = (0, 26, 0); busgrp.keyframe_insert('location', frame=A['frames'])
tail = emission("tail", (1.0, 0.08, 0.04), 9)
tyre = mat("tyre", (0.02, 0.02, 0.025), rough=0.8); glassm = mat("cglass", (0.05, 0.08, 0.12), rough=0.05, spec=1.0, metal=0.2)
def car(x, y, col, i, scale=1.0, kind=0):
    g = bpy.data.objects.new("carg%d" % i, None); link(g)
    paint = mat("car%d" % i, tuple(c * 0.45 for c in col), rough=0.5, spec=0.3)
    L, W = (4.4, 1.85) if kind == 0 else (4.9, 2.0)
    P = [box("lower", (W, L, 0.75), (0, 0, 0.72), paint),
         box("hood", (W - 0.1, L * 0.3, 0.12), (0, L * 0.34, 1.12), paint),
         box("trunk", (W - 0.1, L * 0.22, 0.12), (0, -L * 0.38, 1.12), paint),
         box("cabin", (W - 0.25, L * 0.42, 0.62), (0, -L * 0.04, 1.35), glassm),
         box("roof", (W - 0.3, L * 0.34, 0.07), (0, -L * 0.04, 1.69), paint),
         box("hl1", (0.42, 0.08, 0.2), (-W * 0.34, L / 2, 0.85), emission("chl", (1, 0.95, 0.8), 25)), box("hl2", (0.42, 0.08, 0.2), (W * 0.34, L / 2, 0.85), emission("chl2", (1, 0.95, 0.8), 25)),
         box("tl1", (0.5, 0.08, 0.16), (-W * 0.34, -L / 2, 0.9), tail), box("tl2", (0.5, 0.08, 0.16), (W * 0.34, -L / 2, 0.9), tail),
         box("bump", (W + 0.02, 0.1, 0.18), (0, L / 2, 0.45), tyre), box("bump2", (W + 0.02, 0.1, 0.18), (0, -L / 2, 0.45), tyre)]
    for sx in (-1, 1):
        for fy in (-0.32, 0.32): P.append(cyl("wheel", 0.36, 0.24, (sx * (W / 2 - 0.05), fy * L, 0.36), tyre, 20, (0, 1.5708, 0)))
    for o in P: o.parent = g
    g.location = (x, y, 0); g.scale = (scale, scale, scale)
    return g
cols = [(0.8, 0.02, 0.02), (0.02, 0.1, 0.6), (0.9, 0.9, 0.92), (0.95, 0.65, 0.0), (0.03, 0.03, 0.04), (0.0, 0.45, 0.12)]
for i, (x, y) in enumerate(((4.0, 40), (3.4, 70), (-4.5, 95), (4.2, 120), (-3.8, 150), (-4.2, 55), (4.3, 20), (-4.0, 135), (3.6, 100), (4.0, 170))):
    car(x, y, cols[i % len(cols)], i, 1.0, i % 2)
# parked cars along the kerbs
for i, (x, y) in enumerate(((-7.2, 8), (-7.2, 30), (7.4, 14), (7.4, 48), (-7.2, 66), (7.4, 84))):
    car(x, y, cols[(i + 2) % len(cols)], 20 + i, 1.0, (i + 1) % 2)
dust(160, ((-12, 12), (0, 120), (0.5, 12)), (1.0, 0.75, 0.5), 6, 0.04)
camera(sc, (1.2, -22, 2.3), (1.0, -13, 2.4), (0.4, 60, 4.2), (0.2, 60, 4.5), lens=30, fstop=2.0, focus=45, frames=A['frames'])
render(sc, A['out'], A['only_frame'])
