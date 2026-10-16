"""Animal Balloon Farm: the poppy.

Run from repository root:
  blender --background --factory-startup --python art/blender/poppy.py
Add `-- --cycles` to render the review on the CPU where EEVEE has no GPU.

Regenerates, in public/assets/plants/:
  poppy.blend        editable source
  poppy.glb          the poppy the garden plants
  poppy-review.png   art-review render: sapling, nodding buds, in bloom, and
                     a bloom asking for care (aphids and a stray shoot)

Authoring frame matches blueberry_bush.py: Z-up, resting on z = 0 and centred
on the origin, so glTF lands the model in Three.js with +Y up.

A poppy is a small plant, so it gets a small bed rather than the bush's big
mound: a low dome of tilled earth with a few pebbles, about 0.6 m across. The
bed is what makes a poppy easy to see and to click on bare soil.

The game reads the model by node name (src/scene/poppy-visual.ts), all under
`PP_root`:

  PP_mound      tilled soil and pebbles; always shown
  PP_rosette    the lobed grey-green leaves at the base; grows in first
  PP_stalk_N    one flower stem (N = 1..3), pivoting at its base; the game
                stretches it as the poppy grows and bows it when thirsty
  PP_head_N     the flower on stalk N, placed at the stalk's tip. Holds
                PP_bud_N (a hairy nodding bud) and PP_bloom_N (the open cup).
  PP_aphids_N   a few aphids on stalk N, shown while pests are about
  PP_shoot      one leggy stray shoot, shown while the poppy wants a pinch

A head and its aphids are not children of their stalk (a stalk stretches
non-uniformly, which would squash them). The game keeps each one riding its
stalk instead: it measures where the head sits in the stalk's frame once, then
re-places it from the stalk every frame.

The petals share one material, `PP petal`. Verify with
`node scripts/inspect-glb.mjs public/assets/plants/poppy.glb`.
"""
from __future__ import annotations

import math
import random
import sys
from pathlib import Path

import bpy
from mathutils import Euler, Vector

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "public" / "assets" / "plants"
OUTPUT.mkdir(parents=True, exist_ok=True)
random.seed(1917)


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


def smooth(obj):
    for face in obj.data.polygons:
        face.use_smooth = True


def sphere(name, location, scale, mat, parent=None, segments=8, rings=5, rotation=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + "_mesh"
    obj.scale = scale
    if rotation is not None:
        obj.rotation_mode = "QUATERNION"
        obj.rotation_quaternion = rotation
    obj.data.materials.append(mat)
    smooth(obj)
    return parent_local(obj, parent, location)


def cone(name, location, radius_bottom, radius_top, depth, mat, parent=None, segments=6, rotation=None):
    bpy.ops.mesh.primitive_cone_add(vertices=segments, radius1=radius_bottom, radius2=radius_top, depth=depth, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + "_mesh"
    if rotation is not None:
        obj.rotation_mode = "QUATERNION"
        obj.rotation_quaternion = rotation
    obj.data.materials.append(mat)
    smooth(obj)
    return parent_local(obj, parent, location)


def torus(name, location, major, minor, mat, parent=None):
    bpy.ops.mesh.primitive_torus_add(major_segments=12, minor_segments=4, major_radius=major, minor_radius=minor, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + "_mesh"
    obj.data.materials.append(mat)
    smooth(obj)
    return parent_local(obj, parent, location)


def pivot(name, location=(0, 0, 0), parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = .08
    if parent:
        obj.parent = parent
        obj.matrix_parent_inverse.identity()
    obj.location = location
    return obj


def aim(direction, up_axis="Z"):
    """A rotation that turns the local `up_axis` to point along `direction`."""
    return Vector(direction).normalized().to_track_quat(up_axis, "Y")


def stick(name, start, end, radius_bottom, radius_top, mat, parent=None, segments=6):
    """A tapered cylinder from `start` to `end`, in the parent's space."""
    start = Vector(start)
    end = Vector(end)
    return cone(name, (start + end) / 2, radius_bottom, radius_top, (end - start).length, mat, parent, segments, aim(end - start))


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

M = {
    "soil": make_material("PP soil", "#7a5136", .92, 0, .02),
    "soilDark": make_material("PP soil shade", "#5a3a27", .95, 0, .01),
    "pebble": make_material("PP pebble", "#c9b9a0", .7, 0, .1),
    "pebbleDark": make_material("PP pebble shade", "#9c8f80", .75, 0, .08),
    "leaf": make_material("PP leaf", "#6f9a68", .55, 0, .25),
    "leafPale": make_material("PP leaf underside", "#93b685", .6, 0, .2),
    "stem": make_material("PP stem", "#6c9a5a", .5, 0, .2),
    "bud": make_material("PP bud", "#7fa86a", .55, 0, .3),
    "budSlit": make_material("PP bud slit", "#e03a28", .45, 0, .3),
    # One material for every petal, so the game can tint the poppy if it ever wants to.
    "petal": make_material("PP petal", "#e03a28", .42, 0, .45),
    "petalDeep": make_material("PP petal fold", "#bf2c24", .45, 0, .4),
    "blotch": make_material("PP blotch", "#2b1e2c", .55, 0, .2),
    "pod": make_material("PP seed pod", "#b7cf86", .5, 0, .3),
    "podCap": make_material("PP pod cap", "#4b3956", .5, 0, .2),
    "shoot": make_material("PP stray shoot", "#a9cf6a", .45, 0, .3),
    "aphid": make_material("PP aphid", "#9ccf4c", .35, 0, .5),
    "aphidEye": make_material("PP aphid eye", "#2a2430", .4, 0, .3),
    "stageFloor": make_material("STAGE buttercream floor", "#f6e6c6", .88, 0, .02),
    "stageBack": make_material("STAGE mint studio backdrop", "#a6d8cf", .9, 0, .02),
}

poppy = pivot("PP_root")
poppy["design_size"] = "about 0.6 m across the bed, 0.75 m tall in bloom"

# ------------------------------------------------------------------ the bed --

# A low dome of tilled earth, a darker rim, and a few pebbles: enough of a
# footprint to see and click, small enough to sit between other plants.
MOUND_R = .3
mound = pivot("PP_mound", parent=poppy)
sphere("PP_mound_soil", (0, 0, 0), (MOUND_R, MOUND_R, .065), M["soil"], mound, 16, 6)
sphere("PP_mound_rim", (0, 0, -.01), (MOUND_R + .035, MOUND_R + .035, .035), M["soilDark"], mound, 16, 5)
for index in range(7):
    angle = index * math.tau / 7 + random.uniform(-.3, .3)
    radius = random.uniform(.17, .28)
    x, y = math.cos(angle) * radius, math.sin(angle) * radius
    z = .065 * math.sqrt(max(0.0, 1 - (radius / MOUND_R) ** 2))
    size = random.uniform(.018, .03)
    tone = "pebble" if index % 3 else "pebbleDark"
    sphere(f"PP_mound_pebble_{index + 1}", (x, y, z), (size * 1.3, size, size * .6), M[tone], mound, 6, 4,
           Euler((0, 0, random.uniform(0, math.pi))).to_quaternion())

# ------------------------------------------------------------- the rosette --

# Poppy leaves are long, grey-green and deeply lobed. Each is a midrib balloon
# with two pairs of side lobes, arching up and out from the crown.
rosette = pivot("PP_rosette", parent=poppy)
for index in range(7):
    angle = index * math.tau / 7 + .2
    length = random.uniform(.15, .19)
    rise = math.radians(random.uniform(18, 30))
    out = Vector((math.cos(angle), math.sin(angle), 0))
    side = Vector((-math.sin(angle), math.cos(angle), 0))
    direction = (out * math.cos(rise) + Vector((0, 0, math.sin(rise)))).normalized()
    centre = Vector((0, 0, .055)) + direction * length * .55
    # Lay the leaf flat along its direction: long axis X, thin axis Z.
    lay = direction.to_track_quat("X", "Z")
    tone = "leaf" if index % 2 else "leafPale"
    sphere(f"PP_leaf_{index + 1}", centre, (length * .55, .03, .012), M[tone], rosette, 8, 5, lay)
    for lobe, t in enumerate((.35, .7)):
        for sign in (-1, 1):
            at = Vector((0, 0, .055)) + direction * length * (.2 + t * .7) + side * sign * .03
            lobe_dir = (direction + side * sign * .9).normalized()
            sphere(f"PP_leaf_{index + 1}_lobe_{lobe + 1}{'LR'[sign > 0]}", at, (.032, .016, .009), M["leaf"], rosette, 6, 4,
                   lobe_dir.to_track_quat("X", "Z"))

# --------------------------------------------------------- stalks and heads --

# Three flower stems of different heights, each a gentle curve leaning out a
# little. Each stalk pivots at its base; its head and aphids are siblings that
# the game keeps on the stalk (see the docstring).
STALKS = [
    # azimuth (deg), height, lean (m out at the top), head tilt (deg)
    (25, .64, .1, 10),
    (150, .52, .12, 16),
    (265, .44, .11, 20),
]


def stalk_point(base, out, height, lean, t):
    """A point on a stalk's curve, t = 0 at the base and 1 at the tip."""
    return base + out * lean * t ** 1.6 + Vector((0, 0, height * t))


for index, (azimuth, height, lean, tilt) in enumerate(STALKS, start=1):
    angle = math.radians(azimuth)
    out = Vector((math.cos(angle), math.sin(angle), 0))
    base = Vector((math.cos(angle) * .03, math.sin(angle) * .03, .05))
    stalk = pivot(f"PP_stalk_{index}", base, poppy)
    points = [stalk_point(Vector(), out, height, lean, t) for t in (0, .35, .7, 1)]
    for segment in range(3):
        radius = .012 - segment * .002
        stick(f"PP_stalk_{index}_stem_{segment + 1}", points[segment], points[segment + 1], radius, radius - .002, M["stem"], stalk)
    # A single small stem leaf low on the stalk.
    leaf_at = points[1] + out * .025
    sphere(f"PP_stalk_{index}_leaf", leaf_at, (.05, .016, .008), M["leaf"], stalk, 6, 4,
           (out + Vector((0, 0, .7))).normalized().to_track_quat("X", "Z"))

    tip = base + points[3]
    head = pivot(f"PP_head_{index}", tip, poppy)
    # The head leans the way its stalk does, so the cup faces up and a little out.
    head.rotation_mode = "QUATERNION"
    head.rotation_quaternion = aim(Vector((0, 0, 1)) + out * math.tan(math.radians(tilt)))

    # The bud: a hairy oval with a red slit of petal showing. It is authored
    # upright; the game nods the whole head over while it is a bud.
    bud = pivot(f"PP_bud_{index}", parent=head)
    sphere(f"PP_bud_{index}_body", (0, 0, .045), (.032, .032, .05), M["bud"], bud, 8, 6)
    sphere(f"PP_bud_{index}_slit", (0, -.026, .05), (.008, .012, .036), M["budSlit"], bud, 6, 4)
    sphere(f"PP_bud_{index}_neck", (0, 0, .004), (.014, .014, .012), M["stem"], bud, 6, 4)

    # The bloom: four big cupped petals in two pairs, a dark blotch at their
    # base, a ring of dark stamens, and the pale seed pod with its star cap.
    bloom = pivot(f"PP_bloom_{index}", parent=head)
    for petal in range(4):
        petal_angle = petal * math.tau / 4 + (math.pi / 4 if petal % 2 else 0)
        petal_out = Vector((math.cos(petal_angle), math.sin(petal_angle), 0))
        inner = petal % 2 == 1
        cup = math.radians(38 if inner else 26)
        reach = .06 if inner else .072
        direction = (petal_out * math.cos(cup) + Vector((0, 0, math.sin(cup)))).normalized()
        centre = Vector((0, 0, .02)) + direction * reach
        sphere(f"PP_bloom_{index}_petal_{petal + 1}", centre, (reach * 1.05, reach * .95, .012),
               M["petalDeep" if inner else "petal"], bloom, 10, 6, direction.to_track_quat("X", "Z"))
    sphere(f"PP_bloom_{index}_blotch", (0, 0, .024), (.034, .034, .008), M["blotch"], bloom, 10, 4)
    torus(f"PP_bloom_{index}_stamens", (0, 0, .03), .022, .007, M["blotch"], bloom)
    sphere(f"PP_bloom_{index}_pod", (0, 0, .038), (.016, .016, .017), M["pod"], bloom, 8, 5)
    cone(f"PP_bloom_{index}_cap", (0, 0, .055), .018, .004, .006, M["podCap"], bloom, 8)

    # Aphids: a little cluster three-quarters of the way up the stalk.
    aphid_at = base + stalk_point(Vector(), out, height, lean, .72)
    aphids = pivot(f"PP_aphids_{index}", aphid_at, poppy)
    side = Vector((-math.sin(angle), math.cos(angle), 0))
    for bug in range(3):
        around = side * (.016 if bug % 2 else -.016) + out * .006
        at = around + Vector((0, 0, (bug - 1) * .03))
        sphere(f"PP_aphids_{index}_{bug + 1}", at, (.011, .011, .015), M["aphid"], aphids, 6, 4)
        sphere(f"PP_aphids_{index}_{bug + 1}_eye", at + around.normalized() * .008 + Vector((0, 0, .011)),
               (.004, .004, .004), M["aphidEye"], aphids, 4, 3)

# ------------------------------------------------------------ stray shoot --

# What a pinch removes: one leggy, lighter shoot reaching sideways out of the
# rosette with a crooked little bud, so it reads as out of place.
shoot = pivot("PP_shoot", parent=poppy)
shoot_out = Vector((math.cos(math.radians(205)), math.sin(math.radians(205)), 0))
shoot_points = [Vector((0, 0, .06)), Vector((0, 0, .06)) + shoot_out * .14 + Vector((0, 0, .1)),
                Vector((0, 0, .06)) + shoot_out * .3 + Vector((0, 0, .16))]
for segment in range(2):
    stick(f"PP_shoot_stem_{segment + 1}", shoot_points[segment], shoot_points[segment + 1], .011, .008, M["shoot"], shoot)
sphere("PP_shoot_bud", shoot_points[2] + shoot_out * .015 + Vector((0, 0, -.012)), (.02, .02, .028), M["shoot"], shoot, 6, 4,
       aim(shoot_out + Vector((0, 0, -.6))))
for leaf_index, t in enumerate((.35, .65)):
    at = shoot_points[0].lerp(shoot_points[2], t)
    side = Vector((-shoot_out.y, shoot_out.x, 0)) * (1 if leaf_index % 2 else -1)
    sphere(f"PP_shoot_leaf_{leaf_index + 1}", at + side * .03, (.04, .014, .008), M["shoot"], shoot, 6, 4,
           (side + Vector((0, 0, .5))).normalized().to_track_quat("X", "Z"))

# ------------------------------------------------------------ review render --

scene = bpy.context.scene
engines = [item.identifier for item in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
if "--cycles" in sys.argv:
    # For machines without a GPU (cloud containers), where EEVEE cannot start.
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 64
    scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = 1400, 700
scene.render.resolution_percentage = 100
scene.eevee.taa_render_samples = 48
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.view_settings.exposure = .2
scene.world = bpy.data.worlds.new("Poppy review: mint fairground morning")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = color_rgba("#b7dcd2")
scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = .68

bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, -.03))
floor = bpy.context.object
floor.name = "STAGE floor"
floor.data.materials.append(M["stageFloor"])
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 6, 3))
backdrop = bpy.context.object
backdrop.name = "STAGE backdrop"
backdrop.dimensions = (60, .25, 12)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
backdrop.data.materials.append(M["stageBack"])

camera_data = bpy.data.cameras.new("STAGE camera")
camera = bpy.data.objects.new("STAGE camera", camera_data)
bpy.context.collection.objects.link(camera)
camera.location = (0, -6.5, 2.8)
camera.rotation_euler = (Vector((0, 0, .3)) - Vector(camera.location)).to_track_quat("-Z", "Y").to_euler()
camera_data.type = "ORTHO"
camera_data.ortho_scale = 3.3
scene.camera = camera

for name, location, energy, size, tint in [
    ("STAGE LIGHT warm key", (3, -6, 7), 900, 5, (1.0, .93, .82)),
    ("STAGE LIGHT cool fill", (-6, -3, 4), 500, 5, (.76, .92, 1.0)),
    ("STAGE LIGHT soft rim", (5, 4, 6), 650, 4, (1.0, .82, .72)),
]:
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = tint
    lamp = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(lamp)
    lamp.location = location
    lamp.rotation_euler = (Vector((0, 0, .4)) - lamp.location).to_track_quat("-Z", "Y").to_euler()


def named(root, prefix):
    return [obj for obj in root.children_recursive if obj.name.startswith(prefix)]


def show_tree(obj, shown):
    obj.hide_render = not shown
    for child in obj.children_recursive:
        child.hide_render = not shown


def stage_copy(location, stalk_scale, bud, bloom, aphids, shoot_shown, rosette_scale=1.0):
    """A linked copy of the poppy posed at one moment of its life, for the portrait."""
    mapping = {}
    for obj in [poppy, *poppy.children_recursive]:
        dup = obj.copy()
        bpy.context.collection.objects.link(dup)
        mapping[obj] = dup
    for obj, dup in mapping.items():
        if obj.parent in mapping:
            dup.parent = mapping[obj.parent]
    copy_root = mapping[poppy]
    copy_root.location = location
    for obj, dup in mapping.items():
        if obj.name.startswith("PP_stalk_") and obj.parent is poppy:
            dup.scale = (.6 + .4 * stalk_scale, .6 + .4 * stalk_scale, stalk_scale)
        if obj.parent is poppy and obj.type == "EMPTY" and (obj.name.startswith("PP_head_") or obj.name.startswith("PP_aphids_")):
            # Ride the shortened stalk, as the game does.
            index = obj.name.rsplit("_", 1)[1]
            stalk = bpy.data.objects[f"PP_stalk_{index}"]
            offset = obj.location - stalk.location
            dup.location = stalk.location + Vector((offset.x * (.6 + .4 * stalk_scale), offset.y * (.6 + .4 * stalk_scale), offset.z * stalk_scale))
        if obj.parent is poppy and obj.name.startswith("PP_head_") and bud and not bloom:
            # A bud nods over on its neck.
            dup.rotation_quaternion = obj.rotation_quaternion @ Euler((math.radians(150), 0, 0)).to_quaternion()
    mapping[rosette].scale = (rosette_scale, rosette_scale, rosette_scale)
    for obj, dup in mapping.items():
        if obj.name.startswith("PP_bud_") and obj.type == "EMPTY":
            show_tree(dup, bud and not bloom)
        if obj.name.startswith("PP_bloom_") and obj.type == "EMPTY":
            show_tree(dup, bloom)
        if obj.name.startswith("PP_aphids_") and obj.type == "EMPTY":
            show_tree(dup, aphids)
        if obj.name == "PP_shoot":
            show_tree(dup, shoot_shown)
    return copy_root


# The portrait: a sapling, nodding buds, in bloom, and a bloom asking for care.
review_copies = [
    stage_copy((-1.2, 0, 0), .15, False, False, False, False, rosette_scale=.55),
    stage_copy((-.4, 0, 0), .7, True, False, False, False),
    stage_copy((.4, 0, 0), 1, False, True, False, False),
    stage_copy((1.2, 0, 0), 1, False, True, True, True),
]
show_tree(poppy, False)

blend_path = OUTPUT / "poppy.blend"
render_path = OUTPUT / "poppy-review.png"
scene.render.filepath = str(render_path)
if "--no-render" not in sys.argv:
    bpy.ops.render.render(write_still=True)

# The saved source keeps only the model and the stage, not the portrait copies.
for copy_root in review_copies:
    for obj in [copy_root, *copy_root.children_recursive]:
        bpy.data.objects.remove(obj, do_unlink=True)
show_tree(poppy, True)
bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))

flatten_material_colours()


def select_tree(obj):
    obj.select_set(True)
    for child in obj.children:
        select_tree(child)


bpy.ops.object.select_all(action="DESELECT")
select_tree(poppy)
bpy.context.view_layer.objects.active = poppy
bpy.ops.export_scene.gltf(
    filepath=str(OUTPUT / "poppy.glb"), export_format="GLB", use_selection=True,
    export_apply=True, export_animations=False, export_materials="EXPORT", export_texcoords=False,
    export_cameras=False, export_lights=False,
)
print("Poppy Blender source:", blend_path)
print("Poppy art review:", render_path)
print("Poppy GLB:", OUTPUT / "poppy.glb")
