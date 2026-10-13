"""Animal Balloon Farm: the blueberry bush and its garden critters.

Run from repository root:
  blender --background --factory-startup --python art/blender/blueberry_bush.py

Regenerates, in public/assets/plants/:
  blueberry-bush.blend   editable source for both models below
  blueberry-bush.glb     the bush the garden plants
  garden-critters.glb    the cast of the bush's care minigames
  blueberry-review.png   art-review render of the bush and the cast

Authoring frame matches oak_tree.py: Z-up, resting on z = 0 and centred on the
origin, so glTF lands each model in Three.js with +Y up.

The game reads these models by node name (GLTFLoader turns spaces into
underscores, so names here already use underscores):

blueberry-bush.glb, under `BB_root`:
  BB_mound    soil and pine-needle mulch; always shown
  BB_canes    the woody red canes; always shown
  BB_canopy   the leaf balloons; grows in with the bush
  BB_shoots   three leggy shoots that stick out while the bush wants pruning
  BB_flowers  white bells, shown mid-growth
  BB_berries  the berries; material `BB berry` is re-tinted green -> pink ->
              blue at runtime as they ripen, so it must stay its own material

garden-critters.glb, one root per critter, each centred on its own origin:
  CRITTER_beetle    the pest; its wings are the pivots CRITTER_beetle_wing_L/_R
  CRITTER_ladybug   the friend you must not swat
  CRITTER_leaf      a leaf to slice, built as two halves CRITTER_leaf_half_L/_R
  CRITTER_cloud     the rain cloud, with a sleepy face on its -Y side
  CRITTER_swatter   the fly swatter, handle along +Z, mesh face toward -Y
  CRITTER_hedgehog  the pruning helper, facing -Y

Each node group is a pivot in src/scene/garden-plants.ts, which merges the
meshes inside a group but never across groups, so a group can be hidden or
scaled on its own. Verify with `node scripts/inspect-glb.mjs <glb>`.
"""
from __future__ import annotations

import math
import random
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "public" / "assets" / "plants"
OUTPUT.mkdir(parents=True, exist_ok=True)
random.seed(4471)


def color_rgba(value: str):
    raw = value.lstrip("#")
    rgb = [int(raw[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    rgb = [c / 12.92 if c < .04045 else ((c + .055) / 1.055) ** 2.4 for c in rgb]
    return (*rgb, 1.0)


def make_material(name, value, roughness=.75, metallic=0.0, coat=.06, alpha=1.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color_rgba(value)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color_rgba(value)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Coat Weight"].default_value = coat
    shader.inputs["Coat Roughness"].default_value = .26
    if alpha < 1.0:
        shader.inputs["Alpha"].default_value = alpha
        if hasattr(mat, "surface_render_method"):
            mat.surface_render_method = "BLENDED"
        else:
            mat.blend_method = "BLEND"
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


def sphere(name, location, scale, mat, parent=None, segments=12, rings=8, rotation=None):
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


def cone(name, location, radius_bottom, radius_top, depth, mat, parent=None, segments=10, rotation=None):
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


def box(name, location, size, mat, parent=None, bevel=0.0, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + "_mesh"
    obj.scale = size
    obj.rotation_euler = rotation
    obj.data.materials.append(mat)
    if bevel > 0:
        modifier = obj.modifiers.new("soft", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
    return parent_local(obj, parent, location)


def pivot(name, location=(0, 0, 0), parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = .15
    if parent:
        obj.parent = parent
        obj.matrix_parent_inverse.identity()
    obj.location = location
    return obj


def aim(direction, up_axis="Z"):
    """A rotation that turns the local `up_axis` to point along `direction`."""
    return Vector(direction).normalized().to_track_quat(up_axis, "Y")


def stick(name, start, end, radius_bottom, radius_top, mat, parent=None, segments=8):
    """A tapered cylinder from `start` to `end`."""
    start = Vector(start)
    end = Vector(end)
    middle = (start + end) / 2
    return cone(name, middle, radius_bottom, radius_top, (end - start).length, mat, parent, segments, aim(end - start))


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


def dome_point(azimuth, elevation, radius_xy, radius_z, centre_z):
    """A point on the canopy's squashed dome, and the outward normal there."""
    x = math.cos(azimuth) * math.cos(elevation) * radius_xy
    y = math.sin(azimuth) * math.cos(elevation) * radius_xy
    z = centre_z + math.sin(elevation) * radius_z
    normal = Vector((x / radius_xy ** 2, y / radius_xy ** 2, (z - centre_z) / radius_z ** 2)).normalized()
    return Vector((x, y, z)), normal


# Fresh authoring scene; the named outputs below are intentionally regenerated.
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for collection in (bpy.data.meshes, bpy.data.curves, bpy.data.materials,
                   bpy.data.cameras, bpy.data.lights, bpy.data.worlds, bpy.data.actions):
    for block in list(collection):
        if block.users == 0:
            collection.remove(block)

M = {
    "soil": make_material("BB soil", "#6a4630", .92, 0, .02),
    "soilDark": make_material("BB soil shade", "#4f3324", .95, 0, .01),
    "needle": make_material("BB pine mulch", "#b8743d", .8, 0, .04),
    "cane": make_material("BB cane", "#8d4a3c", .62, 0, .1),
    "leafDeep": make_material("BB deep leaf balloon", "#36704a", .34, .01, .5),
    "leaf": make_material("BB leaf balloon", "#4c9058", .32, .01, .52),
    "leafBlue": make_material("BB blue-green leaf balloon", "#4f8f7c", .32, .01, .52),
    "leafBright": make_material("BB sunlit leaf balloon", "#79b660", .3, .01, .54),
    "leafTip": make_material("BB leaf tip", "#5ea35a", .4, 0, .35),
    "shoot": make_material("BB stray shoot", "#9bc85b", .45, 0, .3),
    "bell": make_material("BB flower bell", "#fbf2e6", .45, 0, .3),
    "blush": make_material("BB flower blush", "#f1b9c8", .45, 0, .3),
    # Re-tinted per plant at runtime (green -> pink -> blue): keep it its own material.
    "berry": make_material("BB berry", "#3e4f9f", .38, 0, .55),
    "crown": make_material("BB berry crown", "#2a2b52", .6, 0, .1),
    # Critters.
    "shell": make_material("CRITTER beetle shell", "#5b3b97", .22, .05, .9),
    "shellGlint": make_material("CRITTER beetle shell glint", "#3d9b7a", .22, .05, .9),
    "bugBlack": make_material("CRITTER bug black", "#24202a", .4, 0, .4),
    "eyeWhite": make_material("CRITTER eye white", "#fffaf0", .3, 0, .4),
    "wing": make_material("CRITTER wing", "#d9f0ff", .2, 0, .3, alpha=.55),
    "ladyRed": make_material("CRITTER ladybug red", "#e0432f", .24, 0, .9),
    "leafSlice": make_material("CRITTER slice leaf", "#5aa257", .4, 0, .4),
    "leafRib": make_material("CRITTER slice leaf rib", "#b7dc7a", .5, 0, .2),
    "cloud": make_material("CRITTER cloud", "#f4f7fb", .55, 0, .25),
    "cloudShade": make_material("CRITTER cloud shade", "#c9d3e3", .6, 0, .2),
    "cheek": make_material("CRITTER cheek", "#f4a3b5", .5, 0, .2),
    "handle": make_material("CRITTER swatter handle", "#e2603f", .3, 0, .6),
    "grip": make_material("CRITTER swatter grip", "#f5d05a", .4, 0, .4),
    "mesh": make_material("CRITTER swatter mesh", "#4fae66", .35, 0, .5),
    "hogSpine": make_material("CRITTER hedgehog spines", "#8a5a3a", .6, 0, .1),
    "hogFace": make_material("CRITTER hedgehog face", "#f1d7b0", .55, 0, .15),
    "steel": make_material("CRITTER shears steel", "#cfd8de", .2, .8, .3),
    "stageFloor": make_material("STAGE buttercream floor", "#f6e6c6", .88, 0, .02),
    "stageBack": make_material("STAGE mint studio backdrop", "#a6d8cf", .9, 0, .02),
}

# ---------------------------------------------------------------- the bush --

bush = pivot("BB_root")
bush["design_size"] = "about 1.1 m across, 1 m tall"

CANOPY_Z = .46
CANOPY_RXY = .42
CANOPY_RZ = .3

# Soil: a low mound of dark earth with a ring of pine-needle mulch, the
# blueberry's sour bed.
mound = pivot("BB_mound", parent=bush)
sphere("BB_mound_soil", (0, 0, 0), (.5, .5, .1), M["soil"], mound, 18, 8)
sphere("BB_mound_rim", (0, 0, -.015), (.56, .56, .06), M["soilDark"], mound, 18, 6)
for index in range(18):
    angle = index * math.tau / 18 + random.uniform(-.15, .15)
    radius = random.uniform(.24, .48)
    x, y = math.cos(angle) * radius, math.sin(angle) * radius
    z = .1 * math.sqrt(max(0.0, 1 - (radius / .5) ** 2)) + .006
    yaw = angle + random.uniform(.8, 2.3)
    half = Vector((math.cos(yaw), math.sin(yaw), random.uniform(-.08, .08))) * .07
    stick(f"BB_mound_needle_{index + 1}", Vector((x, y, z)) - half, Vector((x, y, z)) + half, .009, .006, M["needle"], mound, 4)

# Canes: a fan of woody red stems from the crown of the root.
canes = pivot("BB_canes", parent=bush)
for index in range(6):
    angle = index * math.tau / 6 + .25
    reach = random.uniform(.18, .27)
    top = Vector((math.cos(angle) * reach, math.sin(angle) * reach, random.uniform(.42, .56)))
    stick(f"BB_cane_{index + 1}", (0, 0, .05), top, .034, .018, M["cane"], canes, 7)

# Canopy: a squashed dome of leaf balloons in four greens, then small pointed
# leaves standing out of it so the silhouette reads as leafy, not lumpy.
canopy = pivot("BB_canopy", parent=bush)
CANOPY_BALLS = [
    # azimuth (deg), elevation (deg), radius, tone
    (0, -24, .23, "leaf"), (45, -18, .21, "leafDeep"), (90, -26, .23, "leafBlue"), (135, -18, .21, "leaf"),
    (180, -24, .23, "leafDeep"), (225, -16, .21, "leafBlue"), (270, -26, .23, "leaf"), (315, -18, .21, "leafDeep"),
    (20, 38, .2, "leafBright"), (100, 40, .19, "leaf"), (175, 36, .2, "leafBright"), (250, 40, .19, "leafBlue"),
    (320, 35, .19, "leafBright"), (0, 90, .2, "leafBright"),
]
for index, (azimuth, elevation, radius, tone) in enumerate(CANOPY_BALLS):
    point, _normal = dome_point(math.radians(azimuth), math.radians(elevation), CANOPY_RXY * .72, CANOPY_RZ * .72, CANOPY_Z)
    sphere(f"BB_canopy_ball_{index + 1}", point, (radius, radius * .96, radius * .84), M[tone], canopy, 10, 7)
for index in range(22):
    azimuth = index * 2.399 + random.uniform(-.2, .2)
    elevation = math.asin(min(.95, -.45 + 1.35 * ((index + .5) / 22)))
    point, normal = dome_point(azimuth, elevation, CANOPY_RXY * 1.02, CANOPY_RZ * 1.02, CANOPY_Z)
    # The leaf's long axis points outward and a little up, like a real leaf.
    direction = (normal + Vector((0, 0, .35))).normalized()
    # Broad and flat, like a real blueberry leaf, so the tips read as leaves and not thorns.
    sphere(f"BB_canopy_leaf_{index + 1}", point + direction * .025, (.055, .012, .085), M["leafTip"], canopy, 6, 4, aim(direction))

# Stray shoots: what pruning cuts. Three leggy, lighter-green shoots that
# overshoot the dome, each with a few leaves along it.
shoots = pivot("BB_shoots", parent=bush)
for index, (azimuth, rise) in enumerate(((35, .55), (160, .35), (275, .7))):
    angle = math.radians(azimuth)
    start = Vector((math.cos(angle) * .2, math.sin(angle) * .2, .5))
    end = start + Vector((math.cos(angle) * .45, math.sin(angle) * .45, rise * .5))
    stick(f"BB_shoot_{index + 1}_stem", start, end, .016, .009, M["shoot"], shoots, 6)
    for leaf_index in range(3):
        t = .45 + leaf_index * .25
        at = start.lerp(end, t)
        side = 1 if leaf_index % 2 else -1
        direction = Vector((-math.sin(angle) * side, math.cos(angle) * side, .6)).normalized()
        sphere(f"BB_shoot_{index + 1}_leaf_{leaf_index + 1}", at + direction * .045, (.03, .012, .07), M["shoot"], shoots, 6, 4, aim(direction))

# Flowers: little upside-down bells, three to a cluster, on the outside of the dome.
flowers = pivot("BB_flowers", parent=bush)
for cluster in range(8):
    azimuth = cluster * math.tau / 8 + .3
    elevation = math.radians(random.uniform(-5, 40))
    point, normal = dome_point(azimuth, elevation, CANOPY_RXY * 1.05, CANOPY_RZ * 1.05, CANOPY_Z)
    tangent = normal.cross(Vector((0, 0, 1))).normalized()
    for bell in range(3):
        offset = tangent * ((bell - 1) * .045) + Vector((0, 0, -abs(bell - 1) * .02))
        at = point + normal * .02 + offset
        sphere(f"BB_flower_{cluster + 1}_{bell + 1}", at, (.024, .024, .03), M["bell"], flowers, 7, 4)
        sphere(f"BB_flower_{cluster + 1}_{bell + 1}_lip", at + Vector((0, 0, -.026)), (.018, .018, .008), M["blush"], flowers, 6, 3)

# Berries: clusters of three or four, hanging just outside the leaves, each
# with the little star-shaped crown real blueberries carry.
berries = pivot("BB_berries", parent=bush)
for cluster in range(9):
    azimuth = cluster * math.tau / 9 + .62
    elevation = math.radians(random.uniform(-15, 35))
    point, normal = dome_point(azimuth, elevation, CANOPY_RXY * 1.02, CANOPY_RZ * 1.02, CANOPY_Z)
    tangent = normal.cross(Vector((0, 0, 1))).normalized()
    count = 4 if cluster % 2 else 3
    for berry in range(count):
        spread = (berry - (count - 1) / 2) * .07
        at = point + normal * .05 + tangent * spread + Vector((0, 0, -abs(spread) * .6 - .02))
        radius = random.uniform(.042, .052)
        sphere(f"BB_berry_{cluster + 1}_{berry + 1}", at, (radius, radius, radius * .92), M["berry"], berries, 8, 5)
        cone(f"BB_berry_{cluster + 1}_{berry + 1}_crown", at + normal * radius * .92, .016, .01, .012, M["crown"], berries, 5, aim(normal))

# -------------------------------------------------------------- the critters --

critters = []


def add_critter(name, location):
    root = pivot(name, location)
    critters.append(root)
    return root


def googly_eyes(prefix, parent, centre, spacing, size, facing=Vector((0, -1, 0))):
    side = Vector((1, 0, 0))
    for label, sign in (("L", -1), ("R", 1)):
        eye = Vector(centre) + side * sign * spacing
        sphere(f"{prefix}_eye_{label}", eye, (size, size, size), M["eyeWhite"], parent, 10, 6)
        sphere(f"{prefix}_pupil_{label}", eye + facing * size * .7, (size * .5, size * .5, size * .5), M["bugBlack"], parent, 8, 5)


# Beetle: a glossy jewel-shelled berry thief, about 0.2 m long, facing -Y.
beetle = add_critter("CRITTER_beetle", (-2.0, 0, .4))
sphere("CRITTER_beetle_belly", (0, .01, 0), (.075, .1, .045), M["bugBlack"], beetle, 12, 8)
for label, sign in (("L", -1), ("R", 1)):
    sphere(f"CRITTER_beetle_shell_{label}", (sign * .04, .02, .03), (.05, .1, .05), M["shell"], beetle, 12, 8)
    sphere(f"CRITTER_beetle_glint_{label}", (sign * .045, -.01, .065), (.022, .05, .012), M["shellGlint"], beetle, 8, 4)
sphere("CRITTER_beetle_head", (0, -.1, .015), (.05, .045, .04), M["bugBlack"], beetle, 10, 6)
googly_eyes("CRITTER_beetle", beetle, (0, -.135, .04), .025, .02)
for label, sign in (("L", -1), ("R", 1)):
    stick(f"CRITTER_beetle_antenna_{label}", (sign * .015, -.13, .05), (sign * .05, -.19, .11), .005, .003, M["bugBlack"], beetle, 4)
    sphere(f"CRITTER_beetle_antenna_tip_{label}", (sign * .05, -.19, .11), (.01, .01, .01), M["bugBlack"], beetle, 6, 4)
    for leg in range(3):
        y = -.04 + leg * .045
        stick(f"CRITTER_beetle_leg_{label}_{leg + 1}", (sign * .05, y, -.02), (sign * .1, y + (leg - 1) * .02, -.06), .007, .005, M["bugBlack"], beetle, 4)
    # Wings: their own pivots at the shoulder, so the game can flap them.
    wing_pivot = pivot(f"CRITTER_beetle_wing_{label}", (sign * .02, -.02, .07), beetle)
    sphere(f"CRITTER_beetle_wing_{label}_membrane", (sign * .07, .05, .01), (.07, .035, .006), M["wing"], wing_pivot, 10, 4)

# Ladybug: round, red, spotted, friendly.
lady = add_critter("CRITTER_ladybug", (-1.6, 0, .4))
sphere("CRITTER_ladybug_belly", (0, 0, -.01), (.07, .08, .035), M["bugBlack"], lady, 12, 6)
sphere("CRITTER_ladybug_shell", (0, .01, .02), (.075, .085, .055), M["ladyRed"], lady, 14, 8)
for index, (x, y) in enumerate(((-.035, -.03), (.035, -.03), (-.045, .025), (.045, .025), (0, .055), (0, -.005))):
    z = .02 + .055 * math.sqrt(max(0.0, 1 - (x / .075) ** 2 - ((y - .01) / .085) ** 2)) - .004
    sphere(f"CRITTER_ladybug_spot_{index + 1}", (x, y, z), (.014, .014, .006), M["bugBlack"], lady, 8, 4)
sphere("CRITTER_ladybug_head", (0, -.075, .01), (.038, .03, .03), M["bugBlack"], lady, 10, 6)
googly_eyes("CRITTER_ladybug", lady, (0, -.1, .025), .018, .013)

# Leaf to slice: two mirrored halves either side of the midrib.
leaf = add_critter("CRITTER_leaf", (-1.2, 0, .4))
for label, sign in (("L", -1), ("R", 1)):
    half = pivot(f"CRITTER_leaf_half_{label}", (0, 0, 0), leaf)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=1, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = f"CRITTER_leaf_blade_{label}"
    obj.data.name = obj.name + "_mesh"
    # Keep only the half of the ellipsoid on this side of the midrib.
    mesh = obj.data
    for vertex in mesh.vertices:
        if vertex.co.x * sign < 0:
            vertex.co.x = 0
    obj.scale = (.07, .14, .012)
    obj.data.materials.append(M["leafSlice"])
    smooth(obj)
    parent_local(obj, half, (0, 0, 0))
    stick(f"CRITTER_leaf_vein_{label}", (0, -.02, .006), (sign * .045, .05, .006), .003, .002, M["leafRib"], half, 4)
stick("CRITTER_leaf_midrib", (0, -.15, .008), (0, .13, .008), .004, .002, M["leafRib"], leaf, 4)

# Rain cloud: soft balloon puffs with a sleepy face and rosy cheeks.
cloud = add_critter("CRITTER_cloud", (-.55, 0, .75))
for index, (x, z, radius, tone) in enumerate((
    (0, .04, .2, "cloud"), (-.19, -.02, .15, "cloud"), (.19, -.02, .155, "cloud"),
    (-.09, .14, .14, "cloud"), (.1, .13, .13, "cloud"), (-.31, -.06, .1, "cloudShade"),
    (.32, -.06, .1, "cloudShade"), (0, -.09, .14, "cloudShade"),
)):
    sphere(f"CRITTER_cloud_puff_{index + 1}", (x, 0, z), (radius, radius * .82, radius * .9), M[tone], cloud, 14, 9)
for label, sign in (("L", -1), ("R", 1)):
    # Closed, smiling eyes: little dark arcs.
    for step in range(6):
        t = step / 5
        x = sign * .07 + (t - .5) * .05
        z = .04 + math.sin(t * math.pi) * .012
        sphere(f"CRITTER_cloud_lash_{label}_{step + 1}", (x, -.17, z), (.009, .006, .008), M["bugBlack"], cloud, 5, 3)
    sphere(f"CRITTER_cloud_cheek_{label}", (sign * .12, -.155, -.005), (.03, .006, .018), M["cheek"], cloud, 8, 4)

# Fly swatter: a red handle and a green mesh paddle, about 0.55 m long.
swatter = add_critter("CRITTER_swatter", (.05, 0, .1))
stick("CRITTER_swatter_handle", (0, 0, 0), (0, 0, .36), .016, .012, M["handle"], swatter, 10)
stick("CRITTER_swatter_grip", (0, 0, -.02), (0, 0, .12), .021, .021, M["grip"], swatter, 10)
sphere("CRITTER_swatter_knob", (0, 0, -.025), (.024, .024, .02), M["grip"], swatter, 10, 6)
box("CRITTER_swatter_paddle", (0, 0, .47), (.2, .012, .22), M["mesh"], swatter, .02)
for index in range(5):
    offset = -.07 + index * .035
    box(f"CRITTER_swatter_rib_v_{index + 1}", (offset, -.009, .47), (.008, .006, .2), M["grip"], swatter)
    box(f"CRITTER_swatter_rib_h_{index + 1}", (0, -.009, .47 + offset), (.18, .006, .008), M["grip"], swatter)

# Hedgehog: the pruning helper, a spiky little gardener with shears.
hog = add_critter("CRITTER_hedgehog", (.62, -.3, .0))
sphere("CRITTER_hedgehog_body", (0, .02, .13), (.13, .15, .11), M["hogSpine"], hog, 14, 9)
for index in range(22):
    azimuth = index * 2.399
    elevation = math.asin(min(.9, -.1 + .95 * ((index + .5) / 22)))
    direction = Vector((math.cos(azimuth) * math.cos(elevation), abs(math.sin(azimuth)) * math.cos(elevation) * .9 + .25, math.sin(elevation))).normalized()
    base = Vector((0, .02, .13)) + Vector((direction.x * .12, direction.y * .13, direction.z * .1))
    cone(f"CRITTER_hedgehog_spine_{index + 1}", base + direction * .03, .022, .002, .07, M["hogSpine"], hog, 5, aim(direction))
sphere("CRITTER_hedgehog_face", (0, -.1, .11), (.08, .08, .07), M["hogFace"], hog, 12, 8)
sphere("CRITTER_hedgehog_snout", (0, -.18, .1), (.035, .05, .03), M["hogFace"], hog, 10, 6)
sphere("CRITTER_hedgehog_nose", (0, -.225, .105), (.016, .016, .015), M["bugBlack"], hog, 8, 5)
for label, sign in (("L", -1), ("R", 1)):
    sphere(f"CRITTER_hedgehog_eye_{label}", (sign * .035, -.155, .14), (.014, .012, .016), M["bugBlack"], hog, 8, 5)
    sphere(f"CRITTER_hedgehog_cheek_{label}", (sign * .055, -.155, .1), (.018, .008, .012), M["cheek"], hog, 8, 4)
    sphere(f"CRITTER_hedgehog_foot_{label}", (sign * .07, -.06, .015), (.03, .04, .018), M["hogFace"], hog, 8, 5)
# Shears held out front.
for label, sign in (("L", -1), ("R", 1)):
    stick(f"CRITTER_hedgehog_shear_blade_{label}", (sign * .02, -.2, .07), (-sign * .03, -.33, .09), .009, .003, M["steel"], hog, 5)
    sphere(f"CRITTER_hedgehog_shear_loop_{label}", (sign * .045, -.17, .06), (.022, .022, .008), M["handle"], hog, 8, 4)

# ------------------------------------------------------------ review render --

scene = bpy.context.scene
engines = [item.identifier for item in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
scene.render.resolution_x, scene.render.resolution_y = 1400, 900
scene.render.resolution_percentage = 100
scene.eevee.taa_render_samples = 48
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.view_settings.exposure = .2
scene.world = bpy.data.worlds.new("Blueberry review: mint fairground morning")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = color_rgba("#b7dcd2")
scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = .68

bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, -.05))
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
camera.location = (.2, -6.5, 2.6)
camera.rotation_euler = (Vector((-.15, 0, .45)) - Vector(camera.location)).to_track_quat("-Z", "Y").to_euler()
camera_data.type = "ORTHO"
camera_data.ortho_scale = 4.6
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

# The swatter lies across the stage for the portrait; it exports upright.
swatter.rotation_euler = (0, math.radians(-55), 0)
bush.location = (1.45, 0, 0)

blend_path = OUTPUT / "blueberry-bush.blend"
render_path = OUTPUT / "blueberry-review.png"
scene.render.filepath = str(render_path)
if "--no-render" not in sys.argv:
    bpy.ops.render.render(write_still=True)
bush.location = (0, 0, 0)
swatter.rotation_euler = (0, 0, 0)
bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))

flatten_material_colours()


def select_tree(obj):
    obj.select_set(True)
    for child in obj.children:
        select_tree(child)


def export(roots, path):
    bpy.ops.object.select_all(action="DESELECT")
    for root in roots:
        select_tree(root)
    bpy.context.view_layer.objects.active = roots[0]
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", use_selection=True,
        export_apply=True, export_animations=False, export_materials="EXPORT", export_texcoords=False,
        export_cameras=False, export_lights=False,
    )


# Critters export side by side as authored; the game re-centres each on its root.
saved = [(root, root.location.copy()) for root in critters]
for root, _location in saved:
    root.location = (0, 0, 0)
export([bush], OUTPUT / "blueberry-bush.glb")
export(critters, OUTPUT / "garden-critters.glb")
for root, location in saved:
    root.location = location
print("Blueberry Blender source:", blend_path)
print("Blueberry art review:", render_path)
print("Blueberry GLB:", OUTPUT / "blueberry-bush.glb")
print("Critters GLB:", OUTPUT / "garden-critters.glb")
