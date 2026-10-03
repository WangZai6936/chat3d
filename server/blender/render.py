"""Bounded asset rendering; accepts GLB data only, never model-supplied Python."""
import bpy,sys,json,math
from pathlib import Path
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:];root=Path(args[0]);views=json.loads(args[1])
if not views or len(views)>3 or any(x not in ['perspective','front','back','side','left','top'] for x in views):raise ValueError('Invalid views')
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(root/'input.glb'))
meshes=[o for o in bpy.data.objects if o.type=='MESH']
if not meshes or len(meshes)>1200 or sum(len(o.data.vertices) for o in meshes)>600000:raise ValueError('Asset exceeds render budget')
for o in list(bpy.data.objects):
 if o.type in ['LIGHT','CAMERA']:bpy.data.objects.remove(o,do_unlink=True)
bpy.context.view_layer.update();points=[o.matrix_world@Vector(p) for o in meshes for p in o.bound_box];lo=Vector(tuple(min(p[i] for p in points) for i in range(3)));hi=Vector(tuple(max(p[i] for p in points) for i in range(3)));centre=(lo+hi)/2;size=max((hi-lo).length,.3)
for offset,power in [((-.7,-1,1.8),900),((1,-.2,.8),450),((0,1,1.5),700)]:
 bpy.ops.object.light_add(type='AREA',location=centre+Vector(offset)*size);light=bpy.context.object;light.data.energy=power*size*size;light.data.size=size;light.rotation_euler=(centre-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add();camera=bpy.context.object;camera.data.type='ORTHO';camera.data.ortho_scale=size*1.13
scene=bpy.context.scene;scene.camera=camera;scene.render.engine='CYCLES';scene.cycles.samples=64;scene.cycles.use_denoising=False;scene.world.color=(.22,.22,.22);scene.render.resolution_x=960;scene.render.resolution_y=960;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.view_settings.exposure=-.8
angles={'perspective':(1,-1.5,1),'front':(0,-1,0),'back':(0,1,0),'side':(1,0,0),'left':(-1,0,0),'top':(0,-.001,1)}
for i,view in enumerate(views):
 camera.location=centre+Vector(angles[view]).normalized()*size*3;camera.rotation_euler=(centre-camera.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(root/(str(i)+'.png'));bpy.ops.render.render(write_still=True)
print(json.dumps({'meshes':len(meshes),'vertices':sum(len(o.data.vertices) for o in meshes),'views':views}))
