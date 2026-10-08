"""Animal Balloon Farm: the small barn the shop sells.

Run from repository root:
  blender --background --factory-startup --python art/blender/barn_prop.py

Regenerates public/assets/props/barn.blend, barn-review.png and barn.glb. Like
oak_tree.py it is its own script, so rebuilding the barn never touches the
approved fountain, statue, fence and coop in shop_props.py.

Authoring frame matches shop_props.py: Z-up, resting on z = 0 and centred on the
origin in X/Y. The gable and the big door face -Y, which glTF turns into +Z, the
way a placed prop faces the default camera. Two lattice cells (4 m) square.
"""
from __future__ import annotations

import math
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "public" / "assets" / "props"
OUTPUT.mkdir(parents=True, exist_ok=True)

HALF_W = 1.5       # body half-width (x)
HALF_L = 1.8       # body half-length (y)
WALL = 1.8         # eave height
RIDGE = 3.0        # ridge height


def color_rgba(value: str):
    raw = value.lstrip("#")
    rgb = [int(raw[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    rgb = [c / 12.92 if c < .04045 else ((c + .055) / 1.055) ** 2.4 for c in rgb]
    return (*rgb, 1.0)


def make_material(name, value, roughness=.75, metallic=0.0, coat=.06):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color_rgba(value)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color_rgba(value)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Coat Weight"].default_value = coat
    shader.inputs["Coat Roughness"].default_value = .26
    return mat


def parent_local(obj, parent, location):
    if parent:
        obj.parent = parent
        obj.matrix_parent_inverse.identity()
    obj.location = location
    return obj


def sphere(name, location, scale, mat, parent=None, segments=20, rings=14):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + " · mesh"
    obj.scale = scale
    obj.data.materials.append(mat)
    for face in obj.data.polygons:
        face.use_smooth = True
    return parent_local(obj, parent, location)


def cone_frustum(name, location, radius_bottom, radius_top, depth, mat, parent=None, segments=20):
    bpy.ops.mesh.primitive_cone_add(vertices=segments, radius1=radius_bottom, radius2=radius_top, depth=depth, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + " · mesh"
    obj.data.materials.append(mat)
    for face in obj.data.polygons:
        face.use_smooth = True
    return parent_local(obj, parent, location)


def pivot(name, location, parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = .25
    if parent:
        obj.parent = parent
        obj.matrix_parent_inverse.identity()
    obj.location = location
    return obj


def flatten_material_colours():
    for mat in bpy.data.materials:
        if not mat.use_nodes or mat.node_tree is None:
            continue
        shader = mat.node_tree.nodes.get("Principled BSDF")
        if shader is None or not shader.inputs["Base Color"].is_linked:
            continue
        for link in list(shader.inputs["Base Color"].links):
            mat.node_tree.links.remove(link)
        shader.inputs["Base Color"].default_value = mat.diffuse_color


# Fresh authoring scene; the named outputs below are intentionally regenerated.
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for collection in (bpy.data.meshes, bpy.data.curves, bpy.data.materials,
                   bpy.data.cameras, bpy.data.lights, bpy.data.worlds, bpy.data.actions):
    for block in list(collection):
        if block.users == 0:
            collection.remove(block)


def box(name, location, size, mat, parent=None, bevel=0.06, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + " · mesh"
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = obj.modifiers.new("soft", "BEVEL")
        mod.width = bevel
        mod.segments = 3
        bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.data.materials.append(mat)
    for face in obj.data.polygons:
        face.use_smooth = True
    obj.rotation_euler = rotation
    return parent_local(obj, parent, location)


def gable(name, y, mat, flip, parent=None):
    """A triangular wall under the roof, in the XZ plane at the given y."""
    mesh = bpy.data.meshes.new(name + " · mesh")
    verts = [(-HALF_W, y, WALL), (HALF_W, y, WALL), (0, y, RIDGE)]
    mesh.from_pydata(verts, [], [(2, 1, 0) if flip else (0, 1, 2)])
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    if parent:
        obj.parent = parent
        obj.matrix_parent_inverse.identity()
    return obj


# Fresh authoring scene; the named outputs below are intentionally regenerated.
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for collection in (bpy.data.meshes, bpy.data.curves, bpy.data.materials,
                   bpy.data.cameras, bpy.data.lights, bpy.data.worlds, bpy.data.actions):
    for block in list(collection):
        if block.users == 0:
            collection.remove(block)

M = {
    "wall": make_material("BARN · red wall", "#b8503f", .52, 0, .22),
    "wallDark": make_material("BARN · shaded wall", "#9c4034", .55, 0, .18),
    "roof": make_material("BARN · slate roof", "#5e4a58", .5, 0, .25),
    "trim": make_material("BARN · cream trim", "#f3e6c8", .55, 0, .2),
    "door": make_material("BARN · dark doorway", "#4a2f2a", .7, 0, .05),
    "hay": make_material("BARN · hay", "#e2bb55", .7, 0, .08),
    "hayDark": make_material("BARN · hay shade", "#c79a3c", .72, 0, .06),
    "strap": make_material("BARN · bale twine", "#8d6141", .8, 0, .04),
    "stageFloor": make_material("STAGE · buttercream floor", "#f6e6c6", .88, 0, .02),
    "stageBack": make_material("STAGE · mint studio backdrop", "#a6d8cf", .9, 0, .02),
}

root = pivot("PROP BARN · export root", (0, 0, 0))
root["design_size"] = "2 x 2 cells, about 3 m tall"

# Walls and the two gable ends.
box("BARN · body", (0, 0, WALL / 2), (HALF_W * 2, HALF_L * 2, WALL), M["wall"], root, .1)
gable("BARN · front gable", -HALF_L - .001, M["wall"], False, root)
gable("BARN · back gable", HALF_L + .001, M["wallDark"], True, root)

# Roof: two slabs meeting at a ridge, with a cream ridge cap.
slope = math.atan2(RIDGE - WALL, HALF_W)
slab_width = math.hypot(HALF_W, RIDGE - WALL) + .35
for side in (-1, 1):
    centre = (side * (HALF_W / 2 + .02), 0, (WALL + RIDGE) / 2 + .09)
    box(f"BARN · roof slab {'east' if side > 0 else 'west'}", centre, (slab_width, HALF_L * 2 + .5, .16), M["roof"], root, .05,
        rotation=(0, side * slope, 0))
ridge = cone_frustum("BARN · ridge cap", (0, 0, RIDGE + .1), .1, .1, HALF_L * 2 + .52, M["trim"], root, 12)
ridge.rotation_euler = (math.pi / 2, 0, 0)

# Corner posts in cream trim.
for sx in (-1, 1):
    for sy in (-1, 1):
        box(f"BARN · corner post {sx}{sy}", (sx * HALF_W, sy * HALF_L, WALL / 2), (.16, .16, WALL + .02), M["trim"], root, .03)

# The big double door on the front, with a cream frame and an X brace on each leaf.
DOOR_Y = -HALF_L - .02
box("BARN · doorway", (0, DOOR_Y, .62), (1.25, .08, 1.24), M["door"], root, .02)
box("BARN · door frame top", (0, DOOR_Y - .02, 1.27), (1.45, .09, .12), M["trim"], root, .02)
box("BARN · door frame left", (-.68, DOOR_Y - .02, .64), (.12, .09, 1.3), M["trim"], root, .02)
box("BARN · door frame right", (.68, DOOR_Y - .02, .64), (.12, .09, 1.3), M["trim"], root, .02)
box("BARN · door centre bar", (0, DOOR_Y - .02, .62), (.07, .09, 1.2), M["trim"], root, .02)
for index, side in enumerate((-1, 1)):
    for tilt in (1, -1):
        box(f"BARN · door brace {index}{tilt}", (side * .32, DOOR_Y - .03, .62), (.07, .07, 1.2), M["trim"], root, .015,
            rotation=(0, tilt * math.radians(24), 0))
# Hayloft hatch in the gable.
box("BARN · loft frame", (0, DOOR_Y, 2.28), (.78, .08, .78), M["trim"], root, .02)
box("BARN · loft hatch", (0, DOOR_Y - .02, 2.28), (.58, .09, .58), M["door"], root, .02)
# Side windows.
for side in (-1, 1):
    box(f"BARN · side window {side}", (side * (HALF_W + .02), -.3, 1.15), (.08, .55, .5), M["trim"], root, .02)
    box(f"BARN · side window pane {side}", (side * (HALF_W + .035), -.3, 1.15), (.08, .4, .36), M["door"], root, .015)

# A hay bale by the door, for the story.
box("BARN · hay bale", (1.15, -HALF_L - .42, .26), (.78, .52, .52), M["hay"], root, .09)
for x in (.95, 1.35):
    box(f"BARN · bale twine {x}", (x, -HALF_L - .42, .26), (.05, .56, .56), M["strap"], root, .015)
box("BARN · loose hay", (1.7, -HALF_L - .2, .1), (.5, .4, .2), M["hayDark"], root, .08)

# Contact-sheet stage, excluded from the export selection.
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE_NEXT"
scene.render.resolution_x, scene.render.resolution_y = 900, 1100
scene.render.resolution_percentage = 100
scene.eevee.taa_render_samples = 64
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.view_settings.exposure = .2
scene.render.threads_mode = "FIXED"
scene.render.threads = 8
scene.world = bpy.data.worlds.new("Barn review · mint fairground morning")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = color_rgba("#b7dcd2")
scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = .68

bpy.ops.mesh.primitive_plane_add(size=300, location=(0, 0, 0))
floor = bpy.context.object
floor.name = "STAGE · buttercream floor"
floor.data.materials.append(M["stageFloor"])
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 14, 8))
backdrop = bpy.context.object
backdrop.name = "STAGE · mint studio backdrop"
backdrop.dimensions = (300, .25, 24)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
backdrop.data.materials.append(M["stageBack"])

camera_data = bpy.data.cameras.new("STAGE · barn camera")
camera = bpy.data.objects.new("STAGE · barn camera", camera_data)
bpy.context.collection.objects.link(camera)
camera.location = (9, -14, 7.0)
camera.rotation_euler = (Vector((0, 0, 1.7)) - Vector(camera.location)).to_track_quat("-Z", "Y").to_euler()
camera_data.type = "ORTHO"
camera_data.ortho_scale = 7.6
scene.camera = camera

for name, location, energy, size, tint in [
    ("STAGE LIGHT · warm key", (3, -9, 14), 3000, 9, (1.0, .93, .82)),
    ("STAGE LIGHT · cool fill", (-13, -4, 8), 1700, 9, (.76, .92, 1.0)),
    ("STAGE LIGHT · soft rim", (11, 5, 11), 2200, 8, (1.0, .82, .72)),
]:
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = tint
    lamp = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(lamp)
    lamp.location = location
    lamp.rotation_euler = (Vector((0, 0, 1.5)) - lamp.location).to_track_quat("-Z", "Y").to_euler()

blend_path = OUTPUT / "barn.blend"
render_path = OUTPUT / "barn-review.png"
scene.render.filepath = str(render_path)
bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
bpy.ops.render.render(write_still=True)

flatten_material_colours()
bpy.ops.object.select_all(action="DESELECT")


def select_tree(obj):
    obj.select_set(True)
    for child in obj.children:
        select_tree(child)


select_tree(root)
bpy.context.view_layer.objects.active = root
glb_path = OUTPUT / "barn.glb"
bpy.ops.export_scene.gltf(
    filepath=str(glb_path), export_format="GLB", use_selection=True,
    export_apply=True, export_animations=False, export_materials="EXPORT",
    export_cameras=False, export_lights=False,
)
print("Barn Blender source:", blend_path)
print("Barn art review:", render_path)
print("Barn GLB:", glb_path)
