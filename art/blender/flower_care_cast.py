"""Animal Balloon Farm: the flower's care cast (the buzz, hop and chop minigames).

Run from repository root:
  blender --background --factory-startup --python art/blender/flower_care_cast.py

Regenerates, in public/assets/plants/:
  flower-care-cast.blend    editable source for the cast
  flower-care-cast.glb      the cast, one root per critter
  flower-care-cast-review.png  art-review render of the cast side by side

Sizes are metres, relative to a ~1 m tall flower. Authoring frame matches
blueberry_bush.py: Z-up, each critter centred on its own origin, so glTF lands
each one in Three.js with +Y up. The export zeroes every root, so each critter's
geometry sits on its own origin in the GLB.

The game reads these models by node name (GLTFLoader turns spaces into
underscores, so names here already use underscores):

  CRITTER_bee       the buzz pest-or-helper, about 0.18 m, facing +X (it flies right)
                    wing_L / wing_R   flap pivots at the wing roots; rotate about
                                      the local X axis to flap
                    CRITTER_bee_drop  the dewdrop it carries (a copy of CRITTER_dewdrop)
  CRITTER_dewdrop   a glossy translucent drop, about 0.08 m
  CRITTER_aphid     a plump pale-green aphid, about 0.05 m, facing -Y
  CRITTER_burr      a spiky seed burr, about 0.12 m (dangerous: the hop obstacle)
  CRITTER_thorn     a curved rose-thorn spike, about 0.15 m tall, on a small base
  CRITTER_shears    garden shears, about 0.4 m, open at rest in the XZ plane
                    blade_A / blade_B  pivots at the rivet; each half is a steel
                                       blade plus its wooden handle and finger loop
                                       (rotate about the local Y axis to snap shut)
  CRITTER_stalk     a spent, overgrown flower stalk, about 0.9 m, centred on its origin;
                    its droopy seed head faces -Y

Verify with `node scripts/inspect-glb.mjs public/assets/plants/flower-care-cast.glb`.
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
random.seed(8812)


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


def fuzz(prefix, parent, centre, radii, count, length, mat):
    """Short soft hairs standing out of an ellipsoid, so a body reads as fuzzy."""
    for index in range(count):
        azimuth = index * 2.399 + .4
        elevation = math.asin(min(.9, -.35 + 1.25 * ((index + .5) / count)))
        n = Vector((math.cos(azimuth) * math.cos(elevation), math.sin(azimuth) * math.cos(elevation), math.sin(elevation)))
        surface = Vector(centre) + Vector((n.x * radii[0], n.y * radii[1], n.z * radii[2]))
        direction = Vector((n.x / radii[0], n.y / radii[1], n.z / radii[2])).normalized()
        cone(f"{prefix}_{index + 1}", surface + direction * length * .4, .0065, .0012, length, mat, parent, 5, aim(direction))


def tube(name, points, radii, mat, parent, sides=10):
    """One continuous lofted tube through `points` (parent-local), so a stem has no joints."""
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
            verts.append(p + (u * math.cos(angle) + v * math.sin(angle)) * radii[i])
    for i in range(len(points) - 1):
        s0, s1 = rings[i], rings[i + 1]
        for k in range(sides):
            k2 = (k + 1) % sides
            faces.append((s0 + k, s0 + k2, s1 + k2, s1 + k))
    bottom = len(verts)
    verts.append(points[0])
    for k in range(sides):
        faces.append((bottom, rings[0] + (k + 1) % sides, rings[0] + k))
    top = len(verts)
    verts.append(points[-1])
    last = rings[-1]
    for k in range(sides):
        faces.append((top, last + k, last + (k + 1) % sides))
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


def googly(prefix, parent, eyes, size):
    """White googly eyes; each pupil sits off-centre so it looks like it is rolling."""
    for label, centre, look in eyes:
        sphere(f"{prefix}_eye_{label}", centre, (size, size, size), M["eyeWhite"], parent, 10, 6)
        look = Vector(look).normalized()
        sphere(f"{prefix}_pupil_{label}", Vector(centre) + look * size * .62, (size * .5,) * 3, M["pupil"], parent, 8, 5)


def dewdrop(prefix, parent, centre, size=1.0):
    """A teardrop of glossy translucent water, with a little point on top and a highlight."""
    r = .034 * size
    cx, cy, cz = centre
    sphere(f"{prefix}_body", (cx, cy, cz), (r, r, r * .96), M["dew"], parent, 12, 8)
    cone(f"{prefix}_tip", (cx, cy, cz + r * .8 + .01 * size), r * .3, .0015, .02 * size, M["dew"], parent, 8)
    highlight = Vector((-.3, -.6, .6)).normalized()
    sphere(f"{prefix}_shine", Vector((cx, cy, cz)) + highlight * r * .9, (r * .22,) * 3, M["dewShine"], parent, 6, 4)


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
    # Bee.
    "bee": make_material("FLOWER bee body", "#f6c744", .42, 0, .3),
    "beeStripe": make_material("FLOWER bee stripe", "#3a2d3a", .4, 0, .3),
    "fuzz": make_material("FLOWER bee fuzz", "#fff4cf", .9, 0, .05),
    "wing": make_material("FLOWER bee wing", "#eef8ff", .2, 0, .3, alpha=.7),
    # Water and dew.
    "dew": make_material("FLOWER dewdrop", "#6fbcf0", .06, 0, .7, alpha=.6),
    "dewShine": make_material("FLOWER dewdrop shine", "#ffffff", .1, 0, .3),
    # Aphid.
    "aphid": make_material("FLOWER aphid body", "#a8ec6a", .4, 0, .35),
    "aphidLeg": make_material("FLOWER aphid leg", "#6f9a4f", .5, 0, .1),
    # Faces.
    "eyeWhite": make_material("FLOWER eye white", "#fffaf0", .3, 0, .4),
    "pupil": make_material("FLOWER pupil", "#24202a", .4, 0, .4),
    "cheek": make_material("FLOWER cheek", "#f4a3b5", .5, 0, .2),
    # Burr and thorn.
    "burr": make_material("FLOWER burr core", "#7a5a2c", .75, 0, .1),
    "burrSpike": make_material("FLOWER burr spike", "#b5523c", .45, 0, .2),
    "thorn": make_material("FLOWER thorn", "#9c3f2c", .38, 0, .25),
    "stub": make_material("FLOWER thorn stub", "#5ea35a", .32, .01, .5),
    "leafGreen": make_material("FLOWER leaf", "#4c9058", .32, .01, .5),
    "leafBright": make_material("FLOWER sunlit leaf", "#79b660", .3, .01, .54),
    # Shears.
    "steel": make_material("FLOWER shears steel", "#9fabb4", .28, .85, .3),
    "brass": make_material("FLOWER shears brass", "#d9a441", .3, .8, .3),
    "rubber": make_material("FLOWER shears rubber grip", "#d9573b", .6, 0, .1),
    "wood": make_material("FLOWER shears wood", "#c98a4b", .5, 0, .2),
    "loop": make_material("FLOWER shears grip loop", "#e2603f", .3, 0, .6),
    # Stalk.
    "stem": make_material("FLOWER stalk stem", "#8c9a4f", .55, 0, .15),
    "leafBrown": make_material("FLOWER stalk leaf browning", "#b98a3e", .6, 0, .15),
    "petal": make_material("FLOWER stalk dried petal", "#9a6a3a", .7, 0, .1),
    "fluff": make_material("FLOWER seed fluff", "#e6dcc3", .9, 0, .05),
    "seed": make_material("FLOWER seed thread", "#b8a27a", .6, 0, .05),
    # Review stage (never exported).
    "stageFloor": make_material("STAGE buttercream floor", "#f6e6c6", .88, 0, .02),
    "stageBack": make_material("STAGE mint studio backdrop", "#a6d8cf", .9, 0, .02),
}

critters = []

# ----------------------------------------------------------------- bee -----
# About 0.18 m long, facing +X. The head is the front, so the googly eyes sit
# on its +X face, and the one big dewdrop hangs under the belly.
bee = add_critter("CRITTER_bee", -.5, .2)
BEE_CX, BEE_RX, BEE_RY, BEE_RZ = -.02, .065, .05, .048
sphere("CRITTER_bee_body", (BEE_CX, 0, 0), (BEE_RX, BEE_RY, BEE_RZ), M["bee"], bee, 14, 9)
# Soft fuzzy bands that follow the body: each band is a thin slice of the body's
# own curve, a hair proud of the surface, so it hugs the belly instead of ringing it.
for index, x in enumerate((-.05, -.012, .026)):
    k = math.sqrt(max(0.0, 1 - ((x - BEE_CX) / BEE_RX) ** 2))
    sphere(f"CRITTER_bee_stripe_{index + 1}", (x, 0, 0), (.018, BEE_RY * k + .0025, BEE_RZ * k + .0025), M["beeStripe"], bee, 14, 8)
fuzz("CRITTER_bee_fuzz", bee, (BEE_CX, 0, 0), (BEE_RX + .001, BEE_RY + .001, BEE_RZ + .001), 18, .022, M["fuzz"])
sphere("CRITTER_bee_head", (.068, 0, .004), (.04, .04, .038), M["beeStripe"], bee, 12, 8)
googly("CRITTER_bee", bee, (
    ("L", (.1, -.024, .012), (.7, -.35, .1)),
    ("R", (.1, .024, .012), (.7, .35, .1)),
), .017)
for label, sign in (("L", -1), ("R", 1)):
    stick(f"CRITTER_bee_antenna_{label}", (.09, sign * .018, .03), (.118, sign * .036, .08), .0035, .0025, M["beeStripe"], bee, 4)
    sphere(f"CRITTER_bee_antenna_tip_{label}", (.118, sign * .036, .08), (.009, .009, .009), M["fuzz"], bee, 6, 4)
    # Wings: big, rounded, semi-opaque, each a pivot at its root on the back so code can flap it.
    wing = pivot(f"wing_{label}", (-.01, sign * .04, .03), bee)
    wing.rotation_euler = (sign * .6, 0, 0)  # tilted up and out, so it reads from the front
    sphere(f"wing_{label}_membrane", (-.012, sign * .03, .024), (.04, .042, .004), M["wing"], wing, 14, 8)
    # Legs: the front pair hugs the dewdrop, the back pair trails.
    stick(f"CRITTER_bee_leg_front_{label}", (.035, sign * .03, -.035), (.02, sign * .03, -.085), .0045, .003, M["beeStripe"], bee, 5)
    stick(f"CRITTER_bee_leg_back_{label}", (-.035, sign * .04, -.04), (-.068, sign * .07, -.07), .004, .0025, M["beeStripe"], bee, 5)
# The one dewdrop the bee carries, slung under the body.
dewdrop("CRITTER_bee_drop", bee, (0, 0, -.11), 1.35)

# ------------------------------------------------------------- dewdrop -----
dew = add_critter("CRITTER_dewdrop", -.36, -.2)
dewdrop("CRITTER_dewdrop", dew, (0, 0, -.006))

# ------------------------------------------------------------- aphid -------
# Plump and bright green, facing -Y, with a clear googly face and tiny legs.
aphid = add_critter("CRITTER_aphid", -.22, .2)
sphere("CRITTER_aphid_body", (0, 0, 0), (.027, .023, .021), M["aphid"], aphid, 12, 8)
sphere("CRITTER_aphid_head", (0, -.02, .006), (.018, .016, .016), M["aphid"], aphid, 10, 7)
googly("CRITTER_aphid", aphid, (
    ("L", (-.009, -.033, .01), (-.25, -1, .15)),
    ("R", (.009, -.033, .01), (.25, -1, .15)),
), .013)
for label, sign in (("L", -1), ("R", 1)):
    sphere(f"CRITTER_aphid_cheek_{label}", (sign * .015, -.029, -.002), (.006, .004, .005), M["cheek"], aphid, 6, 4)
    for step, y in enumerate((-.012, 0, .012)):
        stick(f"CRITTER_aphid_leg_{label}_{step + 1}", (sign * .018, y, -.01), (sign * .036, y * 1.2, -.026), .003, .0018, M["aphidLeg"], aphid, 4)
    stick(f"CRITTER_aphid_antenna_{label}", (sign * .01, -.022, .02), (sign * .03, -.038, .05), .0028, .0016, M["aphidLeg"], aphid, 4)

# ------------------------------------------------------------- burr --------
# A dangerous seed burr: a rust-tipped spiky ball, no face.
burr = add_critter("CRITTER_burr", -.07, -.2)
sphere("CRITTER_burr_core", (0, 0, 0), (.038, .038, .036), M["burr"], burr, 12, 8)
SPIKES = 22
for index in range(SPIKES):
    z = 1 - 2 * (index + .5) / SPIKES
    azimuth = index * 2.399
    ring = math.sqrt(max(0.0, 1 - z * z))
    direction = Vector((math.cos(azimuth) * ring, math.sin(azimuth) * ring, z))
    cone(f"CRITTER_burr_spike_{index + 1}", direction * (.038 + .012), .0085, .0012, .024, M["burrSpike"], burr, 5, aim(direction))

# ------------------------------------------------------------ thorn --------
# A bold red-brown rose thorn: a chunky hook on a green stem stub, centred on its origin.
thorn = add_critter("CRITTER_thorn", .07, .2)
THORN_LIFT = -.07
stick("CRITTER_thorn_stub", (0, 0, THORN_LIFT - .02), (0, 0, THORN_LIFT + .012), .02, .016, M["stub"], thorn, 10)
sphere("CRITTER_thorn_stub_cap", (0, 0, THORN_LIFT + .012), (.016, .016, .01), M["stub"], thorn, 10, 6)
curve = [Vector((0, 0, 0.0)), Vector((.005, 0, .05)), Vector((.02, 0, .1)), Vector((.045, 0, .135)), Vector((.075, 0, .145))]
radii = [.018, .014, .0095, .0055, .0022]
for index in range(len(curve) - 1):
    a = curve[index] + Vector((0, 0, THORN_LIFT))
    b = curve[index + 1] + Vector((0, 0, THORN_LIFT))
    stick(f"CRITTER_thorn_segment_{index + 1}", a, b, radii[index], radii[index + 1], M["thorn"], thorn, 7)

# ----------------------------------------------------------- shears --------
# Chunky bypass pruners, open, in the XZ plane. Each half is a pivot at the
# rivet holding its steel blade (a bevelled bar with a hooked tip) and its fat
# rubber grip, so the halves cross at the big brass rivet like a real pair.
shears = add_critter("CRITTER_shears", .24, -.2)
sphere("CRITTER_shears_rivet", (0, 0, 0), (.024, .024, .024), M["brass"], shears, 12, 8)
# The spring: a brass coil loop between the grips, behind the rivet.
bpy.ops.mesh.primitive_torus_add(major_segments=18, minor_segments=6, location=(0, 0, 0), major_radius=.045, minor_radius=.0055)
spring = bpy.context.object
spring.name = "CRITTER_shears_spring"
spring.data.name = "CRITTER_shears_spring_mesh"
spring.rotation_euler = (math.radians(90), 0, 0)
spring.location = (0, .012, -.1)
spring.data.materials.append(M["brass"])
smooth(spring)
spring.parent = shears
spring.matrix_parent_inverse.identity()
OPEN_ANGLE = math.radians(26)
BLADE, GRIP = .21, .14
for name, side in (("blade_A", -1), ("blade_B", 1)):
    half = pivot(name, (0, 0, 0), shears)
    direction = Vector((side * math.sin(OPEN_ANGLE), 0, math.cos(OPEN_ANGLE)))
    # Straight cutting bar, bevelled: width along local X, thickness along Y.
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
    bar = bpy.context.object
    bar.name = f"{name}_steel"
    bar.data.name = f"{name}_steel_mesh"
    bar.scale = (.05, .012, BLADE * .72)
    bar.rotation_euler = (0, side * OPEN_ANGLE, 0)  # flat in XZ: width across the pair
    bar.data.materials.append(M["steel"])
    bevel = bar.modifiers.new("bevel", "BEVEL")
    bevel.width = .003
    bevel.segments = 2
    parent_local(bar, half, direction * BLADE * .36)
    # Hooked tip: the last stretch bends in toward the other blade, bypass style.
    tip_direction = Vector((side * math.sin(OPEN_ANGLE - .35), 0, math.cos(OPEN_ANGLE - .35)))
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
    tip = bpy.context.object
    tip.name = f"{name}_tip"
    tip.data.name = f"{name}_tip_mesh"
    tip.scale = (.042, .012, BLADE * .3)
    tip.rotation_euler = (0, side * (OPEN_ANGLE - .35), 0)
    tip.data.materials.append(M["steel"])
    bevel = tip.modifiers.new("bevel", "BEVEL")
    bevel.width = .003
    bevel.segments = 2
    parent_local(tip, half, direction * BLADE * .72 + tip_direction * BLADE * .15)
    # Fat rubber grip, capped round, on the far side of the rivet.
    stick(f"{name}_grip", -direction * .02, -direction * GRIP, .021, .025, M["rubber"], half, 10)
    sphere(f"{name}_grip_end", -direction * GRIP, (.025, .025, .025), M["rubber"], half, 10, 6)

# ------------------------------------------------------------ stalk --------
# A spent, overgrown flower stalk, about 0.9 m, centred on its origin: a smooth
# S-curved stem, floppy leaves, and a wilted seed head bent over at the top.
stalk = add_critter("CRITTER_stalk", .47, 0)
STALK_BOTTOM, STALK_TOP = -.45, .3
STALK_SWAY = .035


def stalk_point(t):
    return Vector((STALK_SWAY * math.sin(2 * math.pi * t), 0, STALK_BOTTOM + (STALK_TOP - STALK_BOTTOM) * t))


STEM_RINGS = 24
stem_points = [stalk_point(i / STEM_RINGS) for i in range(STEM_RINGS + 1)]
tube("CRITTER_stalk_stem", stem_points, [.019 - .011 * i / STEM_RINGS for i in range(STEM_RINGS + 1)], M["stem"], stalk, 10)
# Floppy leaves: two green, one browned and yellowing, all hanging outward and down.
for label, side, t, mat in (("L", -1, .22, "leafBright"), ("R", 1, .5, "leafGreen"), ("L", -1, .74, "leafBrown")):
    base = stalk_point(t)
    direction = Vector((side * .9, 0, -.25)).normalized()
    # Lie the leaf flat in the XZ plane so its broad face shows from the front.
    flat = Euler((0, math.atan2(direction.x, direction.z), 0)).to_quaternion()
    sphere(f"CRITTER_stalk_leaf_{label}_{t:.2f}", base + direction * .075, (.034, .008, .075), M[mat], stalk, 8, 5, flat)
# The bent neck: a short arc from the stem top, bowing over toward +X.
top = stalk_point(1)
neck = [Vector((0, 0, 0)), Vector((.012, 0, .04)), Vector((.04, 0, .065)), Vector((.07, 0, .07))]
neck_points = [top + Vector((0, 0, 0)), top + Vector((.012, 0, .04)), top + Vector((.04, 0, .065)), top + Vector((.07, 0, .07))]
tube("CRITTER_stalk_neck", neck_points, [.011, .0105, .0095, .0085], M["stem"], stalk, 8)
HEAD_POS = top + Vector((.07, 0, .07))  # the neck's end
head = pivot("CRITTER_stalk_head", HEAD_POS, stalk)
head.rotation_euler = (0, .9, 0)  # the seed head hangs down and toward +X
sphere("CRITTER_stalk_fluff", (0, 0, 0), (.07, .07, .075), M["fluff"], head, 12, 8)
for index in range(9):
    azimuth = index * 2.399
    elevation = math.asin(min(.9, -.4 + 1.1 * ((index + .5) / 9)))
    direction = Vector((math.cos(azimuth) * math.cos(elevation), math.sin(azimuth) * math.cos(elevation), math.sin(elevation)))
    stick(f"CRITTER_stalk_seed_{index + 1}", direction * .068, direction * .11, .0032, .0006, M["seed"], head, 4)
# Dried, drooping petals, brown at the tips.
for index, azimuth in enumerate((.3, 1.6, 2.9, 4.3, 5.5)):
    direction = Vector((math.cos(azimuth), math.sin(azimuth) * .6, -.35)).normalized()
    sphere(f"CRITTER_stalk_petal_{index + 1}", direction * .082, (.012, .005, .03), M["petal"], head, 8, 4, aim(direction))

# ------------------------------------------------------ review render ------

scene = bpy.context.scene
engines = [item.identifier for item in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
scene.render.resolution_x, scene.render.resolution_y = 900, 600
scene.render.resolution_percentage = 100
scene.eevee.taa_render_samples = 24
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.view_settings.exposure = .5
scene.world = bpy.data.worlds.new("Flower care cast review: buttercream meadow morning")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = color_rgba("#f1e4c0")
scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0

bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, -.5))
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
camera.location = (.01, -6.5, .6)
camera.rotation_euler = (Vector((.01, 0, -.01)) - Vector(camera.location)).to_track_quat("-Z", "Y").to_euler()
camera_data.type = "ORTHO"
camera_data.ortho_scale = 1.4
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

review_path = OUTPUT / "flower-care-cast-review.png"
blend_path = OUTPUT / "flower-care-cast.blend"
scene.render.filepath = str(review_path)
if "--no-render" not in sys.argv:
    bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))

flatten_material_colours()


def select_tree(obj):
    obj.select_set(True)
    for child in obj.children:
        select_tree(child)


# Every critter is zeroed for the export, so each one's geometry is centred on
# its own root. The game places each by its root and reads the parts by name.
for root in critters:
    root.location = (0, 0, 0)
bpy.ops.object.select_all(action="DESELECT")
for root in critters:
    select_tree(root)
bpy.context.view_layer.objects.active = critters[0]
bpy.ops.export_scene.gltf(
    filepath=str(OUTPUT / "flower-care-cast.glb"), export_format="GLB", use_selection=True,
    export_apply=True, export_animations=False, export_materials="EXPORT", export_texcoords=False,
    export_cameras=False, export_lights=False,
)
print("Flower care cast Blender source:", blend_path)
print("Flower care cast art review:", review_path)
print("Flower care cast GLB:", OUTPUT / "flower-care-cast.glb")
