import bpy, bmesh, math
from mathutils import Vector, Matrix
S="/private/tmp/claude-501/-Users-alokchauhan-Documents-timetravel-portfolio/123eee09-8ca3-4ca7-a35c-368a2fe051a4/scratchpad/avatar/"
bpy.ops.wm.open_mainfile(filepath=S+"stage3.blend")
arm=bpy.data.objects['Armature']; lk=bpy.data.objects['avaturn_look_0']
# ---------- 1. fringe: bring the hair's front edge down to just above the brows, cut straight ----------
h=bpy.data.objects['avaturn_hair_0']
PAINT_FRINGE = False   # long hair has its own bangs
if PAINT_FRINGE:
    # ---- fringe: paint a blunt, slightly choppy hair band into the forehead skin texture ----
    import numpy as np, random
    body=bpy.data.objects['avaturn_body']
    mat=bpy.data.materials['avaturn_body_material']
    node=[n for n in mat.node_tree.nodes if n.type=='TEX_IMAGE' and any(l.to_socket.name=='Base Color' for o in n.outputs for l in o.links)][0]
    im=node.image; W,H=im.size
    px=np.array(im.pixels[:],dtype=np.float32).reshape(H,W,4)
    random.seed(11)
    lock=[random.uniform(-0.0022,0.0022) for _ in range(40)]
    def cut_z(x):
        u=(x+0.09)/0.0070; i=int(u)%39; f=u-int(u)
        base=lock[i]*(1-f)+lock[i+1]*f
        fine=0.0007*math.sin(x*900)+0.0005*math.sin(x*1900+1)
        return 1.762+base+fine+0.005*(x/0.07)**2+0.02*max(0,abs(x)-0.058)*3
    me=body.data; uvl=me.uv_layers.active.data
    rng=np.random.RandomState(3)
    for poly in me.polygons:
        vs=[me.vertices[i].co for i in poly.vertices]
        if min(v.y for v in vs)>-0.03 or max(v.z for v in vs)<1.745 or min(v.z for v in vs)>1.85: continue
        loops=[uvl[i].uv for i in poly.loop_indices]
        for k in range(1,len(loops)-1):
            tri=[0,k,k+1]
            uv=[(loops[t].x*W,loops[t].y*H) for t in tri]; P=[vs[t] for t in tri]
            x0,x1=int(max(0,min(u[0] for u in uv)-1)),int(min(W-1,max(u[0] for u in uv)+1)); y0,y1=int(max(0,min(u[1] for u in uv)-1)),int(min(H-1,max(u[1] for u in uv)+1))
            X,Y=np.meshgrid(np.arange(x0,x1+1)+0.5,np.arange(y0,y1+1)+0.5)
            den=(uv[1][1]-uv[2][1])*(uv[0][0]-uv[2][0])+(uv[2][0]-uv[1][0])*(uv[0][1]-uv[2][1])
            if abs(den)<1e-9: continue
            l1=((uv[1][1]-uv[2][1])*(X-uv[2][0])+(uv[2][0]-uv[1][0])*(Y-uv[2][1]))/den
            l2=((uv[2][1]-uv[0][1])*(X-uv[2][0])+(uv[0][0]-uv[2][0])*(Y-uv[2][1]))/den
            l3=1-l1-l2; m=(l1>=-0.001)&(l2>=-0.001)&(l3>=-0.001)
            wz=l1*P[0].z+l2*P[1].z+l3*P[2].z; wx=l1*P[0].x+l2*P[1].x+l3*P[2].x; wy=l1*P[0].y+l2*P[1].y+l3*P[2].y
            cz=np.vectorize(cut_z)(wx)
            a=np.clip((wz-cz)/0.0025,0,1)*(wy<-0.02)*m              # 1 above the cut, soft 1 mm edge
            streak=0.018+0.012*rng.rand(*a.shape)
            sub=px[y0:y1+1,x0:x1+1]
            for c,col in enumerate((0.020,0.020,0.026)): sub[...,c]=sub[...,c]*(1-a)+(col+streak*0.3)*a
            px[y0:y1+1,x0:x1+1]=sub
    tmp=bpy.data.images.new("face_tmp",W,H,alpha=False); tmp.pixels=px.ravel().tolist()
    tmp.filepath_raw=S+"face_fringe.png"; tmp.file_format='PNG'; tmp.save()
    ni=bpy.data.images.load(S+"face_fringe.png"); ni.colorspace_settings.name='sRGB'; ni.pack(); node.image=ni
# ---- eye life: catchlights on the painted irises, slightly deeper limbal edge ----
import numpy as np
_body=bpy.data.objects['avaturn_body']; _mat=bpy.data.materials['avaturn_body_material']
_node=[n for n in _mat.node_tree.nodes if n.type=='TEX_IMAGE' and any(l.to_socket.name=='Base Color' for o in n.outputs for l in o.links)][0]
_im=_node.image; _W,_H=_im.size
_px=np.array(_im.pixels[:],dtype=np.float32).reshape(_H,_W,4)
EYE=[(-0.035,1.7195),(0.035,1.7195)]
_me=_body.data; _uv=_me.uv_layers.active.data
for poly in _me.polygons:
    vs=[_me.vertices[i].co for i in poly.vertices]
    if min(v.y for v in vs)>-0.03 or max(v.z for v in vs)<1.70 or min(v.z for v in vs)>1.74 or max(abs(v.x) for v in vs)<0.015 or min(abs(v.x) for v in vs)>0.06: continue
    loops=[_uv[i].uv for i in poly.loop_indices]
    for k in range(1,len(loops)-1):
        tri=[0,k,k+1]; uv=[(loops[t].x*_W,loops[t].y*_H) for t in tri]; P=[vs[t] for t in tri]
        x0,x1=int(max(0,min(u[0] for u in uv)-1)),int(min(_W-1,max(u[0] for u in uv)+1)); y0,y1=int(max(0,min(u[1] for u in uv)-1)),int(min(_H-1,max(u[1] for u in uv)+1))
        X,Y=np.meshgrid(np.arange(x0,x1+1)+0.5,np.arange(y0,y1+1)+0.5)
        den=(uv[1][1]-uv[2][1])*(uv[0][0]-uv[2][0])+(uv[2][0]-uv[1][0])*(uv[0][1]-uv[2][1])
        if abs(den)<1e-9: continue
        l1=((uv[1][1]-uv[2][1])*(X-uv[2][0])+(uv[2][0]-uv[1][0])*(Y-uv[2][1]))/den
        l2=((uv[2][1]-uv[0][1])*(X-uv[2][0])+(uv[0][0]-uv[2][0])*(Y-uv[2][1]))/den
        l3=1-l1-l2; m=(l1>=-0.001)&(l2>=-0.001)&(l3>=-0.001)
        wx=l1*P[0].x+l2*P[1].x+l3*P[2].x; wz=l1*P[0].z+l2*P[1].z+l3*P[2].z
        sub=_px[y0:y1+1,x0:x1+1]
        for ex,ez in EYE:
            cx=ex+(-0.0028 if ex>0 else 0.0028)*-1; cz=ez+0.0030          # glint up and toward the key light
            g=np.exp(-(((wx-cx)**2)+((wz-cz)**2))/(2*0.0011**2))*m
            ring=np.exp(-((np.sqrt((wx-ex)**2+(wz-ez)**2)-0.0058)**2)/(2*0.0007**2))*m*0.35   # limbal ring
            for c in range(3): sub[...,c]=sub[...,c]*(1-ring)+sub[...,c]*0.55*ring
            for c in range(3): sub[...,c]=sub[...,c]*(1-0.92*g)+0.97*0.92*g
        _px[y0:y1+1,x0:x1+1]=sub
_tmp=bpy.data.images.new("face_eyes_tmp",_W,_H,alpha=False); _tmp.pixels=_px.ravel().tolist()
_tmp.filepath_raw=S+"face_eyes.png"; _tmp.file_format='PNG'; _tmp.save()
_ni=bpy.data.images.load(S+"face_eyes.png"); _ni.colorspace_settings.name='sRGB'; _ni.pack(); _node.image=_ni

# ---------- 2. Chrono details ----------
def mat(name,col,emit=0.0,metal=0.0,rough=0.5):
    col=tuple(x**2.2 for x in col)
    m=bpy.data.materials.new(name); m.use_nodes=True; b=m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value=(*col,1); b.inputs['Metallic'].default_value=metal; b.inputs['Roughness'].default_value=rough
    if emit:
        b.inputs['Emission Color'].default_value=(*col,1); b.inputs['Emission Strength'].default_value=emit
    return m
CYAN=mat('chrono_cyan',(0.0,0.706,1.0),emit=2.5); AMBER=mat('chrono_amber',(1.0,0.69,0.125),emit=1.2)
CORD=mat('cord_black',(0.02,0.02,0.02),rough=0.8); SILVER=mat('ring_silver',(0.8,0.8,0.82),metal=1.0,rough=0.25)
DARK=mat('chrono_graphite',(0.055,0.09,0.15),rough=0.4)
def patch_mat():
    m=bpy.data.materials.new('chrono_patch'); m.use_nodes=True; nt=m.node_tree; b=nt.nodes['Principled BSDF']
    im=bpy.data.images.load(S+"patch_tex.png"); im.pack()
    t=nt.nodes.new('ShaderNodeTexImage'); t.image=im
    nt.links.new(t.outputs['Color'],b.inputs['Base Color']); nt.links.new(t.outputs['Color'],b.inputs['Emission Color'])
    b.inputs['Emission Strength'].default_value=0.5; b.inputs['Roughness'].default_value=0.6
    return m
PATCH=patch_mat()
def bone(n): b=arm.data.bones[n]; return b.head_local.copy(),b.tail_local.copy()
def sleeve_radius(point,axis):
    ds=[]
    for v in lk.data.vertices:
        r=v.co-point; t=r.dot(axis); d=(r-axis*t).length
        if abs(t)<0.012 and d<0.07: ds.append(d)
    return (sum(ds)/len(ds) if ds else 0.035)*1.12
def finish(obj,bone_name,material):
    obj.data.transform(obj.matrix_world); obj.matrix_world=Matrix.Identity(4)
    obj.data.materials.append(material)
    obj.parent=arm; vg=obj.vertex_groups.new(name=bone_name); vg.add(list(range(len(obj.data.vertices))),1.0,'REPLACE')
    m=obj.modifiers.new('Armature','ARMATURE'); m.object=arm
    for p in obj.data.polygons: p.use_smooth=True
def torus(name,center,axis,R,r,material,bone_name):
    bpy.ops.mesh.primitive_torus_add(major_segments=48,minor_segments=10,major_radius=R,minor_radius=r,location=center)
    o=bpy.context.object; o.name=name
    o.rotation_euler=axis.to_track_quat('Z','Y').to_euler(); bpy.context.view_layer.update(); finish(o,bone_name,material); return o
def cylinder(name,center,axis,R,depth,material,bone_name):
    bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=R,depth=depth,location=center)
    o=bpy.context.object; o.name=name
    o.rotation_euler=axis.to_track_quat('Z','Y').to_euler(); bpy.context.view_layer.update(); finish(o,bone_name,material); return o
for side,sgn in (('Left',-1),('Right',1)):
    fh,ft=bone(side+'ForeArm'); ax=(ft-fh).normalized()
    # cyan piping at the cuff
    pc=fh+(ft-fh)*0.93; rr=sleeve_radius(pc,ax)+0.0008
    torus(side+'CuffPiping',pc,ax,rr,0.0016,CYAN,side+'ForeArm')
    if side=='Left':
        # chronometer: graphite band + cyan display on the back of the wrist
        pw=fh+(ft-fh)*0.80; rw=sleeve_radius(pw,ax)
        torus('ChronoBand',pw,ax,rw*0.80+0.003,0.0045,DARK,'LeftForeArm')
        up=Vector((0,0,1))
        cylinder('ChronoCase',pw+up*(rw*0.80+0.008),up,0.021,0.008,DARK,'LeftForeArm')
        cylinder('ChronoDisplay',pw+up*(rw*0.80+0.0132),up,0.0165,0.0012,CYAN,'LeftForeArm')
        # sleeve patch (amber) on the upper arm
        uh,ut=bone('LeftArm'); pp=uh+(ut-uh)*0.55; axu=(ut-uh).normalized(); ru=sleeve_radius(pp,axu)
        cpos=pp+up*(ru+0.0015); R=0.026
        po=cylinder('SleevePatch',cpos,up,R,0.003,PATCH,'LeftArm')
        uvl=po.data.uv_layers.active
        for lp in po.data.loops:
            co=po.data.vertices[lp.vertex_index].co
            uvl.data[lp.index].uv=(0.5+(co.x-cpos.x)/(2*R),0.5+(co.y-cpos.y)/(2*R))
    else:
        # black knotted cord bracelet + thin silver ring on the index finger
        pb=fh+(ft-fh)*0.97+ax*0.012; rb=sleeve_radius(pb,ax)
        torus('CordBracelet',pb,ax,rb+0.003,0.0035,CORD,'RightForeArm')
        ih,it=bone('RightHandIndex1'); ai=(it-ih).normalized(); pr=ih+(it-ih)*0.55
        torus('SilverRing',pr,ai,0.0105,0.0016,SILVER,'RightHandIndex1')
for o in bpy.data.objects: o.select_set(False)
bpy.ops.wm.save_as_mainfile(filepath=S+"stage4.blend")
bpy.ops.export_scene.gltf(filepath=S+"alok_avatar_v2.glb",export_format='GLB',export_morph=True,export_skins=True,export_yup=True,export_apply=False,use_selection=False)
print("done")
