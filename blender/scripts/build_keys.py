import bpy, bmesh, math, sys
from mathutils import Vector
S="/private/tmp/claude-501/-Users-alokchauhan-Documents-timetravel-portfolio/123eee09-8ca3-4ca7-a35c-368a2fe051a4/scratchpad/avatar/"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="/Users/alokchauhan/Documents/timetravel-portfolio/reference/avaturn-alok.glb")
bpy.data.objects.remove(bpy.data.objects['Icosphere'])
arm=bpy.data.objects['Armature']; body=bpy.data.objects['avaturn_body']

# ---- landmarks (metres, imported Blender space, -Y is forward) ----
EYE_Z=1.72; EYE_X=0.035
MOUTH_Z=1.6565; LIP_UP_Z=1.664; LIP_LO_Z=1.649; CORNER_X=0.024
BROW_Z=1.7375; NOSE_Z=1.6825
HINGE=Vector((0,0.0,1.685))
def g(d2,s): return math.exp(-d2/(2*s*s))
def sm(a,b,x):
    t=min(1,max(0,(x-a)/(b-a))); return t*t*(3-2*t)

def lower_w(p):  # jaw weight: below the lips, fades along neck and toward the back of head
    w=1-sm(MOUTH_Z-0.004, MOUTH_Z+0.006, p.z)      # 1 below lips
    w*=sm(1.54,1.60,p.z)                            # fade on neck
    w*=1-sm(0.0,0.05,p.y)                           # not behind the hinge
    w*=1-sm(0.075,0.105,abs(p.x))                   # not the ears
    return w

def d_jaw(p,deg=10,fwd=0,side=0):
    w=lower_w(p); a=math.radians(deg)*w
    r=p-HINGE
    ny=r.y*math.cos(a)-r.z*math.sin(a); nz=r.y*math.sin(a)+r.z*math.cos(a)
    q=HINGE+Vector((r.x,ny,nz))
    return (q-p)+Vector((side*w,-fwd*w,0))
def blob(p,cx,cz,sx,sz,dx=0,dy=0,dz=0,front=True):
    w=g((p.x-cx)**2/(sx*sx)*sx*sx,sx)*0+math.exp(-((p.x-cx)**2/(2*sx*sx)+(p.z-cz)**2/(2*sz*sz)))
    if front: w*=1-sm(-0.03,0.01,p.y) if False else (1-sm(-0.02,0.03,p.y))
    return Vector((dx*w,dy*w,dz*w)),w
def mouthgate(p): return 1-sm(0.07,0.10,abs(p.x))
def d_corner(p,side,dx,dy,dz):
    v,w=blob(p,side*CORNER_X,MOUTH_Z,0.014,0.016,dx*side,dy,dz); return v
def d_lip(p,zc,dy,dz,sx=0.02,sz=0.007,dx=0): 
    v,w=blob(p,0,zc,sx,sz,dx,dy,dz); return v
def d_squeeze(p,k,dy=0,zc=MOUTH_Z):  # pull mouth towards the centre line
    v,w=blob(p,0,zc,0.035,0.022); return Vector((-p.x*k*w,dy*w,0))
def d_blink(p,side,k=0.92):
    cx=side*EYE_X; w=math.exp(-(((p.x-cx)**2)/(2*0.018**2)+((p.z-EYE_Z)**2)/(2*0.009**2)))
    w*=1-sm(-0.03,0.01,p.y)
    low=EYE_Z-0.007
    return Vector((0,0,-(p.z-low)*k*w)) if p.z>low else Vector()
def d_brow(p,side,dz,inner=0,outer=0):
    v1,w1=blob(p,side*0.02,BROW_Z,0.016,0.011,0,0,dz)
    v2,w2=blob(p,side*0.015,BROW_Z+0.002,0.012,0.012,0,0,inner)
    v3,w3=blob(p,side*0.05,BROW_Z-0.002,0.016,0.012,0,0,outer)
    return v1+v2+v3
def d_cheek(p,side,puff=0,squint=0):
    v,w=blob(p,side*0.058,1.668,0.022,0.022); return Vector((side*puff*w,-puff*0.6*w,squint*w))
def d_nose(p,side,k):
    v,w=blob(p,side*0.02,1.677,0.011,0.009,0,0,k); return v

L,R=-1,1
def K(): return {}
keys={}
def add(name,fn): keys[name]=fn
# mouth/jaw
add('jawOpen',lambda p:d_jaw(p,16))
add('jawForward',lambda p:d_jaw(p,0,fwd=0.008))
add('jawLeft',lambda p:d_jaw(p,0,side=-0.008))
add('jawRight',lambda p:d_jaw(p,0,side=0.008))
add('mouthClose',lambda p:d_lip(p,LIP_LO_Z,0,0.004)+d_lip(p,LIP_UP_Z,0,-0.002))
add('mouthFunnel',lambda p:d_squeeze(p,0.35,-0.010)+d_lip(p,LIP_LO_Z,-0.004,-0.002)+d_lip(p,LIP_UP_Z,-0.004,0.002))
add('mouthPucker',lambda p:d_squeeze(p,0.55,-0.012))
add('mouthLeft',lambda p:blob(p,0,MOUTH_Z,0.03,0.02,-0.008)[0])
add('mouthRight',lambda p:blob(p,0,MOUTH_Z,0.03,0.02,0.008)[0])
for s,n in ((L,'Left'),(R,'Right')):
    add('mouthSmile'+n,lambda p,s=s:d_corner(p,s,0.007,0.0,0.007))
    add('mouthFrown'+n,lambda p,s=s:d_corner(p,s,0.0,0.0,-0.006))
    add('mouthDimple'+n,lambda p,s=s:d_corner(p,s,0.003,0.002,0.002))
    add('mouthStretch'+n,lambda p,s=s:d_corner(p,s,0.008,0.0,-0.002))
    add('mouthPress'+n,lambda p,s=s:blob(p,s*0.015,MOUTH_Z,0.014,0.01,0,0,0.0)[0]+blob(p,s*0.015,LIP_LO_Z,0.014,0.006,0,0,0.003)[0])
    add('mouthUpperUp'+n,lambda p,s=s:blob(p,s*0.015,LIP_UP_Z,0.014,0.007,0,0,0.005)[0])
    add('mouthLowerDown'+n,lambda p,s=s:blob(p,s*0.015,LIP_LO_Z,0.014,0.007,0,0,-0.006)[0])
    add('cheekSquint'+n,lambda p,s=s:d_cheek(p,s,0,0.004))
    add('noseSneer'+n,lambda p,s=s:d_nose(p,s,0.004))
    add('eyeBlink'+n,lambda p,s=s:d_blink(p,s))
    add('eyeSquint'+n,lambda p,s=s:d_blink(p,s,0.35)+d_cheek(p,s,0,0.003))
    add('eyeWide'+n,lambda p,s=s:blob(p,s*EYE_X,EYE_Z+0.005,0.015,0.006,0,0,0.003)[0])
    add('browDown'+n,lambda p,s=s:d_brow(p,s,-0.006))
    add('browOuterUp'+n,lambda p,s=s:d_brow(p,s,0,0,0.008))
add('mouthRollUpper',lambda p:d_lip(p,LIP_UP_Z,0.004,-0.003))
add('mouthRollLower',lambda p:d_lip(p,LIP_LO_Z,0.004,0.003))
add('mouthShrugUpper',lambda p:d_lip(p,LIP_UP_Z,0,0.004))
add('mouthShrugLower',lambda p:d_lip(p,LIP_LO_Z,0,0.004,sx=0.03)+blob(p,0,MOUTH_Z-0.02,0.02,0.01,0,-0.002,0.003)[0])
add('browInnerUp',lambda p:d_brow(p,L,0,0.007)+d_brow(p,R,0,0.007))
add('cheekPuff',lambda p:d_cheek(p,L,0.006)+d_cheek(p,R,0.006))
# no eyeballs/tongue in the Avaturn mesh: these exist (empty) so animation code finds them
for n in ('eyeLookDownLeft','eyeLookDownRight','eyeLookInLeft','eyeLookInRight','eyeLookOutLeft','eyeLookOutRight','eyeLookUpLeft','eyeLookUpRight','tongueOut'):
    add(n,lambda p:Vector())
# Oculus visemes as mixtures of the above (weights) — jaw in degrees folded into jawOpen weight
VIS={
 'viseme_sil':{},
 'viseme_PP':{'mouthClose':1.0,'mouthPressLeft':.6,'mouthPressRight':.6},
 'viseme_FF':{'mouthLowerDownLeft':.4,'mouthLowerDownRight':.4,'mouthUpperUpLeft':.3,'mouthUpperUpRight':.3,'mouthRollLower':.5},
 'viseme_TH':{'jawOpen':.18,'mouthLowerDownLeft':.3,'mouthLowerDownRight':.3},
 'viseme_DD':{'jawOpen':.22,'mouthStretchLeft':.25,'mouthStretchRight':.25},
 'viseme_kk':{'jawOpen':.28,'mouthStretchLeft':.2,'mouthStretchRight':.2},
 'viseme_CH':{'jawOpen':.2,'mouthFunnel':.55,'mouthPucker':.2},
 'viseme_SS':{'jawOpen':.1,'mouthStretchLeft':.45,'mouthStretchRight':.45,'mouthSmileLeft':.2,'mouthSmileRight':.2},
 'viseme_nn':{'jawOpen':.18,'mouthStretchLeft':.15,'mouthStretchRight':.15},
 'viseme_RR':{'jawOpen':.2,'mouthPucker':.45,'mouthFunnel':.2},
 'viseme_aa':{'jawOpen':.8,'mouthLowerDownLeft':.3,'mouthLowerDownRight':.3},
 'viseme_E':{'jawOpen':.4,'mouthStretchLeft':.5,'mouthStretchRight':.5,'mouthSmileLeft':.25,'mouthSmileRight':.25},
 'viseme_I':{'jawOpen':.28,'mouthStretchLeft':.6,'mouthStretchRight':.6,'mouthSmileLeft':.3,'mouthSmileRight':.3},
 'viseme_O':{'jawOpen':.5,'mouthFunnel':.8,'mouthPucker':.3},
 'viseme_U':{'jawOpen':.22,'mouthPucker':.9,'mouthFunnel':.3},
}
def mesh_coords(obj): return [v.co.copy() for v in obj.data.vertices]
def add_keys(obj,nameset):
    me=obj.data
    if not me.shape_keys: obj.shape_key_add(name='Basis')
    base=[v.co.copy() for v in me.vertices]
    cache={}
    for name in nameset:
        fn=keys[name] if name in keys else None
        if fn is None: continue
        sk=obj.shape_key_add(name=name,from_mix=False)
        d=[fn(p) for p in base]; cache[name]=d
        for i,(p,dd) in enumerate(zip(base,d)): sk.data[i].co=p+dd
    for vn,mix in VIS.items():
        sk=obj.shape_key_add(name=vn,from_mix=False)
        for i,p in enumerate(base):
            off=Vector()
            for kn,wt in mix.items():
                off+=cache[kn][i]*wt
            sk.data[i].co=p+off
    return cache
order=['browDownLeft','browDownRight','browInnerUp','browOuterUpLeft','browOuterUpRight','cheekPuff','cheekSquintLeft','cheekSquintRight','eyeBlinkLeft','eyeBlinkRight','eyeLookDownLeft','eyeLookDownRight','eyeLookInLeft','eyeLookInRight','eyeLookOutLeft','eyeLookOutRight','eyeLookUpLeft','eyeLookUpRight','eyeSquintLeft','eyeSquintRight','eyeWideLeft','eyeWideRight','jawForward','jawLeft','jawOpen','jawRight','mouthClose','mouthDimpleLeft','mouthDimpleRight','mouthFrownLeft','mouthFrownRight','mouthFunnel','mouthLeft','mouthLowerDownLeft','mouthLowerDownRight','mouthPressLeft','mouthPressRight','mouthPucker','mouthRight','mouthRollLower','mouthRollUpper','mouthShrugLower','mouthShrugUpper','mouthSmileLeft','mouthSmileRight','mouthStretchLeft','mouthStretchRight','mouthUpperUpLeft','mouthUpperUpRight','noseSneerLeft','noseSneerRight','tongueOut']
assert len(order)==52 and all(n in keys for n in order), [n for n in order if n not in keys]
# shape keys go on the body mesh (it holds the face). Hair hugs the scalp only, so it needs none.
cache=add_keys(body,order)
print("keys:",len(body.data.shape_keys.key_blocks)-1)
bpy.ops.wm.save_as_mainfile(filepath=S+"stage1.blend")
