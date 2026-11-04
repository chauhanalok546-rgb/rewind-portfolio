import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
A = args(); sc = setup(A['scale'], A['frames']); random.seed(19)
world_flat(sc, (0.012, 0.02, 0.045), 1.0)
CY = (0.0, 0.72, 1.0); AM = (1.0, 0.69, 0.13)
floor = mat("floor", (0.02, 0.03, 0.06), rough=0.1, metal=0.9, spec=1.0, coat=0.6)
box("floor", (200, 200, 0.2), (0, 40, -0.1), floor)
grid = emission("grid", CY, 2.2)
for i in range(-20, 21): box("gx", (0.04, 160, 0.02), (i * 3.0, 40, 0.02), grid); box("gy", (130, 0.04, 0.02), (0, i * 4.0 + 40, 0.02), grid)
code = ["def solve(n):", "    if n < 2:", "        return n", "    a, b = 0, 1", "    for _ in range(n):", "        a, b = b, a + b", "    return a", "", "# ship it", "print(solve(30))"]
code2 = ["git commit -m 'bug slayer'", "docker run sandbox", "gemma.diagnose(err)", "patch(line_12)", "tests passed: 42", "deploy --prod", "", "> alok.os v18 ready"]
def panel(x, y, z, w, h, ry, lines, color, size=0.34):
    pm = mat("panel", (0.01, 0.03, 0.06), rough=0.2, alpha=0.55); p = box("panel", (w, 0.08, h), (x, y, z), pm); p.rotation_euler[2] = math.radians(ry)
    bpy.ops.object.text_add(location=(0, 0, 0)); t = bpy.context.object; t.data.body = "\n".join(lines); t.data.size = size; t.data.space_line = 1.1; t.data.extrude = 0.01
    t.data.align_x = 'LEFT'; t.data.materials.append(emission("txt", color, 6)); t.rotation_euler = (math.pi / 2, 0, math.radians(ry)); 
    off = Vector((-w / 2 + 0.5, -0.1, h / 2 - 0.8)); rot = __import__('mathutils').Matrix.Rotation(math.radians(ry), 3, 'Z'); t.location = Vector((x, y, z)) + rot @ off
    bar = box("bar", (w, 0.05, 0.12), (x, y - 0.05, z + h / 2), emission("bar", color, 5)); bar.rotation_euler[2] = math.radians(ry)
panel(-9, 22, 5.0, 8.5, 5.0, 14, code, CY); panel(0.5, 32, 6.2, 9.5, 5.5, 0, code2, AM, 0.38); panel(10, 24, 4.6, 8.0, 4.8, -16, code, CY, 0.32)
panel(-17, 38, 7.0, 8.0, 4.6, 30, code2, CY, 0.3); panel(18, 40, 7.5, 8.5, 5.0, -28, code, AM, 0.32)
# the Chrono core and floating cubes
core = sphere("core", 1.5, (0, 16, 4.2), emission("core", AM, 7), 40)
for i, (r, rx, ry) in enumerate(((2.6, 0.3, 0), (3.4, 1.2, 0.5), (4.2, 0.8, 1.6))):
    bpy.ops.mesh.primitive_torus_add(major_radius=r, minor_radius=0.045, location=(0, 16, 4.2), rotation=(rx, ry, 0)); t = bpy.context.object; t.data.materials.append(emission("ring", CY if i % 2 == 0 else AM, 9))
    t.rotation_euler = (rx, ry, 0); t.keyframe_insert('rotation_euler', frame=1); t.rotation_euler = (rx + 1.2, ry + 0.8 * (1 if i % 2 else -1), 1.0); t.keyframe_insert('rotation_euler', frame=A['frames'])
point("corelight", (0, 16, 4.2), 9000, (1.0, 0.65, 0.2), 1.0)
cubem = mat("cube", (0.05, 0.1, 0.18), rough=0.15, metal=0.9, spec=1.0)
for i in range(26):
    s = random.uniform(0.3, 1.1); o = box("fc", (s, s, s), (random.uniform(-22, 22), random.uniform(10, 50), random.uniform(1.5, 12)), cubem); o.rotation_euler = (random.random() * 3, random.random() * 3, random.random() * 3)
    o.keyframe_insert('rotation_euler', frame=1); o.rotation_euler = (o.rotation_euler[0] + 0.7, o.rotation_euler[1] + 0.9, o.rotation_euler[2]); o.keyframe_insert('rotation_euler', frame=A['frames'])
    if i % 3 == 0: box("edge", (s * 1.02, s * 1.02, s * 0.04), o.location, emission("edge", CY, 5)).rotation_euler = o.rotation_euler
area("cyanA", (-14, 12, 9), (60, 0, 40), 12, 9000, CY, sy=8); area("amberA", (14, 12, 9), (60, 0, -40), 12, 9000, AM, sy=8)
dust(150, ((-20, 20), (6, 48), (0.5, 14)), CY, 6, 0.03)
shaft("beam1", (0, 16, 14), (0, 16, 0.2), 1.2, 6.0, CY, 0.9)
camera(sc, (-6, -2, 3.0), (5, 2, 3.4), (0, 22, 4.4), (0, 24, 4.6), lens=28, fstop=2.0, focus=None, frames=A['frames'])
render(sc, A['out'], A['only_frame'])
