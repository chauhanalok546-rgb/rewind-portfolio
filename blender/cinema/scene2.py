import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
A = args(); sc = setup(A['scale'], A['frames']); random.seed(8)
world_flat(sc, (0.30, 0.26, 0.22), 0.9)
# --- the school hall
floor = mat("floor", (0.30, 0.17, 0.08), rough=0.22, metal=0.0, spec=0.9, coat=0.3)
wall = mat("wall", (0.78, 0.70, 0.58), rough=0.85); beam = mat("beam", (0.16, 0.09, 0.05), rough=0.6); curtain = mat("curtain", (0.45, 0.04, 0.05), rough=0.9)
box("floor", (26, 46, 0.2), (0, 18, -0.1), floor); box("ceiling", (26, 46, 0.3), (0, 18, 9.3), mat("ceil", (0.5, 0.45, 0.4), rough=0.9))
box("wallL", (0.4, 46, 9.4), (-13, 18, 4.5), wall); box("wallR", (0.4, 46, 9.4), (13, 18, 4.5), wall); box("wallB", (26, 0.4, 9.4), (0, 41, 4.5), wall)
for i in range(7): box("rib%d" % i, (26, 0.5, 0.5), (0, -2 + i * 7, 8.8), beam)
# tall windows on the left wall with sunlight pouring in
glass = emission("glass", (1.0, 0.85, 0.6), 9)
for i in range(5):
    y = 2 + i * 8; box("win%d" % i, (0.1, 3.2, 5.2), (-12.75, y, 4.6), glass); box("frame%d" % i, (0.25, 3.8, 0.35), (-12.7, y, 7.4), beam)
    box("mullion%d" % i, (0.2, 0.16, 5.2), (-12.7, y, 4.6), beam); box("sill%d" % i, (0.3, 3.8, 0.3), (-12.7, y, 1.9), beam)
    shaft("shaft%d" % i, (-12.5, y, 6.5), (4 + i * 0.6, y + 5, 0.2), 3.0, 8.0, (1.0, 0.82, 0.55), 1.3)
    spot("sun%d" % i, (-12, y, 6.2), (62, 0, 78 + i * 2), 52000, (1.0, 0.82, 0.58), angle=38, blend=0.6, radius=0.4)
# stage, curtain and the trophy
box("stage", (16, 6, 1.0), (0, 38, 0.5), mat("stage", (0.2, 0.12, 0.07), rough=0.5))
for i in range(5): box("curtain%d" % i, (2.6, 0.6, 8), (-8 + i * 4, 40.3, 4.2), curtain)
gold = mat("gold", (1.0, 0.72, 0.2), rough=0.18, metal=1.0, spec=1.0)
box("pedestal", (1.6, 1.6, 1.6), (0, 22, 0.8), mat("ped", (0.85, 0.82, 0.78), rough=0.4))
cyl("cup", 0.45, 0.9, (0, 22, 2.2), gold, 32); sphere("cupball", 0.5, (0, 22, 3.05), gold, 32); cyl("cupbase", 0.6, 0.18, (0, 22, 1.7), gold, 32)
spot("trophy_spot", (0, 12, 9), (-68, 0, 0), 90000, (1.0, 0.9, 0.7), angle=22, blend=0.7, radius=0.2)
point("glint", (0.6, 20.5, 3.3), 220, (1.0, 0.85, 0.5), 0.15)
# rows of benches and a chess table
bench = mat("bench", (0.22, 0.12, 0.06), rough=0.55)
for r in range(8):
    for side in (-1, 1):
        for k in range(2):
            box("bench", (4.0, 0.7, 0.18), (side * (5.5 + k * 3.3), 3 + r * 3.0, 0.9), bench); box("leg", (3.8, 0.12, 0.9), (side * (5.5 + k * 3.3), 3 + r * 3.0, 0.45), bench)
tbl = box("chess_table", (3.0, 3.0, 0.14), (7.5, 14.0, 1.3), bench); cyl("tleg", 0.14, 1.3, (7.5, 14.0, 0.65), bench, 12)
board = mat("board", (0.85, 0.74, 0.55), rough=0.5); box("board", (2.2, 2.2, 0.08), (7.5, 14.0, 1.42), board)
dk = mat("darksq", (0.18, 0.1, 0.06), rough=0.5)
for i in range(4):
    for j in range(4): box("sq", (0.275, 0.275, 0.085), (6.95 + i * 0.55 + (0.27 if j % 2 else 0), 13.45 + j * 0.55, 1.425), dk)
for i, (x, y) in enumerate(((7.2, 13.7), (7.9, 14.4), (7.5, 14.0), (8.0, 13.6))):
    cyl("pawn", 0.11, 0.3, (x, y, 1.62), mat("pw%d" % i, (0.95, 0.93, 0.88) if i % 2 else (0.08, 0.05, 0.04), rough=0.35, spec=0.8), 16); sphere("pawnh", 0.11, (x, y, 1.82), mat("pwh%d" % i, (0.95, 0.93, 0.88) if i % 2 else (0.08, 0.05, 0.04), rough=0.35), 16)
dust(110, ((-11, 11), (0, 36), (0.5, 8)), (1.0, 0.88, 0.6), 7, 0.028)
area("fill", (0, 12, 8.5), (0, 0, 0), 20, 3500, (0.95, 0.82, 0.68), sy=24)
camera(sc, (-2.5, -3, 2.0), (1.5, 2, 2.2), (0.5, 22, 2.2), (0.8, 22, 2.4), lens=30, fstop=1.8, focus=None, frames=A['frames'])
render(sc, A['out'], A['only_frame'])
