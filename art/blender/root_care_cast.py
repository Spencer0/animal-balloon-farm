"""Animal Balloon Farm: the root vegetable's care cast (barrel climb, bug breakout, trim pong).

Run from repository root:
  blender --background --factory-startup --python art/blender/root_care_cast.py
Add `-- --cycles` to render the review on the CPU where EEVEE has no GPU.

Regenerates, in public/assets/plants/:
  root-care-cast.blend        editable source for the cast
  root-care-cast.glb          the cast, one root per critter
  root-care-cast-review.png   art-review render of the cast side by side

Sizes are metres, relative to a ~1 m stage. Authoring frame matches
flower_care_cast.py: Z-up, each critter on its own origin (the export zeroes
every root), so glTF lands each one in Three.js with +Y up and Blender's -Y
(the side facing the review camera) toward the game camera (+Z).

The game reads these models by node name:

  CRITTER_pea         trim pong's ball, a glossy green pea about 0.1 m across
  CRITTER_trowel      trim pong's bat: a garden trowel, blade up, about 0.36 m tall
  CRITTER_shoot       a wild shoot that trim pong trims, about 0.5 m tall from its base
  CRITTER_hoe         bug breakout's paddle: a hoe blade about 0.5 m wide, handle toward -Y
  CRITTER_pebble      bug breakout's ball, a speckled pebble about 0.1 m across
  CRITTER_grub        a fat white root grub, about 0.18 m long, head toward -Y
  CRITTER_beetle      a striped potato beetle, about 0.18 m long, head toward -Y
  CRITTER_shellbug    a shiny shelled beetle (takes two hits), about 0.2 m long, head toward -Y
  CRITTER_barrel      a rolling barrel, its axis along Y (toward the camera), about 0.28 m across
  CRITTER_gopher      the barrel thief, sitting, about 0.5 m tall, facing -Y
                      arm_L / arm_R  shoulder pivots; rotate about local X to swing a throw
  CRITTER_can         the hero: a little watering can on legs, about 0.36 m tall, facing -Y
                      with its spout to +X (the way it walks)
                      leg_L / leg_R  hip pivots; rotate about the depth axis (Blender Y,
                                     glTF Z) to swing a leg forward and back
  CRITTER_rainbarrel  the stolen rain barrel, upright and brimming, about 0.55 m tall

Verify with `node scripts/inspect-glb.mjs public/assets/plants/root-care-cast.glb`.
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
random.seed(4471)


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


def box(name, location, size, mat, parent=None, rotation=None, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + "_mesh"
    obj.scale = size
    if rotation is not None:
        obj.rotation_mode = "QUATERNION"
        obj.rotation_quaternion = rotation
    obj.data.materials.append(mat)
    if bevel > 0:
        modifier = obj.modifiers.new("soft", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
    return parent_local(obj, parent, location)


def torus(name, location, major, minor, mat, parent=None, rotation=None, segments=20):
    bpy.ops.mesh.primitive_torus_add(major_segments=segments, minor_segments=4, major_radius=major, minor_radius=minor, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + "_mesh"
    if rotation is not None:
        obj.rotation_mode = "QUATERNION"
        obj.rotation_quaternion = rotation
    obj.data.materials.append(mat)
    smooth(obj)
    return parent_local(obj, parent, location)


def pivot(name, location=(0, 0, 0), parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = .06
    if parent:
        obj.parent = parent
        obj.matrix_parent_inverse.identity()
    obj.location = location
    return obj


def aim(direction, up_axis="Z"):
    return Vector(direction).normalized().to_track_quat(up_axis, "Y")


def stick(name, start, end, radius_bottom, radius_top, mat, parent=None, segments=8):
    start = Vector(start)
    end = Vector(end)
    return cone(name, (start + end) / 2, radius_bottom, radius_top, (end - start).length, mat, parent, segments, aim(end - start))


def tube(name, points, radii, mat, parent, sides=8):
    """One continuous lofted tube through `points` (parent-local)."""
    verts, faces, rings = [], [], []
    for i, p in enumerate(points):
        a = points[max(i - 1, 0)]
        b = points[min(i + 1, len(points) - 1)]
        tangent = (b - a).normalized()
        u = tangent.cross(Vector((0, 1, 0)))
        if u.length < 1e-4:
            u = tangent.cross(Vector((1, 0, 0)))
        u.normalize()
        v = tangent.cross(u).normalized()
        rings.append(len(verts))
        for k in range(sides):
            angle = math.tau * k / sides
            verts.append(p + u * (math.cos(angle) * radii[i]) + v * (math.sin(angle) * radii[i]))
    for i in range(len(points) - 1):
        s0, s1 = rings[i], rings[i + 1]
        for k in range(sides):
            k2 = (k + 1) % sides
            faces.append((s0 + k, s0 + k2, s1 + k2, s1 + k))
    for end, ring, flip in ((points[0], rings[0], True), (points[-1], rings[-1], False)):
        centre = len(verts)
        verts.append(end)
        for k in range(sides):
            a, b = ring + k, ring + (k + 1) % sides
            faces.append((centre, b, a) if flip else (centre, a, b))
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata([tuple(v) for v in verts], [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.matrix_parent_inverse.identity()
    obj.data.materials.append(mat)
    smooth(obj)
    return obj


def lathe(name, profile, mat, parent, sides=16, axis="Z", location=(0, 0, 0)):
    """A surface of revolution through (radius, height) pairs, capped, around local Z (or Y)."""
    verts, faces = [], []
    for radius, height in profile:
        for k in range(sides):
            angle = math.tau * k / sides
            x, y = math.cos(angle) * radius, math.sin(angle) * radius
            verts.append((x, height, y) if axis == "Y" else (x, y, height))
    for i in range(len(profile) - 1):
        for k in range(sides):
            a, b = i * sides + k, i * sides + (k + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    for ring, flip in ((0, True), (len(profile) - 1, False)):
        centre = len(verts)
        height = profile[ring][1]
        verts.append((0, height, 0) if axis == "Y" else (0, 0, height))
        for k in range(sides):
            a, b = ring * sides + k, ring * sides + (k + 1) % sides
            faces.append((centre, b, a) if flip else (centre, a, b))
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata(verts, [], faces)
    if axis == "Y":
        mesh.flip_normals()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    smooth(obj)
    return parent_local(obj, parent, location)


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


def googly(prefix, parent, eyes, size):
    """White googly eyes; each pupil sits off-centre so it looks like it is rolling."""
    for label, centre, look in eyes:
        sphere(f"{prefix}_eye_{label}", centre, (size, size, size), M["eyeWhite"], parent, 8, 5)
        look = Vector(look).normalized()
        sphere(f"{prefix}_pupil_{label}", Vector(centre) + look * size * .62, (size * .5,) * 3, M["pupil"], parent, 6, 4)


def add_critter(name, x, z=0):
    """A critter root laid out at (x, z) for the review. The export zeroes it again."""
    root = pivot(name, (x, 0, z))
    critters.append(root)
    return root


# Fresh authoring scene; the named outputs below are intentionally regenerated.
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for collection in (bpy.data.meshes, bpy.data.curves, bpy.data.materials,
                   bpy.data.cameras, bpy.data.lights, bpy.data.worlds, bpy.data.actions):
    for block in list(collection):
        if block.users == 0:
            collection.remove(block)

M = {
    "eyeWhite": make_material("ROOT eye white", "#fffaf0", .3, 0, .4),
    "pupil": make_material("ROOT pupil", "#24202a", .4, 0, .4),
    "cheek": make_material("ROOT cheek", "#f4a3b5", .5, 0, .2),
    # Pea and pebble.
    "pea": make_material("ROOT pea", "#7cc24a", .3, 0, .6),
    "peaShine": make_material("ROOT pea shine", "#e9ffd0", .2, 0, .4),
    "pebble": make_material("ROOT pebble", "#a9a39a", .55, 0, .35),
    "pebbleFleck": make_material("ROOT pebble fleck", "#6f6a64", .6, 0, .2),
    # Tools.
    # The game's stage has no environment map, so a fully metallic part renders
    # near black there: steel and brass stay mostly diffuse, with a glossy coat.
    "steel": make_material("ROOT trowel steel", "#c9d3db", .3, .3, .5),
    "steelDark": make_material("ROOT steel shade", "#97a2ab", .35, .3, .4),
    "wood": make_material("ROOT handle wood", "#c98a4b", .5, 0, .2),
    "woodDark": make_material("ROOT handle wood dark", "#94603a", .55, 0, .15),
    "paint": make_material("ROOT tool paint", "#d9573b", .4, 0, .5),
    "brass": make_material("ROOT brass", "#d9a441", .35, .3, .4),
    # Shoot.
    "shoot": make_material("ROOT wild shoot", "#a6cf5a", .45, 0, .3),
    "shootLeaf": make_material("ROOT wild shoot leaf", "#7fb84a", .45, 0, .3),
    "shootTip": make_material("ROOT wild shoot tip", "#d6ec7a", .4, 0, .35),
    # Bugs.
    "grub": make_material("ROOT grub", "#f3ead2", .45, 0, .4),
    "grubFold": make_material("ROOT grub fold", "#ddd0b0", .5, 0, .3),
    "grubHead": make_material("ROOT grub head", "#b5642c", .4, 0, .4),
    "beetle": make_material("ROOT potato beetle shell", "#f0d27a", .3, 0, .6),
    "stripe": make_material("ROOT beetle stripe", "#2b2226", .35, 0, .5),
    "beetleHead": make_material("ROOT beetle head", "#d77a2e", .4, 0, .4),
    "shell": make_material("ROOT shellbug shell", "#3d8a6a", .2, .55, .8),
    "shellSheen": make_material("ROOT shellbug sheen", "#7a5ab5", .2, .55, .8),
    "bugLeg": make_material("ROOT bug leg", "#3a2d2a", .5, 0, .1),
    # Barrels.
    "stave": make_material("ROOT barrel stave", "#b57a43", .6, 0, .15),
    "staveDark": make_material("ROOT barrel stave seam", "#7f522c", .65, 0, .1),
    "hoop": make_material("ROOT barrel hoop", "#5c5c66", .4, .3, .3),
    "water": make_material("ROOT rain water", "#5ab4e0", .08, 0, .8),
    # Gopher.
    "fur": make_material("ROOT gopher fur", "#9a6a43", .75, 0, .05),
    "furLight": make_material("ROOT gopher belly", "#d9b48a", .75, 0, .05),
    "nose": make_material("ROOT gopher nose", "#e58aa0", .4, 0, .3),
    "tooth": make_material("ROOT gopher tooth", "#fff6e0", .3, 0, .4),
    "brow": make_material("ROOT gopher brow", "#4a3020", .6, 0, .1),
    "claw": make_material("ROOT gopher claw", "#efe2c8", .5, 0, .2),
    # The watering can.
    "can": make_material("ROOT can body", "#3fa59a", .3, .1, .6),
    "canDark": make_material("ROOT can rim", "#2c7d74", .35, .1, .5),
    "rose": make_material("ROOT can rose", "#e4b54a", .3, .3, .4),
    "boot": make_material("ROOT can boot", "#d9573b", .4, 0, .4),
    # Review stage (never exported).
    "stageFloor": make_material("STAGE buttercream floor", "#f6e6c6", .88, 0, .02),
    "stageBack": make_material("STAGE mint studio backdrop", "#a6d8cf", .9, 0, .02),
}

critters = []

# ------------------------------------------------------------ pea, pebble --

pea = add_critter("CRITTER_pea", -.95, .55)
sphere("CRITTER_pea_body", (0, 0, 0), (.05, .05, .05), M["pea"], pea, 12, 7)
sphere("CRITTER_pea_shine", (-.018, -.03, .025), (.012, .008, .01), M["peaShine"], pea, 6, 4)

pebble = add_critter("CRITTER_pebble", -.75, .55)
sphere("CRITTER_pebble_body", (0, 0, 0), (.055, .05, .045), M["pebble"], pebble, 10, 6)
for index in range(6):
    angle = index * 2.4
    at = Vector((math.cos(angle) * .04, math.sin(angle) * .036, (index % 3 - 1) * .022))
    sphere(f"CRITTER_pebble_fleck_{index + 1}", at, (.008, .008, .004), M["pebbleFleck"], pebble, 5, 3, aim(at))

# ---------------------------------------------------------------- trowel --
# Blade up, its scoop facing +Y (away from the camera), the wooden handle below.
trowel = add_critter("CRITTER_trowel", -.95, -.05)
blade_profile = [(-.001, .0), (.055, .03), (.07, .09), (.06, .15), (.035, .2), (.0, .23)]
blade_points = []
for half, z in blade_profile:
    blade_points.append((half, z))
blade_verts, blade_faces = [], []
for i, (half, z) in enumerate(blade_profile):
    for k, x in enumerate((-half, -half * .5, 0, half * .5, half)):
        # The scoop curves back toward +Y at its edges.
        y = .02 * (abs(x) / max(half, 1e-4)) ** 2 if half > 0 else 0
        blade_verts.append((x, y, z + .14))
for i in range(len(blade_profile) - 1):
    for k in range(4):
        a = i * 5 + k
        blade_faces.append((a, a + 1, a + 6, a + 5))
mesh = bpy.data.meshes.new("CRITTER_trowel_blade_mesh")
mesh.from_pydata(blade_verts, [], blade_faces)
mesh.update()
blade = bpy.data.objects.new("CRITTER_trowel_blade", mesh)
bpy.context.collection.objects.link(blade)
blade.parent = trowel
blade.data.materials.append(M["steel"])
smooth(blade)
solid = blade.modifiers.new("thickness", "SOLIDIFY")
solid.thickness = .008
stick("CRITTER_trowel_neck", (0, 0, .105), (0, .01, .15), .012, .01, M["steelDark"], trowel, 8)
cone("CRITTER_trowel_ferrule", (0, 0, .1), .02, .018, .02, M["brass"], trowel, 10)
lathe("CRITTER_trowel_handle", [(.012, 0), (.022, .015), (.024, .05), (.02, .085), (.018, .09)], M["wood"], trowel, 10)
torus("CRITTER_trowel_band", (0, 0, .03), .023, .004, M["paint"], trowel, segments=12)

# ----------------------------------------------------------------- shoot --
# A leggy, crooked wild shoot: pale stem, a few leaves, a curled bright tip.
shoot = add_critter("CRITTER_shoot", -.6, -.35)
shoot_points = [Vector((0, 0, 0)), Vector((.02, 0, .14)), Vector((-.03, .01, .28)), Vector((.03, 0, .4)), Vector((.08, 0, .46))]
tube("CRITTER_shoot_stem", shoot_points, [.014, .012, .01, .008, .006], M["shoot"], shoot, 7)
for index, (t, side) in enumerate(((.25, 1), (.5, -1), (.72, 1))):
    at = shoot_points[1].lerp(shoot_points[3], t)
    direction = Vector((side * .9, -.2, .5)).normalized()
    sphere(f"CRITTER_shoot_leaf_{index + 1}", at + direction * .045, (.05, .022, .007), M["shootLeaf"], shoot, 8, 4, direction.to_track_quat("X", "Z"))
sphere("CRITTER_shoot_tip", shoot_points[-1] + Vector((.015, 0, -.012)), (.026, .02, .022), M["shootTip"], shoot, 8, 5)
torus("CRITTER_shoot_curl", shoot_points[-1] + Vector((.02, 0, .012)), .018, .005, M["shootTip"], shoot, Euler((math.pi / 2, 0, 0)).to_quaternion(), 10)

# ------------------------------------------------------------------- hoe --
# A wide steel blade with a red-painted band; the handle stub runs toward -Y.
hoe = add_critter("CRITTER_hoe", -.25, -.35)
box("CRITTER_hoe_blade", (0, .02, .03), (.5, .03, .06), M["steel"], hoe, bevel=.008)
box("CRITTER_hoe_edge", (0, .036, .008), (.5, .012, .014), M["steelDark"], hoe)
box("CRITTER_hoe_band", (0, .0, .045), (.5, .012, .02), M["paint"], hoe)
stick("CRITTER_hoe_neck", (0, .0, .05), (0, -.05, .065), .012, .012, M["steelDark"], hoe, 8)
cone("CRITTER_hoe_ferrule", (0, -.065, .068), .02, .02, .03, M["brass"], hoe, 10, aim((0, -1, .1)))
stick("CRITTER_hoe_handle", (0, -.08, .07), (0, -.26, .1), .02, .018, M["wood"], hoe, 10)

# ----------------------------------------------------------------- bugs ---
# All three crawl head-first toward -Y (the hoe), seen mostly from above.
grub = add_critter("CRITTER_grub", .05, -.35)
for index in range(5):
    t = index / 4
    angle = math.radians(-70 + 140 * t)
    at = Vector((math.cos(angle) * .05 - .03, math.sin(angle) * .065, .03))
    size = .036 - abs(t - .45) * .02
    sphere(f"CRITTER_grub_segment_{index + 1}", at, (size, size * .9, size * .85), M["grub" if index % 2 else "grubFold"], grub, 8, 5)
sphere("CRITTER_grub_head", (.0, -.085, .03), (.026, .024, .024), M["grubHead"], grub, 8, 5)
googly("CRITTER_grub", grub, (("L", (.012, -.102, .045), (0, -1, .3)), ("R", (-.012, -.102, .045), (0, -1, .3))), .009)

beetle = add_critter("CRITTER_beetle", .3, -.35)
sphere("CRITTER_beetle_shell", (0, 0, .04), (.065, .085, .045), M["beetle"], beetle, 12, 6)
for stripe in (-2, -1, 0, 1, 2):
    sphere(f"CRITTER_beetle_stripe_{stripe + 3}", (stripe * .022, .005, .04 + .042 * math.cos(stripe * .4)), (.006, .07, .01), M["stripe"], beetle, 6, 4,
           Euler((0, stripe * .35, 0)).to_quaternion())
sphere("CRITTER_beetle_head", (0, -.09, .035), (.03, .025, .024), M["beetleHead"], beetle, 8, 5)
googly("CRITTER_beetle", beetle, (("L", (.016, -.108, .05), (0, -1, .3)), ("R", (-.016, -.108, .05), (0, -1, .3))), .011)
for side, label in ((1, "L"), (-1, "R")):
    for step, y in enumerate((-.04, .0, .04)):
        stick(f"CRITTER_beetle_leg_{label}_{step + 1}", (side * .055, y, .02), (side * .09, y + (step - 1) * .015, .0), .006, .004, M["bugLeg"], beetle, 4)

shellbug = add_critter("CRITTER_shellbug", .55, -.35)
sphere("CRITTER_shellbug_shell_L", (.034, .005, .045), (.04, .095, .05), M["shell"], shellbug, 10, 6)
sphere("CRITTER_shellbug_shell_R", (-.034, .005, .045), (.04, .095, .05), M["shell"], shellbug, 10, 6)
sphere("CRITTER_shellbug_sheen_L", (.04, .025, .085), (.014, .04, .008), M["shellSheen"], shellbug, 8, 4)
sphere("CRITTER_shellbug_sheen_R", (-.028, .025, .085), (.014, .04, .008), M["shellSheen"], shellbug, 8, 4)
sphere("CRITTER_shellbug_head", (0, -.1, .035), (.03, .025, .024), M["bugLeg"], shellbug, 8, 5)
for side in (1, -1):
    stick(f"CRITTER_shellbug_horn_{'LR'[side > 0]}", (side * .012, -.115, .045), (side * .03, -.15, .07), .006, .002, M["bugLeg"], shellbug, 4)
googly("CRITTER_shellbug", shellbug, (("L", (.016, -.118, .05), (0, -1, .3)), ("R", (-.016, -.118, .05), (0, -1, .3))), .011)
for side, label in ((1, "L"), (-1, "R")):
    for step, y in enumerate((-.05, .0, .05)):
        stick(f"CRITTER_shellbug_leg_{label}_{step + 1}", (side * .06, y, .02), (side * .1, y + (step - 1) * .02, .0), .007, .004, M["bugLeg"], shellbug, 4)

# ---------------------------------------------------------------- barrel --
# Its axis runs along Y so it rolls across the screen as a disc with hoops.
barrel = add_critter("CRITTER_barrel", -.3, .55)
lathe("CRITTER_barrel_body", [(.11, -.11), (.13, -.06), (.14, 0), (.13, .06), (.11, .11)], M["stave"], barrel, 16, "Y")
for y in (-.075, .075):
    lathe(f"CRITTER_barrel_hoop_{'AB'[y > 0]}", [(.128, y - .012), (.137, y - .008), (.137, y + .008), (.128, y + .012)], M["hoop"], barrel, 16, "Y")
for k in range(8):
    angle = k * math.tau / 8
    box(f"CRITTER_barrel_seam_{k + 1}", (math.cos(angle) * .136, 0, math.sin(angle) * .136), (.006, .2, .006), M["staveDark"], barrel,
        Euler((0, -angle, 0)).to_quaternion())
for y, label in ((-.111, "front"), (.111, "back")):
    cone(f"CRITTER_barrel_lid_{label}", (0, y, 0), .1, .1, .006, M["staveDark"], barrel, 16, aim((0, 1, 0)))
    for k in (-1, 0, 1):
        box(f"CRITTER_barrel_lid_{label}_plank_{k + 2}", (k * .045, y * 1.02, 0), (.004, .004, .17 - abs(k) * .05), M["stave"], barrel)

# ---------------------------------------------------------------- gopher --
gopher = add_critter("CRITTER_gopher", .12, .55)
sphere("CRITTER_gopher_body", (0, 0, .17), (.15, .13, .17), M["fur"], gopher, 12, 7)
sphere("CRITTER_gopher_belly", (0, -.08, .15), (.1, .07, .12), M["furLight"], gopher, 8, 5)
sphere("CRITTER_gopher_head", (0, -.02, .38), (.12, .11, .1), M["fur"], gopher, 12, 7)
for side in (1, -1):
    sphere(f"CRITTER_gopher_cheek_{'LR'[side > 0]}", (side * .07, -.085, .35), (.055, .045, .045), M["furLight"], gopher, 9, 6)
    sphere(f"CRITTER_gopher_ear_{'LR'[side > 0]}", (side * .09, .0, .46), (.03, .02, .03), M["fur"], gopher, 6, 4)
    sphere(f"CRITTER_gopher_foot_{'LR'[side > 0]}", (side * .07, -.08, .02), (.05, .07, .025), M["furLight"], gopher, 8, 5)
sphere("CRITTER_gopher_nose", (0, -.13, .375), (.022, .018, .016), M["nose"], gopher, 8, 5)
for side in (1, -1):
    box(f"CRITTER_gopher_tooth_{'LR'[side > 0]}", (side * .011, -.125, .31), (.02, .01, .04), M["tooth"], gopher)
googly("CRITTER_gopher", gopher, (("L", (.04, -.1, .42), (-.2, -1, 0)), ("R", (-.04, -.1, .42), (.2, -1, 0))), .022)
for side in (1, -1):
    # Grumpy brows slanting down to the middle.
    box(f"CRITTER_gopher_brow_{'LR'[side > 0]}", (side * .045, -.112, .455), (.045, .01, .012), M["brow"], gopher,
        Euler((0, side * .45, 0)).to_quaternion())
for side, label in ((1, "L"), (-1, "R")):
    arm = pivot(f"arm_{label}", (side * .13, -.02, .25), gopher)
    sphere(f"CRITTER_gopher_arm_{label}", (side * .03, -.03, -.05), (.035, .035, .07), M["fur"], arm, 8, 5, Euler((.4, side * -.3, 0)).to_quaternion())
    sphere(f"CRITTER_gopher_paw_{label}", (side * .04, -.06, -.11), (.035, .03, .025), M["furLight"], arm, 8, 5)
    for claw in (-1, 1):
        cone(f"CRITTER_gopher_claw_{label}_{claw + 2}", (side * .04 + claw * .01, -.09, -.12), .007, .001, .02, M["claw"], arm, 4, aim((0, -1, -.3)))
cone("CRITTER_gopher_tail", (0, .13, .04), .03, .012, .1, M["fur"], gopher, 8, aim((0, 1, -.3)))

# ------------------------------------------------------- the watering can --
# The hero: a teal can with its spout to +X, eyes on the -Y face, red boots.
can = add_critter("CRITTER_can", .5, .55)
lathe("CRITTER_can_body", [(.0, .1), (.1, .1), (.11, .14), (.11, .26), (.1, .3), (.0, .3)], M["can"], can, 14)
torus("CRITTER_can_rim", (0, 0, .3), .1, .012, M["canDark"], can, segments=14)
torus("CRITTER_can_base", (0, 0, .105), .102, .01, M["canDark"], can, segments=14)
tube("CRITTER_can_spout", [Vector((.09, 0, .15)), Vector((.18, 0, .22)), Vector((.25, 0, .3))], [.022, .016, .012], M["can"], can, 8)
cone("CRITTER_can_rose", (.265, 0, .315), .02, .045, .035, M["rose"], can, 10, aim((1, 0, .9)))
tube("CRITTER_can_handle", [Vector((-.1, 0, .27)), Vector((-.16, 0, .25)), Vector((-.17, 0, .18)), Vector((-.1, 0, .15))], [.014, .014, .014, .014], M["canDark"], can, 8)
googly("CRITTER_can", can, (("L", (.04, -.1, .225), (.25, -1, .1)), ("R", (-.03, -.104, .225), (.25, -1, .1))), .026)
sphere("CRITTER_can_cheek_L", (.075, -.088, .18), (.016, .006, .011), M["cheek"], can, 8, 4, Vector((.6, -1, 0)).normalized().to_track_quat("Y", "Z"))
sphere("CRITTER_can_cheek_R", (-.065, -.092, .18), (.016, .006, .011), M["cheek"], can, 8, 4, Vector((-.4, -1, 0)).normalized().to_track_quat("Y", "Z"))
for side, label in ((1, "L"), (-1, "R")):
    leg = pivot(f"leg_{label}", (side * .05, 0, .11), can)
    stick(f"CRITTER_can_leg_{label}", (0, 0, 0), (0, 0, -.07), .016, .014, M["canDark"], leg, 8)
    sphere(f"CRITTER_can_boot_{label}", (.015, -.005, -.082), (.032, .026, .02), M["boot"], leg, 10, 6)

# ------------------------------------------------------- the rain barrel ---
rain = add_critter("CRITTER_rainbarrel", 1.08, .55)
lathe("CRITTER_rainbarrel_body", [(.0, 0), (.17, 0), (.2, .12), (.21, .26), (.2, .4), (.18, .5), (.0, .5)], M["stave"], rain, 14)
for z in (.08, .42):
    lathe(f"CRITTER_rainbarrel_hoop_{int(z * 100)}", [(.19 + (z - .25) * -.02, z - .016), (.21 + .006, z - .01), (.21 + .006, z + .01), (.19 + (z - .25) * -.02, z + .016)], M["hoop"], rain, 14)
cone("CRITTER_rainbarrel_water", (0, 0, .505), .165, .165, .012, M["water"], rain, 14)
torus("CRITTER_rainbarrel_lip", (0, 0, .5), .175, .012, M["staveDark"], rain, segments=14)
for k in range(7):
    angle = k * math.tau / 7 + .2
    box(f"CRITTER_rainbarrel_seam_{k + 1}", (math.cos(angle) * .207, math.sin(angle) * .207, .25), (.006, .006, .44), M["staveDark"], rain,
        Euler((0, 0, angle)).to_quaternion())
stick("CRITTER_rainbarrel_tap_pipe", (0, -.2, .1), (0, -.26, .1), .016, .016, M["brass"], rain, 8)
stick("CRITTER_rainbarrel_tap_spout", (0, -.26, .1), (0, -.27, .06), .014, .012, M["brass"], rain, 8)
box("CRITTER_rainbarrel_tap_handle", (0, -.25, .13), (.05, .012, .012), M["paint"], rain)
sphere("CRITTER_rainbarrel_drip", (0, -.27, .03), (.012, .012, .016), M["water"], rain, 8, 5)

# ------------------------------------------------------ review render ------

scene = bpy.context.scene
engines = [item.identifier for item in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
if "--cycles" in sys.argv:
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = 1200, 800
scene.render.resolution_percentage = 100
scene.eevee.taa_render_samples = 24
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.view_settings.exposure = .5
scene.world = bpy.data.worlds.new("Root care cast review: buttercream meadow morning")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = color_rgba("#f1e4c0")
scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0

bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, -.6))
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
camera.location = (0, -6.5, 2.4)
camera.rotation_euler = (Vector((.05, 0, .3)) - Vector(camera.location)).to_track_quat("-Z", "Y").to_euler()
camera.location = (.05, -6.5, 2.6)
camera_data.type = "ORTHO"
camera_data.ortho_scale = 2.75
scene.camera = camera

for name, location, energy, size, tint in [
    ("STAGE LIGHT warm key", (3, -6, 7), 1300, 5, (1.0, .93, .82)),
    ("STAGE LIGHT cool fill", (-6, -3, 4), 800, 5, (.76, .92, 1.0)),
    ("STAGE LIGHT soft rim", (5, 4, 6), 900, 4, (1.0, .82, .72)),
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

review_path = OUTPUT / "root-care-cast-review.png"
blend_path = OUTPUT / "root-care-cast.blend"
scene.render.filepath = str(review_path)
# Review only: the barrel turned so its hoops and lid read, the bugs tipped toward the camera.
barrel.rotation_euler = (0, 0, math.radians(35))
tipped = [grub, beetle, shellbug, hoe]
for critter in tipped:
    critter.rotation_euler = (math.radians(-35), 0, 0)
if "--no-render" not in sys.argv:
    bpy.ops.render.render(write_still=True)
barrel.rotation_euler = (0, 0, 0)
for critter in tipped:
    critter.rotation_euler = (0, 0, 0)
bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))

flatten_material_colours()


def select_tree(obj):
    obj.select_set(True)
    for child in obj.children:
        select_tree(child)


for root in critters:
    root.location = (0, 0, 0)
bpy.ops.object.select_all(action="DESELECT")
for root in critters:
    select_tree(root)
bpy.context.view_layer.objects.active = critters[0]
bpy.ops.export_scene.gltf(
    filepath=str(OUTPUT / "root-care-cast.glb"), export_format="GLB", use_selection=True,
    export_apply=True, export_animations=False, export_materials="EXPORT", export_texcoords=False,
    export_cameras=False, export_lights=False,
)
print("Root care cast Blender source:", blend_path)
print("Root care cast art review:", review_path)
print("Root care cast GLB:", OUTPUT / "root-care-cast.glb")
