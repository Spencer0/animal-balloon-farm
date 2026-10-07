"""Original carnival kit. Writes only carnival-dressing.{blend,glb} and review PNG.
Blender Z-up; stalls face -Y, converted to Three.js +Z by the glTF exporter.
Objects are named for runtime palette selection; pivots keep fabric separate.
"""
from pathlib import Path
import math
import bpy
from mathutils import Vector

OUT = Path(__file__).resolve().parents[2] / 'public' / 'assets' / 'props'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

COLORS = {'cream': '#F6E6BF', 'coral': '#D96573', 'teal': '#479C97', 'gold': '#E9B654', 'wood': '#926F50', 'dark': '#4D655E', 'rose': '#D790AA', 'leaf': '#78A470'}
def mat(name, color):
    m = bpy.data.materials.new(name)
    m.diffuse_color = tuple(int(color[i:i+2], 16) / 255 for i in (1, 3, 5)) + (1,)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = m.diffuse_color
    bsdf.inputs['Roughness'].default_value = .72
    return m
M = {name: mat(name, color) for name, color in COLORS.items()}
roots = []
def root(name):
    r = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(r)
    roots.append(r)
    return r

def box(name, p, dims, color, parent, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=p)
    o = bpy.context.object; o.name = name; o.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(M[color]); o.parent = parent
    if bevel:
        mod = o.modifiers.new('Soft painted edges', 'BEVEL'); mod.width = bevel; mod.segments = 1
        o.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    return o

def cylinder(name, p, radius, depth, color, parent, vertices=10):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=p)
    o=bpy.context.object; o.name=name; o.data.materials.append(M[color]); o.parent=parent
    return o

def sphere(name, p, radius, color, parent):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=4, radius=radius, location=p)
    o=bpy.context.object; o.name=name; o.data.materials.append(M[color]); o.parent=parent
    return o

def banner(name, p, width, height, color, parent):
    vertices=[(-width/2,0,0),(width/2,0,0),(width/2,0,-height*.72),(0,0,-height),(-width/2,0,-height*.72)]
    data=bpy.data.meshes.new(name); data.from_pydata(vertices,[],[(0,1,2,3,4)]); data.materials.append(M[color])
    o=bpy.data.objects.new(name,data); bpy.context.collection.objects.link(o); o.location=p; o.parent=parent
    return o

stall=root('LemonadeStall')
box('Painted counter', (0,0,.65), (2.7,1.4,1.3),'teal',stall,.04)
box('Ivory counter lip', (0,-.08,1.34), (3,1.65,.16),'cream',stall,.035)
for x in [-1.3,1.3]:
    cylinder('Canopy post', (x,.5,1.7), .065,3.4,'wood',stall)
for i in range(8):
    color='coral' if i%2==0 else 'cream'
    roof=box('Foldable awning', (-1.4+i*.4,0,2.9),(.4,2.05,.08),color,stall)
    roof.rotation_euler.x=.19
    banner('Scalloped valance', (-1.4+i*.4,-1.02,2.7),.4,.3,color,stall)
box('Menu sign', (0,.61,2.08),(1.05,.13,.63),'dark',stall,.045)
for i in range(3): box('Menu chalk line', (0,.53,2.2-i*.12),(.67,.02,.03),'cream',stall)
for i in range(4):
    cylinder('Cup', (-.8+i*.44,-.23,1.55),.10,.29,'gold' if i%2 else 'coral',stall)
    cylinder('Striped straw',(-.8+i*.44,-.23,1.83),.012,.28,'cream',stall,5)
for x in [-.62,.62]: sphere('Lemon garnish',(x,-.55,1.49),.12,'gold',stall)

cart=root('PopcornCart')
box('Popcorn body',(0,0,.88),(1.55,.9,1.02),'coral',cart,.05)
box('Popcorn glass case',(0,0,1.65),(1.5,.88,.48),'cream',cart,.03)
for x in [-.68,.68]:
    for y in [-.50,.50]:
        wheel=cylinder('Cart wheel',(x,y,.31),.29,.12,'dark',cart,12); wheel.rotation_euler.x=math.pi/2
        hub=cylinder('Brass hub',(x,y*1.12,.31),.09,.14,'gold',cart,8); hub.rotation_euler.x=math.pi/2
for x in [-.68,.68]: cylinder('Canopy pole',(x,.28,1.55),.04,1.75,'wood',cart,8)
for i in range(6):
    roof=box('Cart striped roof',(-.8+i*.32,0,2.43),(.32,1.3,.10),'gold' if i%2 else 'cream',cart)
    roof.rotation_euler.x=.1
for i in range(12): sphere('Popcorn',(-.54+(i%4)*.33,-.17+(i//4)*.18,1.98),.13,'gold',cart)
box('Pull handle',(1.08,0,.96),(.8,.12,.12),'wood',cart)

bench=root('GardenBench')
for i in range(3): box('Bench seat slat',(0,-.28+i*.23,.51),(1.9,.17,.08),'cream',bench,.025)
for i in range(2): box('Bench back slat',(0,.28,.87+i*.22),(1.9,.08,.16),'teal',bench,.025)
for x in [-.7,.7]:
    for y in [-.24,.25]: box('Bench leg',(x,y,.26),(.1,.12,.52),'wood',bench)
    box('Bench back upright',(x,.28,.85),(.1,.1,.85),'wood',bench)

sign=root('MidwaySign')
cylinder('Sign post',(0,0,.75),.065,1.5,'wood',sign,8)
box('Arrow sign',(0,-.05,1.6),(1.5,.15,.42),'teal',sign,.045)
for x in [-.48,-.21,.06,.33]: box('Letter mark',(x,-.137,1.61),(.1,.018,.17),'cream',sign)
banner('Hanging pennant',(.38,-.09,1.32),.35,.4,'coral',sign)

planter=root('FlowerPlanter')
cylinder('Planter tub',(0,0,.24),.38,.48,'wood',planter,10)
for z in [.09,.4]:
    ring=cylinder('Planter band',(0,0,z),.39,.055,'gold',planter,10)
for i in range(7):
    angle=i*2.4; x=math.cos(angle)*.22; y=math.sin(angle)*.22; h=.57+(i%3)*.12
    cylinder('Flower stem',(x,y,h/2+.18),.018,h,'leaf',planter,5)
    for p in range(5):
        a=p*math.tau/5; sphere('Petal',(x+math.cos(a)*.065,y+math.sin(a)*.065,h+.18),.07,'rose' if i%2 else 'cream',planter)
    sphere('Flower center',(x,y,h+.20),.045,'gold',planter)

# Collapse static parts by prop: the runtime retains five independent roots,
# but the export no longer stores a separate accessor/node for every flower petal.
for r in roots:
    bpy.ops.object.select_all(action='DESELECT')
    meshes = [o for o in r.children_recursive if o.type == 'MESH']
    for o in meshes:
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        for modifier in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    joined = bpy.context.object
    joined.name = r.name + '_mesh'
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
# Export only the named kit roots, no studio furniture.
bpy.ops.object.select_all(action='DESELECT')
for r in roots:
    r.select_set(True)
    for child in r.children_recursive: child.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'carnival-dressing.glb'),export_format='GLB',use_selection=True,export_apply=True)
# The source keeps every prop at its own local origin; arrange for contact-sheet only after export.
for r,p in zip(roots,[(-3,1,0),(1,1,0),(-3,-3,0),(1,-3,0),(3,-3,0)]): r.location=p
floor=mat('Studio ivory','#E9E2C9')
bpy.ops.mesh.primitive_plane_add(size=200)
bpy.context.object.data.materials.append(floor)
scene=bpy.context.scene
scene.render.engine='CYCLES'; scene.cycles.samples=24
scene.render.resolution_x=1100; scene.render.resolution_y=760; scene.render.resolution_percentage=100
scene.world.color=(.65,.65,.65)
for name,p,energy,size in [('Key',(-6,-6,10),1400,7),('Fill',(6,-1,7),700,6)]:
    data=bpy.data.lights.new(name,'AREA'); data.energy=energy; data.shape='DISK'; data.size=size
    o=bpy.data.objects.new(name,data); scene.collection.objects.link(o); o.location=p
    o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('Kit review'); camera=bpy.data.objects.new('Kit review',data); scene.collection.objects.link(camera)
camera.location=(10,-14,12); camera.rotation_euler=(Vector((0,-.5,1))-camera.location).to_track_quat('-Z','Y').to_euler()
data.type='ORTHO'; data.ortho_scale=13.5; scene.camera=camera
scene.render.image_settings.file_format='PNG'; scene.render.filepath=str(OUT/'carnival-dressing-review.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'carnival-dressing.blend'))
bpy.ops.render.render(write_still=True)
print('Carnival dressing outputs:',OUT)
