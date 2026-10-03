"""Offline catalogue preparation using existing Blender, no addons or services.
Preserves present UVs; creates a basic smart projection only when absent.
Repairs the known trouser-to-boot gap in the four authored worker assets.
"""
import bpy,sys,json,math
from pathlib import Path
from mathutils import Vector
root=Path(sys.argv[sys.argv.index('--')+1]);reports=[]
for file in sorted(root.glob('*.glb')):
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 bpy.ops.import_scene.gltf(filepath=str(file));meshes=[o for o in bpy.data.objects if o.type=='MESH']
 repaired=[];missing=[]
 for o in meshes:
  if file.stem.endswith('worker') and 'trouser' in o.name.lower():
   points=[o.matrix_world@v.co for v in o.data.vertices];low=min(p.z for p in points)
   # Original authored hem ends about 15 mm above boot; overlap the boot collar.
   if low>.12:
    inv=o.matrix_world.inverted()
    for v,p in zip(o.data.vertices,points):
     weight=max(0,1-(p.z-low)/.12);p.z-=.035*weight;v.co=inv@p
    repaired.append(o.name)
  if not o.data.uv_layers:missing.append(o)
 if missing:
  bpy.ops.object.select_all(action='DESELECT')
  for o in missing:o.select_set(True)
  bpy.context.view_layer.objects.active=missing[0];bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
  bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.015,correct_aspect=True,scale_to_bounds=False)
  bpy.ops.object.mode_set(mode='OBJECT')
 if not missing and not repaired:
  reports.append({'asset':file.name,'unchanged':True});continue
 temp=file.with_name(file.stem+'.prepared.glb')
 bpy.ops.export_scene.gltf(filepath=str(temp),export_format='GLB',export_apply=True,export_texcoords=True,export_normals=True,export_cameras=False,export_lights=False)
 temp.replace(file)
 reports.append({'asset':file.name,'meshes':len(meshes),'uvAdded':len(missing),'hemsRepaired':repaired,'quality':'basic projection, seams/stretch still require visual review'})
print('CATALOG_PREPARATION '+json.dumps(reports))
