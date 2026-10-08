"""Animal Balloon Farm: the chicken coop the shop sells.

Run from repository root:
  blender --background --factory-startup --python art/blender/chicken_coop.py

Regenerates public/assets/props/coop.blend, coop-review.png and coop.glb. Like
barn_prop.py and oak_tree.py it is its own script, so rebuilding the coop never
touches the approved fountain, statue and fence in shop_props.py.

A cream hen house on legs with a terracotta gable roof, a round pop-hole and a
cleated ramp down into a little fenced run, with a nest box on the flank.

Authoring frame matches shop_props.py: Z-up, resting on z = 0 and centred on the
origin in X/Y. The ramp and the run face -Y, which glTF turns into +Z, the way a
placed prop faces the default camera. Two lattice cells (4 m) square.
"""
from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "public" / "assets" / "props"
OUTPUT.mkdir(parents=True, exist_ok=True)

HX = 1.25          # house half-width (x)
Y0, Y1 = 0.15, 2.0  # house front / back (y)
YC = (Y0 + Y1) / 2
HALF_D = (Y1 - Y0) / 2
FLOOR = 0.5        # floor height: the house stands on legs
EAVE = 1.65
RIDGE = 2.6
RUN_X = 1.85       # run half-width
RUN_FRONT = -1.85


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


def box(name, location, size, mat, parent=None, bevel=.03, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + " · mesh"
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = obj.modifiers.new("soft", "BEVEL")
        mod.width = min(bevel, min(size) * .45)
        mod.segments = 2
        bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.data.materials.append(mat)
    for face in obj.data.polygons:
        face.use_smooth = True
    obj.rotation_euler = rotation
    return parent_local(obj, parent, location)


def cylinder(name, location, radius, depth, mat, parent=None, axis="Z", segments=20):
    bpy.ops.mesh.primitive_cylinder_add(vertices=segments, radius=radius, depth=depth, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + " · mesh"
    obj.data.materials.append(mat)
    for face in obj.data.polygons:
        face.use_smooth = len(face.vertices) == 4
    if axis == "Y":
        obj.rotation_euler = (math.pi / 2, 0, 0)
    elif axis == "X":
        obj.rotation_euler = (0, math.pi / 2, 0)
    return parent_local(obj, parent, location)


def gable(name, y, mat, flip, parent=None):
    """A triangular wall under the roof, in the XZ plane at the given y."""
    mesh = bpy.data.meshes.new(name + " · mesh")
    verts = [(-HX, y, EAVE), (HX, y, EAVE), (0, y, RIDGE)]
    mesh.from_pydata(verts, [], [(2, 1, 0) if flip else (0, 1, 2)])
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    if parent:
        obj.parent = parent
        obj.matrix_parent_inverse.identity()
    return obj


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


# Fresh authoring scene; the named outputs below are intentionally regenerated.
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for collection in (bpy.data.meshes, bpy.data.curves, bpy.data.materials,
                   bpy.data.cameras, bpy.data.lights, bpy.data.worlds, bpy.data.actions):
    for block in list(collection):
        if block.users == 0:
            collection.remove(block)

M = {
    "wall": make_material("COOP · cream clapboard", "#f1dca4", .6, 0, .12),
    "wallDark": make_material("COOP · shaded clapboard", "#d9c186", .62, 0, .1),
    "trim": make_material("COOP · teal trim", "#3e8c88", .55, 0, .16),
    "roof": make_material("COOP · terracotta shingles", "#c4604a", .62, 0, .14),
    "roofDark": make_material("COOP · roof ridge", "#9a4636", .66, 0, .1),
    "dark": make_material("COOP · dark opening", "#3c2a24", .75, 0, .03),
    "wood": make_material("COOP · weathered wood", "#a77b4c", .78, 0, .05),
    "woodDark": make_material("COOP · dark wood", "#7b5632", .8, 0, .04),
    "straw": make_material("COOP · straw bedding", "#e6c477", .9, 0, .02),
    "ground": make_material("COOP · packed earth", "#c9a66b", .95, 0, .0),
    "wire": make_material("COOP · fence wire", "#9aa5a3", .45, .55, .05),
    "metal": make_material("COOP · tin feeder", "#c9ced0", .4, .6, .1),
    "water": make_material("COOP · drinker water", "#78c3d6", .15, 0, .3),
    "stageFloor": make_material("STAGE · buttercream floor", "#f6e6c6", .88, 0, .02),
    "stageBack": make_material("STAGE · mint studio backdrop", "#a6d8cf", .9, 0, .02),
}

root = pivot("PROP COOP · export root", (0, 0, 0))
root["asset_id"] = "coop"
root["design_size"] = "2 x 2 cells, about 2.7 m tall"
root["description"] = "Cream hen house with a pop-hole, ramp, nest box and fenced run"

# --- the hen house -----------------------------------------------------------
for sx in (-1, 1):
    for y in (Y0 + .16, Y1 - .16):
        box(f"COOP · leg {sx}{y:.1f}", (sx * (HX - .14), y, FLOOR / 2), (.16, .16, FLOOR), M["woodDark"], root, .02)
box("COOP · floor", (0, YC, FLOOR), (HX * 2 + .1, HALF_D * 2 + .1, .12), M["woodDark"], root, .03)
box("COOP · body", (0, YC, FLOOR + .06 + (EAVE - FLOOR - .06) / 2), (HX * 2, HALF_D * 2, EAVE - FLOOR - .06), M["wall"], root, .04)
# Clapboard lines: thin dark strips across the front and sides.
for index in range(4):
    z = FLOOR + .3 + index * .26
    box(f"COOP · front board {index}", (0, Y0 - .012, z), (HX * 2 - .1, .02, .035), M["wallDark"], root, 0)
    for sx in (-1, 1):
        box(f"COOP · side board {sx}{index}", (sx * (HX + .012), YC, z), (.02, HALF_D * 2 - .1, .035), M["wallDark"], root, 0)
gable("COOP · front gable", Y0 - .001, M["wall"], False, root)
gable("COOP · back gable", Y1 + .001, M["wallDark"], True, root)

# Corner boards in teal.
for sx in (-1, 1):
    for y in (Y0, Y1):
        box(f"COOP · corner board {sx}{y}", (sx * HX, y, FLOOR + .06 + (EAVE - FLOOR - .06) / 2), (.14, .14, EAVE - FLOOR - .06), M["trim"], root, .02)

# Gable roof with generous eaves.
slope = math.atan2(RIDGE - EAVE, HX)
slab_len = math.hypot(HX, RIDGE - EAVE) + .34
for side in (-1, 1):
    box(f"COOP · roof slab {'east' if side > 0 else 'west'}",
        (side * (HX / 2 + .04), YC, (EAVE + RIDGE) / 2 + .1), (slab_len, HALF_D * 2 + .5, .14), M["roof"], root, .04,
        rotation=(0, side * slope, 0))
    # Shingle courses: thin ribs laid across the slope, placed along its own axis.
    angle = side * slope
    centre = Vector((side * (HX / 2 + .04), YC, (EAVE + RIDGE) / 2 + .1))
    along_axis = Vector((math.cos(angle), 0, -math.sin(angle)))
    normal_axis = Vector((math.sin(angle), 0, math.cos(angle)))
    for course in range(3):
        u = -slab_len / 2 + .55 + course * .5
        at = centre + along_axis * u + normal_axis * .09
        box(f"COOP · shingle course {side}{course}", tuple(at), (.07, HALF_D * 2 + .46, .05), M["roofDark"], root, 0,
            rotation=(0, angle, 0))
ridge = cylinder("COOP · ridge cap", (0, YC, RIDGE + .12), .09, HALF_D * 2 + .52, M["roofDark"], root, "Y", 12)
# Round vent in the gable.
cylinder("COOP · gable vent frame", (0, Y0 - .02, 2.12), .2, .05, M["trim"], root, "Y", 24)
cylinder("COOP · gable vent", (0, Y0 - .045, 2.12), .14, .05, M["dark"], root, "Y", 24)

# Pop-hole: an arched doorway with a teal frame, and the ramp down to the run.
DOOR_X = -.5
box("COOP · pop door frame", (DOOR_X, Y0 - .02, FLOOR + .52), (.7, .05, .78), M["trim"], root, .02)
cylinder("COOP · pop door arch frame", (DOOR_X, Y0 - .02, FLOOR + .9), .35, .05, M["trim"], root, "Y", 24)
box("COOP · pop door", (DOOR_X, Y0 - .045, FLOOR + .44), (.5, .05, .62), M["dark"], root, .01)
cylinder("COOP · pop door arch", (DOOR_X, Y0 - .045, FLOOR + .75), .25, .05, M["dark"], root, "Y", 24)
box("COOP · door sill", (DOOR_X, Y0 - .1, FLOOR + .1), (.74, .22, .06), M["trim"], root, .015)

ramp_run = 1.05
ramp_rise = FLOOR + .06
ramp_len = math.hypot(ramp_run, ramp_rise)
ramp_angle = math.atan2(ramp_rise, ramp_run)
ramp_cy = Y0 - .15 - ramp_run / 2
box("COOP · ramp", (DOOR_X, ramp_cy, ramp_rise / 2 + .02), (.5, ramp_len, .07), M["wood"], root, .015, rotation=(ramp_angle, 0, 0))
for index in range(5):
    t = (index + .8) / 5.6
    cy = Y0 - .15 - ramp_run * (1 - t) - 0.0
    cz = .02 + ramp_rise * t
    box(f"COOP · ramp cleat {index}", (DOOR_X, Y0 - .15 - ramp_run + ramp_run * t, cz + .05), (.46, .05, .04), M["woodDark"], root, 0,
        rotation=(ramp_angle, 0, 0))

# A window with shutters on the other half of the front.
WIN_X = .55
box("COOP · window frame", (WIN_X, Y0 - .02, FLOOR + .66), (.52, .05, .46), M["trim"], root, .015)
box("COOP · window pane", (WIN_X, Y0 - .04, FLOOR + .66), (.4, .05, .34), M["dark"], root, .01)
box("COOP · window mullion", (WIN_X, Y0 - .055, FLOOR + .66), (.04, .03, .34), M["trim"], root, 0)
for side in (-1, 1):
    box(f"COOP · shutter {side}", (WIN_X + side * .34, Y0 - .03, FLOOR + .66), (.15, .04, .46), M["trim"], root, .015)
box("COOP · flower box", (WIN_X, Y0 - .13, FLOOR + .38), (.6, .14, .1), M["woodDark"], root, .02)
for index in range(3):
    from_x = WIN_X - .2 + index * .2
    sphere = bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=8, radius=.07, location=(0, 0, 0))
    bloom = bpy.context.object
    bloom.name = f"COOP · bloom {index}"
    bloom.data.name = bloom.name + " · mesh"
    bloom.data.materials.append(M["roof"])
    parent_local(bloom, root, (from_x, Y0 - .13, FLOOR + .47))

# --- the nest box on the right flank ------------------------------------------
NEST_X = HX + .42
for y in (YC - .25, YC + .25):
    box(f"COOP · nest leg {y:.2f}", (NEST_X + .2, y, .32), (.1, .1, .64), M["woodDark"], root, .015)
box("COOP · nest box", (NEST_X, YC, .64 + .3), (.8, .78, .6), M["wall"], root, .04)
box("COOP · nest lid", (NEST_X + .03, YC, .64 + .66), (.98, .94, .08), M["roof"], root, .03, rotation=(0, .26, 0))
box("COOP · nest hatch", (NEST_X + .41, YC, .64 + .3), (.03, .5, .4), M["trim"], root, .01)
bpy.ops.mesh.primitive_uv_sphere_add(segments=14, ring_count=10, radius=1, location=(0, 0, 0))
straw = bpy.context.object
straw.name = "COOP · nest straw"
straw.data.name = straw.name + " · mesh"
straw.scale = (.3, .3, .08)
straw.data.materials.append(M["straw"])
parent_local(straw, root, (NEST_X, YC, .64 + .6))

# --- the run ---------------------------------------------------------------------
box("COOP · run ground", (0, (RUN_FRONT + Y0) / 2, .02), (RUN_X * 2, Y0 - RUN_FRONT, .04), M["ground"], root, .02)
POST_H = 1.0
for x in (-RUN_X, 0, RUN_X):
    box(f"COOP · front post {x}", (x, RUN_FRONT, POST_H / 2), (.13, .13, POST_H), M["wood"], root, .02)
for x in (-RUN_X, RUN_X):
    box(f"COOP · rear post {x}", (x, Y0 - .06, POST_H / 2), (.13, .13, POST_H), M["wood"], root, .02)
    box(f"COOP · mid post {x}", (x, (RUN_FRONT + Y0) / 2, POST_H / 2), (.13, .13, POST_H), M["wood"], root, .02)
rail_span_y = Y0 - RUN_FRONT
for z in (.96, .42):
    box(f"COOP · front rail {z}", (0, RUN_FRONT, z), (RUN_X * 2, .07, .08), M["wood"], root, .015)
    for x in (-RUN_X, RUN_X):
        box(f"COOP · side rail {x}{z}", (x, (RUN_FRONT + Y0) / 2, z), (.07, rail_span_y, .08), M["wood"], root, .015)
# Short rear return either side of the house.
for sx in (-1, 1):
    seg = RUN_X - HX
    box(f"COOP · rear rail {sx}", (sx * (HX + seg / 2), Y0 - .06, .96), (seg, .07, .08), M["wood"], root, .015)
    box(f"COOP · rear rail low {sx}", (sx * (HX + seg / 2), Y0 - .06, .42), (seg, .07, .08), M["wood"], root, .015)
# Wire mesh as thin vertical strands between the rails.
for index in range(19):
    x = -RUN_X + .1 + index * (RUN_X * 2 - .2) / 18
    box(f"COOP · front wire {index}", (x, RUN_FRONT, .69), (.025, .025, .5), M["wire"], root, 0)
for sx in (-1, 1):
    for index in range(10):
        y = RUN_FRONT + .12 + index * (rail_span_y - .24) / 9
        box(f"COOP · side wire {sx}{index}", (sx * RUN_X, y, .69), (.025, .025, .5), M["wire"], root, 0)

# Run furniture: a tin feeder and a drinker.
cylinder("COOP · feeder", (1.15, -1.25, .11), .22, .14, M["metal"], root, "Z", 20)
cylinder("COOP · feed", (1.15, -1.25, .185), .18, .02, M["straw"], root, "Z", 20)
cylinder("COOP · drinker", (-1.2, -1.3, .1), .19, .12, M["trim"], root, "Z", 20)
cylinder("COOP · drinker water", (-1.2, -1.3, .165), .16, .02, M["water"], root, "Z", 20)
box("COOP · perch", (-1.1, -.3, .3), (.12, .12, .62), M["woodDark"], root, .015)
box("COOP · perch bar", (-1.1, -.3, .6), (.12, .9, .09), M["wood"], root, .02, rotation=(0, 0, math.radians(90)))

# Contact-sheet stage, excluded from the export selection.
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE_NEXT"
scene.render.resolution_x, scene.render.resolution_y = 1000, 900
scene.render.resolution_percentage = 100
scene.eevee.taa_render_samples = 64
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.view_settings.exposure = .2
scene.render.threads_mode = "FIXED"
scene.render.threads = 8
scene.world = bpy.data.worlds.new("Coop review · mint fairground morning")
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

camera_data = bpy.data.cameras.new("STAGE · coop camera")
camera = bpy.data.objects.new("STAGE · coop camera", camera_data)
bpy.context.collection.objects.link(camera)
camera.location = (7, -12, 7.0)
camera.rotation_euler = (Vector((0, 0.1, 1.2)) - Vector(camera.location)).to_track_quat("-Z", "Y").to_euler()
camera_data.type = "ORTHO"
camera_data.ortho_scale = 7.2
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

blend_path = OUTPUT / "coop.blend"
render_path = OUTPUT / "coop-review.png"
scene.render.filepath = str(render_path)
bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
bpy.ops.render.render(write_still=True)

bpy.ops.object.select_all(action="DESELECT")


def select_tree(obj):
    obj.select_set(True)
    for child in obj.children:
        select_tree(child)


select_tree(root)
bpy.context.view_layer.objects.active = root
glb_path = OUTPUT / "coop.glb"
bpy.ops.export_scene.gltf(
    filepath=str(glb_path), export_format="GLB", use_selection=True,
    export_apply=True, export_animations=False, export_materials="EXPORT",
    export_cameras=False, export_lights=False,
)
print("Coop Blender source:", blend_path)
print("Coop art review:", render_path)
print("Coop GLB:", glb_path)
