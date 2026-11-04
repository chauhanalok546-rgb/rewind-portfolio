import bpy, math, sys, numpy as np
argv=sys.argv[sys.argv.index("--")+1:]; GLB, OUT = argv[0], argv[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
if "Icosphere" in bpy.data.objects: bpy.data.objects.remove(bpy.data.objects["Icosphere"])
sc=bpy.context.scene
w=bpy.data.worlds.new("w"); w.use_nodes=True; w.node_tree.nodes['Background'].inputs[0].default_value=(0.78,0.82,0.88,1); sc.world=w
cam=bpy.data.objects.new("c",bpy.data.cameras.new("c")); sc.collection.objects.link(cam); sc.camera=cam
cam.data.type='ORTHO'; sc.render.engine='BLENDER_EEVEE'
l=bpy.data.lights.new("s",'SUN'); l.energy=3; lo=bpy.data.objects.new("s",l); sc.collection.objects.link(lo); lo.rotation_euler=(0.9,0.2,0.5)
l2=bpy.data.lights.new("f",'SUN'); l2.energy=1.6; lo2=bpy.data.objects.new("f",l2); sc.collection.objects.link(lo2); lo2.rotation_euler=(1.2,0,0)
def shot(name,loc,rot,scale,w_=500,h_=500):
    cam.data.ortho_scale=scale; cam.location=loc; cam.rotation_euler=rot; sc.render.resolution_x=w_; sc.render.resolution_y=h_; sc.render.filepath=OUT+name; bpy.ops.render.render(write_still=True)
# front is -Y in Blender: camera at -Y looks toward +Y
shot("_legs_f.png",(0,-6,0.5),(math.pi/2,0,0),1.1,520,520)
shot("_legs_l.png",(-6,0,0.5),(math.pi/2,0,-math.pi/2),1.1,520,520)
shot("_legs_b.png",(0,6,0.5),(math.pi/2,0,math.pi),1.1,520,520)
def rgba(n,h,w): return np.array(bpy.data.images.load(OUT+n).pixels[:]).reshape(h,w,4)
out=np.concatenate([rgba("_legs_f.png",520,520),rgba("_legs_l.png",520,520),rgba("_legs_b.png",520,520)],axis=1)
im=bpy.data.images.new("m",out.shape[1],out.shape[0]); im.pixels=out.ravel().tolist(); im.filepath_raw=OUT+"_legs.png"; im.file_format='PNG'; im.save()
