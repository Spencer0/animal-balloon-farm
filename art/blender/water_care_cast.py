"""Animal Balloon Farm: the water plants' care-game cast.

Run from repository root:
  blender --background --factory-startup --python art/blender/water_care_cast.py

Regenerates, in public/assets/plants/:
  water-care-cast.blend   editable source for the whole cast
  water-care-cast.glb     one root per critter, each centred on its own origin
  water-care-cast-review.png  art-review render (small critters enlarged 3x in the
                          render only, so they read; the GLB keeps true sizes)

Authoring frame matches blueberry_bush.py: Z-up, resting on z = 0 and centred on
the origin, so glTF lands each model in Three.js with +Y up. Sizes are metres,
scaled to a ~1 m wide water lily. Facing: the dragonfly and fish face +X, the
frog and mosquito face -Y (glTF +Z for the frog, so it reads from the camera).

The game reads these models by node name (GLTFLoader turns spaces into
underscores, so names here already use underscores):

  CRITTER_dragonfly        ~0.23 m, facing +X, slim jewel-teal body
    CRITTER_dragonfly_wing_L/_R   glassy wing pairs; pivots at the thorax, about
                                  3 cm from the root, so code can flap them
  CRITTER_frog             ~0.18 m, sitting, chubby green, pale belly, faces -Y
    CRITTER_frog_tongue    pink tongue; pivot at the mouth, points -Y, so code
                           can scale it out along Y
  CRITTER_fish             ~0.25 m orange-and-white koi, mid-leap arc, facing +X
  CRITTER_cattail          ~0.7 m reed with a brown seed head
  CRITTER_mosquito         ~0.06 m, comical, thin legs, facing -Y
  CRITTER_log              ~0.6 m floating log along X, stub branch and moss
  CRITTER_snag             ~0.35 m jagged dead branch standing out of the water
  CRITTER_runner_leaf      ~0.07 m lily runner leaf (instanced along a vine)

Verify with `node scripts/inspect-glb.mjs public/assets/plants/water-care-cast.glb`
and `npm run assets:budget`.
"""
from __future__ import annotations

import math
import os
import sys
from pathlib import Path

import bpy
from mathutils import Euler, Vector

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "public" / "assets" / "plants"
OUTPUT.mkdir(parents=True, exist_ok=True)


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


def sphere(name, location, scale, mat, parent=None, segments=10, rings=6, rotation=None):
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
    obj.empty_display_size = .03
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


def googly_eye(name, parent, centre, facing, size):
    """A white ball with a loose black pupil that sits forward of the ball, so it reads as googly."""
    eye = Vector(centre)
    sphere(f"{name}_eye", eye, (size, size, size), M["eyeWhite"], parent, 10, 6)
    sphere(f"{name}_pupil", eye + Vector(facing).normalized() * size * .6, (size * .5,) * 3, M["ink"], parent, 8, 5)


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


def tree(obj):
    yield obj
    for child in obj.children:
        yield from tree(child)


def triangles(root):
    total = 0
    for obj in tree(root):
        if obj.type == "MESH":
            total += sum(max(0, len(poly.vertices) - 2) for poly in obj.data.polygons)
    return total


# Fresh authoring scene; the named outputs below are intentionally regenerated.
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for collection in (bpy.data.meshes, bpy.data.curves, bpy.data.materials,
                   bpy.data.cameras, bpy.data.lights, bpy.data.worlds, bpy.data.actions):
    for block in list(collection):
        if block.users == 0:
            collection.remove(block)

M = {
    # Dragonfly.
    "dragonTeal": make_material("WC dragonfly teal", "#2aa6a0", .3, 0, .5),
    "dragonBlue": make_material("WC dragonfly blue", "#1f6f8b", .3, 0, .5),
    "dragonDeep": make_material("WC dragonfly head", "#17606e", .3, 0, .5),
    "wingFore": make_material("WC dragonfly fore wing", "#e4f6ff", .12, 0, .4, alpha=.72),
    "wingHind": make_material("WC dragonfly hind wing", "#efe6ff", .12, 0, .4, alpha=.72),
    "eyeWhite": make_material("WC googly eye white", "#fffaf0", .3, 0, .4),
    "ink": make_material("WC googly pupil ink", "#24202a", .4, 0, .4),
    # Frog.
    "frogGreen": make_material("WC frog green", "#62b35c", .3, 0, .6),
    "frogDark": make_material("WC frog spot green", "#3d8a48", .35, 0, .4),
    "frogBelly": make_material("WC frog pale belly", "#eef3b5", .4, 0, .3),
    "cheek": make_material("WC cheek pink", "#f4a3b5", .5, 0, .2),
    "tongue": make_material("WC frog tongue", "#f2748c", .35, 0, .4),
    # Fish.
    "fishOrange": make_material("WC koi orange", "#f2782f", .3, 0, .5),
    "fishWhite": make_material("WC koi white", "#fff6ea", .35, 0, .4),
    "fishFin": make_material("WC koi fin red", "#e8532e", .35, 0, .4),
    "fishTail": make_material("WC koi tail", "#f7a25a", .35, 0, .4),
    # Cattail.
    "reed": make_material("WC cattail stalk", "#8fb35e", .5, 0, .2),
    "reedLeaf": make_material("WC cattail leaf", "#6ea24e", .45, 0, .3),
    "seed": make_material("WC cattail seed head", "#6b3f25", .5, 0, .3),
    "seedLight": make_material("WC cattail seed highlight", "#9a6a3e", .5, 0, .3),
    "reedTip": make_material("WC cattail tip", "#8a6a3a", .5, 0, .2),
    "mud": make_material("WC pond mud", "#6a4630", .92, 0, .02),
    # Mosquito.
    "mosBody": make_material("WC mosquito body", "#4a4153", .4, 0, .3),
    "mosStripe": make_material("WC mosquito stripe", "#e9dfcf", .4, 0, .3),
    "mosWing": make_material("WC mosquito wing", "#e6f4ff", .15, 0, .3, alpha=.45),
    # Log.
    "logBark": make_material("WC log bark", "#8a5a3a", .7, 0, .1),
    "logCut": make_material("WC log cut ring", "#e6b87a", .6, 0, .1),
    "logKnot": make_material("WC log knot", "#6e4530", .7, 0, .1),
    "branch": make_material("WC log stub branch", "#7a4a2f", .7, 0, .1),
    "moss": make_material("WC moss", "#6fae5a", .9, 0, .2),
    "mossLight": make_material("WC moss highlight", "#8fc56e", .9, 0, .2),
    # Snag.
    "deadWood": make_material("WC dead wood", "#9c8470", .75, 0, .1),
    "deadDark": make_material("WC dead wood shade", "#6e5a4c", .8, 0, .1),
    "deadPale": make_material("WC dead wood splinter", "#c9b49a", .7, 0, .1),
    "lichen": make_material("WC lichen", "#b9c98a", .8, 0, .2),
    # Runner leaf.
    "leafRun": make_material("WC runner leaf", "#5fa85a", .35, 0, .35),
    "leafRib": make_material("WC runner leaf rib", "#b9e08a", .45, 0, .2),
    "stemRun": make_material("WC runner stem", "#5a8f4a", .45, 0, .2),
    # Review stage only (never exported).
    "stagePond": make_material("STAGE buttercream floor", "#f6e6c6", .88, 0, .02),
    "stageBack": make_material("STAGE mint backdrop", "#a6d8cf", .9, 0, .02),
    }

critters = []


def add_critter(name, design_size):
    root = pivot(name)
    root["design_size"] = design_size
    critters.append(root)
    return root


# ------------------------------------------------------------- dragonfly --

dragon = add_critter("CRITTER_dragonfly", "about 0.23 m long, facing +X")
for index in range(6):
    x = .025 - index * .022
    radius = .0165 - index * .0012
    tone = "dragonBlue" if index % 2 else "dragonTeal"
    sphere(f"CRITTER_dragonfly_abdomen_{index + 1}", (x, 0, .012), (.0135, radius, radius), M[tone], dragon, 10, 6)
stick("CRITTER_dragonfly_tail", (-.09, 0, .012), (-.12, 0, .012), .0085, .003, M["dragonBlue"], dragon, 6)
sphere("CRITTER_dragonfly_thorax", (.04, 0, .014), (.033, .03, .03), M["dragonTeal"], dragon, 12, 8)
sphere("CRITTER_dragonfly_head", (.08, 0, .014), (.03, .03, .028), M["dragonDeep"], dragon, 12, 8)
WING_TILT = math.radians(35)  # wings splay out and up in a V, so they read from the side
for label, side in (("L", 1), ("R", -1)):
    # Each wing is a shoulder pivot carrying a large fore wing and a smaller hind wing.
    wing = pivot(f"wing_{label}", (.03, side * .02, .035), dragon)

    def wing_point(y, x=0.0):
        return (x, y * math.cos(side * WING_TILT), y * math.sin(side * WING_TILT))

    tilt = Euler((side * WING_TILT, 0, 0)).to_quaternion()
    sphere(f"wing_{label}_fore", wing_point(.09), (.038, .095, .002), M["wingFore"], wing, 10, 6, tilt)
    sphere(f"wing_{label}_hind", wing_point(.075, -.032), (.03, .078, .002), M["wingHind"], wing, 10, 6, tilt)
    googly_eye(f"CRITTER_dragonfly_{label}", dragon, (.078, side * .022, .02), (.5, side, 0), .02)

# ------------------------------------------------------------------ frog --

frog = add_critter("CRITTER_frog", "about 0.2 m, sitting, faces -Y")
sphere("CRITTER_frog_body", (0, .005, .055), (.085, .075, .06), M["frogGreen"], frog, 14, 9)
sphere("CRITTER_frog_head", (0, -.02, .1), (.07, .05, .04), M["frogGreen"], frog, 12, 8)
sphere("CRITTER_frog_belly", (0, -.045, .04), (.06, .035, .04), M["frogBelly"], frog, 12, 8)
# Spots on the back (+Y side) read from behind, where the stream game sees the frog.
for index, (x, y, z) in enumerate(((-.04, .074, .07), (.04, .074, .07), (-.02, .078, .04), (.03, .078, .035),
                                    (0, .08, .06), (-.06, .07, .03), (.06, .07, .03))):
    sphere(f"CRITTER_frog_spot_{index + 1}", (x, y, z), (.013, .006, .013), M["frogDark"], frog, 8, 5)
for label, sign in (("L", -1), ("R", 1)):
    # Big folded back legs: their thighs are the two bumps you see from behind.
    sphere(f"CRITTER_frog_thigh_{label}", (sign * .075, .03, .025), (.045, .05, .036), M["frogGreen"], frog, 12, 8)
    sphere(f"CRITTER_frog_foot_{label}", (sign * .068, -.072, .01), (.035, .028, .013), M["frogDark"], frog, 8, 5)
    stick(f"CRITTER_frog_arm_{label}", (sign * .045, -.035, .04), (sign * .07, -.058, .012), .011, .009, M["frogGreen"], frog, 6)
    sphere(f"CRITTER_frog_cheek_{label}", (sign * .042, -.058, .085), (.014, .005, .01), M["cheek"], frog, 8, 5)
    # Googly eyes raised on top of the head; pupils look forward and up.
    googly_eye(f"CRITTER_frog_{label}", frog, (sign * .032, -.02, .132), (0, -.2, 1), .03)
# Wide smile: a curve of short ink strokes across the front of the head.
SMILE = [(-.065, -.052, .094), (-.04, -.064, .09), (-.02, -.069, .088), (0, -.07, .088),
         (.02, -.069, .088), (.04, -.064, .09), (.065, -.052, .094)]
for index in range(len(SMILE) - 1):
    stick(f"CRITTER_frog_smile_{index + 1}", SMILE[index], SMILE[index + 1], .0032, .0032, M["ink"], frog, 5)
tongue = pivot("tongue", (0, -.07, .088), frog)
stick("CRITTER_frog_tongue_strand", (0, 0, 0), (0, -.045, 0), .009, .007, M["tongue"], tongue, 8)
sphere("CRITTER_frog_tongue_tip", (0, -.048, 0), (.011, .011, .011), M["tongue"], tongue, 8, 5)

# ------------------------------------------------------------------ fish --

fish = add_critter("CRITTER_fish", "about 0.25 m, mid-leap arc, faces +X")
# The spine is walked from the tail: heading sweeps from a tail-down dip to a
# head-up lift, so the body is clearly curved like a leap. Radii swell to the head.
SPINE_N = 6
spine = []
x = z = 0.0
for index in range(SPINE_N):
    t = index / (SPINE_N - 1)
    spine.append((x, z, t))
    heading = math.radians(-62 + 124 * t)
    step = .24 / (SPINE_N - 1)
    x += math.cos(heading) * step
    z += math.sin(heading) * step
mid_x = sum(p[0] for p in spine) / SPINE_N
mid_z = sum(p[1] for p in spine) / SPINE_N
spine = [(px - mid_x, pz - mid_z, t) for px, pz, t in spine]


def fish_radius(t):
    return .014 + .026 * t ** .6


for index, (px, pz, t) in enumerate(spine):
    r = fish_radius(t)
    # Long, overlapping ellipsoids read as a fish body; round balls read as a grub.
    sphere(f"CRITTER_fish_body_{index + 1}", (px, 0, pz), (r * 1.9, r * .95, r), M["fishOrange"], fish, 10, 6)
for index in (1, 3):
    px, pz, _ = spine[index]
    r = fish_radius(spine[index][2])
    for side, label in ((-1, "L"), (1, "R")):
        sphere(f"CRITTER_fish_patch_{index + 1}_{label}", (px, side * r * .85, pz + r * .15),
               (r * .85, .005, r * .7), M["fishWhite"], fish, 8, 4)
hx, hz, _ = spine[-1]
sphere("CRITTER_fish_head", (hx + .012, 0, hz), (.042, .036, .036), M["fishOrange"], fish, 10, 6)
sphere("CRITTER_fish_snout", (hx + .034, 0, hz - .005), (.014, .016, .014), M["fishWhite"], fish, 8, 5)
mx, mz, _ = spine[2]
sphere("CRITTER_fish_dorsal", (mx, 0, mz + fish_radius(.5) * .95 + .012), (.034, .005, .03), M["fishFin"], fish, 8, 4)
for side, label in ((-1, "L"), (1, "R")):
    sphere(f"CRITTER_fish_pectoral_{label}", (spine[2][0] + .01, side * .03, spine[2][1] - .015),
           (.02, .006, .012), M["fishWhite"], fish, 6, 4, Euler((0, 0, side * math.radians(25))).to_quaternion())
    googly_eye(f"CRITTER_fish_{label}", fish, (hx + .022, side * .028, hz + .012), (.2, side, .2), .016)
# Forked tail: two fan lobes swept back and apart, with a root between them.
tx, tz, _ = spine[0]
sphere("CRITTER_fish_tail_upper", (tx - .03, 0, tz + .02), (.036, .005, .018), M["fishTail"], fish, 8, 4,
       Euler((0, math.radians(30), 0)).to_quaternion())
sphere("CRITTER_fish_tail_lower", (tx - .03, 0, tz - .02), (.036, .005, .018), M["fishTail"], fish, 8, 4,
       Euler((0, math.radians(-30), 0)).to_quaternion())
sphere("CRITTER_fish_tail_root", (tx - .008, 0, tz), (.02, .016, .016), M["fishTail"], fish, 8, 4)

# --------------------------------------------------------------- cattail --

cattail = add_critter("CRITTER_cattail", "about 0.7 m tall reed, seed head near the top")
sphere("CRITTER_cattail_mud", (0, 0, -.004), (.05, .05, .012), M["mud"], cattail, 10, 5)
stick("CRITTER_cattail_stalk", (0, 0, 0), (0, 0, .62), .013, .008, M["reed"], cattail, 8)
for index, (azimuth, rise) in enumerate(((20, .34), (120, .38), (210, .32), (300, .36))):
    a = math.radians(azimuth)
    stick(f"CRITTER_cattail_leaf_{index + 1}", (0, 0, .03),
          (math.cos(a) * .13, math.sin(a) * .13, rise), .02, .002, M["reedLeaf"], cattail, 3)
sphere("CRITTER_cattail_seed", (0, 0, .56), (.024, .024, .085), M["seed"], cattail, 10, 6)
sphere("CRITTER_cattail_seed_shine", (.008, -.008, .55), (.009, .009, .06), M["seedLight"], cattail, 6, 4)
stick("CRITTER_cattail_tip", (0, 0, .64), (0, 0, .70), .005, .002, M["reedTip"], cattail, 5)

# -------------------------------------------------------------- mosquito --

mosquito = add_critter("CRITTER_mosquito", "about 0.06 m, comical, faces -Y")
sphere("CRITTER_mosquito_thorax", (0, .004, .008), (.009, .011, .009), M["mosBody"], mosquito, 8, 5)
sphere("CRITTER_mosquito_abdomen", (0, .025, .003), (.005, .018, .005), M["mosBody"], mosquito, 8, 5)
for index, y in enumerate((.02, .028, .036)):
    sphere(f"CRITTER_mosquito_stripe_{index + 1}", (0, y, .003), (.0056, .002, .0056), M["mosStripe"], mosquito, 6, 4)
sphere("CRITTER_mosquito_head", (0, -.012, .01), (.007, .007, .007), M["mosBody"], mosquito, 8, 5)
stick("CRITTER_mosquito_proboscis", (0, -.017, .008), (0, -.048, .005), .0012, .0006, M["mosBody"], mosquito, 4)
for label, sign in (("L", -1), ("R", 1)):
    stick(f"CRITTER_mosquito_antenna_{label}", (sign * .003, -.014, .016), (sign * .009, -.022, .024), .0008, .0004, M["mosBody"], mosquito, 3)
    googly_eye(f"CRITTER_mosquito_{label}", mosquito, (sign * .005, -.014, .013), (0, -1, .2), .0065)
    for pair, y in enumerate((-.002, .006, .014)):
        knee = (sign * .022, y, -.004)
        foot = (sign * .03, y + .004, -.02)
        stick(f"CRITTER_mosquito_leg_{label}_{pair + 1}_upper", (sign * .007, y, .0), knee, .0009, .0007, M["mosBody"], mosquito, 3)
        stick(f"CRITTER_mosquito_leg_{label}_{pair + 1}_lower", knee, foot, .0007, .0004, M["mosBody"], mosquito, 3)
    sphere(f"CRITTER_mosquito_wing_{label}", (sign * .012, .004, .02), (.013, .03, .0015), M["mosWing"], mosquito, 8, 4)

# ------------------------------------------------------------------ log --

log = add_critter("CRITTER_log", "about 0.6 m floating log along X")
stick("CRITTER_log_trunk", (-.3, 0, 0), (.3, 0, 0), .07, .07, M["logBark"], log, 12)
for side, label in ((-1, "L"), (1, "R")):
    stick(f"CRITTER_log_cut_{label}", (side * .298, 0, 0), (side * .304, 0, 0), .07, .07, M["logCut"], log, 12)
stick("CRITTER_log_stub", (.12, .03, .05), (.17, .05, .13), .02, .011, M["branch"], log, 7)
sphere("CRITTER_log_stub_tip", (.17, .05, .13), (.014, .014, .014), M["logCut"], log, 7, 4)
sphere("CRITTER_log_knot_1", (.05, -.07, 0), (.016, .01, .016), M["logKnot"], log, 8, 5)
sphere("CRITTER_log_knot_2", (-.2, .07, -.02), (.014, .01, .014), M["logKnot"], log, 8, 5)
sphere("CRITTER_log_moss_1", (-.18, 0, .06), (.08, .062, .03), M["moss"], log, 8, 5)
sphere("CRITTER_log_moss_2", (-.02, -.02, .062), (.06, .05, .026), M["moss"], log, 8, 5)
sphere("CRITTER_log_moss_3", (.22, .02, .06), (.07, .055, .028), M["moss"], log, 8, 5)
sphere("CRITTER_log_moss_4", (-.06, .02, .075), (.03, .025, .012), M["mossLight"], log, 6, 4)

# ---------------------------------------------------------------- snag --

snag = add_critter("CRITTER_snag", "about 0.35 m tall dead branch, sticks up from the water")
sphere("CRITTER_snag_flare", (0, 0, -.004), (.05, .05, .012), M["deadDark"], snag, 8, 5)
stick("CRITTER_snag_trunk", (0, 0, 0), (.01, 0, .31), .035, .016, M["deadWood"], snag, 7)
stick("CRITTER_snag_spike", (.008, 0, .3), (.02, 0, .36), .012, .002, M["deadWood"], snag, 5)
stick("CRITTER_snag_stub_1", (0, 0, .12), (.07, -.02, .2), .015, .006, M["deadWood"], snag, 6)
stick("CRITTER_snag_stub_2", (-.01, 0, .18), (-.08, .02, .26), .013, .005, M["deadWood"], snag, 6)
stick("CRITTER_snag_stub_3", (0, 0, .08), (-.05, -.03, .12), .012, .005, M["deadWood"], snag, 5)
sphere("CRITTER_snag_knot", (0, -.03, .14), (.02, .012, .02), M["deadDark"], snag, 7, 4)
cone("CRITTER_snag_splinter_1", (.07, -.02, .2), .006, .0, .03, M["deadPale"], snag, 4, aim((.5, -.2, .8)))
cone("CRITTER_snag_splinter_2", (-.08, .02, .26), .005, .0, .025, M["deadPale"], snag, 4, aim((-.4, .2, .9)))
sphere("CRITTER_snag_lichen_1", (-.01, -.012, .22), (.012, .008, .012), M["lichen"], snag, 6, 4)
sphere("CRITTER_snag_lichen_2", (.012, .01, .05), (.01, .008, .01), M["lichen"], snag, 6, 4)

# -------------------------------------------------------- runner leaf --

runner = add_critter("CRITTER_runner_leaf", "about 0.07 m lily runner leaf, lies flat")
sphere("CRITTER_runner_leaf_blade", (0, 0, .003), (.035, .02, .003), M["leafRun"], runner, 10, 5)
stick("CRITTER_runner_leaf_rib", (-.03, 0, .006), (.03, 0, .006), .0012, .0009, M["leafRib"], runner, 3)
stick("CRITTER_runner_leaf_stem", (-.033, 0, .002), (-.05, 0, .0), .002, .0015, M["stemRun"], runner, 4)

# ------------------------------------------------------- authoring pose --

CRITTER_COUNT = len(critters)
for root in critters:
    print(f"{root.name}: {triangles(root)} triangles")
print("Water cast total triangles:", sum(triangles(root) for root in critters))

# ------------------------------------------------------------ review render --

# Review layout: each critter on the stage, with a water lily pad under the frog
# for scale. The dragonfly is enlarged 1.5x and the two smallest critters 3x, in the render only.
REVIEW_LAYOUT = {
    # Back row
    "CRITTER_cattail": (-1.35, .5, 0),
    "CRITTER_snag": (-.7, .5, 0),
    "CRITTER_mosquito": (-.1, .5, .15),
    "CRITTER_dragonfly": (.75, .5, .4),
    "CRITTER_runner_leaf": (1.35, .5, 0),
    # Front row
    "CRITTER_frog": (-1.2, -.3, 0),
    "CRITTER_fish": (-.35, -.3, .15),
    "CRITTER_log": (.9, -.3, 0),
}
# The whole cast is drawn at 2x so it fills the frame; the smallest ones at 4x.
# Review-only: the GLB keeps true sizes.
REVIEW_ENLARGE = {"CRITTER_mosquito": 4.0, "CRITTER_runner_leaf": 4.0}
REVIEW_DEFAULT_ENLARGE = 2.0

for root in critters:
    root.location = REVIEW_LAYOUT[root.name]
    root.scale = (REVIEW_ENLARGE.get(root.name, REVIEW_DEFAULT_ENLARGE),) * 3

scene = bpy.context.scene
engines = [item.identifier for item in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
scene.render.resolution_x, scene.render.resolution_y = 900, 600
scene.render.resolution_percentage = 100
scene.eevee.taa_render_samples = 32
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.view_settings.exposure = .35
scene.world = bpy.data.worlds.new("Water cast review: mint pond morning")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = color_rgba("#b7dcd2")
scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = .95

bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, -.05))
floor = bpy.context.object
floor.name = "STAGE floor"
floor.data.materials.append(M["stagePond"])
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 6, 3))
backdrop = bpy.context.object
backdrop.name = "STAGE backdrop"
backdrop.dimensions = (60, .25, 12)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
backdrop.data.materials.append(M["stageBack"])

camera_data = bpy.data.cameras.new("STAGE camera")
camera = bpy.data.objects.new("STAGE camera", camera_data)
bpy.context.collection.objects.link(camera)
camera.location = (0, -8.0, 2.6)
camera.rotation_euler = (Vector((0, 0, .75)) - Vector(camera.location)).to_track_quat("-Z", "Y").to_euler()
camera_data.type = "ORTHO"
camera_data.ortho_scale = 3.5
scene.camera = camera

for name, location, energy, size, tint in [
    ("STAGE LIGHT warm key", (3, -6, 7), 1200, 5, (1.0, .93, .82)),
    ("STAGE LIGHT cool fill", (-6, -3, 4), 700, 5, (.76, .92, 1.0)),
    ("STAGE LIGHT soft rim", (5, 4, 6), 850, 4, (1.0, .82, .72)),
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

blend_path = OUTPUT / "water-care-cast.blend"
render_path = OUTPUT / "water-care-cast-review.png"
scene.render.filepath = str(render_path)
if "--no-render" not in sys.argv:
    bpy.ops.render.render(write_still=True)

def render_extra_view(png_path, camera_at, target, ortho_scale, only_names=None):
    """A scratch-only view (never a repository output): others hidden when `only_names` is given."""
    hidden = []
    for obj in bpy.data.objects:
        if obj.type != "MESH" or obj.name.startswith("STAGE"):
            continue
        if only_names is not None and obj.name not in only_names:
            obj.hide_render = True
            hidden.append(obj)
    stage_meshes = [obj for obj in bpy.data.objects if obj.name.startswith("STAGE") and obj.type == "MESH"]
    for obj in stage_meshes:
        obj.hide_render = True
    view_data = bpy.data.cameras.new("STAGE view camera")
    view_data.type = "ORTHO"
    view_data.ortho_scale = ortho_scale
    view_cam = bpy.data.objects.new("STAGE view camera", view_data)
    bpy.context.collection.objects.link(view_cam)
    view_cam.location = camera_at
    view_cam.rotation_euler = (Vector(target) - Vector(camera_at)).to_track_quat("-Z", "Y").to_euler()
    scene.camera = view_cam
    scene.render.filepath = png_path
    bpy.ops.render.render(write_still=True)
    scene.camera = camera
    for obj in hidden + stage_meshes:
        obj.hide_render = False
    scene.render.filepath = str(render_path)
    bpy.data.objects.remove(view_cam, do_unlink=True)


# Scratch-only extra views for the art check, enabled by environment variables.
if "--no-render" not in sys.argv:
    back_png = os.environ.get("WATER_CARE_BACK_PNG")
    if back_png:
        # The frog from behind: the stream game sees its back.
        render_extra_view(back_png, (-1.2, .9, .35), (-1.2, -.3, .15), .6,
                          {obj.name for obj in tree(frog)})
    close_png = os.environ.get("WATER_CARE_CLOSE_PNG")
    if close_png:
        render_extra_view(close_png, (-.6, -7.0, 1.0), (-.6, -.1, .3), 2.6)

# Undo the review layout before saving and exporting: true scale, roots at origin.
for root in critters:
    root.location = (0, 0, 0)
    root.scale = (1, 1, 1)

bpy.context.preferences.filepaths.save_version = 0
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


export(critters, OUTPUT / "water-care-cast.glb")
print("Water cast Blender source:", blend_path)
print("Water cast art review:", render_path)
print("Water cast GLB:", OUTPUT / "water-care-cast.glb", f"({CRITTER_COUNT} critters)")
