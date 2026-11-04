import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
A = args(); sc = setup(A['scale'], A['frames']); random.seed(23)
world_flat(sc, (0.012, 0.018, 0.05), 1.0)
CY = (0.0, 0.72, 1.0); AM = (1.0, 0.69, 0.13); PU = (0.55, 0.25, 0.95)
# stars
sm = emission("star", (1.0, 0.97, 0.9), 22); bpy.ops.mesh.primitive_ico_sphere_add(radius=1, subdivisions=1, location=(0, 0, -900)); sbase = bpy.context.object; sbase.data.materials.append(sm)
for i in range(700):
    v = Vector((random.gauss(0, 1), random.uniform(0.15, 1.0), random.uniform(-0.25, 1.0))).normalized() * random.uniform(650, 900)
    o = bpy.data.objects.new("s", sbase.data); link(o); o.location = v; r = random.uniform(0.6, 2.2); o.scale = (r, r, r)
# nebula clouds: big planes with a noise-driven glow
def nebula(name, loc, size, color, rot):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    tc = nt.nodes.new('ShaderNodeTexCoord'); no = nt.nodes.new('ShaderNodeTexNoise'); no.inputs['Scale'].default_value = 2.2; no.inputs['Detail'].default_value = 8; no.inputs['Roughness'].default_value = 0.6
    ramp = nt.nodes.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].position = 0.42; ramp.color_ramp.elements[1].position = 0.85
    sub = nt.nodes.new('ShaderNodeVectorMath'); sub.operation = 'SUBTRACT'; sub.inputs[1].default_value = (0.5, 0.5, 0.0); nt.links.new(tc.outputs['UV'], sub.inputs[0])
    ln = nt.nodes.new('ShaderNodeVectorMath'); ln.operation = 'LENGTH'; nt.links.new(sub.outputs[0], ln.inputs[0])
    sc2 = nt.nodes.new('ShaderNodeMath'); sc2.operation = 'MULTIPLY'; sc2.inputs[1].default_value = 2.0; sc2.use_clamp = True; nt.links.new(ln.outputs['Value'], sc2.inputs[0])
    inv = nt.nodes.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1.0; inv.use_clamp = True; nt.links.new(sc2.outputs[0], inv.inputs[1])
    sq = nt.nodes.new('ShaderNodeMath'); sq.operation = 'POWER'; sq.inputs[1].default_value = 1.6; nt.links.new(inv.outputs[0], sq.inputs[0])
    nt.links.new(tc.outputs['Object'], no.inputs[0])
    mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; nt.links.new(ramp.outputs[0], mul.inputs[0]); nt.links.new(sq.outputs[0], mul.inputs[1]); nt.links.new(no.outputs[0], ramp.inputs[0])
    em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (*color, 1); em.inputs['Strength'].default_value = 2.4
    tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mx = nt.nodes.new('ShaderNodeMixShader'); nt.links.new(mul.outputs[0], mx.inputs[0]); nt.links.new(tr.outputs[0], mx.inputs[1]); nt.links.new(em.outputs[0], mx.inputs[2])
    out = nt.nodes.new('ShaderNodeOutputMaterial'); nt.links.new(mx.outputs[0], out.inputs['Surface'])
    try: m.surface_render_method = 'BLENDED'
    except Exception: pass
    bpy.ops.mesh.primitive_plane_add(size=size, location=loc, rotation=rot); p = bpy.context.object; p.data.materials.append(m); p.visible_shadow = False
nebula("neb1", (-160, 760, 130), 900, PU, (math.radians(90), 0, math.radians(15))); nebula("neb2", (120, 820, 20), 1000, (0.1, 0.5, 1.0), (math.radians(90), 0, math.radians(-25))); nebula("neb3", (-30, 850, 300), 800, (1.0, 0.45, 0.2), (math.radians(90), 0, 0))
# a big ringed planet
planet = sphere("planet", 90, (230, 640, 150), mat("planet", (0.35, 0.18, 0.6), rough=0.6, emit=(0.15, 0.06, 0.3), emit_strength=0.6), 64)
bpy.ops.mesh.primitive_torus_add(major_radius=160, minor_radius=5, location=(230, 640, 150), rotation=(math.radians(72), math.radians(8), 0)); rg = bpy.context.object; rg.scale = (1, 1, 0.05); rg.data.materials.append(emission("ring", (0.9, 0.7, 0.5), 1.4))
sun(2.2, (1.0, 0.85, 0.7), (60, 0, -40), angle=1.5)
# floating islands
rock = mat("rock", (0.12, 0.11, 0.14), rough=0.9); grass = mat("grass", (0.1, 0.35, 0.12), rough=0.9, objcolor=True); crystal = emission("crystal", CY, 5)
def island(x, y, z, r, seed):
    n = 56; th = np.linspace(0, 2 * np.pi, n, endpoint=False); verts = []; faces = []; rings = [(0.0, 1.0, 0.0), (0.0, 1.0, -0.15), (-0.35, 0.75, -0.3), (-0.9, 0.45, -0.55), (-1.8, 0.18, -0.75)]
    # a flat top disc with a rough edge and a rocky cone beneath
    centre_top = len(verts); verts.append((0, 0, 0.0))
    for k, (dz, sc_, _) in enumerate(rings):
        for t in th:
            rr = r * sc_ * (1 + 0.14 * math.sin(3 * t + seed) + 0.08 * math.sin(7 * t + seed * 2)); verts.append((rr * math.cos(t), rr * math.sin(t), dz * r * 0.55 + (0.04 * r * math.sin(5 * t + seed) if k == 0 else 0)))
    for i in range(n): faces.append((0, 1 + i, 1 + (i + 1) % n))
    for k in range(len(rings) - 1):
        for i in range(n): a = 1 + k * n + i; b = 1 + k * n + (i + 1) % n; faces.append((a, a + n, b + n, b))
    bot = len(verts); verts.append((0, 0, -2.4 * r * 0.55))
    for i in range(n): faces.append((1 + (len(rings) - 1) * n + i, bot, 1 + (len(rings) - 1) * n + (i + 1) % n))
    me = bpy.data.meshes.new("isl"); me.from_pydata(verts, [], faces); me.update(); [setattr(p, 'use_smooth', True) for p in me.polygons]
    top = [p for p in me.polygons if all(me.vertices[v].co.z > -0.001 * r + 0.0 and v <= n for v in p.vertices)]
    me.materials.append(rock); me.materials.append(grass)
    for p in me.polygons:
        zs = [me.vertices[v].co.z for v in p.vertices]
        if max(zs) > -0.02 * r and min(zs) > -0.12 * r and len(p.vertices) == 3 and 0 in p.vertices: p.material_index = 1
    o = bpy.data.objects.new("island", me); link(o); o.location = (x, y, z); o.rotation_euler[2] = random.uniform(0, 6.28)
    for j in range(random.randint(2, 5)):
        a = random.uniform(0, 6.28); d = random.uniform(0.15, 0.7) * r; h = random.uniform(0.4, 1.4) * r * 0.35
        bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.12 * r, radius2=0, depth=h, location=(x + d * math.cos(a), y + d * math.sin(a), z + h / 2), rotation=(random.uniform(-0.3, 0.3), random.uniform(-0.3, 0.3), 0)); c = bpy.context.object; c.data.materials.append(crystal)
    for j in range(random.randint(2, 6)):
        a = random.uniform(0, 6.28); d = random.uniform(0.0, 0.8) * r
        bpy.ops.mesh.primitive_cone_add(vertices=7, radius1=0.12 * r, radius2=0, depth=0.5 * r, location=(x + d * math.cos(a), y + d * math.sin(a), z + 0.25 * r)); t_ = bpy.context.object; t_.data.materials.append(grass); t_.color = (0.8, 1.0, 0.7, 1)
    point("isl_light", (x, y, z + r * 0.4), 90 * r * r, (0.0, 0.72, 1.0), 0.5)
    return o
for i, (x, y, z, r) in enumerate(((-9, 38, 3, 6), (10, 55, 8, 8), (-22, 78, 14, 11), (24, 92, 5, 9), (2, 125, 18, 14), (-34, 140, 6, 10), (36, 160, 20, 12))): island(x, y, z, r, i * 1.7)
dust(220, ((-40, 40), (4, 120), (-4, 28)), CY, 8, 0.06)
area("rimC", (-20, -10, 18), (70, 0, -30), 24, 22000, CY, sy=14); area("rimA", (24, -10, 14), (70, 0, 35), 24, 12000, AM, sy=14)
camera(sc, (0, -12, 6), (3, 6, 9), (0, 60, 12), (2, 70, 14), lens=32, fstop=2.2, focus=None, frames=A['frames'])
render(sc, A['out'], A['only_frame'])
