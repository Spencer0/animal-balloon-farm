"""Animal Balloon Farm: the vine's care cast (pipe spin, caterpillar squirt, runner steer).

Run from repository root:
  blender --background --factory-startup --python art/blender/vine_care_cast.py
Add `-- --cycles` to render the review on the CPU where EEVEE has no GPU.

Regenerates, in public/assets/plants/:
  vine-care-cast.blend        editable source for the cast
  vine-care-cast.glb          the cast, one root per critter
  vine-care-cast-review.png   art-review render of the cast side by side

Sizes are metres. Authoring frame matches root_care_cast.py: Z-up, each critter
on its own origin (the export zeroes every root), so glTF lands each one in
Three.js with +Y up, Blender's +X to the right and Blender's -Y (the side
facing the review camera) toward the game camera (+Z).

The game reads these models by node name:

  CRITTER_pump             the pipe spin's hand pump, about 0.55 m tall, its spout
                           pouring toward +X at about 0.15 m up
                           handle  the lever's pivot; rotate about Blender Y
                                   (glTF -Z) to pump it
  CRITTER_trough           a straight wooden trough across one 0.5 m tile, along X
                           (W to E), its floor at z = 0 and its walls 0.07 m high;
                           the water runs 0.045 m up
  CRITTER_elbow            a trough bending a quarter turn across one tile, from its
                           +Y edge (N) round to its +X edge (E)
  CRITTER_cross            two troughs crossing on one tile: W to E along the
                           ground, N to S arching over it on a little bridge
  CRITTER_rock             a mossy boulder about 0.36 m across, filling a tile
  CRITTER_sprayer          the caterpillar squirt's spray bottle, standing about
                           0.34 m tall, nozzle straight up (+Z)
  CRITTER_caterpillar_head a caterpillar's round head, about 0.22 m across, its
                           face to -Y (the camera)
  CRITTER_caterpillar_body one banded, fuzzy body bit, about 0.2 m across
  CRITTER_trellis_leaf     a vine leaf on the trellis, facing -Y, about 0.3 m across
  CRITTER_bubble           a soap bubble (see-through), about 0.2 m across
  CRITTER_suds             a blob of soap suds, about 0.24 m across, facing -Y
  CRITTER_tip              the runaway runner's growing tip, lying on the ground and
                           pointing +X, about 0.3 m long from its stem end at the origin
  CRITTER_vine_leaf        a leaf on a short stalk, lying almost flat, its stalk
                           from the origin out along +X, about 0.26 m long
  CRITTER_blossom          a yellow trumpet flower facing up, about 0.16 m across
  CRITTER_peg              a wooden garden peg standing in the ground, about 0.3 m tall

Verify with `node scripts/inspect-glb.mjs public/assets/plants/vine-care-cast.glb`.
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
random.seed(5531)

TILE = .5
TROUGH_INNER = .12
TROUGH_WALL = .024
TROUGH_HEIGHT = .07
TROUGH_FOOT = TROUGH_INNER + TROUGH_WALL * 2 + .04


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
    if alpha < 1:
        shader.inputs["Alpha"].default_value = alpha
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


def box(name, location, size, mat, parent=None, rotation=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + "_mesh"
    obj.scale = size
    if rotation is not None:
        obj.rotation_mode = "QUATERNION"
        obj.rotation_quaternion = rotation
    obj.data.materials.append(mat)
    return parent_local(obj, parent, location)


def torus(name, location, major, minor, mat, parent=None, rotation=None, segments=14, minor_segments=5):
    bpy.ops.mesh.primitive_torus_add(major_segments=segments, minor_segments=minor_segments, major_radius=major, minor_radius=minor, location=(0, 0, 0))
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


def aim(direction, track_axis="Z"):
    """A rotation that turns the local `track_axis` to point along `direction`."""
    return Vector(direction).normalized().to_track_quat(track_axis, "Z" if track_axis in ("X", "Y") else "Y")


def stick(name, start, end, radius_bottom, radius_top, mat, parent=None, segments=8):
    start = Vector(start)
    end = Vector(end)
    return cone(name, (start + end) / 2, radius_bottom, radius_top, (end - start).length, mat, parent, segments, aim(end - start))


def mesh_object(name, verts, faces, mat, parent, location=(0, 0, 0), rotation=None, smooth_shade=True):
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata([tuple(v) for v in verts], [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    if smooth_shade:
        smooth(obj)
    if rotation is not None:
        obj.rotation_mode = "QUATERNION"
        obj.rotation_quaternion = rotation
    return parent_local(obj, parent, location)


def tube(name, points, radii, mat, parent, sides=6):
    """One continuous lofted tube through `points` (parent-local), capped at both ends."""
    points = [Vector(p) for p in points]
    verts, faces, rings = [], [], []
    for i, p in enumerate(points):
        a = points[max(i - 1, 0)]
        b = points[min(i + 1, len(points) - 1)]
        tangent = (b - a).normalized()
        u = tangent.cross(Vector((0, 0, 1)))
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
    return mesh_object(name, verts, faces, mat, parent)


def sweep_plank(name, path, lateral, width, bottom, top, mat, parent):
    """A plank swept along a path of (x, y, rise) points: its cross-section a `width`-wide
    rectangle centred `lateral` to the path's left, from `bottom` to `top` above the path's rise."""
    path = [Vector(p) for p in path]
    verts, faces = [], []
    for i, p in enumerate(path):
        a = path[max(i - 1, 0)]
        b = path[min(i + 1, len(path) - 1)]
        tangent = Vector((b.x - a.x, b.y - a.y, 0)).normalized()
        left = Vector((-tangent.y, tangent.x, 0))
        centre = Vector((p.x, p.y, 0)) + left * lateral
        for side, height in ((-1, bottom), (1, bottom), (1, top), (-1, top)):
            verts.append(centre + left * side * width / 2 + Vector((0, 0, p.z + height)))
    for i in range(len(path) - 1):
        s0, s1 = i * 4, (i + 1) * 4
        for k in range(4):
            k2 = (k + 1) % 4
            faces.append((s0 + k, s0 + k2, s1 + k2, s1 + k))
    last = (len(path) - 1) * 4
    faces.append((3, 2, 1, 0))
    faces.append((last, last + 1, last + 2, last + 3))
    return mesh_object(name, verts, faces, mat, parent, smooth_shade=False)


def trough_along(prefix, path, parent):
    """A wooden trough along a path: a floor plank, two side walls and a darker rim on each wall."""
    floor_width = TROUGH_INNER + TROUGH_WALL * 2
    sweep_plank(f"{prefix}_floor", path, 0, floor_width, -.004, .02, M["plank"], parent)
    for side, label in ((1, "L"), (-1, "R")):
        lateral = side * (TROUGH_INNER / 2 + TROUGH_WALL / 2)
        sweep_plank(f"{prefix}_wall_{label}", path, lateral, TROUGH_WALL, .02, TROUGH_HEIGHT - .008, M["plankLight"], parent)
        sweep_plank(f"{prefix}_rim_{label}", path, lateral, TROUGH_WALL + .006, TROUGH_HEIGHT - .008, TROUGH_HEIGHT, M["plankDark"], parent)


def arc_path(centre, radius, start, end, steps, rise=None):
    """Points round a circle in the XY plane from angle `start` to `end`; `rise(t)` lifts them."""
    return [Vector((centre[0] + radius * math.cos(start + (end - start) * i / steps),
                    centre[1] + radius * math.sin(start + (end - start) * i / steps),
                    rise(i / steps) if rise else 0)) for i in range(steps + 1)]


def googly(prefix, parent, eyes, size):
    """White googly eyes; each pupil sits off-centre so it looks like it is rolling."""
    for label, centre, look in eyes:
        sphere(f"{prefix}_eye_{label}", centre, (size, size, size), M["eyeWhite"], parent, 10, 6)
        look = Vector(look).normalized()
        sphere(f"{prefix}_pupil_{label}", Vector(centre) + look * size * .62, (size * .5,) * 3, M["pupil"], parent, 8, 5)


def lobed_blade(name, parent, radius, lobes, depth, mat, location, rotation, droop=.25, segments=24, rings=2):
    """A palmate leaf blade spreading along its own +X from its stalk's notch at the origin, facing +Z."""
    centre = radius * (1 - depth) * .9

    def rim(theta):
        return radius * (1 - depth * (1 - math.cos(lobes * theta)) / 2)

    verts = [Vector((centre, 0, radius * .04))]
    for ring in range(1, rings + 1):
        f = ring / rings
        for j in range(segments):
            theta = math.tau * j / segments
            r = rim(theta) * f
            verts.append(Vector((centre + r * math.cos(theta), r * math.sin(theta), -droop * radius * f * f)))
    faces = [(0, 1 + j, 1 + (j + 1) % segments) for j in range(segments)]
    for ring in range(rings - 1):
        a = 1 + ring * segments
        b = a + segments
        for j in range(segments):
            j2 = (j + 1) % segments
            faces.append((a + j, b + j, b + j2, a + j2))
    blade = mesh_object(name, verts, faces, mat, parent, location, rotation)
    for k in range(lobes):
        theta = math.tau * k / lobes
        tip = Vector((centre + radius * .85 * math.cos(theta), radius * .85 * math.sin(theta), 0))
        mid = Vector((centre * .15, 0, 0)).lerp(tip, .5)
        from_centre = (mid - Vector((centre, 0, 0))).length / radius
        tube(f"{name}_vein_{k + 1}", [Vector((centre * .15, 0, .004)), Vector((mid.x, mid.y, -droop * radius * from_centre ** 2 + .004)),
                                       Vector((tip.x, tip.y, -droop * radius * .72 + .004))], [.004, .0035, .002], M["vein"], blade, 4)
    return blade


def trumpet(name, parent, at, direction, size):
    """A squash-family flower: a flared yellow trumpet with five pointed lobes, on a green calyx."""
    direction = Vector(direction).normalized()
    rotation = aim(direction)
    at = Vector(at)
    cone(f"{name}_calyx", at, .012 * size, .02 * size, .03 * size, M["stem"], parent, 8, rotation)
    mouth = at + direction * .075 * size
    cone(f"{name}_trumpet", at + direction * .042 * size, .016 * size, .05 * size, .066 * size, M["petal"], parent, 12, rotation)
    cone(f"{name}_throat", at + direction * .05 * size, .007 * size, .03 * size, .05 * size, M["throat"], parent, 10, rotation)
    across = direction.orthogonal().normalized()
    other = direction.cross(across).normalized()
    for k in range(5):
        angle = k * math.tau / 5
        out = across * math.cos(angle) + other * math.sin(angle)
        sphere(f"{name}_lobe_{k + 1}", mouth + out * .05 * size, (.034 * size, .02 * size, .006 * size), M["petal"], parent, 8, 4,
               (out + direction * .5).normalized().to_track_quat("X", "Z"))
    stick(f"{name}_stamen", at + direction * .03 * size, mouth + direction * .008 * size, .007 * size, .005 * size, M["throat"], parent, 6)


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
    "eyeWhite": make_material("VINE eye white", "#fffaf0", .3, 0, .4),
    "pupil": make_material("VINE pupil", "#24202a", .4, 0, .4),
    "cheek": make_material("VINE cheek", "#f4a3b5", .5, 0, .2),
    # Troughs and pump.
    "plank": make_material("VINE trough plank", "#b9824a", .65, 0, .12),
    "plankLight": make_material("VINE trough wall", "#cf9a5e", .6, 0, .15),
    "plankDark": make_material("VINE trough rim", "#8a5a31", .7, 0, .1),
    "post": make_material("VINE bridge post", "#9a6a3c", .7, 0, .1),
    "iron": make_material("VINE pump iron", "#3f8f7a", .4, .2, .45),
    "ironDark": make_material("VINE pump iron shade", "#2c6a5a", .45, .2, .4),
    "brass": make_material("VINE pump brass", "#d9a441", .35, .3, .4),
    "stone": make_material("VINE pump stone", "#b7ab98", .85, 0, .05),
    "water": make_material("VINE pump water", "#5ab4e0", .08, 0, .8),
    "rock": make_material("VINE rock", "#a59c91", .85, 0, .05),
    "rockDark": make_material("VINE rock shade", "#7f776e", .9, 0, .03),
    "moss": make_material("VINE moss", "#6f9a45", .9, 0, .03),
    # Sprayer.
    "bottle": make_material("VINE spray bottle", "#4fb3bf", .3, 0, .6),
    "bottleDark": make_material("VINE spray bottle shoulder", "#3a8f99", .35, 0, .5),
    "label": make_material("VINE spray label", "#fff3d6", .6, 0, .1),
    "trigger": make_material("VINE spray trigger", "#f4f1ea", .4, 0, .4),
    "nozzle": make_material("VINE spray nozzle", "#e05a44", .4, 0, .4),
    # Caterpillar.
    "cat": make_material("VINE caterpillar", "#9ad04a", .45, 0, .35),
    "catBand": make_material("VINE caterpillar band", "#f2c63a", .45, 0, .35),
    "catHead": make_material("VINE caterpillar head", "#6cb83e", .4, 0, .4),
    "catFoot": make_material("VINE caterpillar foot", "#4c7d2c", .5, 0, .2),
    "fuzz": make_material("VINE caterpillar fuzz", "#e8f6c8", .6, 0, .1),
    # Leaves, flowers, pegs.
    "leaf": make_material("VINE leaf", "#3f7d36", .6, 0, .2),
    "leafLight": make_material("VINE leaf sunlit", "#5a9a49", .55, 0, .25),
    "vein": make_material("VINE leaf vein", "#a9cf84", .55, 0, .2),
    "stem": make_material("VINE stem", "#5e8f3c", .55, 0, .2),
    "tendril": make_material("VINE tendril", "#93c24f", .45, 0, .3),
    "petal": make_material("VINE blossom", "#f6b928", .45, 0, .3),
    "throat": make_material("VINE blossom throat", "#e5871c", .45, 0, .3),
    "peg": make_material("VINE peg wood", "#c99a62", .65, 0, .1),
    "pegTop": make_material("VINE peg paint", "#d9573b", .45, 0, .4),
    "twine": make_material("VINE twine", "#e2c48a", .85, 0, .03),
    # Soap.
    "bubble": make_material("VINE soap bubble", "#cfeaff", .05, 0, .9, .38),
    "bubbleShine": make_material("VINE bubble shine", "#ffffff", .1, 0, .5),
    "suds": make_material("VINE suds", "#f4fbff", .35, 0, .3),
    "sudsShade": make_material("VINE suds shade", "#d6ecf6", .4, 0, .2),
    # Review stage (never exported).
    "stageFloor": make_material("STAGE buttercream floor", "#f6e6c6", .88, 0, .02),
    "stageBack": make_material("STAGE mint studio backdrop", "#a6d8cf", .9, 0, .02),
}

critters = []
H = TILE / 2

# -------------------------------------------------------------- troughs ----

trough = add_critter("CRITTER_trough", -1.5, .6)
trough_along("CRITTER_trough", [Vector((-H, 0, 0)), Vector((H, 0, 0))], trough)
for x in (-.15, .15):
    box(f"CRITTER_trough_foot_{int(x * 100)}", (x, 0, -.002), (.03, TROUGH_FOOT, .02), M["plankDark"], trough)

elbow = add_critter("CRITTER_elbow", -.9, .6)
# The centre line runs from the N edge's middle (0, H) round the tile's NE corner to the E edge's middle (H, 0).
trough_along("CRITTER_elbow", arc_path((H, H), H, math.pi, math.pi * 1.5, 8), elbow)
box("CRITTER_elbow_foot", (H * .3, H * .3, -.002), (.03, TROUGH_FOOT, .02), M["plankDark"], elbow, Euler((0, 0, math.radians(45))).to_quaternion())

cross = add_critter("CRITTER_cross", -.3, .6)
trough_along("CRITTER_cross_ground", [Vector((-H, 0, 0)), Vector((H, 0, 0))], cross)
# The N-S trough arches over the other on a little bridge, so the water plainly runs straight over.
bridge = [Vector((0, -H + i * TILE / 8, .085 * math.sin(math.pi * i / 8) ** .7)) for i in range(9)]
trough_along("CRITTER_cross_bridge", bridge, cross)
for sign in (-1, 1):
    for side in (-1, 1):
        stick(f"CRITTER_cross_post_{sign}_{side}", (side * .1, sign * .09, 0), (side * .1, sign * .09, .07), .012, .012, M["post"], cross, 6)

rock = add_critter("CRITTER_rock", .3, .6)
for k, (at, scale, tone) in enumerate([((0, 0, .08), (.17, .15, .1), "rock"), ((.08, -.05, .06), (.1, .09, .08), "rockDark"),
                                       ((-.09, .06, .05), (.09, .08, .06), "rock"), ((-.02, -.02, .15), (.09, .08, .05), "rock")]):
    sphere(f"CRITTER_rock_lump_{k + 1}", at, scale, M[tone], rock, 10, 6, Euler((0, 0, k * 1.3)).to_quaternion())
for k, (at, scale) in enumerate([((-.04, .02, .19), (.07, .05, .02)), ((.1, .04, .12), (.05, .04, .02)), ((-.12, -.03, .1), (.04, .05, .02))]):
    sphere(f"CRITTER_rock_moss_{k + 1}", at, scale, M["moss"], rock, 8, 4)

# ------------------------------------------------------------- the pump ----

pump = add_critter("CRITTER_pump", -2.15, .6)
box("CRITTER_pump_stone", (0, 0, .04), (.2, .2, .08), M["stone"], pump)
cone("CRITTER_pump_foot", (0, 0, .1), .07, .055, .04, M["ironDark"], pump, 12)
cone("CRITTER_pump_column", (0, 0, .25), .055, .048, .26, M["iron"], pump, 12)
for z in (.16, .34):
    torus(f"CRITTER_pump_band_{int(z * 100)}", (0, 0, z), .055, .008, M["ironDark"], pump, segments=12, minor_segments=4)
sphere("CRITTER_pump_cap", (0, 0, .39), (.058, .058, .04), M["ironDark"], pump, 12, 6)
sphere("CRITTER_pump_knob", (0, 0, .435), (.02, .02, .02), M["brass"], pump, 8, 5)
# The spout leans out over the troughs, toward +X, and turns down at its mouth.
tube("CRITTER_pump_spout", [Vector((.04, 0, .26)), Vector((.12, 0, .25)), Vector((.18, 0, .22)), Vector((.205, 0, .17))],
     [.022, .02, .018, .016], M["iron"], pump, 10)
torus("CRITTER_pump_spout_lip", (.205, 0, .16), .016, .005, M["brass"], pump, segments=10, minor_segments=4)
sphere("CRITTER_pump_drip", (.205, 0, .125), (.012, .012, .017), M["water"], pump, 8, 5)
handle = pivot("handle", (-.035, 0, .4), pump)
stick("CRITTER_pump_lever", (0, 0, 0), (-.26, 0, .07), .012, .01, M["ironDark"], handle, 8)
sphere("CRITTER_pump_grip", (-.27, 0, .072), (.03, .022, .022), M["nozzle"], handle, 10, 6, aim((-1, 0, .27), "X"))
stick("CRITTER_pump_rod", (.0, 0, 0), (.03, 0, -.05), .008, .008, M["brass"], handle, 6)
googly("CRITTER_pump", pump, (("L", (.034, -.05, .3), (0, -1, .1)), ("R", (-.034, -.05, .3), (0, -1, .1))), .016)

# --------------------------------------------------------------- sprayer ---

sprayer = add_critter("CRITTER_sprayer", .9, .55)
cone("CRITTER_sprayer_base", (0, 0, .01), .068, .07, .02, M["bottleDark"], sprayer, 14)
cone("CRITTER_sprayer_body", (0, 0, .11), .07, .064, .18, M["bottle"], sprayer, 14)
cone("CRITTER_sprayer_label", (0, 0, .11), .0705, .0655, .09, M["label"], sprayer, 14)
sphere("CRITTER_sprayer_bubble_mark", (0, -.067, .12), (.022, .006, .022), M["bottle"], sprayer, 8, 4)
cone("CRITTER_sprayer_shoulder", (0, 0, .225), .064, .032, .05, M["bottleDark"], sprayer, 14)
cone("CRITTER_sprayer_neck", (0, 0, .26), .03, .03, .03, M["trigger"], sprayer, 12)
box("CRITTER_sprayer_head", (0, 0, .295), (.06, .05, .05), M["trigger"], sprayer)
cone("CRITTER_sprayer_nozzle", (0, 0, .335), .016, .012, .03, M["nozzle"], sprayer, 10)
box("CRITTER_sprayer_trigger", (0, -.04, .265), (.03, .02, .05), M["nozzle"], sprayer, Euler((math.radians(-20), 0, 0)).to_quaternion())
googly("CRITTER_sprayer", sprayer, (("L", (.026, -.064, .175), (.1, -1, .05)), ("R", (-.026, -.064, .175), (-.1, -1, .05))), .017)
sphere("CRITTER_sprayer_cheek_L", (.048, -.058, .148), (.012, .004, .008), M["cheek"], sprayer, 8, 4, aim((.6, -1, 0), "Y"))
sphere("CRITTER_sprayer_cheek_R", (-.048, -.058, .148), (.012, .004, .008), M["cheek"], sprayer, 8, 4, aim((-.6, -1, 0), "Y"))

# ----------------------------------------------------------- caterpillar ---

head = add_critter("CRITTER_caterpillar_head", 1.35, .6)
sphere("CRITTER_caterpillar_head_ball", (0, 0, .11), (.11, .1, .1), M["catHead"], head, 12, 8)
googly("CRITTER_caterpillar_head", head, (("L", (.045, -.085, .14), (.1, -1, 0)), ("R", (-.045, -.085, .14), (-.1, -1, 0))), .03)
sphere("CRITTER_caterpillar_head_smile", (0, -.098, .085), (.035, .01, .012), M["catFoot"], head, 8, 4)
for side, label in ((1, "L"), (-1, "R")):
    sphere(f"CRITTER_caterpillar_head_cheek_{label}", (side * .07, -.08, .095), (.02, .006, .013), M["cheek"], head, 8, 4, aim((side * .7, -1, 0), "Y"))
    tip = Vector((side * .06, -.02, .3))
    stick(f"CRITTER_caterpillar_head_antenna_{label}", (side * .035, -.01, .19), tip, .007, .005, M["catFoot"], head, 6)
    sphere(f"CRITTER_caterpillar_head_antenna_tip_{label}", tip, (.016, .016, .016), M["catBand"], head, 8, 5)

body = add_critter("CRITTER_caterpillar_body", 1.75, .6)
sphere("CRITTER_caterpillar_body_ball", (0, 0, .1), (.1, .095, .095), M["cat"], body, 12, 8)
# A band round its middle (seen from the front as a stripe across it) and a pale fuzz.
torus("CRITTER_caterpillar_body_band", (0, 0, .1), .088, .018, M["catBand"], body, aim((1, 0, 0)), 16, 5)
for k in range(5):
    angle = math.radians(40 + k * 25)
    sphere(f"CRITTER_caterpillar_body_fuzz_{k + 1}", (math.cos(angle) * .04, -.07, .1 + math.sin(angle) * .07), (.01, .006, .01), M["fuzz"], body, 6, 3)
for side in (-1, 1):
    sphere(f"CRITTER_caterpillar_body_foot_{side}", (side * .045, -.03, .012), (.022, .02, .014), M["catFoot"], body, 8, 4)

# ---------------------------------------------------------------- leaves ---

trellis_leaf = add_critter("CRITTER_trellis_leaf", 2.2, .55)
stick("CRITTER_trellis_leaf_stalk", (-.03, .01, .02), (0, .0, .1), .009, .007, M["stem"], trellis_leaf, 6)
# The blade stands up facing the camera: its own +Z turned to -Y, its spread to +Z.
lobed_blade("CRITTER_trellis_leaf_blade", trellis_leaf, .15, 5, .28, M["leaf"], (0, 0, .07), Euler((math.radians(90), math.radians(-90), 0)).to_quaternion(), .2)

vine_leaf = add_critter("CRITTER_vine_leaf", -1.6, -.15)
tube("CRITTER_vine_leaf_stalk", [Vector((0, 0, .01)), Vector((.05, 0, .04)), Vector((.1, 0, .05))], [.008, .007, .006], M["stem"], vine_leaf, 6)
lobed_blade("CRITTER_vine_leaf_blade", vine_leaf, .1, 5, .26, M["leafLight"], (.1, 0, .05), Euler((0, math.radians(-8), 0)).to_quaternion(), .3)

# -------------------------------------------------------- the runner tip ---

tip = add_critter("CRITTER_tip", -1.05, -.15)
stem = [Vector((0, 0, .03)), Vector((.08, .01, .032)), Vector((.16, -.005, .04)), Vector((.21, 0, .055))]
tube("CRITTER_tip_stem", stem, [.024, .022, .019, .015], M["stem"], tip, 10)
sphere("CRITTER_tip_bud", (.23, 0, .062), (.03, .024, .026), M["tendril"], tip, 10, 6)
# A furled young leaf on top and a curling tendril reaching ahead.
lobed_blade("CRITTER_tip_young_leaf", tip, .06, 5, .3, M["leafLight"], (.14, .015, .05), Euler((math.radians(-25), math.radians(-35), math.radians(30))).to_quaternion(), .5, 18)
curl = []
for i in range(14):
    t = i / 13
    angle = t * math.tau * 1.6
    radius = .035 * (1 - .6 * t)
    curl.append(Vector((.24 + .1 * t + math.cos(angle) * radius * .3, math.sin(angle) * radius, .07 + .07 * t + (1 - math.cos(angle)) * radius)))
tube("CRITTER_tip_tendril", curl, [.006 - .003 * i / 13 for i in range(14)], M["tendril"], tip, 5)
googly("CRITTER_tip", tip, (("L", (.225, -.022, .085), (.4, -1, .2)), ("R", (.235, .02, .085), (.4, 1, .2))), .012)

blossom = add_critter("CRITTER_blossom", -.5, -.15)
trumpet("CRITTER_blossom_flower", blossom, (0, 0, .01), (0, 0, 1), 1.6)

peg = add_critter("CRITTER_peg", 0, -.15)
box("CRITTER_peg_stake", (0, 0, .13), (.04, .04, .26), M["peg"], peg)
cone("CRITTER_peg_point", (0, 0, -.015), .001, .028, .03, M["peg"], peg, 4, Euler((0, 0, math.radians(45))).to_quaternion())
box("CRITTER_peg_cap", (0, 0, .27), (.05, .05, .03), M["pegTop"], peg)
box("CRITTER_peg_hook", (.03, 0, .23), (.04, .036, .022), M["peg"], peg)
torus("CRITTER_peg_twine", (0, 0, .2), .03, .006, M["twine"], peg, segments=12, minor_segments=4)
torus("CRITTER_peg_twine_2", (0, 0, .185), .029, .005, M["twine"], peg, segments=12, minor_segments=4)

# ------------------------------------------------------------------ soap ---

bubble = add_critter("CRITTER_bubble", .55, -.15)
sphere("CRITTER_bubble_film", (0, 0, .1), (.1, .1, .1), M["bubble"], bubble, 14, 9)
sphere("CRITTER_bubble_shine", (-.04, -.07, .15), (.022, .008, .014), M["bubbleShine"], bubble, 8, 4, aim((-.5, -1, .6), "Y"))

suds = add_critter("CRITTER_suds", 1.05, -.15)
for k, (x, z, r) in enumerate([(0, .06, .06), (-.07, .05, .045), (.07, .045, .048), (-.035, .11, .04), (.04, .105, .042), (0, .15, .03), (.1, .09, .028), (-.1, .09, .03)]):
    sphere(f"CRITTER_suds_bubble_{k + 1}", (x, -.01 * (k % 3), z), (r, r * .85, r), M["suds" if k % 3 else "sudsShade"], suds, 8, 5)

# ------------------------------------------------------ review render ------

scene = bpy.context.scene
engines = [item.identifier for item in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
if "--cycles" in sys.argv:
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = 1400, 700
scene.render.resolution_percentage = 100
scene.eevee.taa_render_samples = 24
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.view_settings.exposure = .5
scene.world = bpy.data.worlds.new("Vine care cast review: buttercream meadow morning")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = color_rgba("#f1e4c0")
scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0

bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, -.4))
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
camera.location = (0, -6.5, 3.2)
camera.rotation_euler = (Vector((0, 0, .3)) - Vector(camera.location)).to_track_quat("-Z", "Y").to_euler()
camera_data.type = "ORTHO"
camera_data.ortho_scale = 5.0
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

review_path = OUTPUT / "vine-care-cast-review.png"
blend_path = OUTPUT / "vine-care-cast.blend"
scene.render.filepath = str(review_path)
# Review only: the ground pieces tipped toward the camera so their tops read.
tipped = [trough, elbow, cross, rock, tip, vine_leaf, blossom]
for critter in tipped:
    critter.rotation_euler = (math.radians(35), 0, 0)
if "--no-render" not in sys.argv:
    bpy.ops.render.render(write_still=True)
for critter in tipped:
    critter.rotation_euler = (0, 0, 0)
bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))


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
    filepath=str(OUTPUT / "vine-care-cast.glb"), export_format="GLB", use_selection=True,
    export_apply=True, export_animations=False, export_materials="EXPORT", export_texcoords=False,
    export_cameras=False, export_lights=False,
)
print("Vine care cast Blender source:", blend_path)
print("Vine care cast art review:", review_path)
print("Vine care cast GLB:", OUTPUT / "vine-care-cast.glb")
