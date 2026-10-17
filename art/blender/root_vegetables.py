"""Animal Balloon Farm: the root vegetables (carrot, potato and onion).

Run from repository root:
  blender --background --factory-startup --python art/blender/root_vegetables.py
Add `-- --cycles` to render the review on the CPU where EEVEE has no GPU, and
name vegetables after `--` to regenerate only those (for example `-- onion`).

Regenerates, in public/assets/plants/, for each of carrot, potato and onion:
  <id>.blend        editable source
  <id>.glb          the vegetable the garden plants
  <id>-review.png   art-review render: a seedling, half grown, grown, and grown
                    asking for care (pests and the shoot a trim takes off)

A root vegetable keeps its prize underground, so what makes it recognisable is
its top and a shoulder of root pushing up through the bed:

  carrot  feathery fronds over a bright orange shoulder; bolts a white umbel
  potato  a bushy hill of broad leaves, with tubers peeking out of the earth and
          white flowers when grown; sends out a leggy runner
  onion   tall hollow blue-green leaves from a fat red bulb sitting half out of
          the soil; sends up a flower stalk with a papery bud

Authoring frame matches poppy.py: Z-up, resting on z = 0 and centred on the
origin, so glTF lands each model in Three.js with +Y up. Every model shares one
set of node names, so the game drives all three with one visual
(src/scene/root-visual.ts), all under `RV_root`:

  RV_mound    the bed of soil and pebbles; always shown
  RV_crown    the vegetable showing above ground (shoulder, tubers, bulb);
              swells as the plant grows
  RV_leaf_N   one leaf or frond (N = 1..), pivoting at its base. Its geometry
              runs along its local +Z (glTF +Y), so the game grows it by scaling
              that axis and bows it outward when thirsty.
  RV_flowers  the potato's blossoms, shown once grown (potato only)
  RV_pests    the bugs on the leaves, shown while pests are about
  RV_shoot    what a trim takes off (a bolting umbel, a leggy runner, a flower
              stalk), shown while the plant wants a trim

Verify with `node scripts/inspect-glb.mjs public/assets/plants/carrot.glb`.
"""
from __future__ import annotations

import math
import random
import sys
from pathlib import Path

import bpy
from mathutils import Euler, Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "public" / "assets" / "plants"
OUTPUT.mkdir(parents=True, exist_ok=True)
VEGETABLES = ("carrot", "potato", "onion")


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
    """A gently arching stem in a leaf's local frame: up +Z, curving out along +X."""
    return [Vector((bend * length * (i / (count - 1)) ** 2, 0, length * i / (count - 1))) for i in range(count)]


def mound(prefix, parent, radius, height, M, pebbles=6, seed=1):
    rng = random.Random(seed)
    bed = pivot(f"{prefix}_mound", parent=parent)
    sphere(f"{prefix}_mound_soil", (0, 0, 0), (radius, radius, height), M["soil"], bed, 14, 6)
    sphere(f"{prefix}_mound_rim", (0, 0, -.01), (radius + .035, radius + .035, height * .5), M["soilDark"], bed, 14, 4)
    for index in range(pebbles):
        angle = index * math.tau / pebbles + rng.uniform(-.3, .3)
        r = rng.uniform(.55, .9) * radius
        z = height * math.sqrt(max(0.0, 1 - (r / radius) ** 2))
        size = rng.uniform(.016, .026)
        sphere(f"{prefix}_mound_pebble_{index + 1}", (math.cos(angle) * r, math.sin(angle) * r, z), (size * 1.3, size, size * .6),
               M["pebble" if index % 3 else "pebbleDark"], bed, 6, 3, Euler((0, 0, rng.uniform(0, math.pi))).to_quaternion())
    return bed


def common_materials(prefix):
    return {
        "soil": make_material(f"{prefix} soil", "#7a5136", .92, 0, .02),
        "soilDark": make_material(f"{prefix} soil shade", "#5a3a27", .95, 0, .01),
        "pebble": make_material(f"{prefix} pebble", "#c9b9a0", .7, 0, .1),
        "pebbleDark": make_material(f"{prefix} pebble shade", "#9c8f80", .75, 0, .08),
        "bugEye": make_material(f"{prefix} bug eye", "#fffaf0", .3, 0, .4),
        "bugPupil": make_material(f"{prefix} bug pupil", "#24202a", .4, 0, .4),
        "wing": make_material(f"{prefix} fly wing", "#e8f2f6", .25, 0, .4),
        "stageFloor": make_material("STAGE buttercream floor", "#f6e6c6", .88, 0, .02),
        "stageBack": make_material("STAGE mint studio backdrop", "#a6d8cf", .9, 0, .02),
    }


def fly(name, parent, at, facing, M, body_mat):
    """A little fly: a dark body, two pale wings held back, googly eyes."""
    facing = Vector(facing).normalized()
    side = Vector((-facing.y, facing.x, 0)).normalized()
    sphere(f"{name}_body", at, (.03, .02, .02), body_mat, parent, 7, 4, facing.to_track_quat("X", "Z"))
    head = Vector(at) + facing * .03
    sphere(f"{name}_head", head, (.017, .017, .017), body_mat, parent, 6, 4)
    for sign, label in ((1, "L"), (-1, "R")):
        sphere(f"{name}_wing_{label}", Vector(at) + side * sign * .02 + Vector((0, 0, .016)) - facing * .012, (.03, .015, .003), M["wing"], parent, 6, 3,
               (-facing + side * sign * .6).normalized().to_track_quat("X", "Z"))
        sphere(f"{name}_eye_{label}", head + facing * .011 + side * sign * .009 + Vector((0, 0, .007)), (.008,) * 3, M["bugEye"], parent, 5, 3)
        sphere(f"{name}_pupil_{label}", head + facing * .017 + side * sign * .01 + Vector((0, 0, .007)), (.004,) * 3, M["bugPupil"], parent, 4, 3)


# ---------------------------------------------------------------- carrot ----

def build_carrot():
    rng = random.Random(311)
    M = common_materials("CR")
    M.update({
        "orange": make_material("CR root orange", "#ee7f22", .45, 0, .35),
        "orangeRing": make_material("CR root ring", "#d0661a", .5, 0, .3),
        "collar": make_material("CR green collar", "#7d9a3c", .5, 0, .2),
        "stalk": make_material("CR frond stalk", "#6e9c46", .5, 0, .2),
        "frond": make_material("CR frond", "#4f9a3e", .55, 0, .2),
        "frondLight": make_material("CR frond sunlit", "#6fb54c", .5, 0, .25),
        "umbel": make_material("CR umbel flower", "#f7f2e2", .6, 0, .2),
        "umbelEye": make_material("CR umbel eye", "#8a3a5a", .6, 0, .2),
        "flyBody": make_material("CR root fly", "#3a3440", .4, 0, .3),
    })
    root = pivot("RV_root")
    root["design_size"] = "about 0.55 m across the bed, 0.6 m tall grown"
    mound("RV", root, .26, .06, M, 6, 31)

    # The shoulder: the top of the root showing through the soil, ringed, with a green collar.
    crown = pivot("RV_crown", (0, 0, .03), root)
    cone("RV_crown_shoulder", (0, 0, .045), .09, .07, .1, M["orange"], crown, 14)
    sphere("RV_crown_top", (0, 0, .095), (.07, .07, .026), M["orange"], crown, 14, 5)
    for index, z in enumerate((.02, .06)):
        cone(f"RV_crown_ring_{index + 1}", (0, 0, z), .088 - index * .01, .086 - index * .01, .004, M["orangeRing"], crown, 14)
    cone("RV_crown_collar", (0, 0, .118), .038, .022, .024, M["collar"], crown, 8)

    # Fronds: a stalk arching up and out, with pinnate leaflet tufts and a frilly tip.
    for index in range(8):
        azimuth = index * math.tau / 8 + rng.uniform(-.15, .15)
        tilt = math.radians(rng.uniform(12, 34) if index % 3 else rng.uniform(4, 12))
        length = rng.uniform(.36, .48)
        leaf = leaf_pivot(f"RV_leaf_{index + 1}", root, (0, 0, .14), azimuth, tilt)
        points = curve_points(length, rng.uniform(.2, .38))
        tube(f"RV_leaf_{index + 1}_stalk", points, [.009, .008, .006, .004], M["stalk"], leaf, 5)
        for step, t in enumerate((.32, .5, .66, .82)):
            # The point on the stalk's arch at t.
            at = Vector((points[-1].x * t * t, 0, points[-1].z * t))
            spread = .05 * (1.15 - t * .7)
            for sign in (-1, 1):
                tone = "frondLight" if (step + (sign > 0)) % 2 else "frond"
                # A frilly tuft: leaflets fanned out to the side and up.
                for k in range(3):
                    offset = Vector((k * .008 - .006, sign * spread * (.45 + k * .38), .01 * k - .004))
                    sphere(f"RV_leaf_{index + 1}_tuft_{step + 1}{'LR'[sign > 0]}{k + 1}", at + offset, (.026, .013, .004), M[tone], leaf, 5, 3,
                           Euler((math.radians(rng.uniform(-30, 30)), math.radians(-35 + k * 12), sign * math.radians(60 + k * 12))).to_quaternion())
        for k in range(3):
            sphere(f"RV_leaf_{index + 1}_tip_{k + 1}", points[-1] + Vector((.006 * k, (k - 1) * .014, .012 - abs(k - 1) * .006)), (.03, .016, .005), M["frondLight"], leaf, 5, 3,
                   Euler((0, math.radians(-50), (k - 1) * .6)).to_quaternion())

    # Root flies resting on the fronds.
    pests = pivot("RV_pests", parent=root)
    for index, (azimuth, height, out) in enumerate(((.4, .3, .16), (2.6, .25, .15), (4.4, .36, .13))):
        at = Vector((math.cos(azimuth) * out, math.sin(azimuth) * out, height))
        fly(f"RV_pests_fly_{index + 1}", pests, at, (-math.sin(azimuth), math.cos(azimuth), .2), M, M["flyBody"])

    # The trim: a bolting stalk shooting up past the fronds with a lacy white umbel.
    shoot = pivot("RV_shoot", (0, 0, .13), root)
    lean = Vector((.16, .05, .6))
    tube("RV_shoot_stem", [Vector((0, 0, 0)), lean * .4 + Vector((-.02, 0, 0)), lean * .75, lean], [.01, .009, .007, .006], M["stalk"], shoot, 6)
    head = pivot("RV_shoot_umbel", lean, shoot)
    for k in range(9):
        angle = k * math.tau / 9
        spoke_end = Vector((math.cos(angle) * .07, math.sin(angle) * .07, .04))
        stick(f"RV_shoot_spoke_{k + 1}", (0, 0, 0), spoke_end, .004, .003, M["stalk"], head, 4)
        sphere(f"RV_shoot_floret_{k + 1}", spoke_end + Vector((0, 0, .008)), (.026, .026, .012), M["umbel"], head, 7, 3)
    sphere("RV_shoot_floret_mid", (0, 0, .05), (.024, .024, .011), M["umbel"], head, 7, 3)
    sphere("RV_shoot_eye", (0, 0, .062), (.007, .007, .005), M["umbelEye"], head, 5, 3)
    return root, M


# ---------------------------------------------------------------- potato ----

def potato_tuber(name, parent, at, size, M, seed):
    rng = random.Random(seed)
    tuber = sphere(name, at, (size * 1.35, size, size * .9), M["tuber"], parent, 10, 6,
                   Euler((rng.uniform(-.3, .3), rng.uniform(-.2, .2), rng.uniform(0, math.pi))).to_quaternion())
    for k in range(3):
        angle = rng.uniform(0, math.tau)
        eye_at = Vector(at) + Vector((math.cos(angle) * size * 1.1, math.sin(angle) * size * .8, size * .45))
        sphere(f"{name}_eye_{k + 1}", eye_at, (size * .14, size * .14, size * .08), M["tuberEye"], parent, 5, 3)
    return tuber


def build_potato():
    rng = random.Random(521)
    M = common_materials("PT")
    M.update({
        "tuber": make_material("PT tuber", "#c08745", .62, 0, .12),
        "tuberEye": make_material("PT tuber eye", "#8a5f37", .8, 0, .05),
        "stem": make_material("PT stem", "#5f8f45", .55, 0, .2),
        "leaf": make_material("PT leaf", "#3f7d3a", .55, 0, .25),
        "leafLight": make_material("PT leaf sunlit", "#5b9a48", .5, 0, .3),
        "petal": make_material("PT blossom", "#f6f0f6", .5, 0, .3),
        "petalBlush": make_material("PT blossom blush", "#d9c3e6", .5, 0, .3),
        "pollen": make_material("PT blossom eye", "#f1c232", .45, 0, .3),
        "beetle": make_material("PT beetle shell", "#f0d27a", .3, 0, .6),
        "stripe": make_material("PT beetle stripe", "#2b2226", .35, 0, .5),
        "beetleHead": make_material("PT beetle head", "#d77a2e", .4, 0, .4),
        "runner": make_material("PT runner", "#a9c86a", .5, 0, .25),
    })
    root = pivot("RV_root")
    root["design_size"] = "about 0.62 m across the hill, 0.55 m tall grown"
    mound("RV", root, .3, .1, M, 7, 52)

    # Tubers peeking out of the hill's flanks.
    crown = pivot("RV_crown", (0, 0, 0), root)
    for index, (azimuth, out, size) in enumerate(((.5, .2, .062), (2.2, .21, .055), (3.9, .19, .066), (5.3, .22, .05))):
        at = (math.cos(azimuth) * out, math.sin(azimuth) * out, .1 * math.sqrt(max(0, 1 - (out / .3) ** 2)) + .02)
        potato_tuber(f"RV_crown_tuber_{index + 1}", crown, at, size, M, 70 + index)

    # Stems: each rises with a few broad compound leaves (an end leaflet and side pairs).
    blossom_tips = []
    for index in range(8):
        azimuth = index * math.tau / 8 + rng.uniform(-.2, .2)
        tilt = math.radians(rng.uniform(18, 42) if index % 2 else rng.uniform(5, 16))
        length = rng.uniform(.28, .4)
        leaf = leaf_pivot(f"RV_leaf_{index + 1}", root, (math.cos(azimuth) * .04, math.sin(azimuth) * .04, .1), azimuth, tilt)
        points = curve_points(length, rng.uniform(.25, .45))
        tube(f"RV_leaf_{index + 1}_stem", points, [.011, .01, .008, .006], M["stem"], leaf, 5)
        for step, t in enumerate((.32, .55, .78)):
            at = Vector((points[-1].x * t * t, 0, points[-1].z * t))
            size = 1.05 - step * .12
            for sign in (-1, 1):
                tone = "leafLight" if (step + (sign > 0)) % 2 else "leaf"
                # A broad, pointed leaflet held out to the side and a little up.
                sphere(f"RV_leaf_{index + 1}_leaflet_{step + 1}{'LR'[sign > 0]}", at + Vector((.01, sign * .05 * size, .006)), (.058 * size, .032 * size, .008), M[tone], leaf, 7, 4,
                       Euler((sign * math.radians(22), math.radians(-18), sign * math.radians(72))).to_quaternion())
        sphere(f"RV_leaf_{index + 1}_end", points[-1] + Vector((.025, 0, .012)), (.064, .04, .009), M["leafLight"], leaf, 7, 4,
               Euler((0, math.radians(-35), 0)).to_quaternion())
        if index % 2 == 0:
            blossom_tips.append((leaf, points[-1] + Vector((-.01, 0, .05))))

    # Blossoms over three of the stems; they ride their stems like the leaves do (children of the leaf pivots),
    # so a single named group holds them all for showing and hiding.
    flowers = pivot("RV_flowers", parent=root)
    for index, (leaf, tip) in enumerate(blossom_tips):
        # Place each blossom cluster in the root's space, at its stem's tip.
        world_tip = leaf.matrix_basis @ tip
        cluster = pivot(f"RV_flowers_{index + 1}", world_tip, flowers)
        for k in range(3):
            centre = Vector(((k - 1) * .05, (k % 2) * .03 - .015, (k % 2) * .018))
            for petal in range(5):
                angle = petal * math.tau / 5
                sphere(f"RV_flowers_{index + 1}_{k + 1}_petal_{petal + 1}", centre + Vector((math.cos(angle) * .022, math.sin(angle) * .022, 0)),
                       (.02, .014, .004), M["petalBlush" if petal % 2 else "petal"], cluster, 5, 3, Euler((0, 0, angle)).to_quaternion())
            cone(f"RV_flowers_{index + 1}_{k + 1}_eye", centre + Vector((0, 0, .008)), .01, .003, .016, M["pollen"], cluster, 5)

    # Striped potato beetles on the leaves.
    pests = pivot("RV_pests", parent=root)
    for index, (azimuth, height, out) in enumerate(((.2, .3, .17), (2.3, .25, .19), (4.2, .34, .16))):
        at = Vector((math.cos(azimuth) * out, math.sin(azimuth) * out, height))
        facing = Vector((-math.sin(azimuth), math.cos(azimuth), 0))
        side = Vector((-facing.y, facing.x, 0))
        rotation = facing.to_track_quat("X", "Z")
        sphere(f"RV_pests_beetle_{index + 1}_shell", at, (.04, .03, .025), M["beetle"], pests, 8, 5, rotation)
        for stripe in (-1, 0, 1):
            sphere(f"RV_pests_beetle_{index + 1}_stripe_{stripe + 2}", at + side * stripe * .014 + Vector((0, 0, .02)), (.034, .004, .006), M["stripe"], pests, 5, 3, rotation)
        head = at + facing * .04
        sphere(f"RV_pests_beetle_{index + 1}_head", head, (.016, .016, .014), M["beetleHead"], pests, 6, 4)
        for sign, label in ((1, "L"), (-1, "R")):
            sphere(f"RV_pests_beetle_{index + 1}_eye_{label}", head + facing * .011 + side * sign * .009 + Vector((0, 0, .008)), (.008,) * 3, M["bugEye"], pests, 5, 3)
            sphere(f"RV_pests_beetle_{index + 1}_pupil_{label}", head + facing * .017 + side * sign * .01 + Vector((0, 0, .008)), (.004,) * 3, M["bugPupil"], pests, 4, 3)

    # The trim: a leggy pale runner reaching out sideways from the hill.
    shoot = pivot("RV_shoot", (0, 0, .09), root)
    out = Vector((math.cos(3.6), math.sin(3.6), 0))
    runner = [Vector((0, 0, 0)), out * .12 + Vector((0, 0, .12)), out * .28 + Vector((0, 0, .16)), out * .42 + Vector((0, 0, .1))]
    tube("RV_shoot_stem", runner, [.009, .008, .007, .005], M["runner"], shoot, 6)
    for k, t in enumerate((.45, .75)):
        side = Vector((-out.y, out.x, 0)) * (1 if k % 2 else -1)
        at = runner[1].lerp(runner[3], t)
        sphere(f"RV_shoot_leaf_{k + 1}", at + side * .03, (.035, .02, .005), M["runner"], shoot, 6, 3, (side + Vector((0, 0, .4))).normalized().to_track_quat("X", "Z"))
    sphere("RV_shoot_tip", runner[3] + out * .015, (.022, .015, .012), M["runner"], shoot, 6, 3, aim(out + Vector((0, 0, -.5))))
    return root, M


# ----------------------------------------------------------------- onion ----

def build_onion():
    rng = random.Random(733)
    M = common_materials("ON")
    M.update({
        "bulb": make_material("ON bulb", "#8a2a58", .4, 0, .45),
        "bulbLight": make_material("ON bulb sheen", "#b04a7c", .4, 0, .45),
        "skin": make_material("ON papery skin", "#d8a0a4", .7, 0, .1),
        "neck": make_material("ON neck", "#a9b37a", .5, 0, .2),
        "leaf": make_material("ON leaf", "#5f9a7a", .45, 0, .35),
        "leafLight": make_material("ON leaf sunlit", "#7cb58e", .4, 0, .35),
        "scape": make_material("ON flower stalk", "#7aaa86", .45, 0, .3),
        "bud": make_material("ON papery bud", "#efe6d2", .6, 0, .2),
        "flyBody": make_material("ON onion fly", "#6e6a62", .45, 0, .3),
    })
    root = pivot("RV_root")
    root["design_size"] = "about 0.5 m across the bed, 0.6 m tall grown"
    mound("RV", root, .24, .055, M, 6, 73)

    # The bulb: a fat red onion sitting half out of the soil, with papery streaks and a neck.
    crown = pivot("RV_crown", (0, 0, .02), root)
    sphere("RV_crown_bulb", (0, 0, .055), (.095, .095, .082), M["bulb"], crown, 14, 8)
    for k in range(8):
        # A streak lies along a meridian of the bulb, flat against its skin.
        angle = k * math.tau / 8 + .3
        elevation = math.radians(28)
        normal = Vector((math.cos(elevation) * math.cos(angle), math.cos(elevation) * math.sin(angle), math.sin(elevation)))
        tangent = Vector((-math.sin(elevation) * math.cos(angle), -math.sin(elevation) * math.sin(angle), math.cos(elevation)))
        frame = Matrix((normal.cross(tangent), normal, tangent)).transposed()
        at = Vector((0, 0, .055)) + Vector((normal.x * .095, normal.y * .095, normal.z * .082))
        sphere(f"RV_crown_streak_{k + 1}", at, (.006, .003, .05), M["bulbLight" if k % 2 else "skin"], crown, 5, 4, frame.to_quaternion())
    cone("RV_crown_neck", (0, 0, .15), .04, .022, .05, M["neck"], crown, 10)
    sphere("RV_crown_flake", (.05, -.06, .12), (.03, .012, .004), M["skin"], crown, 5, 3, Euler((.4, .3, .8)).to_quaternion())

    # Tall hollow leaves: tapering tubes that rise from the neck and arch out at the top.
    for index in range(6):
        azimuth = index * math.tau / 6 + rng.uniform(-.2, .2)
        tilt = math.radians(rng.uniform(6, 18))
        length = rng.uniform(.38, .52)
        leaf = leaf_pivot(f"RV_leaf_{index + 1}", root, (math.cos(azimuth) * .012, math.sin(azimuth) * .012, .17), azimuth, tilt)
        points = curve_points(length, rng.uniform(.25, .45), 5)
        tube(f"RV_leaf_{index + 1}_blade", points, [.016, .015, .013, .009, .003], M["leafLight" if index % 2 else "leaf"], leaf, 6)

    # Onion flies hovering at the leaves.
    pests = pivot("RV_pests", parent=root)
    for index, (azimuth, height, out) in enumerate(((1.0, .32, .14), (3.1, .26, .13), (5.0, .4, .12))):
        at = Vector((math.cos(azimuth) * out, math.sin(azimuth) * out, height))
        fly(f"RV_pests_fly_{index + 1}", pests, at, (-math.sin(azimuth), math.cos(azimuth), .1), M, M["flyBody"])

    # The trim: a flower stalk shooting straight up with a papery, pointed bud.
    shoot = pivot("RV_shoot", (0, 0, .17), root)
    stalk_top = Vector((.03, -.02, .56))
    tube("RV_shoot_stem", [Vector((0, 0, 0)), stalk_top * .5, stalk_top], [.011, .01, .008], M["scape"], shoot, 6)
    sphere("RV_shoot_bud", stalk_top + Vector((0, 0, .035)), (.032, .032, .042), M["bud"], shoot, 10, 6)
    cone("RV_shoot_point", stalk_top + Vector((0, 0, .09)), .014, .001, .04, M["bud"], shoot, 6)
    return root, M


BUILDERS = {"carrot": build_carrot, "potato": build_potato, "onion": build_onion}


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
    camera.location = (0, -6.5, 2.8)
    camera.rotation_euler = (Vector((0, 0, .28)) - Vector(camera.location)).to_track_quat("-Z", "Y").to_euler()
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 3.4
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
    """A linked copy posed at one moment of its life: leaves grown to `growth`, care tells shown when `care`."""
    mapping = {}
    for obj in [root, *root.children_recursive]:
        dup = obj.copy()
        bpy.context.collection.objects.link(dup)
        mapping[obj] = dup
    for obj, dup in mapping.items():
        if obj.parent in mapping:
            dup.parent = mapping[obj.parent]
    mapping[root].location = location
    for obj, dup in mapping.items():
        if obj.parent is root and obj.name.startswith("RV_leaf_"):
            dup.scale = (.5 + .5 * growth, .5 + .5 * growth, max(.05, growth))
        if obj.name == "RV_crown":
            size = .3 + .7 * growth
            dup.scale = (size, size, size)
        if obj.name in ("RV_pests", "RV_shoot"):
            show_tree(dup, care)
        if obj.name == "RV_flowers":
            show_tree(dup, growth >= 1 and not care)
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
        stage_copy(root, (-1.2, 0, 0), .25, False),
        stage_copy(root, (-.4, 0, 0), .6, False),
        stage_copy(root, (.4, 0, 0), 1, False),
        stage_copy(root, (1.2, 0, 0), 1, True),
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


wanted = [arg for arg in (sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []) if arg in VEGETABLES]
for vegetable in wanted or VEGETABLES:
    make(vegetable)
