import bpy, bmesh, math, sys
from mathutils import Vector
exec(open(S:="/private/tmp/claude-501/-Users-alokchauhan-Documents-timetravel-portfolio/123eee09-8ca3-4ca7-a35c-368a2fe051a4/scratchpad/avatar/"+"build_keys.py").read().split("# shape keys go on the body mesh")[0])
cache=add_keys(body,order)
for k in body.data.shape_keys.key_blocks: k.value=0
bpy.context.view_layer.update()
# ---------------- mouth decal (dark cavity + teeth) following the lips ----------------
NX,NZ=11,5
HALF_W=0.0205
def fn_for(name):
    return keys[name] if name in keys else None
def vis_disp(vname,p):
    if vname=='rest': return Vector()
    if vname in VIS:
        off=Vector()
        for kn,wt in VIS[vname].items(): off+=keys[kn](p)*wt
        return off
    return keys[vname](p)
# surface y of the face at (x,z): raycast from the front
bm=bmesh.new(); bm.from_mesh(body.data)
dg=bpy.context.evaluated_depsgraph_get()
def surf_y(x,z):
    ok,loc,n,i=body.ray_cast(Vector((x,-1,z)),Vector((0,1,0)))
    return loc.y if ok else -0.085
decal_names=['rest','jawOpen','mouthFunnel','mouthPucker','mouthSmileLeft','mouthSmileRight','mouthStretchLeft','mouthStretchRight','mouthClose','mouthPressLeft','mouthPressRight','mouthLowerDownLeft','mouthLowerDownRight','mouthUpperUpLeft','mouthUpperUpRight','mouthRollLower','mouthRollUpper']+list(VIS.keys())
def shape_for(vname):
    """vertex positions of the decal for one key at weight 1 (relative to the rest face)"""
    ys0=None
    pts=[]
    # open amount at the lip seam centre line
    top=Vector((0,-0.085,MOUTH_Z+0.003)); bot=Vector((0,-0.085,MOUTH_Z-0.003))
    zt=top.z+vis_disp(vname,top).z; zb=bot.z+vis_disp(vname,bot).z
    gap=max(0.0,(zt-zb)-0.006)           # extra opening beyond the rest seam
    mid=(zt+zb)/2
    hw=HALF_W+vis_disp(vname,Vector((CORNER_X,-0.085,MOUTH_Z))).x*-0   # width: corner x shift
    cx=vis_disp(vname,Vector((CORNER_X,-0.085,MOUTH_Z))).x
    hw=max(0.006,HALF_W+cx*1.0)
    return gap,mid,hw
def build_pts(gap,mid,hw,lipy_fn):
    out=[]
    for j in range(NZ):
        t=j/(NZ-1)*2-1                       # -1 bottom .. 1 top
        for i in range(NX):
            s=i/(NX-1)*2-1
            ell=math.sqrt(max(0,1-s*s))
            z=mid+ t*gap/2*ell
            x=s*hw
            out.append(Vector((x,lipy_fn(x,z)-0.0012,z)))
    return out
# base (rest) decal: collapsed, sits on the surface
rest_gap,rest_mid,rest_hw=0.0,MOUTH_Z,HALF_W
mesh=bpy.data.meshes.new("mouth_decal"); obj=bpy.data.objects.new("mouth_decal",mesh)
bpy.context.scene.collection.objects.link(obj)
verts=build_pts(0,MOUTH_Z,HALF_W,surf_y)
faces=[]; 
for j in range(NZ-1):
    for i in range(NX-1):
        faces.append((j*NX+i,j*NX+i+1,(j+1)*NX+i+1,(j+1)*NX+i))
mesh.from_pydata([tuple(v) for v in verts],[],faces)
dark=bpy.data.materials.new("mouth_dark"); dark.use_nodes=True
bs=dark.node_tree.nodes['Principled BSDF']; bs.inputs['Base Color'].default_value=(0.045,0.008,0.01,1); bs.inputs['Roughness'].default_value=0.6
mesh.materials.append(dark)
# decal gets the same key names, each shifted by that key's lip-following shape
obj.shape_key_add(name='Basis')
for vname in [n for n in decal_names if n!='rest']:
    # evaluate with the face shape applied so the decal rides the deformed surface
    for k in body.data.shape_keys.key_blocks: k.value=0
    body.data.shape_keys.key_blocks[vname].value=1.0
    bpy.context.view_layer.update()
    gap,mid,hw=shape_for(vname)
    pts=build_pts(gap,mid,hw,surf_y)
    sk=obj.shape_key_add(name=vname,from_mix=False)
    for i,p in enumerate(pts): sk.data[i].co=p
    body.data.shape_keys.key_blocks[vname].value=0.0
# remaining ARKit names exist (empty) on the decal so the key set matches the face mesh
for n in order:
    if n not in obj.data.shape_keys.key_blocks: obj.shape_key_add(name=n,from_mix=False)
# skin to the Head bone, parent to the armature
obj.parent=arm
vg=obj.vertex_groups.new(name='Head'); vg.add(list(range(len(verts))),1.0,'REPLACE')
mod=obj.modifiers.new('Armature','ARMATURE'); mod.object=arm
for k in body.data.shape_keys.key_blocks: k.value=0
for k in obj.data.shape_keys.key_blocks: k.value=0
bpy.ops.wm.save_as_mainfile(filepath=S+"stage2.blend")
print("decal keys",len(obj.data.shape_keys.key_blocks)-1)
