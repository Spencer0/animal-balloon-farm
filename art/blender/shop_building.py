"""Animal Balloon Farm: the balloon arcade store.

Run from repository root:
  blender --background --factory-startup --python art/blender/shop_building.py

Regenerates public/assets/buildings/farm-shop.blend, farm-shop-review.png and
farm-shop.glb. The building is the clickable shop: with the Hand tool selected
it opens the storefront screen. It unlocks after garden expansion #3 and is
built on site in the game, so every build piece is its own named node:

  SHOP BUILD site        construction barrier, sign and materials (removed last)
  SHOP BUILD foundation  slab that is poured first
  SHOP BUILD walls       shell, arcade window and interior cabinets
  SHOP BUILD marquee     plum marquee lintel with a row of bulbs
  SHOP BUILD roof        mint roof, pink fascia and chrome corner balls
  SHOP BUILD balloons    three balloon bunches on strings, inflated last

src/game/shop-construction.ts holds the matching timeline, keyed by these names.

Design: a pastel balloon arcade. Mint roof, bubblegum pilasters, a plum
marquee with a bulb row, a glowing cabinet window, and balloon bunches tied to
the roof. Same sweet palette as the carnival tents, without the circus stripes.

Authored in Blender Z-up with the storefront (window, marquee, site) facing
-Y, which the glTF exporter lands in Three.js facing +Z. Rests on z = 0,
centred on the origin in X/Y. Envelope about 6.0 x 6.4 x 4.8 m; the placement
normalises the longest side, so the exact size is not load-bearing.

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


def make_material(name, value, roughness=.68, metallic=0.0, coat=.14, emit=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color_rgba(value)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color_rgba(value)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Coat Weight"].default_value = coat
    shader.inputs["Coat Roughness"].default_value = .26
    if emit > 0.0:
        shader.inputs["Emission Color"].default_value = color_rgba(value)
        shader.inputs["Emission Strength"].default_value = emit
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


def cylinder(name, location, radius, depth, mat, parent=None, segments=16, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=segments, radius=radius, depth=depth, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + " mesh"
    obj.data.materials.append(mat)
    for face in obj.data.polygons:
        face.use_smooth = True
    if any(rotation):
        obj.rotation_euler = rotation
    return parent_local(obj, parent, location)


def pivot(name, location=(0, 0, 0), parent=None):
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
    "cream": make_material("SHOP cream walls", "#fff3d6", .7, 0, .16),
    "pink": make_material("SHOP bubblegum pilaster", "#ff9dbf", .6, 0, .2),
    "mint": make_material("SHOP mint roof", "#8ee6cf", .62, 0, .18),
    "teal": make_material("SHOP teal wainscot", "#2fb8b0", .66, 0, .16),
    "plum": make_material("SHOP plum marquee", "#5a3c7a", .5, 0, .24),
    "bulb": make_material("SHOP marquee bulb", "#ffe066", .3, 0, .1, emit=6.0),
    "navy": make_material("SHOP arcade interior", "#1e2a4a", .85, 0, .04),
    "screen": make_material("SHOP cabinet screen", "#7ff6ff", .3, 0, .1, emit=5.0),
    "cabPink": make_material("SHOP cabinet pink", "#ff7fb0", .5, 0, .2),
    "cabTeal": make_material("SHOP cabinet teal", "#3fd0c6", .5, 0, .2),
    "cabViolet": make_material("SHOP cabinet violet", "#9d7bff", .5, 0, .2),
    "chrome": make_material("SHOP chrome ball", "#d6e0ea", .2, .9, .3),
    "stone": make_material("SHOP foundation stone", "#cbc3b3", .86, 0, .03),
    "fascia": make_material("SHOP bubblegum fascia", "#ff7fb0", .58, 0, .2),
    "stripe": make_material("SHOP fascia cream stripe", "#fff8ea", .6, 0, .16),
    "coral": make_material("SHOP balloon coral", "#ff6b6b", .24, 0, .5),
    "sun": make_material("SHOP balloon sun", "#ffd23f", .24, 0, .5),
    "aqua": make_material("SHOP balloon aqua", "#4ce0d2", .24, 0, .5),
    "violet": make_material("SHOP balloon violet", "#9d7bff", .24, 0, .5),
    "string": make_material("SHOP balloon string", "#f5f5f5", .6, 0, .02),
    "hazardYellow": make_material("SHOP hazard yellow", "#ffcc00", .55, 0, .1),
    "hazardBlack": make_material("SHOP hazard black", "#222222", .6, 0, .05),
    "wood": make_material("SHOP crate wood", "#c79a60", .8, 0, .05),
    "iron": make_material("SHOP site iron", "#4f4740", .5, .6, .08),
    "stageFloor": make_material("STAGE buttercream floor", "#f6e6c6", .88, 0, .02),
    "stageBack": make_material("STAGE mint studio backdrop", "#a6d8cf", .9, 0, .02),
}

root = pivot("SHOP BUILDING export root")
root["asset_id"] = "farm_shop"
root["design_size"] = "6.0 x 6.4 x 4.8"
root["description"] = "Balloon arcade store for Animal Balloon Farm"

HALF_W, HALF_D = 2.8, 2.2
WALL_TOP = 2.8
WALL_T = .22
FLOOR_Z = .3
WAINSCOT_H = .9
UPPER_H = WALL_TOP - FLOOR_Z - WAINSCOT_H
FRONT_Y = -(HALF_D - WALL_T / 2)
WINDOW_X, WINDOW_Z0, WINDOW_Z1 = 1.9, .95, 2.1

# ------------------------------------------------------------ SHOP BUILD foundation
foundation = pivot("SHOP BUILD foundation", parent=root)
box("SHOP foundation slab", (HALF_W * 2 + .2, HALF_D * 2 + .2, FLOOR_Z), (0, 0, FLOOR_Z / 2),
    M["stone"], foundation, bevel=.04)
box("SHOP foundation mint trim", (HALF_W * 2 + .3, HALF_D * 2 + .3, .08), (0, 0, FLOOR_Z + .04),
    M["mint"], foundation, bevel=.02)

# ------------------------------------------------------------ SHOP BUILD walls
walls = pivot("SHOP BUILD walls", parent=root)
for side in (-1, 1):
    x = side * (HALF_W - WALL_T / 2)
    # Side walls stop short of the front and back walls, which own the corners. Two faces
    # at the same depth would z-fight, so this keeps every outer face distinct.
    box("SHOP wainscot side %d" % side, (WALL_T, (HALF_D - WALL_T) * 2, WAINSCOT_H), (x, 0, FLOOR_Z + WAINSCOT_H / 2),
        M["teal"], walls, bevel=.04)
    box("SHOP upper wall side %d" % side, (WALL_T, (HALF_D - WALL_T) * 2, UPPER_H),
        (x, 0, FLOOR_Z + WAINSCOT_H + UPPER_H / 2), M["cream"], walls, bevel=.04)
box("SHOP wainscot back", (HALF_W * 2, WALL_T, WAINSCOT_H), (0, HALF_D - WALL_T / 2, FLOOR_Z + WAINSCOT_H / 2),
    M["teal"], walls, bevel=.04)
box("SHOP upper wall back", (HALF_W * 2, WALL_T, UPPER_H),
    (0, HALF_D - WALL_T / 2, FLOOR_Z + WAINSCOT_H + UPPER_H / 2), M["cream"], walls, bevel=.04)

# Front: teal wainscot full width, cream piers either side of the arcade window.
# The wainscot is a hair thicker than the piers so its face sits proud of them, not flush.
box("SHOP wainscot front", (HALF_W * 2, WALL_T + .03, WAINSCOT_H), (0, FRONT_Y, FLOOR_Z + WAINSCOT_H / 2),
    M["teal"], walls, bevel=.04)
for side in (-1, 1):
    span = HALF_W - WINDOW_X
    box("SHOP front pier %d" % side, (span, WALL_T, WALL_TOP - FLOOR_Z),
        (side * (HALF_W - span / 2), FRONT_Y, FLOOR_Z + (WALL_TOP - FLOOR_Z) / 2), M["cream"], walls, bevel=.04)
box("SHOP front under window", (WINDOW_X * 2, WALL_T, WINDOW_Z0 - FLOOR_Z),
    (0, FRONT_Y, FLOOR_Z + (WINDOW_Z0 - FLOOR_Z) / 2), M["teal"], walls, bevel=.04)
box("SHOP front above window", (WINDOW_X * 2, WALL_T, WALL_TOP - WINDOW_Z1),
    (0, FRONT_Y, WINDOW_Z1 + (WALL_TOP - WINDOW_Z1) / 2), M["cream"], walls, bevel=.04)

# Bubblegum pilasters with chrome caps on the front corners.
for side in (-1, 1):
    box("SHOP pilaster %d" % side, (.18, .14, WALL_TOP - FLOOR_Z - .1),
        (side * (WINDOW_X + .18), FRONT_Y + FACE * .1, FLOOR_Z + (WALL_TOP - FLOOR_Z - .1) / 2),
        M["pink"], walls, bevel=.03)

# Arcade window: a navy room with three glowing cabinets facing the street.
window_depth = .9
box("SHOP arcade interior", (WINDOW_X * 2, .1, WINDOW_Z1 - WINDOW_Z0), (0, FRONT_Y + 1.0,
    (WINDOW_Z0 + WINDOW_Z1) / 2), M["navy"], walls, bevel=0)
for index, (x, mat_key) in enumerate([(-1.2, "cabPink"), (0, "cabTeal"), (1.2, "cabViolet")]):
    box("SHOP cabinet %d" % index, (.7, .7, 1.0), (x, FRONT_Y + .42, WINDOW_Z0 + .55), M[mat_key], walls, bevel=.05)
    box("SHOP cabinet screen %d" % index, (.46, .03, .42), (x, FRONT_Y + .07, WINDOW_Z0 + .62),
        M["screen"], walls, bevel=.02)
    box("SHOP cabinet marquee %d" % index, (.7, .05, .14), (x, FRONT_Y + .42, WINDOW_Z0 + 1.07),
        M["bulb"], walls, bevel=.02)

# Right side of the front: a small ticket counter ledge in the pier.
box("SHOP ticket ledge", (.8, .4, .12), (2.2, FRONT_Y + FACE * .32, 1.1), M["mint"], walls, bevel=.04)

# ------------------------------------------------------------ SHOP BUILD marquee
marquee = pivot("SHOP BUILD marquee", parent=root)
box("SHOP marquee board", (WINDOW_X * 2 + 1.4, .2, WALL_TOP - WINDOW_Z1 + .02),
    (0, FRONT_Y + FACE * .02, (WINDOW_Z1 + WALL_TOP) / 2), M["plum"], marquee, bevel=.05)
bulb_count = 13
for index in range(bulb_count):
    x = -1.7 + index * (3.4 / (bulb_count - 1))
    sphere("SHOP marquee bulb %d" % index, (x, FRONT_Y + FACE * .14, WALL_TOP - .14),
           (.07, .07, .07), M["bulb"], marquee, 10, 8)
for index in range(bulb_count):
    x = -1.7 + index * (3.4 / (bulb_count - 1))
    sphere("SHOP marquee bulb low %d" % index, (x, FRONT_Y + FACE * .14, WINDOW_Z1 + .14),
           (.07, .07, .07), M["bulb"], marquee, 10, 8)

# ------------------------------------------------------------ SHOP BUILD roof
roof = pivot("SHOP BUILD roof", parent=root)
box("SHOP roof slab", (HALF_W * 2 + .5, HALF_D * 2 + .5, .2), (0, 0, WALL_TOP + .1), M["mint"], roof, bevel=.05)
box("SHOP roof fascia", (HALF_W * 2 + .5, .26, .42), (0, FRONT_Y + FACE * .2, WALL_TOP + .21), M["fascia"], roof, bevel=.04)
for index in range(9):
    x = -2.8 + index * .7
    box("SHOP fascia stripe %d" % index, (.36, .08, .28), (x, FRONT_Y + FACE * .38, WALL_TOP + .21),
        M["stripe"] if index % 2 else M["coral"], roof, bevel=.02)
for sx in (-1, 1):
    for sy in (-1, 1):
        sphere("SHOP chrome ball %d %d" % (sx, sy), (sx * (HALF_W + .15), sy * (HALF_D + .15), WALL_TOP + .34),
               (.14, .14, .14), M["chrome"], roof, 14, 10)

# ------------------------------------------------------------ SHOP BUILD balloons
balloons = pivot("SHOP BUILD balloons", parent=root)
bunches = [
    (-2.1, -.6, [(-.32, .0, .75, "coral", .34), (.26, .1, 1.0, "sun", .3), (.0, -.2, 1.36, "aqua", .32)]),
    (.7, 1.0, [(-.24, .08, .82, "violet", .3), (.3, -.08, .98, "coral", .34), (.02, .2, 1.4, "sun", .3)]),
    (2.3, -.5, [(-.28, .0, .8, "aqua", .32), (.24, .12, 1.04, "violet", .34), (0, -.1, 1.42, "coral", .3)]),
]
for index, (bx, by, puffs) in enumerate(bunches):
    base = WALL_TOP + .2
    for puff_index, (dx, dy, height, key, radius) in enumerate(puffs):
        px, py, pz = bx + dx, by + dy, base + height
        cylinder("SHOP balloon string %d %d" % (index, puff_index), (px, py, base + (pz - base) / 2 - .02),
                 .012, pz - base, M["string"], balloons, 6)
        sphere("SHOP balloon %d %d" % (index, puff_index), (px, py, pz), (radius, radius, radius * 1.22),
               M[key], balloons, 24, 16)
    cylinder("SHOP balloon weight %d" % index, (bx, by, base + .05), .14, .1, M["iron"], balloons, 10)

# ------------------------------------------------------------ SHOP BUILD site
site = pivot("SHOP BUILD site", parent=root)
SITE_Y = FRONT_Y - 1.5
for index in range(9):
    x = -2.0 + index * .5
    box("SHOP barrier stripe %d" % index, (.5, .12, .5), (x, SITE_Y, .72),
        M["hazardYellow"] if index % 2 else M["hazardBlack"], site, bevel=.02)
for x in (-2.3, 2.3):
    box("SHOP barrier leg %s" % x, (.1, .6, .14), (x, SITE_Y, .3), M["iron"], site, bevel=.02)
box("SHOP sign board", (1.9, .1, 1.1), (3.6, SITE_Y - .05, 1.4), M["hazardYellow"], site, bevel=.04)
for index in range(5):
    box("SHOP sign stripe %d" % index, (.22, .12, 1.2), (2.85 + index * .39, SITE_Y - .05, 1.4),
        M["hazardBlack"], site, bevel=.02, rotation=(0, math.radians(20), 0))
for x in (3.0, 4.2):
    box("SHOP sign post %s" % x, (.1, .1, 1.3), (x, SITE_Y, .65), M["iron"], site, bevel=.02)
box("SHOP crate stack base", (.8, .8, .8), (-3.8, SITE_Y + .3, .4), M["wood"], site, bevel=.05)
box("SHOP crate stack top", (.7, .7, .7), (-3.8, SITE_Y + .3, 1.15), M["wood"], site, bevel=.05,
    rotation=(0, math.radians(12), 0))
box("SHOP crate beside", (.7, .7, .7), (-2.9, SITE_Y + .1, .35), M["wood"], site, bevel=.05)

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
scene.world = bpy.data.worlds.new("Balloon arcade review mint morning")
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

camera_data = bpy.data.cameras.new("STAGE arcade store three-quarter")
camera = bpy.data.objects.new("STAGE arcade store three-quarter", camera_data)
bpy.context.collection.objects.link(camera)
camera.location = (7.5, -13.5, 5.2)
camera.rotation_euler = (Vector((0, 0, 2.1)) - Vector(camera.location)).to_track_quat("-Z", "Y").to_euler()
camera_data.type = "ORTHO"
camera_data.ortho_scale = 13.2
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
