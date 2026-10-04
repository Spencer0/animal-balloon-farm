"""Animal Balloon Farm: the midway supply store.

Run from repository root:
  blender --background --factory-startup --python art/blender/shop_building.py

Regenerates public/assets/buildings/farm-shop.blend, farm-shop-review.png and
farm-shop.glb. The building is the clickable shop: with the Hand tool selected
it opens the storefront screen.

Design: a circus midway supply stall, not a barn. Teal wainscot, cream walls
with coral stripe insets, a striped coral/cream canopy roof with gold trim and
a pennant finial, an open serving hatch with a striped awning, a hanging teal
sign, porch posts with gold caps, bunting across the fascia, and a balloon
stake beside the door. Same painted-tin vocabulary as the tents, carousel and
Ferris wheel in src/scene/fairground.ts.

Authored in Blender Z-up with the storefront (hatch, awning, sign, porch)
facing -Y, which the glTF exporter lands in Three.js facing +Z toward the farm
camera. Rests on z = 0, centred on the origin in X/Y. Envelope ~6.2 x 5.0 x
5.0 m so the existing shop placement (size 6.4) keeps working unchanged.

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
random.seed(91827)

FACE = -1.0


def color_rgba(value: str):
    raw = value.lstrip("#")
    rgb = [int(raw[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    rgb = [c / 12.92 if c < .04045 else ((c + .055) / 1.055) ** 2.4 for c in rgb]
    return (*rgb, 1.0)


def make_material(name, value, roughness=.68, metallic=0.0, coat=.14):
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


def flatten_material_colours():
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


def box(name, dimensions, location, mat, parent=None, bevel=0.0, segments=3, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + " mesh"
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


def sphere(name, location, scale, mat, parent=None, segments=24, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + " mesh"
    obj.scale = scale
    obj.data.materials.append(mat)
    for face in obj.data.polygons:
        face.use_smooth = True
    return parent_local(obj, parent, location)


def cylinder(name, location, radius, depth, mat, parent=None, axis="Z", segments=24, bevel=0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=segments, radius=radius, depth=depth, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + " mesh"
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


def cone(name, location, radius, depth, mat, parent=None, segments=3, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=segments, radius1=radius, depth=depth, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + " mesh"
    obj.data.materials.append(mat)
    if any(rotation):
        obj.rotation_euler = rotation
    return parent_local(obj, parent, location)


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
    "cream": make_material("SHOP cream boards", "#fff0c7", .7, 0, .16),
    "coral": make_material("SHOP coral stripe", "#ed5d66", .62, 0, .2),
    "pink": make_material("SHOP pink stripe", "#e88eb7", .62, 0, .2),
    "teal": make_material("SHOP teal wainscot", "#2f9d96", .66, 0, .18),
    "tealDeep": make_material("SHOP deep teal trim", "#247a75", .7, 0, .12),
    "gold": make_material("SHOP brass fittings", "#e0b155", .3, .6, .3),
    "goldSoft": make_material("SHOP gold trim", "#f2c75c", .42, .1, .24),
    "timber": make_material("SHOP counter timber", "#a9764a", .78, 0, .06),
    "timberDark": make_material("SHOP dark stained frame", "#7c5334", .8, 0, .05),
    "glass": make_material("SHOP window glass", "#cfe7e4", .18, 0, .34),
    "iron": make_material("SHOP wrought iron", "#4f4740", .48, .68, .08),
    "stone": make_material("SHOP foundation stone", "#b8b2a4", .86, 0, .03),
    "sign": make_material("SHOP sign field", "#247a75", .58, 0, .22),
    "balloonRed": make_material("SHOP balloon coral", "#f26d83", .24, 0, .5),
    "balloonGold": make_material("SHOP balloon gold", "#ffd15c", .24, 0, .5),
    "balloonTeal": make_material("SHOP balloon teal", "#65c4bd", .24, 0, .5),
    "stageFloor": make_material("STAGE buttercream floor", "#f6e6c6", .88, 0, .02),
    "stageBack": make_material("STAGE mint studio backdrop", "#a6d8cf", .9, 0, .02),
}

root = pivot("SHOP BUILDING export root", (0, 0, 0))
root["asset_id"] = "farm_shop"
root["design_size"] = "6.2 x 5.0 x 5.0"
root["description"] = "Midway supply store for Animal Balloon Farm"

HALF_W, HALF_D = 3.1, 2.3
WALL_TOP = 2.7
WALL_T = .22
WAINSCOT_H = 1.0

box("SHOP foundation", (HALF_W * 2, HALF_D * 2, .3), (0, 0, .15), M["stone"], root, bevel=.04)

# Teal wainscot ring + cream upper walls on all four sides.
for side in (-1, 1):
    box("SHOP wainscot side %d" % side, (WALL_T, HALF_D * 2, WAINSCOT_H),
        (side * (HALF_W - WALL_T / 2), 0, .3 + WAINSCOT_H / 2), M["teal"], root, bevel=.04)
    box("SHOP upper wall side %d" % side, (WALL_T, HALF_D * 2, WALL_TOP - .3 - WAINSCOT_H),
        (side * (HALF_W - WALL_T / 2), 0, .3 + WAINSCOT_H + (WALL_TOP - .3 - WAINSCOT_H) / 2),
        M["cream"], root, bevel=.04)
box("SHOP wainscot back", (HALF_W * 2, WALL_T, WAINSCOT_H),
    (0, HALF_D - WALL_T / 2, .3 + WAINSCOT_H / 2), M["teal"], root, bevel=.04)
box("SHOP upper wall back", (HALF_W * 2, WALL_T, WALL_TOP - .3 - WAINSCOT_H),
    (0, HALF_D - WALL_T / 2, .3 + WAINSCOT_H + (WALL_TOP - .3 - WAINSCOT_H) / 2),
    M["cream"], root, bevel=.04)

# Front (-Y): wainscot full width, upper wall split around the serving hatch.
FRONT_Y = -(HALF_D - WALL_T / 2)
HATCH_W, HATCH_H = 2.6, 1.15
HATCH_SILL = 1.15
box("SHOP wainscot front", (HALF_W * 2, WALL_T, WAINSCOT_H),
    (0, FRONT_Y, .3 + WAINSCOT_H / 2), M["teal"], root, bevel=.04)
for side in (-1, 1):
    span = HALF_W - HATCH_W / 2
    box("SHOP upper wall front %d" % side, (span, WALL_T, WALL_TOP - .3 - WAINSCOT_H),
        (side * (HALF_W - span / 2), FRONT_Y, .3 + WAINSCOT_H + (WALL_TOP - .3 - WAINSCOT_H) / 2),
        M["cream"], root, bevel=.04)
box("SHOP front apron above hatch", (HATCH_W, WALL_T, WALL_TOP - .3 - HATCH_SILL - HATCH_H),
    (0, FRONT_Y, HATCH_SILL + HATCH_H + (WALL_TOP - .3 - HATCH_SILL - HATCH_H) / 2),
    M["cream"], root, bevel=.04)
box("SHOP front apron below hatch", (HATCH_W, WALL_T, HATCH_SILL - .3 - WAINSCOT_H),
    (0, FRONT_Y, .3 + WAINSCOT_H + (HATCH_SILL - .3 - WAINSCOT_H) / 2),
    M["tealDeep"], root, bevel=.04)

# Coral stripe insets on the cream walls: the tent vocabulary at shop scale.
for x in (-2.2, -1.35, 1.35, 2.2):
    box("SHOP front stripe %s" % x, (.42, .06, WALL_TOP - .3 - WAINSCOT_H),
        (x, FRONT_Y + FACE * .04, .3 + WAINSCOT_H + (WALL_TOP - .3 - WAINSCOT_H) / 2),
        M["coral"], root, bevel=.02)
for x in (-2.2, -0.75, 0.75, 2.2):
    box("SHOP back stripe %s" % x, (.42, .06, WALL_TOP - .3 - WAINSCOT_H),
        (x, HALF_D - WALL_T / 2 + .04, .3 + WAINSCOT_H + (WALL_TOP - .3 - WAINSCOT_H) / 2),
        M["pink"] if abs(x) < 1.0 else M["coral"], root, bevel=.02)

# Serving hatch: dark interior, timber counter shelf, side menu boards.
box("SHOP hatch interior", (HATCH_W, .1, HATCH_H),
    (0, FRONT_Y + .02, HATCH_SILL + HATCH_H / 2),
    make_material("SHOP hatch shadow", "#2a1c14", .95, 0, .0), root, bevel=0)
box("SHOP hatch counter", (HATCH_W + .5, .55, .12),
    (0, FRONT_Y + FACE * .32, HATCH_SILL), M["timber"], root, bevel=.05)
for side in (-1, 1):
    box("SHOP hatch post %d" % side, (.14, .14, HATCH_H + .1),
        (side * (HATCH_W / 2 + .05), FRONT_Y, HATCH_SILL + HATCH_H / 2),
        M["timberDark"], root, bevel=.03)
    box("SHOP menu board %d" % side, (.62, .08, .9),
        (side * (HATCH_W / 2 + .62), FRONT_Y + FACE * .06, 1.85),
        M["timberDark"], root, bevel=.03)
    box("SHOP menu card %d" % side, (.46, .04, .7),
        (side * (HATCH_W / 2 + .62), FRONT_Y + FACE * .1, 1.85),
        M["cream"], root, bevel=.02)

# Striped awning over the hatch: alternating coral/cream tilted panels.
AWN_Y = FRONT_Y - .55
for index in range(7):
    stripe = M["coral"] if index % 2 else M["cream"]
    box("SHOP awning stripe %d" % index, (.5, 1.05, .09),
        (-1.5 + index * .5, AWN_Y, 3.15), stripe, root, bevel=.02,
        rotation=(math.radians(28), 0, 0))
box("SHOP awning scallop bar", (3.6, .12, .12), (0, AWN_Y - .42, 2.78), M["goldSoft"], root, bevel=.03)

# Corner posts in cream with gold ball caps.
for sx in (-1, 1):
    for sy in (-1, 1):
        box("SHOP corner post %d %d" % (sx, sy), (.2, .2, WALL_TOP - .3),
            (sx * (HALF_W - .1), sy * (HALF_D - .1), .3 + (WALL_TOP - .3) / 2),
            M["cream"], root, bevel=.03)
        sphere("SHOP corner cap %d %d" % (sx, sy),
               (sx * (HALF_W - .1), sy * (HALF_D - .1), WALL_TOP + .08),
               (.11, .11, .11), M["gold"], root, 14, 10)

# Striped canopy roof: front/back slopes split into alternating panels.
RIDGE_Z = 4.35
RIDGE_RUN = HALF_D + .55
slope = math.atan2(RIDGE_Z - WALL_TOP, RIDGE_RUN)
length = math.hypot(RIDGE_Z - WALL_TOP, RIDGE_RUN)
PANEL_W = (HALF_W * 2 + .8) / 7
for side, ySign in (("front", -1), ("back", 1)):
    for index in range(7):
        stripe = M["coral"] if (index + (0 if ySign < 0 else 1)) % 2 else M["cream"]
        box("SHOP roof %s panel %d" % (side, index), (PANEL_W + .02, length + .25, .14),
            (-(HALF_W + .4) + PANEL_W / 2 + index * PANEL_W, ySign * RIDGE_RUN / 2,
             (WALL_TOP + RIDGE_Z) / 2), stripe, root, bevel=.02,
            rotation=(math.radians(math.degrees(slope)) if ySign < 0 else math.radians(-math.degrees(slope)), 0, 0))
box("SHOP roof ridge", (HALF_W * 2 + .9, .3, .2), (0, 0, RIDGE_Z + .05), M["goldSoft"], root, bevel=.05)
sphere("SHOP roof finial", (0, 0, RIDGE_Z + .42), (.2, .2, .2), M["gold"], root, 16, 12)
cone("SHOP roof pennant", (0, 0, RIDGE_Z + .78), .3, .62, M["coral"], root, 3,
     rotation=(0, math.radians(90), 0))

# Porch: fascia beam on two cream posts, bunting below it, hanging sign.
PORCH_Y = -(HALF_D + 1.15)
box("SHOP porch fascia", (HALF_W * 2 + .34, .16, .34), (0, PORCH_Y + .72, 3.0), M["cream"], root, bevel=.04)
for side in (-1, 1):
    box("SHOP porch post %d" % side, (.18, .18, 2.7),
        (side * (HALF_W - .45), PORCH_Y + .55, 1.35), M["cream"], root, bevel=.03)
    sphere("SHOP porch ball %d" % side,
           (side * (HALF_W - .45), PORCH_Y + .55, 2.82), (.12, .12, .12), M["gold"], root, 14, 10)
    box("SHOP porch base %d" % side, (.34, .34, .24),
        (side * (HALF_W - .45), PORCH_Y + .55, .12), M["tealDeep"], root, bevel=.04)
box("SHOP porch canopy", (HALF_W * 2 + .3, 1.15, .12), (0, PORCH_Y + .1, 3.02), M["teal"], root, bevel=.04,
    rotation=(math.radians(-8), 0, 0))

# Bunting triangles under the fascia in tent colours.
BUNT = ["#ed5d66", "#fff0c7", "#40a9a2", "#f3bf4f", "#6488c5", "#e88eb7"]
for index in range(9):
    mat = make_material("SHOP bunt %d" % index, BUNT[index % len(BUNT)], .66, 0, .14)
    cone("SHOP bunt flag %d" % index, (-2.8 + index * .7, PORCH_Y + .72, 2.62),
         .2, .42, mat, root, 3, rotation=(math.radians(180), 0, 0))

# Hanging sign from the fascia: teal field, cream border, gold studs.
sign_root = pivot("SHOP sign swing", (0, PORCH_Y + .5, 2.82), root)
for side in (-1, 1):
    box("SHOP sign chain %d" % side, (.04, .04, .34), (side * .55, 0, 0), M["iron"], sign_root)
box("SHOP sign board", (1.7, .12, .8), (0, 0, -.5), M["cream"], sign_root, bevel=.06)
box("SHOP sign field", (1.48, .05, .6), (0, FACE * .08, -.5), M["sign"], sign_root, bevel=.02)
for side in (-1, 1):
    sphere("SHOP sign stud %d" % side, (side * .62, FACE * .09, -.5),
           (.05, .04, .05), M["gold"], sign_root, 12, 8)

# Circus-painted crates + a balloon stake beside the hatch.
box("SHOP crate teal", (.8, .8, .8), (2.55, PORCH_Y + 1.0, .4), M["teal"], root, bevel=.05)
box("SHOP crate cream", (.64, .64, .64), (2.5, PORCH_Y + 1.0, 1.1), M["cream"], root, bevel=.05,
    rotation=(0, math.radians(14), 0))
box("SHOP crate band", (.82, .82, .14), (2.55, PORCH_Y + 1.0, .62), M["goldSoft"], root, bevel=.02)
cylinder("SHOP balloon pole", (-2.7, PORCH_Y + .9, 1.5), .05, 3.0, M["timberDark"], root, bevel=.02)
sphere("SHOP balloon A", (-2.95, PORCH_Y + .75, 3.2), (.34, .44, .32), M["balloonRed"], root, 20, 14)
sphere("SHOP balloon B", (-2.5, PORCH_Y + 1.05, 3.35), (.32, .42, .3), M["balloonGold"], root, 20, 14)
sphere("SHOP balloon C", (-2.7, PORCH_Y + .9, 2.85), (.3, .4, .3), M["balloonTeal"], root, 20, 14)
cylinder("SHOP barrel", (-2.5, FRONT_Y - .5, .5), .44, 1.0, M["teal"], root, bevel=.05)
for height in (.24, .76):
    cylinder("SHOP barrel hoop %s" % height, (-2.5, FRONT_Y - .5, height), .46, .09, M["goldSoft"], root, bevel=.02)

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
scene.world = bpy.data.worlds.new("Midway store review mint morning")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = color_rgba("#b7dcd2")
scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = .7

bpy.ops.mesh.primitive_plane_add(size=140, location=(0, 0, 0))
floor = bpy.context.object
floor.name = "STAGE buttercream floor"
floor.data.materials.append(M["stageFloor"])
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 14, 8))
backdrop = bpy.context.object
backdrop.name = "STAGE mint studio backdrop"
backdrop.dimensions = (140, .25, 22)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
backdrop.data.materials.append(M["stageBack"])

camera_data = bpy.data.cameras.new("STAGE midway store three-quarter")
camera = bpy.data.objects.new("STAGE midway store three-quarter", camera_data)
bpy.context.collection.objects.link(camera)
camera.location = (7.5, -13.5, 5.2)
camera.rotation_euler = (Vector((0, 0, 2.1)) - Vector(camera.location)).to_track_quat("-Z", "Y").to_euler()
camera_data.type = "ORTHO"
camera_data.ortho_scale = 12.6
scene.camera = camera

for name, location, energy, size, tint in [
    ("STAGE LIGHT warm key", (-4, -9, 12), 4200, 9, (1.0, .93, .82)),
    ("STAGE LIGHT cool fill", (10, -5, 7), 2200, 9, (.76, .92, 1.0)),
    ("STAGE LIGHT soft rim", (8, 7, 10), 2600, 8, (1.0, .82, .72)),
    ("STAGE LIGHT gentle bounce", (0, -8, 1.4), 700, 8, (1.0, .92, .74)),
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
print("  farm_shop: design size %s" % root["design_size"])
