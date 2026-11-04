import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
sc = setup(0.25, 2)
mode = sys.argv[sys.argv.index("--")+1]
if mode == "sky": world_sky(sc, elevation=11, rotation=205, density=0.0)
elif mode == "flat": world_flat(sc, (0.5,0.6,0.8), 1.0)
sun(5.0, (1,0.8,0.6), (74,0,205))
box("ground", (50,50,0.2), (0,0,-0.1), mat("g",(0.2,0.3,0.1)))
sphere("s", 1, (0,10,1), mat("m",(0.8,0.2,0.1)))
camera(sc, (0,-8,2), (0,-8,2), (0,10,2), (0,10,2), lens=35, fstop=0, frames=2)
print("sky nodes:", [n.type for n in sc.world.node_tree.nodes])
sc.render.filepath = "/private/tmp/claude-501/dbg_%s.png" % mode; bpy.ops.render.render(write_still=True)
