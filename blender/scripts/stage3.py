import bpy, numpy as np, math
from mathutils import Vector
S="/private/tmp/claude-501/-Users-alokchauhan-Documents-timetravel-portfolio/123eee09-8ca3-4ca7-a35c-368a2fe051a4/scratchpad/avatar/"
bpy.ops.wm.open_mainfile(filepath=S+"stage2.blend")
arm=bpy.data.objects['Armature']; lk=bpy.data.objects['avaturn_look_0']; sh=bpy.data.objects['avaturn_shoes_0']
# ---- eye bones (the Avaturn skeleton has none; animation runtimes look for them) ----
bpy.context.view_layer.objects.active=arm; arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
head=arm.data.edit_bones['Head']
for n,x in (('LeftEye',-0.035),('RightEye',0.035)):
    b=arm.data.edit_bones.new(n); b.head=Vector((x,-0.07,1.72)); b.tail=Vector((x,-0.09,1.72)); b.parent=head
bpy.ops.object.mode_set(mode='OBJECT')
# ---- outfit repaint: Chrono field kit palette ----
def raster_mask(obj,size,pred):
    me=obj.data; uv=me.uv_layers.active.data
    mask=np.zeros((size,size),bool)
    for p in me.polygons:
        if not pred(p,me): continue
        loops=[uv[i].uv for i in p.loop_indices]
        for k in range(1,len(loops)-1):
            a,b,c=loops[0],loops[k],loops[k+1]
            xs=[a.x*size,b.x*size,c.x*size]; ys=[a.y*size,b.y*size,c.y*size]
            x0,x1=int(max(0,min(xs)-1)),int(min(size-1,max(xs)+1)); y0,y1=int(max(0,min(ys)-1)),int(min(size-1,max(ys)+1))
            X,Y=np.meshgrid(np.arange(x0,x1+1)+0.5,np.arange(y0,y1+1)+0.5)
            den=(ys[1]-ys[2])*(xs[0]-xs[2])+(xs[2]-xs[1])*(ys[0]-ys[2])
            if abs(den)<1e-9: continue
            l1=((ys[1]-ys[2])*(X-xs[2])+(xs[2]-xs[1])*(Y-ys[2]))/den
            l2=((ys[2]-ys[0])*(X-xs[2])+(xs[0]-xs[2])*(Y-ys[2]))/den
            m=(l1>=-0.02)&(l2>=-0.02)&(1-l1-l2>=-0.02)
            mask[y0:y1+1,x0:x1+1]|=m
    return mask
def zc(p,me): return sum(me.vertices[i].co.z for i in p.vertices)/len(p.vertices)
def repaint(obj,mat_name,fn,pred_lower=None):
    mat=bpy.data.materials[mat_name]
    node=[n for n in mat.node_tree.nodes if n.type=='TEX_IMAGE' and any(l.to_socket.name=='Base Color' for o in n.outputs for l in o.links)][0]
    im=node.image; w,h=im.size
    px=np.array(im.pixels[:],dtype=np.float32).reshape(h,w,4)
    out=fn(obj,px,w)
    tmp=bpy.data.images.new(im.name+"_tmp",w,h,alpha=False)
    tmp.pixels=out.ravel().tolist(); tmp.filepath_raw=S+im.name+"_kit.png"; tmp.file_format='PNG'; tmp.save()
    ni=bpy.data.images.load(S+im.name+"_kit.png"); ni.colorspace_settings.name='sRGB'; ni.pack()
    node.image=ni
def kit(obj,px,w):
    o=px.copy(); rgb=px[...,:3]; L=(0.3*rgb[...,0]+0.6*rgb[...,1]+0.1*rgb[...,2])
    mx=rgb.max(-1); mn=rgb.min(-1); sat=(mx-mn)/(mx+1e-6)
    brown=(rgb[...,0]>rgb[...,2]*1.15)&(sat>0.18)
    dark=(~brown)&(L<0.12)                       # the black trousers (and empty atlas)
    cream=np.array([0.93,0.86,0.70],dtype=np.float32)
    kn=np.array([0.10,0.105,0.12],dtype=np.float32)
    o[...,:3]=np.where(dark[...,None],np.clip(cream*np.clip(0.8+2.0*(L[...,None]-0.04),0.6,1.1),0,1),o[...,:3])
    o[...,:3]=np.where(brown[...,None],np.clip(kn*np.clip(0.5+2.2*L[...,None],0.3,1.6),0,1),o[...,:3])
    o[...,3]=1.0
    return o
repaint(lk,'avaturn_look_0_material',kit)
def shoes(obj,px,w):
    o=px.copy(); rgb=px[...,:3]; L=(0.3*rgb[...,0]+0.6*rgb[...,1]+0.1*rgb[...,2])
    blue=(rgb[...,2]>rgb[...,0]*1.25)
    white=np.clip(0.8+0.35*L,0,1)[...,None]*np.array([1,0.99,0.96],dtype=np.float32)
    o[...,:3]=np.where(blue[...,None],white,o[...,:3]); return o
repaint(sh,'avaturn_shoes_0_material',shoes)
# ---- height: 1.80 m -> 1.85 m, applied so exported nodes carry unit scale ----
f=1.0  # hair+shoes already span 1.847 m
from mathutils import Matrix
M=Matrix.Scale(f,4)
for o in bpy.data.objects:
    if o.type=='MESH': o.data.transform(M)      # also scales every shape key
arm.data.transform(M)
bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=S+"stage3.blend")
bpy.ops.export_scene.gltf(filepath=S+"alok_avatar.glb",export_format='GLB',export_morph=True,export_skins=True,export_yup=True,export_apply=False,use_selection=False)
zs=[(o.matrix_world@v.co).z for o in bpy.data.objects if o.type=='MESH' for v in o.data.vertices]
print("final height",max(zs)-min(zs))
