"""Offline repair for a visually identified blank rear panel on the generic VMC asset.
Generic service access details only; not a manufacturer-exact reconstruction.
"""
import bpy,sys,json,math
from pathlib import Path
from mathutils import Vector
file=Path(sys.argv[sys.argv.index('--')+1]);bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(file))
if any('service hatch gasket' in o.name for o in bpy.data.objects):raise RuntimeError('Service details already present; refusing duplicate geometry')
wall=next(o for o in bpy.data.objects if 'rear service wall' in o.name);points=[wall.matrix_world@Vector(p) for p in wall.bound_box];rear=max(p.y for p in points)
def mat(name,color,rough,metal):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal;return m
panel=mat('Service enamel',(.60,.64,.66),.5,.12);rubber=mat('Service gasket',(.018,.023,.025),.86,0);steel=mat('Service fastener',(.25,.29,.31),.32,.75)
def box(name,loc,size,m,bevel=.004):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name='VMC | '+name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
 if bevel:
  b=o.modifiers.new('Manufactured edge','BEVEL');b.width=bevel;b.segments=3;bpy.ops.object.modifier_apply(modifier=b.name)
 return o
def cyl(name,loc,r,length,m):
 bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=r,depth=length,location=loc,rotation=(math.pi/2,0,0));o=bpy.context.object;o.name='VMC | '+name;o.data.materials.append(m);return o
for x in [-.51,.51]:
 box('service hatch gasket',(x,rear+.004,1.30),(.77,.012,1.32),rubber)
 door=box('service access door',(x,rear+.015,1.30),(.75,.019,1.30),panel,.007)
 for z in [.85,1.75]:box('service door hinge',(x-.34,rear+.037,z),(.022,.030,.11),steel)
 cyl('quarter turn latch',(x+.29,rear+.035,1.30),.018,.020,steel)
 box('latch screwdriver slot',(x+.29,rear+.047,1.30),(.020,.002,.003),rubber,.0005)
 for z in [1.68+i*.047 for i in range(4)]:
  cutter=box('temporary vent cutter',(x,rear-.015,z),(.45,.30,.014),rubber,.002)
  for target in [door,wall]:
   bpy.context.view_layer.objects.active=target;mod=target.modifiers.new('Real ventilation aperture','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter;bpy.ops.object.modifier_apply(modifier=mod.name)
  bpy.data.objects.remove(cutter,do_unlink=True)
  box('rear louver lip',(x,rear+.031,z+.008),(.46,.011,.005),panel,.001)
 for dx in [-.32,.32]:
  for z in [.69,1.91]:cyl('service panel screw',(x+dx,rear+.03,z),.006,.008,steel)
# Existing UVs are preserved; primitives provide default UVs.
meshes=[o for o in bpy.data.objects if o.type=='MESH'];bpy.context.view_layer.update();points=[o.matrix_world@Vector(p) for o in meshes for p in o.bound_box];size=[max(p[i] for p in points)-min(p[i] for p in points) for i in range(3)]
temp=file.with_name(file.stem+'.refined.glb');bpy.ops.export_scene.gltf(filepath=str(temp),export_format='GLB',export_apply=True,export_cameras=False,export_lights=False);temp.replace(file)
print('REFINED '+json.dumps({'parts':len(meshes),'size':[round(size[0],3),round(size[2],3),round(size[1],3)]}))
