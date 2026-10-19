"""Animal Balloon Farm: the vines (pumpkin, watermelon and cucumber).

Run from repository root:
  blender --background --factory-startup --python art/blender/vines.py
Add `-- --cycles` to render the review on the CPU where EEVEE has no GPU, and
name vines after `--` to regenerate only those (for example `-- pumpkin`).

Regenerates, in public/assets/plants/, for each of pumpkin, watermelon and cucumber:
  <id>.blend        editable source
  <id>.glb          the vine the garden plants
  <id>-review.png   art-review render: a seedling, half grown (in flower),
                    grown, and grown asking for care (caterpillars on the leaves
                    and the runaway runner a trim pegs down)

A vine is big umbrella leaves on runners, with its fruit swelling underneath,
so what makes each one recognisable is the fruit sitting in front of its leaves:

  pumpkin     a fat ribbed orange pumpkin with a curly stem, under broad dark
              five-lobed leaves on a straw-mulched bed
  watermelon  a long striped melon under deeply cut silvery leaves
  cucumber    a little teepee of three canes, the vine climbing it, with
              cucumbers hanging from it and a yellow flower at the top

Authoring frame matches root_vegetables.py: Z-up, resting on z = 0 and centred
on the origin, with the fruit toward -Y (the side the care stage's camera sees),
so glTF lands each model in Three.js with +Y up. Every model shares one set of
node names, so the game drives all three with one visual
(src/scene/vine-visual.ts), all under `VN_root`:

  VN_mound    the bed of soil (with its straw, or the cucumber's teepee); always shown
  VN_vines    the stems sprawling over the bed (or climbing the teepee); they
              grow out from the crown, so the game scales them with growth
  VN_leaf_N   one leaf on its stalk (N = 1..), pivoting at the stalk's base.
              Its stalk runs along its local +Z (glTF +Y), so the game grows it
              by scaling that axis and bows it outward when thirsty. Higher
              leaves open later.
  VN_fruit    holds VN_fruit_N, one pivot per fruit at the point it hangs or sits
              from; the game swells each from a small green bud
  VN_flowers  the yellow trumpet flowers, shown while the vine is growing
  VN_pests    caterpillars on the leaves, shown while pests are about
  VN_shoot    the runaway runner a trim pegs down, sprawling off the bed with a
              curling tip, shown while the plant wants a trim

Verify with `node scripts/inspect-glb.mjs public/assets/plants/pumpkin.glb`.
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
VINES = ("pumpkin", "watermelon", "cucumber")


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


def torus(name, location, major, minor, mat, parent=None, rotation=None, segments=12, minor_segments=4):
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


def aim(direction, up_axis="Z"):
    """A rotation that turns the local `up_axis` to point along `direction`."""
    return Vector(direction).normalized().to_track_quat(up_axis, "Y")


def stick(name, start, end, radius_bottom, radius_top, mat, parent=None, segments=6):
    start = Vector(start)
    end = Vector(end)
    return cone(name, (start + end) / 2, radius_bottom, radius_top, (end - start).length, mat, parent, segments, aim(end - start))


def tube(name, points, radii, mat, parent, sides=6, cap=True):
    """One continuous lofted tube through `points` (parent-local), so a stem has no joints."""
    points = [Vector(p) for p in points]
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
    if cap:
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


def mesh_object(name, verts, faces, mat, parent, location=(0, 0, 0), rotation=None):
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata([tuple(v) for v in verts], [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    smooth(obj)
    if rotation is not None:
        obj.rotation_mode = "QUATERNION"
        obj.rotation_quaternion = rotation
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


def fresh_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras,
                       bpy.data.lights, bpy.data.worlds, bpy.data.actions, bpy.data.objects):
        for block in list(collection):
            if block.users == 0:
                collection.remove(block)


def leaf_pivot(name, parent, base, azimuth, tilt):
    """A leaf's base: local +Z points up and out (tilted `tilt` from upright toward `azimuth`), local +X outward."""
    obj = pivot(name, base, parent)
    obj.rotation_mode = "XYZ"
    obj.rotation_euler = Euler((0, tilt, azimuth), "XYZ")
    return obj


def curve_points(length, bend, count=4):
    """A gently arching stalk in a leaf's local frame: up +Z, curving out along +X."""
    return [Vector((bend * length * (i / (count - 1)) ** 2, 0, length * i / (count - 1))) for i in range(count)]


def lobed_blade(name, parent, base, radius, lobes, depth, mat, face, droop=.32, segments=30, rings=3):
    """A palmate leaf blade, its stalk joining at `base` (parent-local). It spreads
    from there along its own +X, lying in its XY plane and facing +Z, with `lobes`
    rounded lobes (`depth` 0..1 is how deep the cuts run) and its rim drooping by
    `droop` of its radius, like an umbrella. `face` turns it into place."""
    centre = radius * (1 - depth) * .9

    def rim(theta):
        cut = (1 - math.cos(lobes * theta)) / 2
        return radius * (1 - depth * cut)

    verts = [Vector((centre, 0, radius * .04))]
    for ring in range(1, rings + 1):
        f = ring / rings
        for j in range(segments):
            theta = math.tau * j / segments
            r = rim(theta) * f
            # The rim droops, and the lobe tips curl down a little more.
            tip = (1 - (1 - math.cos(lobes * theta)) / 2)
            verts.append(Vector((centre + r * math.cos(theta), r * math.sin(theta), -droop * radius * f * f * (1 + .25 * tip))))
    faces = []
    for j in range(segments):
        faces.append((0, 1 + j, 1 + (j + 1) % segments))
    for ring in range(rings - 1):
        a = 1 + ring * segments
        b = a + segments
        for j in range(segments):
            j2 = (j + 1) % segments
            faces.append((a + j, b + j, b + j2, a + j2))
    return mesh_object(name, verts, faces, mat, parent, base, face), centre


def blade_veins(name, blade, centre, radius, lobes, mat, droop=.32):
    """Pale veins fanning from the stalk's notch to each lobe tip, laid on the blade's surface (in its own frame)."""
    notch = Vector((centre * .15, 0, 0))
    for k in range(lobes):
        theta = math.tau * k / lobes
        tip = Vector((centre + radius * .88 * math.cos(theta), radius * .88 * math.sin(theta), 0))
        points = []
        for t in (0.0, .5, 1.0):
            at = notch.lerp(tip, t)
            from_centre = (at - Vector((centre, 0, 0))).length / radius
            points.append(Vector((at.x, at.y, -droop * radius * from_centre * from_centre + .004)))
        tube(f"{name}_{k + 1}", points, [.0035, .003, .0015], mat, blade, 4, cap=False)


def mound(prefix, parent, radius, height, M, pebbles=5, seed=1):
    rng = random.Random(seed)
    bed = pivot(f"{prefix}_mound", parent=parent)
    sphere(f"{prefix}_mound_soil", (0, 0, 0), (radius, radius, height), M["soil"], bed, 14, 6)
    sphere(f"{prefix}_mound_rim", (0, 0, -.01), (radius + .035, radius + .035, height * .5), M["soilDark"], bed, 14, 4)
    for index in range(pebbles):
        angle = index * math.tau / pebbles + rng.uniform(-.3, .3)
        r = rng.uniform(.6, .92) * radius
        z = height * math.sqrt(max(0.0, 1 - (r / radius) ** 2))
        size = rng.uniform(.016, .024)
        sphere(f"{prefix}_mound_pebble_{index + 1}", (math.cos(angle) * r, math.sin(angle) * r, z), (size * 1.3, size, size * .6),
               M["pebble" if index % 3 else "pebbleDark"], bed, 6, 3, Euler((0, 0, rng.uniform(0, math.pi))).to_quaternion())
    return bed


def straw(bed, radius, height, M, count, seed):
    """Golden straw mulch strewn over the bed, the pumpkin patch's own look."""
    rng = random.Random(seed)
    for index in range(count):
        angle = rng.uniform(0, math.tau)
        r = rng.uniform(.25, .95) * radius
        z = height * math.sqrt(max(0.0, 1 - (r / radius) ** 2)) + .004
        at = Vector((math.cos(angle) * r, math.sin(angle) * r, z))
        lie = Vector((math.cos(angle + rng.uniform(-1.4, 1.4)), math.sin(angle + rng.uniform(-1.4, 1.4)), rng.uniform(-.08, .08))).normalized()
        length = rng.uniform(.05, .09)
        stick(f"VN_mound_straw_{index + 1}", at - lie * length / 2, at + lie * length / 2, .0035, .003,
              M["straw" if index % 3 else "strawDark"], bed, 4)


def common_materials(prefix):
    return {
        "soil": make_material(f"{prefix} soil", "#7a5136", .92, 0, .02),
        "soilDark": make_material(f"{prefix} soil shade", "#5a3a27", .95, 0, .01),
        "pebble": make_material(f"{prefix} pebble", "#c9b9a0", .7, 0, .1),
        "pebbleDark": make_material(f"{prefix} pebble shade", "#9c8f80", .75, 0, .08),
        "straw": make_material(f"{prefix} straw", "#e6c66e", .7, 0, .1),
        "strawDark": make_material(f"{prefix} straw shade", "#c9a24f", .75, 0, .08),
        "stem": make_material(f"{prefix} vine stem", "#5e8f3c", .55, 0, .2),
        "tendril": make_material(f"{prefix} tendril", "#86b04e", .5, 0, .2),
        "runner": make_material(f"{prefix} runaway runner", "#93c24f", .45, 0, .3),
        "runnerLeaf": make_material(f"{prefix} runaway runner leaf", "#7fbd45", .5, 0, .25),
        "petal": make_material(f"{prefix} blossom", "#f6b928", .45, 0, .3),
        "throat": make_material(f"{prefix} blossom throat", "#e5871c", .45, 0, .3),
        "calyx": make_material(f"{prefix} blossom calyx", "#6f9c3e", .5, 0, .2),
        "bud": make_material(f"{prefix} fruit bud", "#8cbf55", .45, 0, .3),
        "caterpillar": make_material(f"{prefix} caterpillar", "#9ad04a", .45, 0, .35),
        "caterpillarBand": make_material(f"{prefix} caterpillar band", "#f2d34a", .45, 0, .35),
        "caterpillarHead": make_material(f"{prefix} caterpillar head", "#5fa83a", .4, 0, .4),
        "bugEye": make_material(f"{prefix} bug eye", "#fffaf0", .3, 0, .4),
        "bugPupil": make_material(f"{prefix} bug pupil", "#24202a", .4, 0, .4),
        "stageFloor": make_material("STAGE buttercream floor", "#f6e6c6", .88, 0, .02),
        "stageBack": make_material("STAGE mint studio backdrop", "#a6d8cf", .9, 0, .02),
    }


def caterpillar(name, parent, at, facing, M, size=1.0):
    """A plump little caterpillar: banded segments behind a round head with googly eyes and antennae."""
    facing = Vector(facing).normalized()
    side = Vector((-facing.y, facing.x, 0)).normalized()
    at = Vector(at)
    for k in range(4):
        back = at - facing * (.018 + k * .016) * size
        r = (.013 - k * .0015) * size
        sphere(f"{name}_seg_{k + 1}", back + Vector((0, 0, (.002 if k % 2 else .005) * size)), (r, r, r * .9),
               M["caterpillarBand" if k % 2 else "caterpillar"], parent, 7, 4)
    head = at + Vector((0, 0, .008 * size))
    sphere(f"{name}_head", head, (.015 * size,) * 3, M["caterpillarHead"], parent, 8, 5)
    for sign, label in ((1, "L"), (-1, "R")):
        eye = head + facing * .011 * size + side * sign * .007 * size + Vector((0, 0, .006 * size))
        sphere(f"{name}_eye_{label}", eye, (.0055 * size,) * 3, M["bugEye"], parent, 5, 3)
        sphere(f"{name}_pupil_{label}", eye + facing * .004 * size, (.0028 * size,) * 3, M["bugPupil"], parent, 4, 3)
        tip = head + side * sign * .008 * size + Vector((0, 0, .028 * size)) + facing * .006 * size
        stick(f"{name}_antenna_{label}", head + side * sign * .005 * size + Vector((0, 0, .012 * size)), tip, .0016 * size, .0012 * size, M["caterpillarHead"], parent, 4)
        sphere(f"{name}_antenna_tip_{label}", tip, (.003 * size,) * 3, M["caterpillarBand"], parent, 4, 3)


def trumpet(name, parent, at, direction, size, M):
    """A squash-family flower: a flared yellow trumpet with five pointed lobes, on a green calyx."""
    direction = Vector(direction).normalized()
    rotation = aim(direction)
    at = Vector(at)
    cone(f"{name}_calyx", at, .007 * size, .012 * size, .018 * size, M["calyx"], parent, 6, rotation)
    mouth = at + direction * .045 * size
    cone(f"{name}_trumpet", at + direction * .025 * size, .01 * size, .03 * size, .04 * size, M["petal"], parent, 10, rotation)
    cone(f"{name}_throat", at + direction * .03 * size, .004 * size, .018 * size, .03 * size, M["throat"], parent, 8, rotation)
    across = direction.orthogonal().normalized()
    other = direction.cross(across).normalized()
    for k in range(5):
        angle = k * math.tau / 5
        out = across * math.cos(angle) + other * math.sin(angle)
        sphere(f"{name}_lobe_{k + 1}", mouth + out * .03 * size, (.02 * size, .012 * size, .004 * size), M["petal"], parent, 6, 3,
               (out + direction * .5).normalized().to_track_quat("X", "Z"))
    stick(f"{name}_stamen", at + direction * .02 * size, mouth + direction * .004 * size, .004 * size, .003 * size, M["throat"], parent, 5)


def tendril(name, parent, at, axis_dir, M, radius=.012, turns=2.2, length=.05, tone="tendril"):
    """A curly tendril: a tightening helix along `axis_dir`."""
    axis_dir = Vector(axis_dir).normalized()
    across = axis_dir.orthogonal().normalized()
    other = axis_dir.cross(across).normalized()
    points = []
    steps = 10
    for i in range(steps + 1):
        t = i / steps
        angle = t * turns * math.tau
        r = radius * (1 - .6 * t)
        points.append(Vector(at) + axis_dir * length * t + across * math.cos(angle) * r + other * math.sin(angle) * r)
    thick = 2.2 if tone == "runner" else 1
    tube(name, points, [(.0028 - .0016 * i / steps) * thick for i in range(steps + 1)], M[tone], parent, 4)


def bed_flowers(root, M, spots, size=1.0):
    """Trumpet flowers on short stems low in the bed, peeking up between the leaves: (x, y, height, lean azimuth)."""
    flowers = pivot("VN_flowers", parent=root)
    for k, (x, y, height, azimuth) in enumerate(spots):
        lean = Vector((math.cos(azimuth) * .45, math.sin(azimuth) * .45, 1)).normalized()
        foot = Vector((x, y, .045))
        top = foot + lean * height
        tube(f"VN_flowers_{k + 1}_stem", [foot, foot.lerp(top, .5) + Vector((0, 0, .01)), top], [.006, .005, .005], M["stem"], flowers, 5, cap=False)
        trumpet(f"VN_flowers_{k + 1}", flowers, top, lean, size, M)
    return flowers


def leaf_with_blade(index, root, base, azimuth, tilt, length, bend, blade_radius, lobes, depth, M, tone, lean=.25, droop=.32):
    """A leaf: an arching stalk from `base`, carrying a lobed blade held mostly face-up at its tip."""
    leaf = leaf_pivot(f"VN_leaf_{index}", root, base, azimuth, tilt)
    points = curve_points(length, bend)
    tube(f"VN_leaf_{index}_stalk", points, [.007, .0065, .0055, .0045], M["stem"], leaf, 5)
    # Undo the stalk's lean so the blade faces the sky, then tip it outward a touch.
    face = Euler((0, -tilt + lean, 0)).to_quaternion()
    blade, centre = lobed_blade(f"VN_leaf_{index}_blade", leaf, points[-1], blade_radius, lobes, depth, M[tone], face, droop)
    blade_veins(f"VN_leaf_{index}_vein", blade, centre, blade_radius, lobes, M["vein"], droop)
    return leaf, points[-1], face, centre


def blade_top(leaf, tip, face, centre, lift=.012):
    """A point just above the middle of a leaf's blade, in the root's space (for bugs and flowers to sit on)."""
    local = Vector(tip) + face @ Vector((centre, 0, lift))
    return leaf.matrix_basis @ local


def runaway_runner(root, M, out_azimuth, reach, seed, lift_tip=.1):
    """The runaway runner a trim pegs down: a long stem snaking off the bed over the ground, small leaves along it, a curling tip."""
    rng = random.Random(seed)
    shoot = pivot("VN_shoot", (0, 0, .03), root)
    out = Vector((math.cos(out_azimuth), math.sin(out_azimuth), 0))
    side = Vector((-out.y, out.x, 0))
    points = []
    for i in range(7):
        t = i / 6
        wiggle = math.sin(t * math.pi * 2.2) * .05
        z = .02 + .02 * math.sin(t * math.pi) + (lift_tip * (t - .8) / .2 if t > .8 else 0)
        points.append(out * reach * t + side * wiggle + Vector((0, 0, z)))
    tube("VN_shoot_stem", points, [.013, .012, .012, .011, .01, .009, .007], M["runner"], shoot, 7)
    for k, t in enumerate((.35, .6, .82)):
        at = points[int(t * 6)].lerp(points[min(6, int(t * 6) + 1)], t * 6 % 1)
        flank = side * (1 if k % 2 else -1)
        lobed_blade(f"VN_shoot_leaf_{k + 1}", shoot, at + flank * .015 + Vector((0, 0, .012)), .065 + rng.uniform(0, .015), 5, .3, M["runnerLeaf"],
                    (flank + Vector((0, 0, .5))).normalized().to_track_quat("X", "Z") @ Euler((math.radians(-60), 0, 0)).to_quaternion(), .2, 16, 2)
    tendril("VN_shoot_tip", shoot, points[-1], out + Vector((0, 0, .9)), M, .026, 2.4, .09, "runner")
    trumpet("VN_shoot_bud", shoot, points[4] + Vector((0, 0, .02)), side + Vector((0, 0, 1.2)), .9, M)
    return shoot


# ---------------------------------------------------------------- pumpkin ---

def pumpkin_fruit(name, parent, M):
    """A fat ribbed pumpkin, sitting on its base: overlapping lobes in a ring, a dimpled top and a twisted stem."""
    lobes = 9
    for k in range(lobes):
        angle = k * math.tau / lobes
        at = Vector((math.cos(angle) * .055, math.sin(angle) * .055, .085))
        sphere(f"{name}_lobe_{k + 1}", at, (.07, .052, .085), M["pumpkin" if k % 2 else "pumpkinLight"], parent, 10, 7,
               Euler((0, 0, angle)).to_quaternion())
    sphere(f"{name}_core", (0, 0, .088), (.095, .095, .082), M["pumpkinDeep"], parent, 12, 7)
    sphere(f"{name}_dimple", (0, 0, .163), (.03, .03, .012), M["pumpkinDeep"], parent, 8, 4)
    stem = [Vector((0, 0, .158)), Vector((.004, .002, .185)), Vector((.012, -.004, .205)), Vector((.026, -.006, .214))]
    tube(f"{name}_stem", stem, [.014, .012, .01, .009], M["pumpkinStem"], parent, 6)
    tendril(f"{name}_curl", parent, (.024, -.006, .21), (1, -.3, .5), M, .01, 1.8, .035)


def build_pumpkin():
    rng = random.Random(907)
    M = common_materials("PK")
    M.update({
        "pumpkin": make_material("PK pumpkin", "#e8600e", .5, 0, .35),
        "pumpkinLight": make_material("PK pumpkin rib", "#f27a18", .5, 0, .35),
        "pumpkinDeep": make_material("PK pumpkin crease", "#b8460c", .55, 0, .3),
        "pumpkinStem": make_material("PK pumpkin stem", "#7d6a3a", .7, 0, .1),
        "leaf": make_material("PK leaf", "#2f6a2c", .6, 0, .2),
        "leafLight": make_material("PK leaf sunlit", "#41813a", .55, 0, .25),
        "vein": make_material("PK leaf vein", "#9cc77a", .55, 0, .2),
    })
    root = pivot("VN_root")
    root["design_size"] = "about 0.75 m across the leaves, 0.32 m tall grown"
    bed = mound("VN", root, .3, .06, M, 5, 91)
    straw(bed, .3, .06, M, 22, 92)

    # Main vines snaking out over the straw from the crown, behind the pumpkin.
    vines = pivot("VN_vines", (0, .05, .05), root)
    for k, azimuth in enumerate((.35, 1.6, 2.85, 4.1)):
        out = Vector((math.cos(azimuth), math.sin(azimuth), 0))
        side = Vector((-out.y, out.x, 0))
        points = [out * .26 * t + side * math.sin(t * 5) * .025 + Vector((0, 0, .01 * (1 - t))) for t in (0, .33, .66, 1)]
        tube(f"VN_vines_{k + 1}", points, [.011, .009, .008, .006], M["stem"], vines, 6)
        tendril(f"VN_vines_{k + 1}_curl", vines, points[2] + side * .01, side + Vector((0, 0, .8)), M, .01, 2, .035)

    # Broad five-lobed leaves on short stalks, overlapping in a low mound, leaving the front clear for the pumpkin.
    leaves = []
    plan = [(.15, 48, .17), (.8, 38, .2), (1.4, 25, .22), (1.95, 30, .21), (2.55, 40, .2), (3.15, 50, .17), (3.75, 58, .13),
            (5.75, 58, .13), (1.1, 62, .12), (2.25, 64, .12)]
    for index, (azimuth, tilt_deg, length) in enumerate(plan):
        base = Vector((math.cos(azimuth) * .06, .05 + math.sin(azimuth) * .06, .05))
        leaf = leaf_with_blade(index + 1, root, base, azimuth + rng.uniform(-.1, .1), math.radians(tilt_deg), length, rng.uniform(.25, .4),
                               rng.uniform(.14, .165), 5, .26, M, "leafLight" if index % 2 else "leaf", .3, .36)
        leaves.append(leaf)

    # The pumpkin, out in front of the leaves.
    fruit = pivot("VN_fruit", parent=root)
    one = pivot("VN_fruit_1", (.02, -.14, .015), fruit)
    pumpkin_fruit("VN_fruit_1_pumpkin", one, M)

    # Yellow trumpet flowers peeking up between the leaves.
    bed_flowers(root, M, [(-.17, -.08, .1, 3.6), (.2, -.05, .11, -.4), (-.05, .2, .17, 1.6)], 1.3)

    # Caterpillars munching on three leaves.
    pests = pivot("VN_pests", parent=root)
    for k, index in enumerate((0, 2, 4)):
        top = blade_top(*leaves[index], lift=.024)
        azimuth = plan[index][0]
        caterpillar(f"VN_pests_caterpillar_{k + 1}", pests, top, (-math.sin(azimuth), math.cos(azimuth), 0), M, 2.0)

    runaway_runner(root, M, -.35, .5, 93)
    return root, M


# ------------------------------------------------------------- watermelon ---

def watermelon_fruit(name, parent, M):
    """A long striped melon lying on its side (its length along X), with a pale spot where it rests."""
    a, b, c = .14, .1, .095
    sphere(f"{name}_rind", (0, 0, c), (a, b, c), M["melon"], parent, 16, 10)
    sphere(f"{name}_spot", (.01, -.02, .012), (.06, .045, .01), M["melonSpot"], parent, 8, 4)
    # Dark wavy stripes along its length, each hugging the rind.
    stripes = 9
    for k in range(stripes):
        phi = k * math.tau / stripes
        if math.sin(phi) < -.75:
            continue
        points = []
        steps = 9
        for i in range(steps + 1):
            u = .12 * math.pi + .76 * math.pi * i / steps
            wobble = phi + .09 * math.sin(i * 1.7 + k)
            points.append(Vector((a * math.cos(u) * 1.005, b * math.sin(u) * math.cos(wobble) * 1.02, c + c * math.sin(u) * math.sin(wobble) * 1.02)))
        tube(f"{name}_stripe_{k + 1}", points, [.006 + .007 * math.sin(math.pi * i / steps) for i in range(steps + 1)], M["melonStripe"], parent, 4, cap=False)
    stem = [Vector((a * .96, 0, c + .01)), Vector((a + .012, 0, c + .02)), Vector((a + .02, .004, c + .032))]
    tube(f"{name}_stem", stem, [.008, .007, .006], M["stem"], parent, 5)
    tendril(f"{name}_curl", parent, stem[-1], (.6, .2, 1), M, .009, 2, .03)


def build_watermelon():
    rng = random.Random(1313)
    M = common_materials("WM")
    M.update({
        "melon": make_material("WM rind", "#6aa84f", .4, 0, .45),
        "melonStripe": make_material("WM rind stripe", "#2f6a34", .4, 0, .45),
        "melonSpot": make_material("WM field spot", "#e8d98a", .6, 0, .2),
        "leaf": make_material("WM leaf", "#4f8a5a", .6, 0, .2),
        "leafLight": make_material("WM leaf silvery", "#78a87a", .55, 0, .25),
        "vein": make_material("WM leaf vein", "#c6dcb4", .55, 0, .2),
    })
    root = pivot("VN_root")
    root["design_size"] = "about 0.75 m across the leaves, 0.3 m tall grown"
    bed = mound("VN", root, .3, .055, M, 5, 131)
    straw(bed, .3, .055, M, 18, 132)

    vines = pivot("VN_vines", (0, .05, .05), root)
    for k, azimuth in enumerate((.2, 1.4, 2.6, 3.7, 5.2)):
        out = Vector((math.cos(azimuth), math.sin(azimuth), 0))
        side = Vector((-out.y, out.x, 0))
        points = [out * .28 * t + side * math.sin(t * 6) * .022 + Vector((0, 0, .008 * (1 - t))) for t in (0, .33, .66, 1)]
        tube(f"VN_vines_{k + 1}", points, [.009, .008, .007, .005], M["stem"], vines, 6)
        if k % 2 == 0:
            tendril(f"VN_vines_{k + 1}_curl", vines, points[2] + side * .01, side + Vector((0, 0, .8)), M, .009, 2, .03)

    # Deeply cut, silvery leaves, lower and more of them than the pumpkin's.
    leaves = []
    plan = [(.1, 40, .2), (.8, 34, .22), (1.45, 20, .24), (2.1, 30, .23), (2.8, 40, .22), (3.5, 46, .18), (5.9, 46, .16), (1.15, 55, .14), (2.45, 56, .14)]
    for index, (azimuth, tilt_deg, length) in enumerate(plan):
        base = Vector((math.cos(azimuth) * .06, .05 + math.sin(azimuth) * .06, .045))
        leaf = leaf_with_blade(index + 1, root, base, azimuth + rng.uniform(-.1, .1), math.radians(tilt_deg), length * .8, rng.uniform(.25, .4),
                               rng.uniform(.13, .15), 5, .6, M, "leafLight" if index % 2 else "leaf", .3, .24)
        leaves.append(leaf)

    fruit = pivot("VN_fruit", parent=root)
    one = pivot("VN_fruit_1", (-.03, -.15, .012), fruit)
    one.rotation_euler = (0, 0, math.radians(-12))
    watermelon_fruit("VN_fruit_1_melon", one, M)

    bed_flowers(root, M, [(-.2, -.06, .09, 3.4), (.18, .0, .1, -.2), (.02, .21, .15, 1.5)], 1.0)

    pests = pivot("VN_pests", parent=root)
    for k, index in enumerate((0, 2, 5)):
        top = blade_top(*leaves[index], lift=.024)
        azimuth = plan[index][0]
        caterpillar(f"VN_pests_caterpillar_{k + 1}", pests, top, (-math.sin(azimuth), math.cos(azimuth), 0), M, 2.0)

    runaway_runner(root, M, -.3, .5, 133)
    return root, M


# --------------------------------------------------------------- cucumber ---

def cucumber_fruit(name, parent, M, length=.12, seed=1):
    """A cucumber hanging from its stem at the origin: long, dark, a little bent, with pale bumps and a dry flower at its tip."""
    rng = random.Random(seed)
    points = [Vector((0, 0, 0)), Vector((.004, 0, -length * .3)), Vector((.01, 0, -length * .65)), Vector((.008, 0, -length))]
    tube(f"{name}_neck", [Vector((0, 0, .012)), points[0]], [.004, .006], M["stem"], parent, 5, cap=False)
    tube(f"{name}_body", points, [.022, .03, .03, .021], M["cucumber"], parent, 8)
    sphere(f"{name}_tip", points[-1] + Vector((0, 0, -.004)), (.021, .021, .015), M["cucumber"], parent, 8, 4)
    for k in range(10):
        t = rng.uniform(.15, .9)
        angle = rng.uniform(0, math.tau)
        at = points[1].lerp(points[2], t) if t < .5 else points[2].lerp(points[3], (t - .5) * 2)
        at = Vector((at.x, at.y, -length * t))
        sphere(f"{name}_bump_{k + 1}", at + Vector((math.cos(angle) * .029, math.sin(angle) * .029, 0)), (.0055, .0055, .0055), M["cucumberBump"], parent, 4, 3)
    for k in range(3):
        angle = k * math.tau / 3
        stick(f"{name}_stripe_{k + 1}", Vector((math.cos(angle) * .027, math.sin(angle) * .027, -length * .15)),
              Vector((math.cos(angle) * .025 + .008, math.sin(angle) * .025, -length * .85)), .005, .004, M["cucumberLight"], parent, 4)
    sphere(f"{name}_dry_flower", points[-1] + Vector((0, 0, -.016)), (.01, .01, .006), M["petal"], parent, 6, 3)


def build_cucumber():
    rng = random.Random(1717)
    M = common_materials("CU")
    M.update({
        "cucumber": make_material("CU cucumber", "#3f8a35", .4, 0, .45),
        "cucumberLight": make_material("CU cucumber stripe", "#8cc068", .45, 0, .35),
        "cucumberBump": make_material("CU cucumber bump", "#a8cf7a", .5, 0, .3),
        "cane": make_material("CU bamboo cane", "#d8b77a", .55, 0, .15),
        "caneNode": make_material("CU cane node", "#b08c4e", .6, 0, .1),
        "twine": make_material("CU twine", "#c98f5a", .8, 0, .05),
        "leaf": make_material("CU leaf", "#467f38", .6, 0, .2),
        "leafLight": make_material("CU leaf sunlit", "#64a04b", .55, 0, .25),
        "vein": make_material("CU leaf vein", "#b5d78f", .55, 0, .2),
    })
    root = pivot("VN_root")
    root["design_size"] = "about 0.5 m across the bed, 0.75 m tall to the top of its canes"
    bed = mound("VN", root, .24, .05, M, 5, 171)

    # The teepee: three bamboo canes leaning together, tied with twine at the top.
    apex = Vector((0, .01, .74))
    cane_feet = []
    for k in range(3):
        azimuth = math.radians(90 + k * 120)
        foot = Vector((math.cos(azimuth) * .17, math.sin(azimuth) * .17 + .01, .02))
        cane_feet.append(foot)
        top = apex + (apex - foot).normalized() * .06
        stick(f"VN_mound_cane_{k + 1}", foot, top, .009, .007, M["cane"], bed, 6)
        for t in (.3, .62):
            stick(f"VN_mound_cane_{k + 1}_node_{int(t * 100)}", foot.lerp(top, t) - (top - foot).normalized() * .004,
                  foot.lerp(top, t) + (top - foot).normalized() * .004, .0105, .0105, M["caneNode"], bed, 6)
    torus("VN_mound_twine", apex - Vector((0, 0, .01)), .014, .005, M["twine"], bed, None, 10, 4)
    torus("VN_mound_twine_2", apex - Vector((0, 0, .025)), .016, .004, M["twine"], bed, None, 10, 4)

    # The vine winds up each cane.
    vines = pivot("VN_vines", (0, 0, 0), root)
    for k, foot in enumerate(cane_feet):
        along = apex - foot
        across = along.cross(Vector((0, 0, 1))).normalized()
        out = along.cross(across).normalized()
        points = []
        for i in range(9):
            t = i / 8 * .82
            angle = t * math.tau * 2.2 + k
            points.append(foot.lerp(apex, t) + (across * math.cos(angle) + out * math.sin(angle)) * .013)
        tube(f"VN_vines_{k + 1}", points, [.008 - .004 * i / 8 for i in range(9)], M["stem"], vines, 5, cap=False)
        tendril(f"VN_vines_{k + 1}_curl", vines, foot.lerp(apex, .55) + across * .015, across + Vector((0, 0, .6)), M, .009, 2.2, .03)

    # Leaves off the canes, from the bed up to near the top: lower ones open first.
    leaves = []
    heights = [.06, .11, .16, .21, .26, .31, .36, .41, .46, .51, .57, .63]
    for index, t in enumerate(heights):
        k = index % 3
        foot = cane_feet[k]
        at = foot.lerp(apex, t / apex.z)
        outward = Vector((at.x, at.y, 0))
        azimuth = math.atan2(outward.y, outward.x) + rng.uniform(-.4, .4) + (.7 if index % 2 else -.7)
        leaf = leaf_with_blade(index + 1, root, at, azimuth, math.radians(rng.uniform(55, 70)), rng.uniform(.05, .075), rng.uniform(.1, .25),
                               rng.uniform(.068, .08) * (1.1 - t * .45), 5, .22, M, "leafLight" if index % 2 else "leaf", .45, .28)
        leaves.append(leaf)

    # Three cucumbers hanging off the canes, the front two well in sight.
    fruit = pivot("VN_fruit", parent=root)
    for k, (cane, t, length) in enumerate(((1, .4, .16), (2, .33, .15), (2, .58, .12))):
        foot = cane_feet[cane]
        at = foot.lerp(apex, t)
        out = Vector((at.x, at.y, 0)).normalized()
        hang = pivot(f"VN_fruit_{k + 1}", at + out * .018, fruit)
        hang.rotation_euler = (math.radians(rng.uniform(-8, 8)), math.radians(rng.uniform(-10, 10)), 0)
        cucumber_fruit(f"VN_fruit_{k + 1}_cucumber", hang, M, length, 180 + k)

    flowers = pivot("VN_flowers", parent=root)
    for k, (cane, t) in enumerate(((0, .7), (1, .58), (2, .78), (1, .2))):
        foot = cane_feet[cane]
        at = foot.lerp(apex, t)
        out = Vector((at.x, at.y, 0)).normalized()
        trumpet(f"VN_flowers_{k + 1}", flowers, at + out * .02, out + Vector((0, 0, .5)), .7, M)

    pests = pivot("VN_pests", parent=root)
    for k, index in enumerate((2, 5, 9)):
        top = blade_top(*leaves[index], lift=.018)
        caterpillar(f"VN_pests_caterpillar_{k + 1}", pests, top, (0, -1, 0) if k % 2 else (1, 0, 0), M, 1.7)

    runaway_runner(root, M, -.25, .48, 173, .14)
    return root, M


BUILDERS = {"pumpkin": build_pumpkin, "watermelon": build_watermelon, "cucumber": build_cucumber}


# ------------------------------------------------------------ review render --

def setup_review(name):
    scene = bpy.context.scene
    engines = [item.identifier for item in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
    scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
    if "--cycles" in sys.argv:
        # For machines without a GPU (cloud containers), where EEVEE cannot start.
        scene.render.engine = "CYCLES"
        scene.cycles.device = "CPU"
        scene.cycles.samples = 48
        scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1400, 700
    scene.render.resolution_percentage = 100
    scene.eevee.taa_render_samples = 48
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = .2
    scene.world = bpy.data.worlds.new(f"{name} review: mint fairground morning")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = color_rgba("#b7dcd2")
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = .68


def build_stage(M):
    scene = bpy.context.scene
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
    camera.location = (0, -6.5, 3.4)
    camera.rotation_euler = (Vector((0, 0, .3)) - Vector(camera.location)).to_track_quat("-Z", "Y").to_euler()
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 4.3
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


def show_tree(obj, shown):
    obj.hide_render = not shown
    for child in obj.children_recursive:
        child.hide_render = not shown


def stage_copy(root, location, growth, care):
    """A linked copy posed at one moment of its life, the way src/scene/vine-visual.ts poses it."""
    mapping = {}
    for obj in [root, *root.children_recursive]:
        dup = obj.copy()
        bpy.context.collection.objects.link(dup)
        mapping[obj] = dup
    for obj, dup in mapping.items():
        if obj.parent in mapping:
            dup.parent = mapping[obj.parent]
    mapping[root].location = location
    heights = [obj.location.z for obj in root.children if obj.name.startswith("VN_leaf_")]
    low, high = min(heights), max(heights)
    for obj, dup in mapping.items():
        if obj.parent is root and obj.name.startswith("VN_leaf_"):
            index = int(obj.name.rsplit("_", 1)[1])
            lag = .35 * (obj.location.z - low) / (high - low) if high - low > .1 else ((index - 1) % 4) * .035
            rise = max(0.0, min(1.0, (growth - .02 - lag) / (.68 - lag * .5)))
            dup.scale = (.3 + .7 * rise, .3 + .7 * rise, max(.03, rise))
            if rise <= .01:
                show_tree(dup, False)
        if obj.name == "VN_vines":
            size = .25 + .75 * min(1, growth / .7)
            dup.scale = (size, size, size)
        if obj.parent is not None and obj.parent.name == "VN_fruit":
            swell = max(0.0, min(1.0, (growth - .4) / .5))
            size = .15 + .85 * swell
            dup.scale = (size, size, size)
            if growth < .4:
                show_tree(dup, False)
        if obj.name in ("VN_pests", "VN_shoot"):
            show_tree(dup, care)
        if obj.name == "VN_flowers":
            show_tree(dup, .3 <= growth < .95 and not care)
    return mapping[root]


def remove_tree(obj):
    for child in [obj, *obj.children_recursive]:
        bpy.data.objects.remove(child, do_unlink=True)


def select_tree(obj):
    obj.select_set(True)
    for child in obj.children:
        select_tree(child)


def make(name):
    fresh_scene()
    root, M = BUILDERS[name]()
    setup_review(name)
    build_stage(M)
    copies = [
        stage_copy(root, (-1.5, 0, 0), .25, False),
        stage_copy(root, (-.5, 0, 0), .6, False),
        stage_copy(root, (.5, 0, 0), 1, False),
        stage_copy(root, (1.45, 0, 0), 1, True),
    ]
    show_tree(root, False)
    render_path = OUTPUT / f"{name}-review.png"
    bpy.context.scene.render.filepath = str(render_path)
    if "--no-render" not in sys.argv:
        bpy.ops.render.render(write_still=True)
    for copy_root in copies:
        remove_tree(copy_root)
    show_tree(root, True)
    blend_path = OUTPUT / f"{name}.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    flatten_material_colours()
    bpy.ops.object.select_all(action="DESELECT")
    select_tree(root)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(OUTPUT / f"{name}.glb"), export_format="GLB", use_selection=True,
        export_apply=True, export_animations=False, export_materials="EXPORT", export_texcoords=False,
        export_cameras=False, export_lights=False,
    )
    print(f"{name}: {blend_path}, {render_path}, {OUTPUT / (name + '.glb')}")


wanted = [arg for arg in (sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []) if arg in VINES]
for vine in wanted or VINES:
    make(vine)
