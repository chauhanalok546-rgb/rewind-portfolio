import bpy, bmesh, math, sys, numpy as np
from mathutils import Vector
argv=sys.argv[sys.argv.index("--")+1:]; SRC, OUT = argv[0], argv[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
if "Icosphere" in bpy.data.objects: bpy.data.objects.remove(bpy.data.objects["Icosphere"])
O=bpy.data.objects
body, look, shoes = O['avaturn_body'], O['avaturn_look_0'], O['avaturn_shoes_0']
for o in (body, look): assert all(abs(v)<1e-6 for v in (o.matrix_world.translation.x,o.matrix_world.translation.y,o.matrix_world.translation.z)), "mesh not at origin"

def sstep(a,b,x):
    t=np.clip((x-a)/(b-a),0,1); return t*t*(3-2*t)

# ---------------------------------------------------------------- 1. full-length trousers: extend the hem down to the ankle
def extend_legs():
    me=look.data; bm=bmesh.new(); bm.from_mesh(me)
    uvl=bm.loops.layers.uv.active; dl=bm.verts.layers.deform.active
    gi={n:look.vertex_groups[n].index for n in ('LeftLeg','RightLeg','LeftFoot','RightFoot')}
    hem=[v for v in bm.verts if v.is_boundary and v.co.z<0.372]      # only the hem ring itself, not the UV-seam edges that run up the leg
    print("hem verts",len(hem))
    for side,sgn in (('Left',1),('Right',-1)):
        vs=[v for v in hem if (v.co.x*sgn)>0]
        if not vs: continue
        cx=sum(v.co.x for v in vs)/len(vs); cy=sum(v.co.y for v in vs)/len(vs)
        zt=0.135
        # the leg's centre line at the ankle (from the leg bone), and the hem's own centre
        ly=-0.021+0.032*((0.521-zt)/(0.521-0.091))
        shift_y=ly-cy; tx=sgn*0.086
        new={}
        for v in vs:
            nv=bm.verts.new(Vector((tx+(v.co.x-cx)*0.93, ly+(v.co.y-cy)*0.93, zt)))
            dv=nv[dl]; dv[gi[side+'Leg']]=0.86; dv[gi[side+'Foot']]=0.14
            new[v]=nv
        done=set()
        for e in [e for e in bm.edges if e.is_boundary and e.verts[0] in new and e.verts[1] in new]:
            f=e.link_faces[0]
            for l in f.loops:
                if l.edge==e:
                    a,b=l.vert,l.link_loop_next.vert; ua,ub=l[uvl].uv.copy(),l.link_loop_next[uvl].uv.copy(); break
            nf=bm.faces.new((b,a,new[a],new[b]))
            for l in nf.loops:
                l[uvl].uv = ub if l.vert==b else ua if l.vert==a else (ua if l.vert==new[a] else ub)
    newv=[v for v in bm.verts if v.co.z<0.14]
    bmesh.ops.remove_doubles(bm, verts=newv, dist=1e-5)
    bm.normal_update(); bm.to_mesh(me); bm.free(); me.update()
extend_legs()

# plain trousers: remove the cargo pockets (the small separate pieces on the thighs and shins)
def remove_pockets():
    me=look.data; bm=bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
    keys={}; parent=[]
    def vid(v):
        k=tuple(np.round(np.array(v.co[:])*1e4).astype(int))
        if k not in keys: keys[k]=len(parent); parent.append(len(parent))
        return keys[k]
    def find(i):
        while parent[i]!=i: parent[i]=parent[parent[i]]; i=parent[i]
        return i
    fids=[]
    for f in bm.faces:
        ids=[vid(v) for v in f.verts]; fids.append(ids)
        for j in range(1,len(ids)): parent[find(ids[j])]=find(ids[0])
    cnt={}; zs={}
    for f,ids in zip(bm.faces,fids):
        c=find(ids[0]); cnt[c]=cnt.get(c,0)+1; zs[c]=zs.get(c,0)+f.calc_center_median().z
    kill={c for c in cnt if cnt[c]<=100 and zs[c]/cnt[c]<0.9}
    doomed=[f for f,ids in zip(bm.faces,fids) if find(ids[0]) in kill]
    print("pocket pieces removed:",len(kill),"faces",len(doomed))
    bmesh.ops.delete(bm,geom=doomed,context='FACES')
    bm.to_mesh(me); bm.free(); me.update()
remove_pockets()

# ---------------------------------------------------------------- 2. slimmer build (body, clothes; shape keys moved the same way)
def slim(co):
    x,y,z=co[:,0],co[:,1],co[:,2]; ax=np.abs(x)
    torso=(1-sstep(0.17,0.30,ax))*sstep(0.95,1.08,z)*(1-sstep(1.50,1.58,z))
    leg=sstep(0.12,0.30,z)*(1-sstep(0.92,1.06,z))
    arm=sstep(0.20,0.34,ax)*sstep(1.28,1.40,z)*(1-sstep(1.66,1.78,z))
    cx=np.sign(x)*0.086
    nx=x*(1-0.12*torso); ny=y*(1-0.08*torso)
    nx=nx+((cx+(x-cx)*0.90)-x)*leg; ny=ny+((-0.01+(y+0.01)*0.90)-y)*leg
    ny=ny*(1-0.10*arm); nz=z+((1.5+(z-1.5)*0.90)-z)*arm
    return np.stack([nx,ny,nz],1)

def apply_to_mesh(o, fn):
    me=o.data; n=len(me.vertices)
    co=np.empty(n*3,dtype=np.float32); me.vertices.foreach_get('co',co); new=fn(co.reshape(-1,3).astype(np.float64)).astype(np.float32)
    me.vertices.foreach_set('co',new.ravel())
    if me.shape_keys:
        for kb in me.shape_keys.key_blocks:
            k=np.empty(n*3,dtype=np.float32); kb.data.foreach_get('co',k)
            kb.data.foreach_set('co',fn(k.reshape(-1,3).astype(np.float64)).astype(np.float32).ravel())
    me.update()

# ---------------------------------------------------------------- 3. a more defined face (small, targeted geometry changes, all in millimetres)
HEAD_Y=0.025
def define_face(co):
    x,y,z=co[:,0].copy(),co[:,1].copy(),co[:,2].copy(); ax=np.abs(x); sg=np.sign(x)
    fw=HEAD_Y-y                                           # distance in front of the head's axis
    face=(fw>0.025)*(ax<0.13)*(z>1.57)*(z<1.80)
    # jaw: narrower below the cheeks, a firmer chin
    jaw=face*(1-sstep(1.62,1.70,z))*sstep(1.585,1.62,z)
    x=x*(1-0.075*jaw)
    chin=face*(1-sstep(1.60,1.64,z))*(1-sstep(0.02,0.045,ax))
    y=y-0.004*chin
    # cheekbones forward and out, hollow beneath them
    cheek=face*sstep(0.035,0.055,ax)*(1-sstep(0.085,0.10,ax))*sstep(1.685,1.70,z)*(1-sstep(1.725,1.745,z))
    x=x+sg*0.002*cheek; y=y-0.0035*cheek
    hollow=face*sstep(0.035,0.055,ax)*(1-sstep(0.085,0.10,ax))*sstep(1.655,1.668,z)*(1-sstep(1.685,1.70,z))
    x=x-sg*0.003*hollow
    # nose bridge and tip, brow ridge
    nose=face*(1-sstep(0.010,0.020,ax))*sstep(1.672,1.69,z)*(1-sstep(1.735,1.75,z))
    y=y-0.0035*nose
    brow=face*(1-sstep(0.06,0.09,ax))*sstep(1.735,1.745,z)*(1-sstep(1.755,1.77,z))
    y=y-0.003*brow
    return np.stack([x,y,z],1)

apply_to_mesh(body, lambda c: slim(define_face(c)))
apply_to_mesh(look, slim)

# ---------------------------------------------------------------- 4. face texture: strong brows, eye and skin definition
img=bpy.data.images['face_eyes']; W,H=img.size
px=np.array(img.pixels[:],dtype=np.float32).reshape(H,W,4)
me=body.data; me.calc_loop_triangles(); uv=me.uv_layers.active.data
pos=np.zeros((H,W,3),dtype=np.float32); cov=np.zeros((H,W),dtype=bool)
V=np.array([v.co[:] for v in me.vertices])
for t in me.loop_triangles:
    vi=t.vertices
    p3=V[list(vi)]
    if p3[:,2].min()<1.55 or np.abs(p3[:,0]).max()>0.16: continue
    uvs=np.array([uv[l].uv[:] for l in t.loops])*[W,H]
    x0,y0=np.floor(uvs.min(0)).astype(int); x1,y1=np.ceil(uvs.max(0)).astype(int)
    xs,ys=np.meshgrid(np.arange(max(x0,0),min(x1+1,W)),np.arange(max(y0,0),min(y1+1,H)))
    if xs.size==0: continue
    P=np.stack([xs.ravel()+0.5,ys.ravel()+0.5],1)
    a,b,c=uvs; d=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
    if abs(d)<1e-9: continue
    w0=((b[1]-c[1])*(P[:,0]-c[0])+(c[0]-b[0])*(P[:,1]-c[1]))/d; w1=((c[1]-a[1])*(P[:,0]-c[0])+(a[0]-c[0])*(P[:,1]-c[1]))/d; w2=1-w0-w1
    m=(w0>=-0.01)&(w1>=-0.01)&(w2>=-0.01)
    if not m.any(): continue
    q=(w0[m,None]*p3[0]+w1[m,None]*p3[1]+w2[m,None]*p3[2])
    pos[ys.ravel()[m],xs.ravel()[m]]=q; cov[ys.ravel()[m],xs.ravel()[m]]=True
print("face texels",int(cov.sum()))
X,Y,Z=pos[...,0],pos[...,1],pos[...,2]; AX=np.abs(X); FW=HEAD_Y-Y
front=cov&(FW>0.03)
def blend(mask_alpha,rgb):
    global px
    a=np.clip(mask_alpha,0,1)[...,None]*front[...,None]
    px[...,:3]=px[...,:3]*(1-a)+np.array(rgb,dtype=np.float32)*a
EYE_Z,EYE_X,MOUTH_Z=1.72,0.035,1.6565
def seg_dist(ax_,z_,x0,z0,x1,z1):
    dx,dz=x1-x0,z1-z0; t=np.clip(((ax_-x0)*dx+(z_-z0)*dz)/(dx*dx+dz*dz),0,1); return np.hypot(ax_-(x0+t*dx),z_-(z0+t*dz)),t
# eyebrows: thick, straight with a soft arch, dark (user's brows are heavy and nearly straight)
pts=[(0.012,EYE_Z+0.0150),(0.030,EYE_Z+0.0188),(0.047,EYE_Z+0.0192),(0.061,EYE_Z+0.0160)]
bd=np.full(AX.shape,9.0); bt=np.zeros(AX.shape)
for (a0,b0),(a1,b1) in zip(pts[:-1],pts[1:]):
    d,t=seg_dist(AX,Z,a0,b0,a1,b1); upd=d<bd; bd=np.where(upd,d,bd)
thick=0.0036
blend((1-sstep(thick*0.5,thick,bd))*0.82,(0.04,0.028,0.024))
# upper lash line and eye socket shadow
for sgn in (1,-1):
    pass
eye_d=np.hypot((AX-EYE_X)/1.0,(Z-(EYE_Z+0.0))/0.75)
blend((1-sstep(0.020,0.030,eye_d))*(1-sstep(0.014,0.016,eye_d))*0.0,(0,0,0))
lash=np.abs((Z-(EYE_Z+0.0075))+0.55*((AX-EYE_X)**2)/0.02*0.01)         # a gentle arc over the eye
blend((1-sstep(0.0011,0.0021,lash))*(np.abs(AX-EYE_X)<0.0185)*0.85,(0.03,0.02,0.02))
socket=np.hypot((AX-EYE_X)/1.3,(Z-(EYE_Z+0.006))/0.8)
blend((1-sstep(0.016,0.028,socket))*(sstep(0.008,0.018,socket))*0.14,(0.33,0.2,0.16))
# cheek hollows, jawline and nose shading
blend((1-sstep(0.012,0.024,np.hypot((AX-0.062)/1.0,(Z-1.672)/0.8)))*0.16,(0.38,0.24,0.2))
jawz=1.607+0.05*np.clip((AX-0.02)/0.07,0,1)
blend((1-sstep(0.004,0.012,np.abs(Z-jawz)))*sstep(0.02,0.05,AX)*(1-sstep(0.085,0.1,AX))*0.20,(0.36,0.23,0.19))
blend((1-sstep(0.002,0.006,np.abs(AX-0.0185)))*sstep(1.676,1.69,Z)*(1-sstep(1.728,1.74,Z))*0.10,(0.42,0.27,0.22))
blend((1-sstep(0.004,0.0085,np.hypot((AX-0.0095)/1.0,(Z-1.6715)/0.55)))*0.5,(0.22,0.12,0.10))                  # nostrils
# a hint of the moustache shadow Alok has, and stronger lips
blend((1-sstep(0.002,0.006,np.abs(Z-1.6745)))*(1-sstep(0.026,0.036,AX))*0.20,(0.20,0.15,0.14))
blend((1-sstep(0.0012,0.0035,np.abs(Z-MOUTH_Z)))*(1-sstep(0.02,0.026,AX))*0.55,(0.26,0.10,0.10))
img.pixels=px.ravel().tolist(); img.pack()

# ---------------------------------------------------------------- 5. hair: black
for name in ('Image_3',):
    im=bpy.data.images[name]; a=np.array(im.pixels[:],dtype=np.float32).reshape(-1,4)
    lum=(a[:,:3]*np.array([0.3,0.59,0.11])).sum(1,keepdims=True)
    a[:,:3]=np.clip(lum*0.34,0,1)*np.array([1.0,1.0,1.04]); im.pixels=a.ravel().tolist(); im.pack()

# ---------------------------------------------------------------- 6. trousers: black (only the texels the trouser polygons use, so the white undershirt stays white)
im=bpy.data.images['Image_10_kit']; W2,H2=im.size; a=np.array(im.pixels[:],dtype=np.float32).reshape(H2,W2,4)
lme=look.data; lme.calc_loop_triangles(); luv=lme.uv_layers.active.data
LV=np.array([v.co[:] for v in lme.vertices]); mask=np.zeros((H2,W2),dtype=bool)
# the trousers are their own connected surface: find it by welding vertices that share a position, then taking the piece that reaches the ankles
keys={}; parent=[]
def vid(p):
    k=tuple(np.round(p*1e4).astype(int))
    if k not in keys: keys[k]=len(parent); parent.append(len(parent))
    return keys[k]
def find(i):
    while parent[i]!=i: parent[i]=parent[parent[i]]; i=parent[i]
    return i
tri_ids=[]
for t in lme.loop_triangles:
    ids=[vid(LV[v]) for v in t.vertices]; tri_ids.append(ids)
    for j in (1,2): parent[find(ids[j])]=find(ids[0])
low=set(find(vid(LV[v.index])) for v in lme.vertices if v.co.z<0.2)
zsum={}; zn={}
for t,ids in zip(lme.loop_triangles,tri_ids):
    c=find(ids[0]); zsum[c]=zsum.get(c,0)+LV[list(t.vertices)][:,2].mean(); zn[c]=zn.get(c,0)+1
for c in zsum:
    if zsum[c]/zn[c]<0.9: low.add(c)                      # the pockets and other trouser pieces that do not reach the ankle
print("trouser pieces:",len(low),[ (round(zsum[c]/zn[c],2),zn[c]) for c in low])
for t,ids in zip(lme.loop_triangles,tri_ids):
    if find(ids[0]) not in low: continue
    uvs=np.array([luv[l].uv[:] for l in t.loops])*[W2,H2]
    x0,y0=np.floor(uvs.min(0)).astype(int); x1,y1=np.ceil(uvs.max(0)).astype(int)
    xs,ys=np.meshgrid(np.arange(max(x0,0),min(x1+1,W2)),np.arange(max(y0,0),min(y1+1,H2)))
    if xs.size==0: continue
    P=np.stack([xs.ravel()+0.5,ys.ravel()+0.5],1); p0,p1,p2=uvs; d=(p1[1]-p2[1])*(p0[0]-p2[0])+(p2[0]-p1[0])*(p0[1]-p2[1])
    if abs(d)<1e-9: continue
    w0=((p1[1]-p2[1])*(P[:,0]-p2[0])+(p2[0]-p1[0])*(P[:,1]-p2[1]))/d; w1=((p2[1]-p0[1])*(P[:,0]-p2[0])+(p0[0]-p2[0])*(P[:,1]-p2[1]))/d; w2=1-w0-w1
    m=(w0>=-0.02)&(w1>=-0.02)&(w2>=-0.02)
    mask[ys.ravel()[m],xs.ravel()[m]]=True
# a two-pixel margin so no cream edge peeks out at the seams
for _ in range(2):
    mask=mask|np.roll(mask,1,0)|np.roll(mask,-1,0)|np.roll(mask,1,1)|np.roll(mask,-1,1)
L=(a[...,:3]*np.array([0.3,0.59,0.11])).sum(-1)
mx=a[...,:3].max(-1); mn=a[...,:3].min(-1); sat=(mx-mn)/(mx+1e-6)
wide=mask.copy()
for _ in range(8): wide=wide|np.roll(wide,1,0)|np.roll(wide,-1,0)|np.roll(wide,1,1)|np.roll(wide,-1,1)
mask=mask|(wide&(sat>0.14)&(L>0.3))                      # clearly cream pixels just outside the trouser islands (texture padding) go black too
black=(0.02+0.075*L)[...,None]*np.array([1.0,1.0,1.06])
a[...,:3]=np.where(mask[...,None],black,a[...,:3])
im.pixels=a.ravel().tolist(); im.pack()

# ---------------------------------------------------------------- export
bpy.ops.object.select_all(action='DESELECT')
for o in bpy.data.objects: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_image_format='WEBP', export_image_quality=82, export_morph=True, export_skins=True, use_selection=True, export_yup=True, export_apply=False)
print("EXPORTED",OUT)
