"""Animal Balloon Farm: the new-farm intro cutscene cast and sets.

Run from the repository root:
  blender --background --factory-startup --python art/blender/intro_cutscene.py
  blender --background --factory-startup --python art/blender/intro_cutscene.py -- boy room

Everything is built from balloons: the people are twisted-balloon figures, the
furniture is puffed up, the trees are poodle topiary. The cutscene runs in
Three.js with a perspective camera, so these are authored to be seen close.

Outputs, all in public/assets/cutscenes/:
  intro-boy.glb         the boy. Clips IDLE, SIT, WHY, WALK, REACH, WOW
  intro-president.glb   the (fictional) president. Clips SPEECH, DECREE
  intro-studio.glb      the broadcast set the TV shows: podium, flags, curtains
  intro-room.glb        the living room. The screen is the node TV_SCREEN (has UVs)
  intro-exterior.glb    cottage, garden, gate and mailbox. Clips FLAG, MAIL_OPEN, DOOR_OPEN
  intro-kit.glb         the garden starter kit on three balloons. Clip FLOAT
Each has a matching .blend and -review.png.

Conventions: Blender Z-up, metres. Characters face -Y (glTF converts that to
Three.js +Z). Nodes the runtime looks up by name use underscores, because
three.js sanitises spaces out of node names.
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "public" / "assets" / "cutscenes"
OUTPUT.mkdir(parents=True, exist_ok=True)


# ----------------------------------------------------------------- primitives --

def rgba(hex_color):
    raw = hex_color.lstrip("#")
    channels = [int(raw[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c < .04045 else ((c + .055) / 1.055) ** 2.4 for c in channels) + (1,)


MATERIALS: dict[str, bpy.types.Material] = {}


def mat(name, color, rough=.24, metal=0.0, coat=.55, emit=None, strength=0.0):
    """Materials are cached by name so every asset shares one palette."""
    if name in MATERIALS:
        return MATERIALS[name]
    material = bpy.data.materials.new(name)
    material.diffuse_color = rgba(color)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = rgba(color)
    shader.inputs["Roughness"].default_value = rough
    shader.inputs["Metallic"].default_value = metal
    shader.inputs["Coat Weight"].default_value = coat
    shader.inputs["Coat Roughness"].default_value = .16
    if emit:
        shader.inputs["Emission Color"].default_value = rgba(emit)
        shader.inputs["Emission Strength"].default_value = strength
    MATERIALS[name] = material
    return material


def place(obj, parent, position, rotation=(0, 0, 0)):
    if parent:
        obj.parent = parent
        obj.matrix_parent_inverse.identity()
    obj.location = position
    obj.rotation_euler = tuple(math.radians(v) for v in rotation)
    return obj


def smooth(obj):
    for face in obj.data.polygons:
        face.use_smooth = True


def named(obj, name, material):
    obj.name = name
    obj.data.name = name + " mesh"
    if material is not None:
        obj.data.materials.append(material)
    return obj


def sphere(name, position, size, material, parent=None, rotation=(0, 0, 0), segments=28, rings=18):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1, location=(0, 0, 0))
    obj = named(bpy.context.object, name, material)
    obj.scale = size if isinstance(size, tuple) else (size, size, size)
    smooth(obj)
    return place(obj, parent, position, rotation)


def balloon(name, position, size, material, parent=None, rotation=(0, 0, 0), segments=28, rings=18):
    """A party balloon: an egg with a little tied knot at the bottom."""
    body = sphere(name, position, size, material, parent, rotation, segments, rings)
    # The narrow end and knot are modelled in the mesh, not as a second object.
    bm = bmesh.new()
    bm.from_mesh(body.data)
    for vert in bm.verts:
        if vert.co.z < 0:
            pinch = 1 - .32 * (-vert.co.z) ** 2
            vert.co.x *= pinch
            vert.co.y *= pinch
            vert.co.z *= 1.12
    bm.to_mesh(body.data)
    bm.free()
    sz = size[2] if isinstance(size, tuple) else size
    knot_size = .1 * sz
    sphere(name + " knot", (position[0], position[1], position[2] - sz * 1.14), (knot_size, knot_size, knot_size * .8), material, parent, segments=12, rings=8)
    return body


def box(name, size, position, material, parent=None, rotation=(0, 0, 0), bevel=0.0, segments=3):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
    obj = named(bpy.context.object, name, material)
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        modifier = obj.modifiers.new("Bevel", "BEVEL")
        modifier.width = bevel
        modifier.segments = segments
        modifier.limit_method = "ANGLE"
        smooth(obj)
        obj.data.polygons.foreach_set("use_smooth", [True] * len(obj.data.polygons))
        try:
            bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40))
        except Exception:
            pass
    return place(obj, parent, position, rotation)


def cylinder(name, radius, depth, position, material, parent=None, rotation=(0, 0, 0), vertices=28, bevel=0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=(0, 0, 0))
    obj = named(bpy.context.object, name, material)
    if bevel > 0:
        modifier = obj.modifiers.new("Bevel", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
        modifier.limit_method = "ANGLE"
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40))
    except Exception:
        smooth(obj)
    return place(obj, parent, position, rotation)


def cone(name, r1, r2, depth, position, material, parent=None, rotation=(0, 0, 0), vertices=24):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r1, radius2=r2, depth=depth, location=(0, 0, 0))
    obj = named(bpy.context.object, name, material)
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40))
    except Exception:
        smooth(obj)
    return place(obj, parent, position, rotation)


def torus(name, major, minor, position, material, parent=None, rotation=(0, 0, 0), scale=(1, 1, 1), segments=36):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=segments, minor_segments=10, location=(0, 0, 0))
    obj = named(bpy.context.object, name, material)
    obj.scale = scale
    smooth(obj)
    return place(obj, parent, position, rotation)


def tube(name, points, width, material, parent=None, resolution=3):
    data = bpy.data.curves.new(name + " curve", "CURVE")
    data.dimensions = "3D"
    data.resolution_u = 10
    data.bevel_depth = width
    data.bevel_resolution = resolution
    data.use_fill_caps = True
    spline = data.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for knot, point in zip(spline.bezier_points, points):
        knot.co = point
        knot.handle_left_type = "AUTO"
        knot.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    data.materials.append(material)
    return place(obj, parent, (0, 0, 0))


def sausage(name, length, radius, material, parent, position=(0, 0, 0)):
    """A twisted-balloon limb segment hanging down -Z from its pivot."""
    return sphere(name, (position[0], position[1], position[2] - length / 2), (radius, radius, length / 2 + radius * .35), material, parent, segments=20, rings=14)


def pivot(name, position, parent=None, rotation=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.empty_display_type = "SPHERE"
    obj.empty_display_size = .05
    return place(obj, parent, position, rotation)


def grid(name, width, height, cols, rows, material, parent, position, rotation=(0, 0, 0), shape=None):
    """A subdivided plane in local XY; `shape(x, y)` pushes each vertex along +Z."""
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=cols, y_subdivisions=rows, size=1, location=(0, 0, 0))
    obj = named(bpy.context.object, name, material)
    for vert in obj.data.vertices:
        vert.co.x *= width
        vert.co.y *= height
        if shape:
            vert.co.z = shape(vert.co.x, vert.co.y)
    smooth(obj)
    return place(obj, parent, position, rotation)


# ------------------------------------------------------------------ animation --

class Rig:
    """Named pivots plus whole-body poses. Every clip keys every pivot, so
    crossfading between clips in three.js never leaves a limb behind."""

    def __init__(self, label):
        self.label = label
        self.pivots: dict[str, bpy.types.Object] = {}
        self.rest: dict[str, tuple] = {}

    def add(self, key, name, position, parent=None):
        obj = pivot(name, position, parent)
        self.pivots[key] = obj
        self.rest[key] = tuple(position)
        return obj

    def apply(self, pose):
        for key, obj in self.pivots.items():
            spec = pose.get(key, {})
            base = self.rest[key]
            offset = spec.get("loc", (0, 0, 0))
            obj.location = (base[0] + offset[0], base[1] + offset[1], base[2] + offset[2])
            obj.rotation_euler = tuple(math.radians(v) for v in spec.get("rot", (0, 0, 0)))
            obj.scale = spec.get("scale", (1, 1, 1))

    def clip(self, clip, keys):
        for obj in self.pivots.values():
            obj.animation_data_create()
            obj.animation_data.action = bpy.data.actions.new(f"{self.label} {clip} {obj.name}")
        for frame, pose in keys:
            self.apply(pose)
            for obj in self.pivots.values():
                for path in ("location", "rotation_euler", "scale"):
                    obj.keyframe_insert(data_path=path, frame=frame)
        for obj in self.pivots.values():
            data = obj.animation_data
            action = data.action
            for fcurve in action.fcurves:
                for point in fcurve.keyframe_points:
                    point.interpolation = "BEZIER"
                    point.handle_left_type = "AUTO_CLAMPED"
                    point.handle_right_type = "AUTO_CLAMPED"
            track = data.nla_tracks.new()
            track.name = clip
            strip = track.strips.new(clip, int(keys[0][0]), action)
            strip.extrapolation = "NOTHING"
            data.action = None
        self.apply({})


def merge(*poses):
    """Later poses win per pivot and per channel."""
    out: dict[str, dict] = {}
    for pose in poses:
        for key, spec in pose.items():
            out.setdefault(key, {}).update(spec)
    return out


def object_clip(obj, clip, keys):
    """Keys for a single prop pivot: [(frame, rotation_degrees, location)]."""
    obj.animation_data_create()
    obj.animation_data.action = bpy.data.actions.new(f"{clip} {obj.name}")
    rest = tuple(obj.location)
    for frame, rotation, offset in keys:
        obj.rotation_euler = tuple(math.radians(v) for v in rotation)
        obj.location = (rest[0] + offset[0], rest[1] + offset[1], rest[2] + offset[2])
        obj.keyframe_insert(data_path="rotation_euler", frame=frame)
        obj.keyframe_insert(data_path="location", frame=frame)
    track = obj.animation_data.nla_tracks.new()
    track.name = clip
    track.strips.new(clip, int(keys[0][0]), obj.animation_data.action)
    obj.animation_data.action = None
    obj.location = rest
    obj.rotation_euler = (0, 0, 0)


# ------------------------------------------------------------------- palette --

def palette():
    return {
        "skin": mat("Balloon skin peach", "#f2c09a", .3, coat=.6),
        "cheek": mat("Balloon cheek rose", "#ee8e8a", .35, coat=.4),
        "eye": mat("Glossy eye ink", "#1f1a24", .08, coat=1),
        "white": mat("Balloon white", "#f8f3ea", .22),
        "spark": mat("Eye sparkle", "#ffffff", .1, emit="#ffffff", strength=.6),
        "navy": mat("Balloon navy", "#24356e", .24),
        "navyDeep": mat("Balloon navy deep", "#1b2752", .28),
        "red": mat("Balloon cherry red", "#d33a3a", .2),
        "redDeep": mat("Balloon berry", "#a52a33", .26),
        "mouth": mat("Mouth berry", "#7a2230", .4, coat=.2),
        "brown": mat("Balloon chestnut hair", "#7a4a2c", .3),
        "grey": mat("Balloon silver hair", "#d6d2cc", .3),
        "shoe": mat("Balloon shoe oxblood", "#6e2b26", .26),
        "gold": mat("Brass gold", "#d9a74a", .28, metal=.75, coat=.3),
        "wood": mat("Honey wood", "#b67a45", .5, coat=.15),
        "woodDark": mat("Walnut", "#6d4128", .48, coat=.15),
        "woodPale": mat("Pale oak plank", "#d4a46c", .55, coat=.1),
        "green": mat("Balloon leaf green", "#5ba04e", .26),
        "greenDeep": mat("Balloon hedge green", "#3f7a3c", .3),
        "lawn": mat("Lawn velvet", "#7fbf5a", .8, coat=0),
        "stone": mat("Path stone", "#d8cdb8", .7, coat=.05),
        "cream": mat("Plaster cream", "#f1e2c4", .75, coat=0),
        "terracotta": mat("Roof terracotta", "#c8643f", .5, coat=.25),
        "shutter": mat("Shutter blue", "#4f86b8", .4, coat=.3),
        "yellow": mat("Balloon sunflower", "#f2c444", .22),
        "pink": mat("Balloon pink", "#f08db0", .22),
        "lilac": mat("Balloon lilac", "#a98bd8", .22),
        "teal": mat("Balloon teal", "#3e9e9a", .24),
        "wall": mat("Wallpaper sage", "#9fbfa4", .8, coat=0),
        "wallStripe": mat("Wallpaper stripe", "#b5d1b6", .8, coat=0),
        "wainscot": mat("Wainscot cream", "#efe0bf", .6, coat=.1),
        "rug": mat("Rug raspberry", "#c24d5e", .9, coat=0),
        "rugGold": mat("Rug mustard", "#e2b04f", .9, coat=0),
        "chrome": mat("Chrome", "#d8dde3", .12, metal=1, coat=.2),
        "glass": mat("Window night glass", "#2c3e64", .05, coat=1, emit="#3a5a96", strength=.35),
        "screenOff": mat("TV glass", "#1c2224", .06, coat=1),
        "lampGlow": mat("Lamp shade glow", "#ffd99a", .5, coat=.1, emit="#ffcf86", strength=2.2),
        "bulb": mat("Warm bulb", "#fff3d6", .3, emit="#ffe3a8", strength=6),
        "curtain": mat("Studio curtain blue", "#1e3a8c", .45, coat=.3),
        "flagBlue": mat("Flag blue", "#1f4fb5", .55, coat=.1),
        "flagWhite": mat("Flag white", "#f5f2ea", .55, coat=.1),
        "flagRed": mat("Flag red", "#e0393e", .55, coat=.1),
        "carpet": mat("Studio carpet", "#2a2f5c", .9, coat=0),
        "black": mat("Soft black", "#2a2626", .35, coat=.3),
        "paper": mat("Kraft paper", "#d9b98b", .7, coat=0),
        "straw": mat("Straw", "#e8cf7d", .8, coat=0),
        "soil": mat("Potting soil", "#5a3a26", .9, coat=0),
        "mailRed": mat("Mailbox cherry", "#c94436", .3, coat=.6),
        "string": mat("Balloon string", "#f4efe6", .6, coat=0),
    }


# ----------------------------------------------------------- balloon people --

def face(head, m, radius, *, brows_mat, mustache=False):
    """Eyes, cheeks, nose, brows and a mouth on a head of `radius`, centred on
    `head`. Returns the pivots that animate: eyes, brows, mouth."""
    def on_surface(x, z, lift=0.0):
        return (x, -math.sqrt(max(0.0, radius ** 2 - x ** 2 - z ** 2)) - lift, z)

    eyes = []
    for side, x in (("L", .36), ("R", -.36)):
        eye = pivot(f"eye_{side}", on_surface(x * radius, .1 * radius, -.004), head)
        sphere(f"eye {side} ink", (0, 0, 0), (.17 * radius, .07 * radius, .24 * radius), m["eye"], eye, segments=18, rings=12)
        sphere(f"eye {side} sparkle", (.05 * radius, -.06 * radius, .08 * radius), .055 * radius, m["spark"], eye, segments=10, rings=6)
        eyes.append(eye)
        sphere(f"cheek {side}", on_surface(x * 1.62 * radius, -.28 * radius, -.012), (.17 * radius, .06 * radius, .12 * radius), m["cheek"], head, segments=16, rings=10)
    sphere("nose", on_surface(0, -.06 * radius, -.07 * radius), (.15 * radius, .14 * radius, .13 * radius), m["skin"], head, segments=16, rings=10)
    brows = []
    for side, x in (("L", .37), ("R", -.37)):
        brow = pivot(f"brow_{side}", on_surface(x * radius, .44 * radius, -.012), head)
        sphere(f"brow {side} balloon", (0, 0, 0), (.17 * radius, .05 * radius, .045 * radius), brows_mat, brow, rotation=(0, -8 if side == "L" else 8, 0), segments=14, rings=8)
        brows.append(brow)
    mouth = pivot("mouth", on_surface(0, -.42 * radius, -.004), head)
    sphere("mouth shape", (0, 0, 0), (.17 * radius, .05 * radius, .07 * radius), m["mouth"], mouth, segments=16, rings=10)
    if mustache:
        for side, sign in (("L", 1), ("R", -1)):
            points = [(0, -radius * 1.0, -.24 * radius), (sign * .3 * radius, -radius * .96, -.3 * radius),
                      (sign * .6 * radius, -radius * .78, -.2 * radius), (sign * .72 * radius, -radius * .68, -.02 * radius),
                      (sign * .6 * radius, -radius * .72, .06 * radius)]
            tube(f"mustache {side}", points, .085 * radius, brows_mat, head)
    return eyes, brows, mouth


def build_person(label, m, *, scale, shirt, sleeve, legs, shoe, hair, stripes=False, child=True):
    """A twisted-balloon person. Units are for the boy; `scale` grows the adult."""
    s = scale
    rig = Rig(label)
    root = pivot(f"{label} export root", (0, 0, 0))
    root["asset_id"] = label.lower().replace(" ", "-")
    hip_z = .58 * s
    hips = rig.add("hips", "hips", (0, 0, hip_z), root)
    torso = rig.add("torso", "torso", (0, 0, 0), hips)
    torso_h = .25 * s
    sphere("torso balloon", (0, 0, torso_h * .82), (.2 * s, .165 * s, torso_h), shirt, torso, segments=30, rings=20)
    if stripes:
        for index in range(5):
            dz = (-.55 + index * .3) * torso_h
            f = math.sqrt(max(0.0, 1 - (dz / torso_h) ** 2))
            torus(f"shirt stripe {index}", 1, .03, (0, 0, torso_h * .82 + dz), m["navy"], torso,
                  scale=(.2 * s * f + .004, .165 * s * f + .004, .85))
    sphere("shorts", (0, 0, .02 * s), (.19 * s, .16 * s, .1 * s), legs, hips, segments=24, rings=14)
    neck_z = torso_h * 1.66
    head_r = (.19 if child else .2) * s / (1 if child else 1.18)
    head = rig.add("head", "head", (0, 0, neck_z), torso)
    head_center = pivot("head centre", (0, 0, head_r * .92), head)
    sphere("head balloon", (0, 0, 0), head_r, m["skin"], head_center, segments=32, rings=22)
    sphere("neck knot", (0, 0, -head_r * .9), (.06 * s, .06 * s, .05 * s), m["skin"], head_center, segments=12, rings=8)
    for side, x in (("L", 1), ("R", -1)):
        sphere(f"ear {side}", (x * head_r * .98, 0, -.05 * head_r), (.05 * s, .035 * s, .07 * s), m["skin"], head_center, segments=12, rings=8)
    eyes, brows, mouth = face(head_center, m, head_r, brows_mat=hair, mustache=not child)
    rig.pivots["eye_L"], rig.pivots["eye_R"] = eyes
    rig.rest["eye_L"], rig.rest["eye_R"] = tuple(eyes[0].location), tuple(eyes[1].location)
    rig.pivots["brow_L"], rig.pivots["brow_R"] = brows
    rig.rest["brow_L"], rig.rest["brow_R"] = tuple(brows[0].location), tuple(brows[1].location)
    rig.pivots["mouth"] = mouth
    rig.rest["mouth"] = tuple(mouth.location)

    shoulder_z = torso_h * 1.42
    for side, x in (("L", 1), ("R", -1)):
        shoulder = rig.add(f"shoulder_{side}", f"shoulder_{side}", (x * .2 * s, 0, shoulder_z), torso)
        sphere(f"shoulder knot {side}", (0, 0, 0), .055 * s, sleeve, shoulder, segments=14, rings=10)
        sausage(f"upper arm {side}", .19 * s, .052 * s, sleeve, shoulder)
        elbow = rig.add(f"elbow_{side}", f"elbow_{side}", (0, 0, -.2 * s), shoulder)
        sphere(f"elbow knot {side}", (0, 0, 0), .045 * s, m["skin"] if child else sleeve, elbow, segments=12, rings=8)
        sausage(f"forearm {side}", .17 * s, .046 * s, m["skin"] if child else sleeve, elbow)
        sphere(f"hand {side}", (0, 0, -.2 * s), (.058 * s, .05 * s, .062 * s), m["skin"], elbow, segments=16, rings=10)
        sphere(f"thumb {side}", (x * -.035 * s, -.035 * s, -.18 * s), (.022 * s, .022 * s, .032 * s), m["skin"], elbow, segments=10, rings=6)

        thigh = rig.add(f"thigh_{side}", f"thigh_{side}", (x * .095 * s, 0, 0), hips)
        sausage(f"thigh {side}", .24 * s, .062 * s, legs, thigh)
        knee = rig.add(f"knee_{side}", f"knee_{side}", (0, 0, -.26 * s), thigh)
        sphere(f"knee knot {side}", (0, 0, 0), .05 * s, m["skin"] if child else legs, knee, segments=12, rings=8)
        sausage(f"shin {side}", .2 * s, .052 * s, m["skin"] if child else legs, knee)
        if child:
            sphere(f"sock {side}", (0, 0, -.2 * s), (.056 * s, .056 * s, .035 * s), m["white"], knee, segments=14, rings=8)
        sphere(f"shoe {side}", (0, -.04 * s, -.27 * s), (.07 * s, .11 * s, .05 * s), shoe, knee, segments=18, rings=10)
    return rig, root, head_center, head_r


# ---------------------------------------------------------------- boy poses --

def boy_poses():
    sit_legs = {
        "hips": {"loc": (0, 0, -.47)},
        "thigh_L": {"rot": (-86, 0, -6)}, "thigh_R": {"rot": (-86, 0, 6)},
        "knee_L": {"rot": (18, 0, 0)}, "knee_R": {"rot": (18, 0, 0)},
    }
    sit = merge(sit_legs, {
        "torso": {"rot": (-4, 0, 0)},
        "shoulder_L": {"rot": (14, -22, 0)}, "shoulder_R": {"rot": (14, 22, 0)},
        "elbow_L": {"rot": (-30, 0, 0)}, "elbow_R": {"rot": (-30, 0, 0)},
        "head": {"rot": (8, 0, 0)},
    })
    blink = {"eye_L": {"scale": (1, 1, .12)}, "eye_R": {"scale": (1, 1, .12)}}
    stand = {"shoulder_L": {"rot": (0, -6, 0)}, "shoulder_R": {"rot": (0, 6, 0)},
             "elbow_L": {"rot": (-8, 0, 0)}, "elbow_R": {"rot": (-8, 0, 0)}}
    return sit, blink, stand


def build_boy(m):
    rig, root, head_center, head_r = build_person("INTRO BOY", m, scale=1.0, shirt=m["white"], sleeve=m["white"],
                                                  legs=m["navy"], shoe=m["shoe"], hair=m["brown"], stripes=True)
    # Beret and a few chestnut curls peeking out under it.
    beret = pivot("beret", (.02, 0, head_r * .78), head_center, rotation=(6, 14, 0))
    sphere("beret balloon", (0, 0, 0), (head_r * 1.08, head_r * 1.05, head_r * .32), m["red"], beret, segments=32, rings=16)
    sphere("beret stalk", (0, 0, head_r * .32), (.018, .018, .03), m["red"], beret, segments=10, rings=6)
    # A chestnut hair cap over the back and crown, so he reads from behind too.
    sphere("hair cap", (0, .22 * head_r, .1 * head_r), (.99 * head_r, .93 * head_r, .95 * head_r), m["brown"], head_center, segments=28, rings=18)
    for index, (x, y, z) in enumerate(((.8, .2, .2), (-.8, .25, .22), (.62, .55, .3), (-.6, .58, .32), (0, .78, .3), (.3, .7, .44), (-.32, .72, .44),
                                       (.45, .85, -.1), (-.45, .85, -.1), (0, .95, -.25), (.7, .5, -.3), (-.7, .5, -.3))):
        sphere(f"curl {index}", (x * head_r, y * head_r, z * head_r), .22 * head_r, m["brown"], head_center, segments=14, rings=8)
    sit, blink, stand = boy_poses()

    rig.clip("IDLE", [
        (1, stand),
        (24, merge(stand, {"torso": {"rot": (-2, 0, 1)}, "head": {"rot": (-3, 0, 4)}})),
        (30, merge(stand, blink)),
        (33, stand),
        (48, stand),
    ])
    rig.clip("SIT", [
        (1, sit),
        (20, merge(sit, {"head": {"rot": (6, 0, -4)}, "torso": {"rot": (-6, 0, 0)}})),
        (28, merge(sit, blink, {"head": {"rot": (6, 0, -4)}})),
        (31, merge(sit, {"head": {"rot": (6, 0, -4)}})),
        (48, sit),
    ])
    turned = {"head": {"rot": (2, 0, 34)}, "torso": {"rot": (-2, 0, 10)}}
    shrug = {
        "torso": {"rot": (-2, 0, 10), "loc": (0, 0, .025)},
        "shoulder_L": {"rot": (-30, -58, 0)}, "shoulder_R": {"rot": (-30, 58, 0)},
        "elbow_L": {"rot": (-70, 0, 0)}, "elbow_R": {"rot": (-70, 0, 0)},
        "brow_L": {"loc": (0, 0, .03), "rot": (0, 14, 0)}, "brow_R": {"loc": (0, 0, .03), "rot": (0, -14, 0)},
        "mouth": {"scale": (.7, 1, 2.6)},
        "head": {"rot": (-4, 0, 34)},
    }
    rig.clip("WHY", [
        (1, sit),
        (9, merge(sit, turned)),
        (15, merge(sit, turned, shrug, {"head": {"rot": (-8, 0, 40)}})),
        (21, merge(sit, turned, shrug, {"head": {"rot": (-6, 8, 36)}})),
        (34, merge(sit, turned, shrug, {"head": {"rot": (-6, 10, 36)}, "mouth": {"scale": (.9, 1, 1.2)}})),
        (46, merge(sit, turned, shrug, {"head": {"rot": (-6, 10, 36)}, "mouth": {"scale": (.9, 1, 1.2)}})),
    ])
    walk = []
    for frame, phase in ((1, 0), (6, 1), (11, 2), (16, 3), (21, 4)):
        swing = math.cos(phase * math.pi / 2)
        lift = abs(math.sin(phase * math.pi / 2))
        walk.append((frame, {
            "hips": {"loc": (0, 0, .025 * lift - .01), "rot": (0, 0, 5 * swing)},
            "torso": {"rot": (-4, 2 * swing, -4 * swing)},
            "head": {"rot": (3, -2 * swing, 3 * swing)},
            "thigh_L": {"rot": (28 * swing, 0, 0)}, "thigh_R": {"rot": (-28 * swing, 0, 0)},
            "knee_L": {"rot": (max(0, 34 * -swing) + 6, 0, 0)}, "knee_R": {"rot": (max(0, 34 * swing) + 6, 0, 0)},
            "shoulder_L": {"rot": (-26 * swing, -6, 0)}, "shoulder_R": {"rot": (26 * swing, 6, 0)},
            "elbow_L": {"rot": (-24, 0, 0)}, "elbow_R": {"rot": (-24, 0, 0)},
        }))
    rig.clip("WALK", walk)
    reach = merge(stand, {
        "torso": {"rot": (-12, 0, 0)},
        "shoulder_R": {"rot": (-78, 10, 0)}, "elbow_R": {"rot": (-18, 0, 0)},
        "head": {"rot": (10, 0, 0)},
    })
    rig.clip("REACH", [
        (1, stand),
        (12, reach),
        (20, merge(reach, {"shoulder_R": {"rot": (-58, 10, 0)}, "torso": {"rot": (-8, 0, 0)}})),
        (30, merge(reach, {"shoulder_R": {"rot": (-40, 12, 0)}, "elbow_R": {"rot": (-40, 0, 0)}, "torso": {"rot": (-4, 0, 0)},
                           "brow_L": {"loc": (0, 0, .025)}, "brow_R": {"loc": (0, 0, .025)}, "mouth": {"scale": (.8, 1, 2.2)}})),
        (36, merge(reach, {"shoulder_R": {"rot": (-40, 12, 0)}, "elbow_R": {"rot": (-40, 0, 0)}, "torso": {"rot": (-4, 0, 0)},
                           "brow_L": {"loc": (0, 0, .025)}, "brow_R": {"loc": (0, 0, .025)}, "mouth": {"scale": (.8, 1, 2.2)}})),
    ])
    joy = {
        "shoulder_L": {"rot": (-10, -150, 0)}, "shoulder_R": {"rot": (-10, 150, 0)},
        "elbow_L": {"rot": (-12, 0, 0)}, "elbow_R": {"rot": (-12, 0, 0)},
        "brow_L": {"loc": (0, 0, .03)}, "brow_R": {"loc": (0, 0, .03)},
        "mouth": {"scale": (1.3, 1, 2.4)},
        "head": {"rot": (-10, 0, 0)},
    }
    rig.clip("WOW", [
        (1, merge(joy, {"hips": {"loc": (0, 0, 0)}, "knee_L": {"rot": (14, 0, 0)}, "knee_R": {"rot": (14, 0, 0)}, "thigh_L": {"rot": (-10, 0, 0)}, "thigh_R": {"rot": (-10, 0, 0)}})),
        (7, merge(joy, {"hips": {"loc": (0, 0, .12)}, "head": {"rot": (-14, 0, 6)}})),
        (13, merge(joy, {"hips": {"loc": (0, 0, 0)}, "knee_L": {"rot": (14, 0, 0)}, "knee_R": {"rot": (14, 0, 0)}, "thigh_L": {"rot": (-10, 0, 0)}, "thigh_R": {"rot": (-10, 0, 0)}})),
        (19, merge(joy, {"hips": {"loc": (0, 0, .12)}, "head": {"rot": (-14, 0, -6)}})),
        (25, merge(joy, {"hips": {"loc": (0, 0, 0)}, "knee_L": {"rot": (14, 0, 0)}, "knee_R": {"rot": (14, 0, 0)}, "thigh_L": {"rot": (-10, 0, 0)}, "thigh_R": {"rot": (-10, 0, 0)}})),
    ])
    return root


def build_president(m):
    rig, root, head_center, head_r = build_person("INTRO PRESIDENT", m, scale=1.38, shirt=m["navyDeep"], sleeve=m["navyDeep"],
                                                  legs=m["navyDeep"], shoe=m["black"], hair=m["grey"], child=False)
    torso = rig.pivots["torso"]
    s = 1.38
    torso_h = .25 * s
    # Shirt front, tie, and the tricolour sash, all hugging the suit balloon.
    sphere("shirt front", (0, -.13 * s, torso_h * 1.1), (.08 * s, .05 * s, .14 * s), m["white"], torso, segments=18, rings=12)
    sphere("tie knot", (0, -.17 * s, torso_h * 1.38), (.03 * s, .025 * s, .028 * s), m["red"], torso, segments=12, rings=8)
    sphere("tie", (0, -.165 * s, torso_h * 1.05), (.035 * s, .02 * s, .1 * s), m["red"], torso, segments=14, rings=8)
    for index, material in enumerate((m["flagBlue"], m["flagWhite"], m["flagRed"])):
        off = (index - 1) * .045 * s
        points = []
        for step in range(7):
            t = step / 6
            angle = math.radians(-70 + 140 * t)
            z = torso_h * (1.5 - 1.05 * t) + off
            points.append((.215 * s * math.sin(angle) * 1.02, -.18 * s * math.cos(angle) * 1.02, z))
        tube(f"sash {index}", points, .024 * s, material, torso, resolution=2)
    sphere("sash rosette", (.2 * s, -.075 * s, torso_h * .47), (.045 * s, .025 * s, .045 * s), m["gold"], torso, segments=14, rings=8)
    for index, (x, z) in enumerate(((.82, .1), (-.82, .1), (.7, .45), (-.7, .45), (.5, .72), (-.5, .72), (0, .9), (.25, .85), (-.25, .85))):
        sphere(f"silver puff {index}", (x * head_r, .2 * head_r, z * head_r), .26 * head_r, m["grey"], head_center, segments=14, rings=8)
    talk = []
    rest = {
        "shoulder_L": {"rot": (-38, -12, 0)}, "shoulder_R": {"rot": (-38, 12, 0)},
        "elbow_L": {"rot": (-52, 0, 0)}, "elbow_R": {"rot": (-52, 0, 0)},
    }
    for frame in range(1, 50, 4):
        phase = (frame - 1) / 48 * math.tau
        talk.append((frame, merge(rest, {
            "mouth": {"scale": (1, 1, 2.2 if (frame // 4) % 2 == 0 else .7)},
            "head": {"rot": (3 * math.sin(phase * 2), 0, 9 * math.sin(phase))},
            "torso": {"rot": (0, 0, 3 * math.sin(phase))},
            "shoulder_R": {"rot": (-60 - 22 * max(0, math.sin(phase * 2)), 18, 0)},
            "elbow_R": {"rot": (-70 + 25 * math.sin(phase * 2), 0, 0)},
            "brow_L": {"loc": (0, 0, .012 * max(0, math.sin(phase * 2)))},
            "brow_R": {"loc": (0, 0, .012 * max(0, math.sin(phase * 2)))},
        })))
    rig.clip("SPEECH", talk)
    point = merge(rest, {
        "torso": {"rot": (-10, 0, -6)},
        "shoulder_R": {"rot": (-96, 6, 0)}, "elbow_R": {"rot": (-4, 0, 0)},
        "shoulder_L": {"rot": (-30, -12, 0)},
        "head": {"rot": (-4, 0, -4)},
        "brow_L": {"loc": (0, 0, -.01), "rot": (0, -16, 0)}, "brow_R": {"loc": (0, 0, -.01), "rot": (0, 16, 0)},
        "mouth": {"scale": (1.4, 1, 2.8)},
    })
    rig.clip("DECREE", [
        (1, rest),
        (8, merge(rest, {"shoulder_R": {"rot": (-150, 8, 0)}, "elbow_R": {"rot": (-30, 0, 0)}, "torso": {"rot": (4, 0, 0)}, "mouth": {"scale": (1, 1, 1.4)}})),
        (14, point),
        (18, merge(point, {"torso": {"rot": (-13, 0, -6)}, "mouth": {"scale": (1.2, 1, 1.4)}})),
        (22, merge(point, {"mouth": {"scale": (1.4, 1, 2.8)}})),
        (26, merge(point, {"mouth": {"scale": (1.2, 1, 1.2)}})),
        (30, merge(point, {"mouth": {"scale": (1.4, 1, 2.6)}})),
        (40, merge(point, {"mouth": {"scale": (1, 1, .8)}})),
    ])
    return root


# --------------------------------------------------------------------- sets --

def build_studio(m):
    root = pivot("INTRO STUDIO export root", (0, 0, 0))
    box("studio carpet", (7, 5, .08), (0, 0, -.04), m["carpet"], root)
    # A curtain of long navy balloons, side by side, gently staggered.
    for index in range(26):
        x = -3.25 + index * .26
        sphere(f"curtain balloon {index}", (x, 1.7 + .05 * math.sin(index * 1.3), 1.85), (.15, .12, 1.95), m["curtain"], root, segments=16, rings=14)
    box("curtain pelmet", (7, .3, .32), (0, 1.55, 3.7), m["gold"], root, bevel=.05)
    for index in range(13):
        sphere(f"pelmet tassel {index}", (-3.0 + index * .5, 1.38, 3.48), (.06, .06, .1), m["gold"], root, segments=10, rings=6)
    # Two tricolour flags on brass poles: three waving cloth strips each.
    for side, x in (("L", -1.55), ("R", 1.55)):
        pole = pivot(f"flag pole {side}", (x, 1.1, 0), root)
        cylinder(f"pole {side}", .028, 2.9, (0, 0, 1.45), m["gold"], pole, vertices=12)
        sphere(f"pole finial {side}", (0, 0, 2.95), .06, m["gold"], pole, segments=12, rings=8)
        cylinder(f"pole base {side}", .17, .1, (0, 0, .05), m["gold"], pole, vertices=20, bevel=.02)
        for index, material in enumerate((m["flagBlue"], m["flagWhite"], m["flagRed"])):
            x0 = index * .3

            def wave(px, py, x0=x0):
                u = px + .15 + x0
                return .07 * math.sin(u * 5.2 + py * 1.4) * u
            grid(f"flag {side} stripe {index}", .3, .78, 6, 8, material, pole, (x0 + .18, 0, 2.45), rotation=(90, 0, 0), shape=wave)
    # The podium, with a gilded emblem: a laurel wreath around a star.
    podium = pivot("podium", (0, -.55, 0), root)
    box("podium body", (1.05, .62, 1.12), (0, 0, .56), m["woodDark"], podium, bevel=.06)
    box("podium top", (1.22, .78, .07), (0, -.02, 1.15), m["wood"], podium, rotation=(-8, 0, 0), bevel=.025)
    box("podium front panel", (.86, .04, .82), (0, -.32, .56), m["wood"], podium, bevel=.02)
    cylinder("emblem disc", .2, .04, (0, -.35, .66), m["navy"], podium, rotation=(90, 0, 0), vertices=36, bevel=.01)
    for index in range(14):
        angle = math.radians(200 + index * 10.6 if index < 7 else -20 - (index - 7) * 10.6)
        sphere(f"laurel leaf {index}", (.15 * math.cos(angle), -.38, .66 + .15 * math.sin(angle)), (.028, .012, .05), m["gold"], podium,
               rotation=(0, -math.degrees(angle), 0), segments=10, rings=6)
    star_points = []
    for index in range(11):
        angle = math.pi / 2 + index * math.tau / 10
        radius = .09 if index % 2 == 0 else .038
        star_points.append((radius * math.cos(angle), -.38, .66 + radius * math.sin(angle)))
    tube("emblem star", star_points, .012, m["gold"], podium, resolution=2)
    for side, x in (("L", -.16), ("R", .16)):
        stem = [(x, -.05, 1.18), (x, -.12, 1.26), (x * .8, -.24, 1.31), (x * .6, -.32, 1.33)]
        tube(f"microphone neck {side}", stem, .008, m["chrome"], podium)
        sphere(f"microphone {side}", (x * .58, -.35, 1.335), (.022, .034, .022), m["black"], podium, segments=14, rings=8)
    cylinder("water glass", .045, .14, (.42, .02, 1.26), m["glass"], podium, vertices=16)
    box("speech papers", (.3, .4, .012), (-.18, .02, 1.2), m["white"], podium, rotation=(-8, 0, 6))
    return root


def build_room(m):
    root = pivot("INTRO ROOM export root", (0, 0, 0))
    W, D, H = 6.4, 5.4, 3.0
    box("room floor", (W, D, .1), (0, 0, -.05), m["woodPale"], root)
    for index in range(13):
        box(f"floor seam {index}", (.012, D, .004), (-W / 2 + .5 * index, 0, .002), m["wood"], root)
    # Back wall with stripes, chair rail and wainscot; side walls likewise.
    box("back wall", (W, .12, H), (0, D / 2, H / 2), m["wall"], root)
    for index in range(16):
        box(f"back wallpaper stripe {index}", (.12, .01, H - 1.0), (-W / 2 + .2 + index * .4, D / 2 - .065, H / 2 + .5), m["wallStripe"], root)
    box("back wainscot", (W, .06, .95), (0, D / 2 - .08, .475), m["wainscot"], root, bevel=.01)
    box("back chair rail", (W, .1, .06), (0, D / 2 - .1, .98), m["wood"], root, bevel=.015)
    box("back skirting", (W, .08, .12), (0, D / 2 - .12, .06), m["wood"], root)
    for side, x in (("L", -W / 2), ("R", W / 2)):
        box(f"side wall {side}", (.12, D, H), (x, 0, H / 2), m["wall"], root)
        box(f"side wainscot {side}", (.06, D, .95), (x - math.copysign(.08, x), 0, .475), m["wainscot"], root)
        box(f"side chair rail {side}", (.1, D, .06), (x - math.copysign(.1, x), 0, .98), m["wood"], root)
    # The front wall, which the reverse angles look at, with a bookshelf of toys.
    box("front wall", (W, .12, H), (0, -D / 2, H / 2), m["wall"], root)
    for index in range(16):
        box(f"front wallpaper stripe {index}", (.12, .01, H - 1.0), (-W / 2 + .2 + index * .4, -D / 2 + .065, H / 2 + .5), m["wallStripe"], root)
    box("front wainscot", (W, .06, .95), (0, -D / 2 + .08, .475), m["wainscot"], root, bevel=.01)
    box("front chair rail", (W, .1, .06), (0, -D / 2 + .1, .98), m["wood"], root, bevel=.015)
    shelf = pivot("bookshelf", (1.25, -D / 2 + .3, 0), root)
    box("shelf back", (1.3, .04, 1.7), (0, -.15, .85), m["woodDark"], shelf)
    for side, x in (("L", -.63), ("R", .63)):
        box(f"shelf side {side}", (.05, .34, 1.72), (x, 0, .86), m["wood"], shelf, bevel=.01)
    for index, z in enumerate((.04, .45, .9, 1.35, 1.7)):
        box(f"shelf board {index}", (1.28, .34, .04), (0, 0, z), m["wood"], shelf, bevel=.008)
    book_colours = ("red", "navy", "yellow", "teal", "pink", "lilac", "green", "redDeep")
    for row, z in enumerate((.47, .92)):
        x = -.56
        for index in range(9):
            width = .05 + .025 * ((index * 7 + row * 3) % 3)
            height = .28 + .05 * ((index * 5 + row) % 3)
            box(f"book {row} {index}", (width, .22, height), (x + width / 2, .03, z + height / 2), m[book_colours[(index + row * 3) % 8]], shelf,
                rotation=(0, 6 if index == 8 else 0, 0), bevel=.006)
            x += width + .012
    sphere("shelf globe", (-.35, 0, 1.52), .13, m["teal"], shelf, segments=20, rings=12)
    cylinder("shelf globe stand", .06, .04, (-.35, 0, 1.39), m["gold"], shelf, vertices=12)
    giraffe = pivot("balloon giraffe", (.25, 0, 1.37), shelf)
    for name, position, size in (("body", (0, 0, .1), (.09, .05, .05)), ("neck", (-.06, 0, .22), (.022, .022, .12)),
                                 ("head", (-.08, 0, .35), (.04, .028, .028)), ("leg a", (-.05, 0, .04), (.018, .018, .05)),
                                 ("leg b", (.05, 0, .04), (.018, .018, .05))):
        sphere(f"giraffe {name}", position, size, m["yellow"], giraffe, segments=12, rings=8)
    for row, z in enumerate((.06, 1.72)):
        for index in range(3):
            sphere(f"shelf balloon {row} {index}", (-.4 + index * .38, -.02, z + .1), (.09, .09, .1), m[("pink", "yellow", "lilac")[index]], shelf, segments=16, rings=10)
    # Window on the right wall: night-blue glass behind cream frames and red curtains.
    win = pivot("window", (W / 2 - .1, .2, 1.65), root)
    box("window glass", (.02, 1.3, 1.2), (.02, 0, 0), m["glass"], win)
    for index, (y, z, sy, sz) in enumerate(((0, .62, 1.42, .08), (0, -.62, 1.42, .08), (.67, 0, .08, 1.32), (-.67, 0, .08, 1.32), (0, 0, .05, 1.2), (0, 0, 1.3, .05))):
        box(f"window frame {index}", (.08, sy, sz), (-.02, y, z), m["wainscot"], win, bevel=.01)
    box("window sill", (.22, 1.55, .06), (-.08, 0, -.68), m["wainscot"], win, bevel=.015)
    for side, y in (("front", -.88), ("back", .88)):
        for fold in range(4):
            sphere(f"curtain {side} fold {fold}", (-.12, y + (fold - 1.5) * .09, .02), (.05, .065, .78), m["red"], win, segments=12, rings=12)
    box("curtain rod", (.04, 2.1, .04), (-.14, 0, .86), m["gold"], win)
    # The television: a walnut console on splayed legs with a bulging screen.
    tv = pivot("television", (0, D / 2 - .55, 0), root)
    box("tv cabinet", (1.2, .62, .82), (0, 0, .78), m["woodDark"], tv, bevel=.08)
    box("tv bezel", (.86, .05, .66), (-.13, -.31, .8), m["black"], tv, bevel=.05)
    screen_w, screen_h = .74, .56

    def bulge(px, py):
        return .045 * (1 - (2 * px / screen_w) ** 2) * (1 - (2 * py / screen_h) ** 2)
    screen = grid("TV_SCREEN", screen_w, screen_h, 16, 12, m["screenOff"], tv, (-.13, -.335, .8), rotation=(90, 0, 0), shape=bulge)
    screen["role"] = "tv screen"
    box("tv speaker panel", (.2, .04, .66), (.45, -.31, .8), m["wood"], tv, bevel=.02)
    for index in range(6):
        box(f"speaker slot {index}", (.14, .01, .015), (.45, -.335, .64 + index * .035), m["black"], tv)
    for index, z in enumerate((1.0, .88)):
        cylinder(f"tv knob {index}", .04, .04, (.45, -.34, z), m["gold"], tv, rotation=(90, 0, 0), vertices=18, bevel=.008)
    for index, (x, y) in enumerate(((-.48, -.2), (.48, -.2), (-.48, .2), (.48, .2))):
        cone(f"tv leg {index}", .035, .02, .38, (x, y, .19), m["wood"], tv, rotation=(math.copysign(8, y), -math.copysign(8, x), 0), vertices=10)
    for side, angle in (("L", 28), ("R", -28)):
        tip = (math.sin(math.radians(angle)) * -.6, .05, 1.19 + math.cos(math.radians(angle)) * .6)
        tube(f"antenna {side}", [(0, .05, 1.2), tip], .007, m["chrome"], tv)
        sphere(f"antenna tip {side}", tip, .018, m["chrome"], tv, segments=10, rings=6)
    sphere("antenna base", (0, .05, 1.21), (.09, .07, .045), m["black"], tv, segments=16, rings=8)
    # A balloon poodle ornament on the TV: the game's own animals in miniature.
    dog = pivot("poodle ornament", (-.38, .02, 1.2), tv, rotation=(0, 0, -30))
    for name, position, size in (("body", (0, 0, .07), (.08, .045, .045)), ("head", (-.08, 0, .14), (.04, .04, .045)),
                                 ("snout", (-.13, 0, .135), (.035, .02, .02)), ("tail", (.1, 0, .12), (.02, .02, .04))):
        sphere(f"poodle {name}", position, size, m["pink"], dog, segments=12, rings=8)
    for index, x in enumerate((-.05, .05)):
        sphere(f"poodle leg {index}", (x, 0, .025), (.018, .018, .035), m["pink"], dog, segments=10, rings=6)
    # Rug and a puffy balloon armchair.
    cylinder("rug", 1.25, .03, (0, .25, .015), m["rug"], root, vertices=48, bevel=.012)
    torus("rug ring", 1.0, .03, (0, .25, .032), m["rugGold"], root, scale=(1, 1, .3), segments=48)
    torus("rug ring inner", .55, .025, (0, .25, .032), m["rugGold"], root, scale=(1, 1, .3), segments=40)
    chair = pivot("armchair", (-1.9, .9, 0), root, rotation=(0, 0, 32))
    sphere("chair seat", (0, 0, .36), (.5, .45, .2), m["teal"], chair, segments=28, rings=16)
    sphere("chair back", (0, .38, .78), (.52, .16, .48), m["teal"], chair, rotation=(-10, 0, 0), segments=28, rings=16)
    for side, x in (("L", -.5), ("R", .5)):
        sphere(f"chair arm {side}", (x, .05, .56), (.13, .42, .16), m["teal"], chair, segments=20, rings=12)
    sphere("chair cushion", (.05, .12, .62), (.2, .1, .17), m["yellow"], chair, rotation=(-20, 0, 15), segments=18, rings=10)
    for index, (x, y) in enumerate(((-.35, -.3), (.35, -.3), (-.35, .3), (.35, .3))):
        cone(f"chair foot {index}", .04, .025, .18, (x, y, .09), m["woodDark"], chair, vertices=10)
    # Floor lamp: brass stem, glowing balloon shade.
    lamp = pivot("floor lamp", (1.85, 1.65, 0), root)
    cylinder("lamp base", .2, .05, (0, 0, .025), m["gold"], lamp, vertices=24, bevel=.01)
    cylinder("lamp stem", .02, 1.5, (0, 0, .78), m["gold"], lamp, vertices=10)
    sphere("lamp shade", (0, 0, 1.58), (.28, .28, .22), m["lampGlow"], lamp, segments=28, rings=14)
    sphere("lamp bulb", (0, 0, 1.52), .07, m["bulb"], lamp, segments=12, rings=8)
    # Side table with a baguette in a basket and a potted balloon flower.
    table = pivot("side table", (-1.15, 1.95, 0), root)
    cylinder("table top", .3, .05, (0, 0, .62), m["wood"], table, vertices=28, bevel=.012)
    cylinder("table stem", .035, .6, (0, 0, .31), m["woodDark"], table, vertices=10)
    cylinder("table foot", .18, .03, (0, 0, .015), m["woodDark"], table, vertices=20)
    cylinder("basket", .13, .1, (.08, 0, .7), m["straw"], table, vertices=20, bevel=.01)
    sphere("baguette", (.06, 0, .76), (.03, .03, .2), m["paper"], table, rotation=(0, 62, 15), segments=14, rings=10)
    cylinder("flower pot", .07, .1, (-.14, .05, .7), m["terracotta"], table, vertices=16)
    for index, (dx, dz, col) in enumerate(((0, .2, "pink"), (.05, .15, "yellow"), (-.05, .16, "lilac"))):
        tube(f"flower stem {index}", [(-.14, .05, .74), (-.14 + dx, .05, .74 + dz)], .006, m["green"], table)
        sphere(f"flower {index}", (-.14 + dx, .05, .76 + dz), .035, m[col], table, segments=12, rings=8)
    # Picture frames: a farm landscape and a portrait of a balloon pig.
    for index, (x, z, w, h, col) in enumerate(((-1.5, 1.85, .6, .45, "lawn"), (1.0, 1.95, .42, .52, "pink"), (-2.3, 1.6, .32, .32, "yellow"))):
        frame = pivot(f"picture {index}", (x, D / 2 - .08, z), root)
        box(f"picture {index} frame", (w + .08, .04, h + .08), (0, 0, 0), m["gold"], frame, bevel=.015)
        box(f"picture {index} canvas", (w, .02, h), (0, -.02, 0), m[col], frame)
        sphere(f"picture {index} subject", (0, -.035, -.02), (w * .22, .01, h * .2), m["white"] if col != "pink" else m["red"], frame, segments=14, rings=8)
    # A door on the left wall that leads outside.
    door = pivot("room door", (-W / 2 + .07, -1.2, 0), root)
    box("door leaf", (.06, .95, 2.1), (.02, 0, 1.05), m["shutter"], door, bevel=.02)
    for index, z in enumerate((.6, 1.5)):
        box(f"door panel {index}", (.02, .7, .6), (.06, 0, z), m["wainscot"], door, bevel=.01)
    sphere("door knob", (.09, .36, 1.0), .035, m["gold"], door, segments=12, rings=8)
    box("door frame", (.08, 1.1, 2.2), (-.01, 0, 1.1), m["wainscot"], door)
    return root


def build_exterior(m):
    root = pivot("INTRO EXTERIOR export root", (0, 0, 0))
    cylinder("lawn", 26, .1, (0, 0, -.05), m["lawn"], root, vertices=64)
    # The cottage front, facing -Y, its door at the origin of the path.
    house = pivot("cottage", (0, 3.2, 0), root)
    box("cottage wall", (7.4, .5, 3.4), (0, 0, 1.7), m["cream"], house, bevel=.04)
    box("cottage plinth", (7.6, .6, .35), (0, 0, .175), m["stone"], house, bevel=.03)
    for index in range(10):
        roof_y = .2 + index * .19
        roof_z = 3.45 + index * .17
        box(f"roof course {index}", (8.2, .26, .1), (0, roof_y - .35, roof_z), m["terracotta"], house, rotation=(-42, 0, 0), bevel=.04)
    box("roof ridge", (8.2, .3, .2), (0, 1.5, 5.2), m["redDeep"], house, bevel=.06)
    box("chimney", (.6, .6, 1.6), (2.4, 1.3, 5.2), m["stone"], house, bevel=.04)
    box("chimney cap", (.75, .75, .12), (2.4, 1.3, 6.04), m["terracotta"], house, bevel=.03)
    # A dark hall behind the door, so the open doorway reads as a way in.
    box("house doorway shadow", (1.1, .02, 2.1), (0, -.255, 1.4), mat("Hall shadow", "#2a1d17", .9, coat=0), house)
    door_pivot = pivot("HOUSE_DOOR", (-.55, -.31, .35), house)
    box("house door leaf", (1.1, .08, 2.1), (.55, 0, 1.05), m["green"], door_pivot, bevel=.03)
    for index, z in enumerate((.55, 1.45)):
        box(f"house door panel {index}", (.8, .03, .62), (.55, -.05, z), m["greenDeep"], door_pivot, bevel=.015)
    sphere("house door knob", (.95, -.08, 1.05), .045, m["gold"], door_pivot, segments=12, rings=8)
    box("door frame top", (1.4, .2, .15), (0, -.28, 2.55), m["stone"], house, bevel=.03)
    for side, x in (("L", -.65), ("R", .65)):
        box(f"door frame {side}", (.12, .2, 2.2), (x, -.28, 1.45), m["stone"], house, bevel=.02)
    box("door step", (1.6, .6, .18), (0, -.45, .09), m["stone"], house, bevel=.03)
    sphere("door lamp", (1.0, -.38, 2.35), (.1, .1, .14), m["lampGlow"], house, segments=16, rings=10)
    for side, x in (("L", -2.4), ("R", 2.4)):
        win = pivot(f"cottage window {side}", (x, -.26, 1.9), house)
        box(f"window {side} glass", (1.0, .04, 1.1), (0, 0, 0), m["glass"], win)
        box(f"window {side} frame", (1.12, .06, .08), (0, -.02, 0), m["white"], win)
        box(f"window {side} mullion", (.06, .06, 1.1), (0, -.02, 0), m["white"], win)
        for shutter_side, sx in (("a", -.82), ("b", .82)):
            box(f"window {side} shutter {shutter_side}", (.55, .06, 1.2), (sx, -.03, 0), m["shutter"], win, bevel=.02)
            for slat in range(6):
                box(f"window {side} shutter {shutter_side} slat {slat}", (.45, .02, .04), (sx, -.07, -.45 + slat * .18), m["navy"], win)
        box(f"window {side} box", (1.2, .3, .25), (0, -.18, -.68), m["terracotta"], win, bevel=.03)
        for index in range(7):
            col = ("red", "pink", "yellow", "lilac", "red", "pink", "yellow")[index]
            sphere(f"window {side} flower {index}", (-.48 + index * .16, -.2, -.48 + .04 * math.sin(index * 2.1)), .07, m[col], win, segments=12, rings=8)
            sphere(f"window {side} leaf {index}", (-.48 + index * .16, -.26, -.56), (.07, .04, .05), m["green"], win, segments=10, rings=6)
    for index in range(16):
        angle = index * .5
        sphere(f"climbing rose leaf {index}", (-3.3 + .12 * math.sin(angle), -.3, .5 + index * .2), (.16, .08, .14), m["greenDeep"], house, segments=12, rings=8)
        if index % 3 == 0:
            sphere(f"climbing rose {index}", (-3.25 + .12 * math.sin(angle), -.38, .55 + index * .2), .07, m["red"], house, segments=12, rings=8)
    # Stepping-stone path from the door to the gate.
    for index in range(7):
        y = 2.3 - index * .62
        x = .12 * math.sin(index * 1.4)
        cylinder(f"path stone {index}", .27 + .04 * math.sin(index * 2.3), .06, (x, y, .03), m["stone"], root, vertices=18, bevel=.02)
    # Picket fence with balloon-knot post tops and a gate at the path.
    for side, sign in (("L", -1), ("R", 1)):
        for index in range(14):
            x = sign * (.75 + index * .32)
            box(f"picket {side} {index}", (.09, .05, .8), (x, -1.6, .4), m["white"], root, bevel=.015)
            sphere(f"picket knot {side} {index}", (x, -1.6, .84), .055, m["white"], root, segments=10, rings=6)
        for z in (.3, .62):
            box(f"fence rail {side} {z}", (4.6, .04, .06), (sign * 3.0, -1.57, z), m["white"], root)
    gate = pivot("garden gate", (-.6, -1.6, 0), root, rotation=(0, 0, 70))
    for index in range(4):
        box(f"gate picket {index}", (.09, .05, .76), (.15 + index * .3, 0, .4), m["white"], gate, bevel=.015)
    box("gate rail", (1.1, .04, .06), (.6, .03, .45), m["white"], gate)
    # The mailbox, beside the path, its door facing the walk (-X).
    post = pivot("mailbox post", (.95, -1.25, 0), root)
    box("mailbox post wood", (.1, .1, 1.0), (0, 0, .5), m["woodDark"], post, bevel=.02)
    box("mailbox body", (.5, .34, .26), (0, 0, 1.12), m["mailRed"], post, bevel=.05)
    cylinder("mailbox roof", .17, .5, (0, 0, 1.25), m["mailRed"], post, rotation=(0, 90, 0), vertices=24)
    door = pivot("MAILBOX_DOOR", (-.26, 0, .99), post)
    box("mailbox door panel", (.03, .32, .26), (0, 0, .13), m["redDeep"], door, bevel=.012)
    cylinder("mailbox door arch", .16, .03, (0, 0, .26), m["redDeep"], door, rotation=(0, 90, 0), vertices=20)
    sphere("mailbox door pull", (-.025, 0, .3), .022, m["gold"], door, segments=10, rings=6)
    flag = pivot("MAILBOX_FLAG", (.08, -.18, 1.1), post)
    box("mailbox flag arm", (.03, .02, .32), (0, 0, .16), m["gold"], flag)
    box("mailbox flag", (.16, .02, .11), (.08, 0, .27), m["yellow"], flag, bevel=.01)
    flag.rotation_euler = (0, math.radians(90), 0)
    # Gardens either side: balloon topiary trees, hedges, and distant poplars.
    for index, (x, y, s) in enumerate(((-4.6, .6, 1.0), (4.8, .3, 1.15), (-5.5, -3.5, .8))):
        tree = pivot(f"topiary {index}", (x, y, 0), root)
        cylinder(f"topiary {index} trunk", .1 * s, 1.4 * s, (0, 0, .7 * s), m["woodDark"], tree, vertices=10)
        for puff, (px, py, pz, r) in enumerate(((0, 0, 1.6, .7), (.45, .1, 1.35, .45), (-.4, -.1, 1.4, .48), (0, .2, 2.1, .5), (.1, -.35, 1.7, .4))):
            sphere(f"topiary {index} puff {puff}", (px * s, py * s, pz * s), r * s, m["green"], tree, segments=20, rings=14)
    for side, sign in (("L", -1), ("R", 1)):
        for index in range(9):
            sphere(f"hedge {side} {index}", (sign * (1.6 + index * .45), 1.8 + .1 * math.sin(index), .35), (.33, .3, .35), m["greenDeep"], root, segments=16, rings=10)
    for index in range(14):
        angle = math.radians(-60 + index * 9)
        x = 15 * math.sin(angle)
        y = 13 + 3 * math.cos(index * 1.7)
        h = 3.2 + 1.2 * math.sin(index * 2.3)
        sphere(f"poplar {index}", (x, y, h * .55), (.6, .6, h * .55), m["greenDeep"], root, segments=14, rings=10)
    for index, (x, y, sx, sz, col) in enumerate(((-12, 20, 10, 3, "green"), (8, 22, 12, 4, "greenDeep"), (0, 26, 16, 5, "green"))):
        sphere(f"hill {index}", (x, y, -.5), (sx, 5, sz), m[col], root, segments=24, rings=12)
    object_clip(flag, "FLAG", [(1, (0, 90, 0), (0, 0, 0)), (6, (0, -12, 0), (0, 0, 0)), (9, (0, 8, 0), (0, 0, 0)), (12, (0, -3, 0), (0, 0, 0)), (16, (0, 0, 0), (0, 0, 0))])
    object_clip(door, "MAIL_OPEN", [(1, (0, 0, 0), (0, 0, 0)), (8, (0, -40, 0), (0, 0, 0)), (14, (0, -96, 0), (0, 0, 0)), (18, (0, -88, 0), (0, 0, 0)), (22, (0, -92, 0), (0, 0, 0))])
    object_clip(door_pivot, "DOOR_OPEN", [(1, (0, 0, 0), (0, 0, 0)), (14, (0, 0, -82), (0, 0, 0)), (20, (0, 0, -74), (0, 0, 0)), (24, (0, 0, -77), (0, 0, 0))])
    return root


def build_kit(m):
    root = pivot("INTRO KIT export root", (0, 0, 0))
    crate = pivot("KIT_CRATE", (0, 0, 0), root)
    for side, y in (("front", -.16), ("back", .16)):
        for index, z in enumerate((.05, .14, .23)):
            box(f"crate {side} slat {index}", (.46, .025, .07), (0, y, z), m["woodPale"], crate, bevel=.008)
    for side, x in (("L", -.22), ("R", .22)):
        for index, z in enumerate((.05, .14, .23)):
            box(f"crate {side} slat {index}", (.025, .3, .07), (x, 0, z), m["woodPale"], crate, bevel=.008)
        for y in (-.15, .15):
            box(f"crate corner {side} {y}", (.04, .04, .28), (x, y, .14), m["wood"], crate, bevel=.008)
    box("crate floor", (.44, .3, .02), (0, 0, .01), m["wood"], crate)
    for index in range(16):
        sphere(f"straw {index}", (-.18 + (index % 8) * .05, -.08 + (index // 8) * .14, .25 + .02 * math.sin(index)), (.04, .025, .015), m["straw"], crate,
               rotation=(0, 0, index * 37), segments=8, rings=5)
    for index, (x, col, tilt) in enumerate(((-.14, "pink", -10), (-.06, "yellow", 4), (.02, "lilac", -4), (.1, "red", 9))):
        packet = pivot(f"seed packet {index}", (x, .04, .26), crate, rotation=(-8, tilt, 0))
        box(f"seed packet {index} paper", (.075, .012, .12), (0, 0, .03), m["paper"], packet)
        sphere(f"seed packet {index} picture", (0, -.008, .045), (.025, .004, .025), m[col], packet, segments=10, rings=6)
    trowel = pivot("trowel", (.17, -.06, .25), crate, rotation=(-20, 30, 10))
    cylinder("trowel handle", .016, .12, (0, 0, .06), m["red"], trowel, vertices=10)
    sphere("trowel blade", (0, 0, .17), (.035, .008, .07), m["chrome"], trowel, segments=12, rings=8)
    can = pivot("watering can", (-.15, .07, .2), crate, rotation=(0, 0, 25))
    cylinder("watering can body", .08, .16, (0, 0, .09), m["teal"], can, vertices=20, bevel=.01)
    tube("watering can spout", [(.06, 0, .07), (.13, 0, .14), (.18, 0, .2)], .012, m["teal"], can)
    cylinder("watering can rose", .022, .02, (.185, 0, .205), m["gold"], can, rotation=(0, 55, 0), vertices=12)
    tube("watering can handle", [(-.06, 0, .15), (-.03, 0, .22), (.03, 0, .22), (.05, 0, .16)], .01, m["teal"], can)
    pot = pivot("sprout pot", (.05, -.07, .25), crate)
    cone("sprout pot clay", .05, .065, .08, (0, 0, .04), m["terracotta"], pot, vertices=16)
    cylinder("sprout soil", .058, .01, (0, 0, .08), m["soil"], pot, vertices=16)
    tube("sprout stem", [(0, 0, .08), (.005, 0, .13), (0, 0, .17)], .006, m["green"], pot)
    for side, sign in (("L", -1), ("R", 1)):
        sphere(f"sprout leaf {side}", (sign * .03, 0, .17), (.032, .012, .018), m["green"], pot, rotation=(0, sign * -25, 0), segments=10, rings=6)
    # A ribbon around the crate with a bow and a gift tag.
    box("ribbon band", (.47, .315, .03), (0, 0, .14), m["red"], crate)
    for side, sign in (("L", -1), ("R", 1)):
        sphere(f"bow loop {side}", (sign * .045, -.175, .17), (.045, .02, .03), m["red"], crate, rotation=(0, sign * 25, 0), segments=12, rings=8)
    sphere("bow knot", (0, -.18, .16), .02, m["redDeep"], crate, segments=10, rings=6)
    box("gift tag", (.08, .005, .05), (.06, -.185, .09), m["cream"], crate, rotation=(0, 15, 0))
    # Three balloons in the colours of the flag, each on its own string.
    for index, (x, y, z) in enumerate(((-.2, .05, 1.0), (0, -.05, 1.15), (.2, .05, 1.02))):
        material = (m["flagBlue"], m["flagWhite"], m["flagRed"])[index]
        holder = pivot(f"KIT_BALLOON_{index}", (x, y, z), root)
        balloon(f"kit balloon {index}", (0, 0, 0), (.15, .15, .18), material, holder, segments=24, rings=16)
        tube(f"kit string {index}", [(0, 0, -.2), (-x * .3, 0, -(z - .3) * .5), (-x * .9, -y, -(z - .28))], .004, m["string"], holder, resolution=1)
        object_clip(holder, "FLOAT", [(1, (0, 3 * (index - 1), 0), (0, 0, 0)), (25, (0, -4 * (index - 1) - 2, 3), (0, 0, .03)), (49, (0, 3 * (index - 1), 0), (0, 0, 0))])
    return root


# ------------------------------------------------------------ review + export --

def review(stem, root, camera_from, look_at, lens=40, world="#cfe3dd"):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x, scene.render.resolution_y = 1200, 760
    scene.render.resolution_percentage = 100
    scene.eevee.taa_render_samples = 48
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.world = bpy.data.worlds.new(f"{stem} review world")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = rgba(world)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = .7
    camera_data = bpy.data.cameras.new(f"{stem} review camera")
    camera_data.lens = lens
    camera = bpy.data.objects.new(f"{stem} review camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = camera_from
    camera.rotation_euler = (Vector(look_at) - Vector(camera_from)).to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera
    for name, location, energy, size, color in (
        ("review key", (3, -5, 6), 1400, 5, (1, .88, .78)),
        ("review fill", (-6, -2, 4), 700, 6, (.8, .92, 1)),
        ("review rim", (1, 6, 6), 1100, 4, (1, .8, .76)),
    ):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.size = size
        data.color = color
        lamp = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(lamp)
        lamp.location = location
        lamp.rotation_euler = (Vector(look_at) - Vector(location)).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = str(OUTPUT / f"{stem}-review.png")
    bpy.ops.render.render(write_still=True)


def export(stem, root, *, texcoords=False, animations=True):
    blend_path = OUTPUT / f"{stem}.blend"
    glb_path = OUTPUT / f"{stem}.glb"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    bpy.ops.object.select_all(action="DESELECT")

    def select_tree(obj):
        obj.select_set(True)
        for child in obj.children:
            select_tree(child)

    select_tree(root)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path), export_format="GLB", use_selection=True,
        export_apply=True, export_animations=animations, export_animation_mode="NLA_TRACKS",
        export_force_sampling=True, export_frame_step=1, export_materials="EXPORT",
        export_cameras=False, export_lights=False, export_texcoords=texcoords,
        export_yup=True,
        # Every clip keys every pivot, and the runtime always plays clips at a
        # total weight of 1. Keep the constant channels: the exporter otherwise
        # drops them, and the node it falls back to has been zeroed by the
        # muted NLA stack, which collapses the figure into a heap.
        export_optimize_animation_size=False,
        export_optimize_animation_keep_anim_object=True,
    )
    print(f"{stem}: {blend_path}")
    print(f"{stem}: {glb_path}")


def reset_scene():
    MATERIALS.clear()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = 24
    # No .blend1 backups next to the shipped assets; git is the history.
    bpy.context.preferences.filepaths.save_version = 0


def make_boy():
    m = palette()
    root = build_boy(m)
    bpy.context.scene.frame_set(20)
    review("intro-boy", root, (1.5, -3.4, 1.2), (0, 0, .8), lens=50)
    export("intro-boy", root)


def make_president():
    m = palette()
    root = build_president(m)
    bpy.context.scene.frame_set(1)
    review("intro-president", root, (1.3, -3.4, 1.5), (0, 0, 1.1), lens=45)
    export("intro-president", root)


def make_studio():
    m = palette()
    root = build_studio(m)
    review("intro-studio", root, (0, -5.5, 1.8), (0, 0, 1.5), lens=32, world="#141a33")
    export("intro-studio", root, animations=False)


def make_room():
    m = palette()
    root = build_room(m)
    review("intro-room", root, (.8, -4.0, 1.6), (0, 1.2, .9), lens=24, world="#2b2f3f")
    export("intro-room", root, texcoords=True, animations=False)


def make_exterior():
    m = palette()
    root = build_exterior(m)
    review("intro-exterior", root, (3.4, -7.5, 2.0), (0, 0, 1.4), lens=28, world="#b9dcef")
    export("intro-exterior", root)


def make_kit():
    m = palette()
    root = build_kit(m)
    review("intro-kit", root, (.9, -2.2, .9), (0, 0, .5), lens=50)
    export("intro-kit", root)


MAKERS = {"boy": make_boy, "president": make_president, "studio": make_studio, "room": make_room, "exterior": make_exterior, "kit": make_kit}
arguments = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
requested = [value.lower() for value in arguments] if arguments else list(MAKERS)
invalid = [value for value in requested if value not in MAKERS]
if invalid:
    raise SystemExit(f"Unknown asset(s): {', '.join(invalid)}. Choose from {', '.join(MAKERS)}.")
for name in requested:
    reset_scene()
    MAKERS[name]()
