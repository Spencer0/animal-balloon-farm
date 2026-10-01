"""Animal Balloon Farm: the shop building that stands on the gravel apron.

Run from repository root:
  blender --background --factory-startup --python art/blender/shop_building.py

Regenerates public/assets/buildings/farm-shop.blend, farm-shop-review.png and
farm-shop.glb. The building is the clickable shop: with the Hand tool selected
it opens the storefront screen.

Authored in Blender's Z-up frame with the front (door, porch and sign) facing
-Y, which the glTF exporter lands in Three.js facing +Z. It rests on z = 0 and
is centred on the origin in X/Y, so the scene can place it by position alone.
Overall envelope is roughly 6.2 x 5.0 x 5.0 m: big enough to read as a building
at the farm camera's ~39 m view height, small enough not to dwarf the 28 x 19 m
plot.

Verify with `node scripts/inspect-glb.mjs public/assets/buildings/farm-shop.glb`.
"""
from __future__ import annotations

import math
import random
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "public" / "assets" / "buildings"
OUTPUT.mkdir(parents=True, exist_ok=True)
random.seed(20462)

FACE = -1.0


def color_rgba(value: str):
    raw = value.lstrip("#")
    rgb = [int(raw[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    rgb = [c / 12.92 if c < .04045 else ((c + .055) / 1.055) ** 2.4 for c in rgb]
    return (*rgb, 1.0)


def make_material(name, value, roughness=.78, metallic=0.0, coat=.06):
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


def add_wood_grain(mat, dark, light, scale=3.0, distortion=7.0, detail=3.0):
    tree = mat.node_tree
    shader = tree.nodes.get("Principled BSDF")
    coord = tree.nodes.new("ShaderNodeTexCoord")
    mapping = tree.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (1.0, scale, 1.0)
    noise = tree.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Distortion"].default_value = distortion
    noise.inputs["Detail"].default_value = detail
    ramp = tree.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = .34
    ramp.color_ramp.elements[0].color = color_rgba(dark)
    ramp.color_ramp.elements[1].position = .66
    ramp.color_ramp.elements[1].color = color_rgba(light)
    tree.links.new(coord.outputs["Object"], mapping.inputs["Vector"])
    tree.links.new(mapping.outputs["Vector"], noise.inputs["Vector"])
    tree.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    tree.links.new(ramp.outputs["Color"], shader.inputs["Base Color"])
    return mat


def flatten_material_colours():
    """Fall the procedural Base Color back to its flat tone before export.

    glTF cannot carry a noise-to-ramp node graph, so a linked Base Color exports
    white; the timber would arrive in the game as blank plaster. The .blend and
    the review render keep the grain, only the runtime GLB gets the flat colour.
    """
    for mat in bpy.data.materials:
        if not mat.use_nodes or mat.node_tree is None:
            continue
        shader = mat.node_tree.nodes.get("Principled BSDF")
        if shader is None:
            continue
        socket = shader.inputs["Base Color"]
        if not socket.is_linked:
            continue
        for link in list(socket.links):
            mat.node_tree.links.remove(link)
        socket.default_value = mat.diffuse_color


def parent_local(obj, parent, location):
    if parent:
        obj.parent = parent
        obj.matrix_parent_inverse.identity()
        obj.location = location
    else:
        obj.location = location
    return obj


def box(name, dimensions, location, mat, parent=None, bevel=0.0, segments=4, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + " · mesh"
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0.0:
        mod = obj.modifiers.new("soft carved edge", "BEVEL")
        mod.width = min(bevel, min(dimensions) * .45)
        mod.segments = segments
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(30)
    if any(rotation):
        obj.rotation_euler = rotation
    obj.data.materials.append(mat)
    return parent_local(obj, parent, location)


def sphere(name, location, scale, mat, parent=None, segments=28, rings=20):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + " · mesh"
    obj.scale = scale
    obj.data.materials.append(mat)
    for face in obj.data.polygons:
        face.use_smooth = True
    return parent_local(obj, parent, location)


def cylinder(name, location, radius, depth, mat, parent=None, axis="Z", segments=32, bevel=0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=segments, radius=radius, depth=depth, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + " · mesh"
    if bevel > 0.0:
        mod = obj.modifiers.new("rounded rim", "BEVEL")
        mod.width = bevel
        mod.segments = 3
        mod.limit_method = "ANGLE"
    obj.data.materials.append(mat)
    for face in obj.data.polygons:
        face.use_smooth = len(face.vertices) == 4
    parent_local(obj, parent, location)
    if axis == "Y":
        obj.rotation_euler = (math.radians(90), 0, 0)
    elif axis == "X":
        obj.rotation_euler = (0, math.radians(90), 0)
    return obj


def pivot(name, location, parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = .2
    if parent:
        obj.parent = parent
        obj.matrix_parent_inverse.identity()
    obj.location = location
    return obj


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for collection in (bpy.data.meshes, bpy.data.curves, bpy.data.materials,
                   bpy.data.cameras, bpy.data.lights, bpy.data.worlds, bpy.data.actions):
    for block in list(collection):
        if block.users == 0:
            collection.remove(block)

M = {
    "wall": make_material("SHOP · barn red clapboard", "#b8513f", .76, 0, .08),
    "wallDeep": make_material("SHOP · shadowed barn red", "#93412f", .78, 0, .06),
    "timber": add_wood_grain(make_material("SHOP · weathered timber", "#a9764a", .8, 0, .05), "#7f5531", "#c79763"),
    "timberDark": add_wood_grain(make_material("SHOP · dark stained frame", "#7c5334", .82, 0, .04), "#59391f", "#956743"),
    "cream": make_material("SHOP · buttercream trim", "#f7ecd0", .7, 0, .16),
    "roof": make_material("SHOP · shingle roof", "#6f5b4a", .82, 0, .04),
    "roofDark": make_material("SHOP · roof ridge", "#544437", .84, 0, .03),
    "glass": make_material("SHOP · window glass", "#cfe7e4", .18, 0, .34),
    "gold": make_material("SHOP · brass fittings", "#e0b155", .3, .6, .3),
    "iron": make_material("SHOP · wrought iron", "#4f4740", .48, .68, .08),
    "stone": make_material("SHOP · foundation stone", "#b8b2a4", .86, 0, .03),
    "pot": make_material("SHOP · terracotta pot", "#c2653f", .8, 0, .05),
    "leaf": make_material("SHOP · pot leaf", "#5f9450", .82, 0, .05),
    "sign": make_material("SHOP · sign field", "#3f6b52", .62, 0, .2),
    "stageFloor": make_material("STAGE · buttercream floor", "#f6e6c6", .88, 0, .02),
    "stageBack": make_material("STAGE · mint studio backdrop", "#a6d8cf", .9, 0, .02),
}

root = pivot("SHOP BUILDING · export root", (0, 0, 0))
root["asset_id"] = "farm_shop"
root["design_size"] = "6.2 x 5.0 x 5.0"
root["description"] = "The farm shop building for Animal Balloon Farm"

HALF_W, HALF_D = 3.1, 2.3
WALL_TOP = 2.7
WALL_T = .22

# Foundation and walls. The front wall is left out at the doorway so the opening
# reads as a real hole rather than a painted rectangle.
box("SHOP · foundation", (HALF_W * 2, HALF_D * 2, .3), (0, 0, .15), M["stone"], root, bevel=.04)
box("SHOP · back wall", (HALF_W * 2, WALL_T, WALL_TOP - .3), (0, -HALF_D + WALL_T / 2, .3 + (WALL_TOP - .3) / 2),
    M["wall"], root, bevel=.05)
for side in (-1, 1):
    box(f"SHOP · side wall {side}", (WALL_T, HALF_D * 2 - WALL_T * 2, WALL_TOP - .3),
        (side * (HALF_W - WALL_T / 2), 0, .3 + (WALL_TOP - .3) / 2), M["wallDeep"], root, bevel=.05)

DOOR_W, DOOR_H = 1.5, 2.0
front_y = HALF_D - WALL_T / 2
front_height = WALL_TOP - .3
front_center_z = .3 + front_height / 2
front_bottom = .3
# Left and right of the doorway, plus the lintel above it.
for side in (-1, 1):
    span = (HALF_W) - DOOR_W / 2
    box(f"SHOP · front wall {side}", (span, WALL_T, front_height),
        (side * (HALF_W - span / 2), front_y, front_center_z), M["wall"], root, bevel=.05)
box("SHOP · front lintel", (DOOR_W, WALL_T, WALL_TOP - (front_bottom + DOOR_H)),
    (0, front_y, front_bottom + DOOR_H + (WALL_TOP - front_bottom - DOOR_H) / 2), M["wall"], root, bevel=.05)

# Doorway lining and the open doorway (a dark room behind it).
box("SHOP · door frame left", (.14, WALL_T + .12, DOOR_H), (-DOOR_W / 2, front_y, front_bottom + DOOR_H / 2),
    M["timberDark"], root, bevel=.03)
box("SHOP · door frame right", (.14, WALL_T + .12, DOOR_H), (DOOR_W / 2, front_y, front_bottom + DOOR_H / 2),
    M["timberDark"], root, bevel=.03)
box("SHOP · door frame head", (DOOR_W + .28, WALL_T + .12, .18), (0, front_y, front_bottom + DOOR_H),
    M["timberDark"], root, bevel=.03)
box("SHOP · doorway shadow", (DOOR_W, .1, DOOR_H), (0, front_y - .06, front_bottom + DOOR_H / 2),
    make_material("SHOP · interior shadow", "#2a1c14", .95, 0, .0), root, bevel=0)

# Counter window in the gable above the porch.
box("SHOP · gable window", (2.2, .1, .9), (0, front_y + .02, WALL_TOP + .35), M["glass"], root, bevel=.03)
box("SHOP · gable window frame", (2.4, .16, 1.06), (0, front_y, WALL_TOP + .35), M["cream"], root, bevel=.04)
for offset in (-.55, 0, .55):
    box(f"SHOP · gable window mullion {offset}", (.08, .18, 1.0), (offset, front_y + .02, WALL_TOP + .35),
        M["timberDark"], root)

# Gable ends rising to the ridge, then the two roof slabs.
RIDGE_Z = 4.5
RIDGE_RUN = HALF_D + .35
for side in (-1, 1):
    box(f"SHOP · gable wall {side}", (.22, HALF_D * 2, 1.5), (side * (HALF_W - WALL_T / 2), 0, WALL_TOP + .5),
        M["wallDeep"], root, bevel=.05)
for side in (-1, 1):
    slope = math.atan2(RIDGE_Z - WALL_TOP, RIDGE_RUN)
    length = math.hypot(RIDGE_Z - WALL_TOP, RIDGE_RUN)
    box(f"SHOP · roof {side}", (HALF_W * 2 + .7, length + .2, .16),
        (0, side * RIDGE_RUN / 2, (WALL_TOP + RIDGE_Z) / 2), M["roof"], root, bevel=.03,
        rotation=(math.radians(side * math.degrees(slope) * -1) if side < 0 else math.radians(math.degrees(slope)), 0, 0))
box("SHOP · roof ridge", (HALF_W * 2 + .78, .3, .2), (0, 0, RIDGE_Z + .05), M["roofDark"], root, bevel=.05)
box("SHOP · chimney", (.6, .6, 1.1), (1.9, -1.1, RIDGE_Z - .1), M["stone"], root, bevel=.05)
box("SHOP · chimney cap", (.74, .74, .16), (1.9, -1.1, RIDGE_Z + .48), M["stone"], root, bevel=.04)

# Porch: canopy on two posts with a fascia and bunting hooks.
PORCH_Y = HALF_D + 1.15
box("SHOP · porch canopy", (HALF_W * 2 + .3, 2.5, .18), (0, PORCH_Y - .5, 3.05), M["timber"], root, bevel=.04,
    rotation=(math.radians(6), 0, 0))
box("SHOP · porch fascia", (HALF_W * 2 + .34, .16, .3), (0, PORCH_Y + .72, 3.12), M["cream"], root, bevel=.04)
for side in (-1, 1):
    box(f"SHOP · porch post {side}", (.18, .18, 2.75), (side * (HALF_W - .45), PORCH_Y + .55, 1.38),
        M["timberDark"], root, bevel=.03)
    box(f"SHOP · porch post base {side}", (.34, .34, .26), (side * (HALF_W - .45), PORCH_Y + .55, .13),
        M["stone"], root, bevel=.04)

# The hanging shop sign, swinging from the porch beam.
sign_root = pivot("SHOP · sign swing", (0, PORCH_Y + .5, 2.95), root)
for side in (-1, 1):
    box(f"SHOP · sign chain {side}", (.04, .04, .34), (side * .55, 0, -.17), M["iron"], sign_root)
box("SHOP · sign board", (1.7, .12, .8), (0, 0, -.68), M["timber"], sign_root, bevel=.06)
box("SHOP · sign field", (1.48, .05, .6), (0, FACE * .08, -.68), M["sign"], sign_root, bevel=.02)
for side in (-1, 1):
    sphere(f"SHOP · sign stud {side}", (side * .62, FACE * .09, -.68), (.05, .04, .05), M["gold"], sign_root, 16, 12)

# Awning over the counter window on the right, and a barrel + crates + planters.
box("SHOP · counter awning", (2.6, 1.0, .1), (1.5, HALF_D + .45, 3.3), M["cream"], root, bevel=.03,
    rotation=(math.radians(28), 0, 0))
for index in range(5):
    stripe = make_material(f"SHOP · awning stripe {index}", "#c4483c" if index % 2 else "#f7ecd0", .66, 0, .14)
    box(f"SHOP · awning stripe panel {index}", (.5, .98, .12), (-1.0 + index * .5, HALF_D + .45, 3.3),
        stripe, root, bevel=.02, rotation=(math.radians(28), 0, 0))
cylinder("SHOP · barrel", (-2.5, PORCH_Y + .8, .55), .48, 1.1, M["timberDark"], root, bevel=.06)
for height in (.28, .82):
    cylinder(f"SHOP · barrel hoop {height}", (-2.5, PORCH_Y + .8, height), .5, .1, M["iron"], root, bevel=.02)
box("SHOP · crate A", (.8, .8, .8), (2.5, PORCH_Y + .9, .4), M["timber"], root, bevel=.05)
box("SHOP · crate B", (.66, .66, .66), (2.5, PORCH_Y + .9, 1.13), M["timberDark"], root, bevel=.05,
    rotation=(0, math.radians(14), 0))
for side in (-1, 1):
    cylinder(f"SHOP · planter {side}", (side * (HALF_W - .45) + side * .55, PORCH_Y + .55, .3), .34, .6,
             M["pot"], root, bevel=.05)
    sphere(f"SHOP · planter blooms {side}", (side * (HALF_W - .45) + side * .55, PORCH_Y + .55, .72),
           (.34, .34, .22), M["leaf"], root, 22, 16)

# Review stage, excluded from the export selection.
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE_NEXT"
scene.render.resolution_x, scene.render.resolution_y = 1200, 1000
scene.render.resolution_percentage = 100
scene.eevee.taa_render_samples = 96
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.view_settings.exposure = .25
scene.render.threads_mode = "FIXED"
scene.render.threads = 8
scene.world = bpy.data.worlds.new("Farm shop review · mint fairground morning")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = color_rgba("#b7dcd2")
scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = .7

bpy.ops.mesh.primitive_plane_add(size=140, location=(0, 0, 0))
floor = bpy.context.object
floor.name = "STAGE · buttercream floor"
floor.data.materials.append(M["stageFloor"])
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 14, 8))
backdrop = bpy.context.object
backdrop.name = "STAGE · mint studio backdrop"
backdrop.dimensions = (140, .25, 22)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
backdrop.data.materials.append(M["stageBack"])

camera_data = bpy.data.cameras.new("STAGE · farm shop three-quarter")
camera = bpy.data.objects.new("STAGE · farm shop three-quarter", camera_data)
bpy.context.collection.objects.link(camera)
# Front faces -Y, so the reviewer camera sits three-quarters on that side.
camera.location = (-7.5, -13.5, 5.2)
camera.rotation_euler = (Vector((0, 0, 2.1)) - Vector(camera.location)).to_track_quat("-Z", "Y").to_euler()
camera_data.type = "ORTHO"
camera_data.ortho_scale = 12.6
scene.camera = camera

for name, location, energy, size, tint in [
    ("STAGE LIGHT · warm key", (-4, -9, 12), 4200, 9, (1.0, .93, .82)),
    ("STAGE LIGHT · cool fill", (10, -5, 7), 2200, 9, (.76, .92, 1.0)),
    ("STAGE LIGHT · soft rim", (8, 7, 10), 2600, 8, (1.0, .82, .72)),
    ("STAGE LIGHT · gentle bounce", (0, -8, 1.4), 700, 8, (1.0, .92, .74)),
]:
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = tint
    lamp = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(lamp)
    lamp.location = location
    lamp.rotation_euler = (Vector((0, 0, 1.6)) - lamp.location).to_track_quat("-Z", "Y").to_euler()

blend_path = OUTPUT / "farm-shop.blend"
render_path = OUTPUT / "farm-shop-review.png"
scene.render.filepath = str(render_path)
bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
bpy.ops.render.render(write_still=True)

# After the .blend and the render, so the grain survives in both, and before the
# GLB, so the runtime gets a real colour instead of white.
flatten_material_colours()

bpy.ops.object.select_all(action="DESELECT")


def select_tree(obj):
    obj.select_set(True)
    for child in obj.children:
        select_tree(child)


select_tree(root)
bpy.context.view_layer.objects.active = root
glb_path = OUTPUT / "farm-shop.glb"
bpy.ops.export_scene.gltf(
    filepath=str(glb_path), export_format="GLB", use_selection=True,
    export_apply=True, export_animations=False, export_materials="EXPORT",
    export_cameras=False, export_lights=False,
)
print("GLB:", glb_path)
print("Blender source:", blend_path)
print("Art review:", render_path)
print(f"  farm_shop: design size {root['design_size']}")
