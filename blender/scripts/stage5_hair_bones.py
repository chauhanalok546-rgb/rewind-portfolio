import bpy, math
from mathutils import Vector
S="/private/tmp/claude-501/-Users-alokchauhan-Documents-timetravel-portfolio/123eee09-8ca3-4ca7-a35c-368a2fe051a4/scratchpad/avatar/"
bpy.ops.wm.open_mainfile(filepath=S+"stage4.blend")
arm=bpy.data.objects['Armature']; hair=bpy.data.objects['avaturn_hair_0']
# ---- six hair bones hanging from the Head bone, around the skull (front, sides, back)
ANG={'HairFront':0,'HairR':90,'HairBackR':135,'HairBack':180,'HairBackL':-135,'HairL':-90}
bpy.context.view_layer.objects.active=arm; arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
eb=arm.data.edit_bones; head=eb['Head']; cz=1.71
for n,a in ANG.items():
    r=0.075
    x=math.sin(math.radians(a))*r; y=math.cos(math.radians(a))*r*(-1)*-1   # front is -Y
    y=-math.cos(math.radians(a))*r
    b=eb.new(n); b.head=Vector((x*0.6,y*0.6,cz+0.04)); b.tail=Vector((x,y,cz-0.07)); b.parent=head; b.use_connect=False; b.use_deform=True
bpy.ops.object.mode_set(mode='OBJECT')
# ---- weights: the lower and further out a hair vertex is, the more its bones carry it; the Head bone keeps the rest
vs=hair.data.vertices
zt=max(v.co.z for v in vs); zb=min(v.co.z for v in vs)
for n in ANG: hair.vertex_groups.new(name=n)
hg=hair.vertex_groups['Head']
count=0
for v in vs:
    u=(zt-v.co.z)/max(1e-6,(zt-zb))                      # 0 at the crown, 1 at the lowest tip
    f=min(0.92,max(0.0,(u-0.18)/0.82)**1.3)               # the scalp never moves
    if f<=0.01: continue
    th=math.degrees(math.atan2(v.co.x,-(v.co.y-0.0)))     # 0 = front, +90 = character's left side(+X)
    ws={}
    for n,a in ANG.items():
        d=abs((th-a+180)%360-180); w=max(0.0,1-d/62.0)
        if n=='HairFront': w*=0.45                          # keep the fringe calmer
        if w>0: ws[n]=w
    tot=sum(ws.values())
    if tot<=0: continue
    top=sorted(ws.items(),key=lambda kv:-kv[1])[:2]; tt=sum(w for _,w in top)
    for n,w in top: hair.vertex_groups[n].add([v.index],f*w/tt,'REPLACE')
    hg.add([v.index],1-f,'REPLACE'); count+=1
print("hair verts weighted:",count,"of",len(vs))
for o in bpy.data.objects: o.select_set(False)
bpy.ops.export_scene.gltf(filepath=S+"alok_avatar_v3.glb",export_format='GLB',export_image_format='WEBP',export_image_quality=82,export_morph=True,export_skins=True,export_yup=True,export_apply=False,use_selection=False)
print("done")
