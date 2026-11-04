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
parts = [box("busbody", (3.1, 9.5, 3.3), (-3.6, 18, 1.95), mat("bus", (0.95, 0.65, 0.12), rough=0.4, spec=0.7)), box("busglass", (3.12, 8, 1.1), (-3.6, 18, 2.4), emission("busglass", (1.0, 0.9, 0.6), 4)),
         box("lampL", (0.5, 0.1, 0.4), (-4.6, 22.9, 1.0), emission("hl", (1, 0.95, 0.8), 80)), box("lampR", (0.5, 0.1, 0.4), (-2.6, 22.9, 1.0), emission("hl2", (1, 0.95, 0.8), 80))]
for o in parts: o.parent = busgrp
busgrp.location = (0, 0, 0); busgrp.keyframe_insert('location', frame=1); busgrp.location = (0, 26, 0); busgrp.keyframe_insert('location', frame=A['frames'])
tail = emission("tail", (1.0, 0.1, 0.05), 40)
for i, (x, y) in enumerate(((4.0, 40), (3.4, 70), (-4.5, 95), (4.2, 120), (-3.8, 150))):
    box("car", (1.8, 4.3, 1.4), (x, y, 0.8), mat("car%d" % i, [(0.7, 0.1, 0.1), (0.1, 0.2, 0.5), (0.8, 0.8, 0.8)][i % 3], rough=0.35, spec=0.8)); box("tail", (1.4, 0.08, 0.25), (x, y - 2.17, 0.9), tail)
dust(160, ((-12, 12), (0, 120), (0.5, 12)), (1.0, 0.75, 0.5), 6, 0.04)
camera(sc, (1.2, -22, 2.3), (1.0, -13, 2.4), (0.4, 60, 4.2), (0.2, 60, 4.5), lens=30, fstop=2.0, focus=45, frames=A['frames'])
render(sc, A['out'], A['only_frame'])
