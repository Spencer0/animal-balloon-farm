"""Create Animal Balloon Farm sheep, cow, chicken, duck, goose, frog, owl, raccoon, mouse, rat and snake assets.

Run from the repository root:
  blender --background --factory-startup --python art/blender/balloon_friends.py
By default only duck and goose are generated; name other species after `--` to opt in.
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "public" / "assets" / "animals"
OUTPUT.mkdir(parents=True, exist_ok=True)
FRAMES = (1, 7, 13, 19, 25)
PHASES = (0.0, math.pi / 2, math.pi, 3 * math.pi / 2, math.tau)
# Mesh density for the animal being built: 1.0 for the original catalog. The tall-grass animals
# (mouse, rat, snake) are built at LEAN_DETAIL so the whole catalog stays inside the animal
# download budget (scripts/asset-budget.mjs); at game scale the difference does not show.
DETAIL = 1.0
LEAN_DETAIL = .32


def rgba(hex_color):
    raw = hex_color.lstrip("#")
    channels = [int(raw[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c < .04045 else ((c + .055) / 1.055) ** 2.4 for c in channels) + (1,)


def mat(name, color, rough=.22, metal=0, coat=.5):
    material = bpy.data.materials.new(name)
    material.diffuse_color = rgba(color)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = rgba(color)
    shader.inputs["Roughness"].default_value = rough
    shader.inputs["Metallic"].default_value = metal
    shader.inputs["Coat Weight"].default_value = coat
    shader.inputs["Coat Roughness"].default_value = .17
    return material


def local(obj, parent, position):
    if parent:
        obj.parent = parent
        obj.matrix_parent_inverse.identity()
        obj.location = position
    else:
        obj.location = position
    return obj


def sphere(name, position, size, material, parent=None, segments=36, rings=24):
    segments = max(8, round(segments * DETAIL))
    rings = max(5, round(rings * DETAIL))
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + " · mesh"
    obj.scale = size
    obj.data.materials.append(material)
    for face in obj.data.polygons:
        face.use_smooth = True
    return local(obj, parent, position)


def curve(name, points, width, material, parent=None, resolution=3):
    data = bpy.data.curves.new(name + " · curve", "CURVE")
    data.dimensions = "3D"
    data.resolution_u = max(5, round(16 * DETAIL))
    data.bevel_depth = width
    data.bevel_resolution = resolution
    spline = data.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for knot, point in zip(spline.bezier_points, points):
        knot.co = point
        knot.handle_left_type = "AUTO"
        knot.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    data.materials.append(material)
    return local(obj, parent, (0, 0, 0))


def pivot(name, position, parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.empty_display_type = "SPHERE"
    obj.empty_display_size = .075
    return local(obj, parent, position)


def key(obj, frame, location=None, rotation=None, scale=None):
    for path, value in (("location", location), ("rotation_euler", rotation), ("scale", scale)):
        if value is not None:
            setattr(obj, path, value)
            obj.keyframe_insert(data_path=path, frame=frame, group=obj.name)


def begin_action(obj, label):
    obj.animation_data_create()
    obj.animation_data.action = bpy.data.actions.new(label)


def finish_action(objects, clip, animal):
    for obj in objects:
        data = obj.animation_data
        action = data.action if data else None
        if action is None:
            continue
        action.name = f"BALLOON {animal.upper()} · {clip}"
        for fcurve in action.fcurves:
            for point in fcurve.keyframe_points:
                point.interpolation = "BEZIER"
                point.handle_left_type = "AUTO_CLAMPED"
                point.handle_right_type = "AUTO_CLAMPED"
        track = data.nla_tracks.new()
        track.name = clip
        strip = track.strips.new(clip, 1, action)
        strip.blend_type = "REPLACE"
        strip.extrapolation = "NOTHING"
        data.action = None


def materials(animal):
    base = {
        "ivory": mat(f"{animal} · vanilla balloon", "#fff0d0", .24, .01, .56),
        "highlight": mat(f"{animal} · pearl highlight", "#fff9e9", .18, .01, .62),
        "face": mat(f"{animal} · warm face", "#e6b28f", .28, .01, .38),
        "muzzle": mat(f"{animal} · peach muzzle", "#ffd1b4", .21, .01, .50),
        "inner": mat(f"{animal} · rose details", "#ed91a3", .25, .01, .43),
        "seam": mat(f"{animal} · plum seams", "#754958", .27, 0, .28),
        "eye": mat(f"{animal} · espresso eyes", "#342638", .14, .01, .5),
        "white": mat(f"{animal} · eye whites", "#fffaf0", .17, 0, .28),
        "gold": mat(f"{animal} · polished carnival brass", "#eabd61", .20, .48, .48),
        "hoof": mat(f"{animal} · cocoa hooves", "#765461", .25, .02, .34),
        "hoofglint": mat(f"{animal} · hoof gleam", "#e6a5a6", .2, .01, .4),
        "collar": mat(f"{animal} · keepsake ribbon", "#de839d", .26, .04, .42),
        "cream": mat("Portrait · warm buttercream", "#f8e9ce", .84, 0, .04),
        "mint": mat("Portrait · soft mint backdrop", "#a9d8cf", .9, 0, .03),
        "green": mat("Portrait · garden green", "#56885b", .82),
        "yellow": mat("Portrait · marigold", "#f1c65c", .62, .02, .12),
        "coral": mat("Portrait · coral", "#ed8490", .62, .02, .12),
        "lilac": mat("Portrait · lilac", "#b6a0dc", .62, .02, .12),
    }
    if animal.lower() == "sheep":
        base["wool"] = mat("SHEEP · cloud-cream balloon wool", "#fff4dc", .26, .015, .56)
        base["woolshade"] = mat("SHEEP · warm vanilla curls", "#f5dfba", .30, .01, .48)
        base["face"] = mat("SHEEP · apricot face balloon", "#dca682", .25, .01, .44)
        base["collar"] = mat("SHEEP · soft coral bell ribbon", "#dd8da2", .23, .04, .50)
    elif animal.lower() == "cow":
        base["face"] = mat("COW · creamy ivory face balloon", "#fff0d0", .22, .01, .55)
        base["spot"] = mat("COW · deep blackberry patches", "#353444", .29, .015, .34)
        base["muzzle"] = mat("COW · strawberry-milk muzzle", "#f2a6a5", .23, .01, .48)
        base["inner"] = mat("COW · dusty rose ear interiors", "#df8291", .24, .01, .46)
        base["collar"] = mat("COW · berry-red bell ribbon", "#dc6e76", .22, .04, .48)
        base["horn"] = mat("COW · honey-cream horns", "#edcf93", .27, .02, .35)
    elif animal.lower() == "chicken":
        base["body"] = mat("CHICKEN · sunshine-yellow balloon latex", "#f7c94f", .20, .02, .62)
        base["wing"] = mat("CHICKEN · honey-yellow wing latex", "#efb93f", .22, .015, .52)
        base["feather"] = mat("CHICKEN · buttercream flight feathers", "#fff0c9", .25, .01, .48)
        base["beak"] = mat("CHICKEN · tangerine beak", "#ed8842", .23, .01, .48)
        base["comb"] = mat("CHICKEN · coral-red comb", "#e65b69", .20, .02, .58)
        base["wattle"] = mat("CHICKEN · rosy-red wattle", "#dc596b", .23, .01, .46)
        base["leg"] = mat("CHICKEN · warm orange legs", "#c96b43", .29, .01, .32)
        base["belly"] = mat("CHICKEN · vanilla balloon bib", "#fff0cf", .24, .01, .50)
        base["collar"] = mat("CHICKEN · little golden bell ribbon", "#e7a942", .22, .30, .42)
    elif animal.lower() == "frog":
        # The frog's body is one big smooth ellipsoid, so a tight clearcoat
        # highlight blew out into a hard white patch across its flank that read
        # as a stray white marking rather than as shine. A softer coat and a
        # little more roughness spread that same shine out instead.
        base["body"] = mat("FROG · leaf-green balloon skin", "#6ab84e", .30, .02, .32)
        base["head"] = mat("FROG · spring-green head balloon", "#79c55b", .28, .02, .34)
        base["belly"] = mat("FROG · buttercream belly balloon", "#f3ecc9", .24, .01, .52)
        base["leg"] = mat("FROG · deep moss shank balloons", "#4c8f3e", .24, .01, .48)
        base["foot"] = mat("FROG · padded webbed feet", "#5aa548", .23, .01, .50)
        base["collar"] = mat("FROG · little brass bell ribbon", "#eabd61", .20, .30, .48)
    elif animal.lower() == "duck":
        base["body"] = mat("DUCK · honey-gold balloon plumage", "#d6a34d", .22, .02, .58)
        base["breast"] = mat("DUCK · warm chestnut breast balloon", "#86513d", .25, .01, .50)
        base["head"] = mat("DUCK · glossy mallard emerald head", "#168d69", .17, .035, .72)
        base["wing"] = mat("DUCK · chestnut wing balloons", "#9b6243", .23, .015, .56)
        base["feather"] = mat("DUCK · golden feather balloons", "#edca79", .23, .015, .52)
        base["speculum"] = mat("DUCK · iridescent teal wing patch", "#348ca0", .18, .07, .66)
        base["bill"] = mat("DUCK · tangerine bill", "#ed943c", .23, .01, .48)
        base["leg"] = mat("DUCK · orange webbed feet", "#dc713e", .27, .01, .38)
        base["collar"] = mat("DUCK · little brass bell ribbon", "#eabd61", .20, .30, .48)
    elif animal.lower() == "owl":
        base["body"] = mat("OWL · toasted-hazelnut balloon plumage", "#a9774b", .24, .02, .58)
        base["head"] = mat("OWL · warm hazelnut head balloon", "#b4824f", .23, .02, .60)
        base["wing"] = mat("OWL · dusk-cocoa wing balloons", "#7a5334", .26, .015, .50)
        base["feather"] = mat("OWL · butterscotch flight feathers", "#d9a766", .25, .01, .48)
        base["tip"] = mat("OWL · moonlit cream feather tips", "#fff0cf", .24, .01, .50)
        base["disc"] = mat("OWL · moon-cream facial disc", "#fdeecf", .22, .01, .55)
        base["rim"] = mat("OWL · caramel disc rim", "#d3a06a", .26, .01, .46)
        base["belly"] = mat("OWL · buttercream chest balloon", "#f6e2b9", .23, .01, .55)
        base["fleck"] = mat("OWL · cocoa chest flecks", "#8a5d3a", .30, .01, .30)
        base["iris"] = mat("OWL · lantern-amber eyes", "#f2b13d", .12, .02, .70)
        base["beak"] = mat("OWL · pale honey beak", "#e6a453", .24, .01, .50)
        base["leg"] = mat("OWL · sandy talon latex", "#d9a15e", .28, .01, .34)
        base["collar"] = mat("OWL · twilight-plum bell ribbon", "#8d5f8e", .24, .04, .46)
    elif animal.lower() == "raccoon":
        base["body"] = mat("RACCOON · moonlit-grey balloon fur", "#8f949b", .27, .02, .52)
        base["wool"] = mat("RACCOON · slate-grey leg balloons", "#767b84", .28, .015, .48)
        base["face"] = mat("RACCOON · silver-grey face balloon", "#a4a9af", .25, .02, .54)
        base["belly"] = mat("RACCOON · pale smoke belly", "#d9d8d2", .26, .01, .50)
        base["mask"] = mat("RACCOON · bandit-mask charcoal", "#2f3038", .22, .01, .55)
        base["ring"] = mat("RACCOON · tail-ring charcoal", "#3a3b44", .26, .01, .48)
        base["muzzle"] = mat("RACCOON · cream snout balloon", "#efe6d4", .24, .01, .50)
        base["inner"] = mat("RACCOON · dusky-pink ear lining", "#c98f9a", .25, .01, .44)
        base["hoof"] = mat("RACCOON · charcoal paws", "#33343c", .26, .01, .38)
        base["collar"] = mat("RACCOON · midnight-teal bell ribbon", "#4a8f94", .24, .04, .46)
    elif animal.lower() == "mouse":
        base["body"] = mat("MOUSE · harvest-fawn balloon fur", "#c99a6b", .26, .02, .54)
        base["wool"] = mat("MOUSE · toasted-fawn leg balloons", "#b98a5c", .27, .015, .50)
        base["face"] = mat("MOUSE · light fawn face balloon", "#d5aa7d", .25, .02, .54)
        base["belly"] = mat("MOUSE · oat-cream belly", "#f4e6cc", .25, .01, .52)
        base["muzzle"] = mat("MOUSE · oat-cream snout", "#f4e6cc", .24, .01, .50)
        base["inner"] = mat("MOUSE · petal-pink ear lining", "#f0a3b0", .23, .01, .48)
        base["pink"] = mat("MOUSE · pink nose, paws and tail", "#e99aa6", .24, .01, .46)
        base["hoof"] = base["pink"]
        base["whisker"] = mat("MOUSE · cream whiskers", "#fff6e4", .3, 0, .2)
        base["collar"] = mat("MOUSE · buttercup bell ribbon", "#f0c34f", .22, .10, .48)
    elif animal.lower() == "rat":
        base["body"] = mat("RAT · dusk-slate balloon fur", "#7b7480", .27, .02, .50)
        base["wool"] = mat("RAT · deep slate leg balloons", "#686270", .28, .015, .48)
        base["face"] = mat("RAT · pale slate face balloon", "#8c8591", .25, .02, .52)
        base["belly"] = mat("RAT · moth-grey belly", "#d6d0cf", .26, .01, .50)
        base["muzzle"] = mat("RAT · moth-grey snout", "#d6d0cf", .24, .01, .50)
        base["inner"] = mat("RAT · dusky-rose ear lining", "#d898a3", .24, .01, .46)
        base["pink"] = mat("RAT · rosy nose, paws and tail", "#dd8f9c", .25, .01, .44)
        base["hoof"] = base["pink"]
        base["mask"] = mat("RAT · sleepy lid slate", "#5d5763", .24, .01, .48)
        base["whisker"] = mat("RAT · pale whiskers", "#efe9e4", .3, 0, .2)
        base["collar"] = mat("RAT · moonlight-violet bell ribbon", "#8e74c2", .24, .04, .46)
    elif animal.lower() == "snake":
        base["body"] = mat("SNAKE · meadow-emerald balloon scales", "#3f9e6e", .22, .02, .60)
        base["head"] = mat("SNAKE · bright emerald head balloon", "#48ab78", .21, .02, .62)
        base["spot"] = mat("SNAKE · deep-moss diamond markings", "#2a7650", .24, .02, .52)
        base["belly"] = mat("SNAKE · buttercream belly scales", "#f4ebc4", .24, .01, .50)
        base["tongue"] = mat("SNAKE · cherry tongue", "#e0505f", .22, .01, .50)
        base["collar"] = mat("SNAKE · coral bell ribbon", "#ec8573", .24, .04, .46)
    else:
        base["body"] = mat("GOOSE · warm ivory balloon plumage", "#f5eedc", .26, .01, .50)
        base["wing"] = mat("GOOSE · pearl-grey wing balloons", "#ddd7c9", .27, .01, .46)
        base["feather"] = mat("GOOSE · milk-white flight feathers", "#fff8e8", .23, .01, .52)
        base["bill"] = mat("GOOSE · tangerine bill", "#e9813d", .24, .01, .44)
        base["leg"] = mat("GOOSE · coral-orange webbed feet", "#d96b4a", .28, .01, .36)
        base["collar"] = mat("GOOSE · little brass bell ribbon", "#eabd61", .20, .30, .48)
    return base


def add_face_details(head, m, animal):
    # Head faces +X; each eye and soft brow sits on the visible sides of the balloon.
    for side, label in ((-1, "near"), (1, "far")):
        sphere(f"{animal} · {label} bright eye", (.15, side * .405, .19), (.145, .082, .16), m["white"], head)
        sphere(f"{animal} · {label} dark pupil", (.205, side * .468, .195), (.068, .040, .092), m["eye"], head, 28, 18)
        sphere(f"{animal} · {label} starry catchlight", (.23, side * .501, .238), (.027, .016, .030), m["white"], head, 18, 12)
        curve(f"{animal} · {label} curved brow", [(.015, side * .40, .34), (.14, side * .44, .39), (.28, side * .41, .35)], .021, m["seam"], head, 2)
        cheek = sphere(f"{animal} · {label} rosy cheek", (.31, side * .438, -.075), (.09, .023, .045), m["inner"], head, 24, 16)
        cheek.rotation_euler[1] = math.radians(-12)


def make_legs(root, body, m, animal, body_z=1.25, connected=False):
    positions = ((.61, -.42, "front near"), (.61, .42, "front far"), (-.66, -.42, "hind near"), (-.66, .42, "hind far"))
    legs, hooves = [], []
    for x, y, label in positions:
        legmat = m.get("wool", m["ivory"])
        if connected:
            # A fixed hip bladder overlaps both torso and limb; the articulated limb begins
            # inside that soft join rather than hanging from a narrow, disconnected stem.
            sphere(f"{animal} · {label} integrated hip balloon", (x, y, -.49), (.245, .205, .23), legmat, body, 32, 22)
            pivot_z = -.45
            upper_scale = (.18, .155, .32)
            ankle_z = -.40
            ankle_size = (.145, .137, .17)
            hoof_z = -.56
        else:
            pivot_z = -.52
            upper_scale = (.155, .137, .23)
            ankle_z = -.365
            ankle_size = (.13, .123, .16)
            hoof_z = -.55
        leg = pivot(f"{animal.upper()} RIG · {label} leg", (x, y, pivot_z), body)
        legs.append(leg)
        sphere(f"{animal} · {label} upper leg balloon", (0, 0, -.15), upper_scale, legmat, leg, 32, 22)
        sphere(f"{animal} · {label} ankle", (.015, 0, ankle_z), ankle_size, legmat, leg, 30, 20)
        hoof = pivot(f"{animal.upper()} RIG · {label} hoof hinge", (.025, 0, hoof_z), leg)
        hooves.append(hoof)
        sphere(f"{animal} · {label} polished cocoa hoof", (.025, 0, -.055), (.162, .145, .105), m["hoof"], hoof, 28, 20)
        sphere(f"{animal} · {label} hoof glimmer", (.14, -.091, -.025), (.028, .013, .018), m["hoofglint"], hoof, 16, 10)
        curve(f"{animal} · {label} ankle seam", [(-.075, 0, -.31), (0, 0, -.35), (.075, 0, -.32)], .009, m["seam"], leg, 2)
    return positions, legs, hooves


def add_collar(body, neck, m, animal):
    ring = [(x := .39 * math.cos(i * math.tau / 40), .40 * math.sin(i * math.tau / 40), -.19) for i in range(40)]
    curve(f"{animal} · satin bell collar", ring, .03, m["collar"], neck, 3)
    bell = pivot(f"{animal.upper()} RIG · keepsake bell", (.30, 0, -.18), neck)
    sphere(f"{animal} · rounded golden bell", (0, 0, 0), (.145, .135, .15), m["gold"], bell, 30, 20)
    sphere(f"{animal} · tiny bell clapper", (.02, -.018, -.13), (.038, .038, .046), m["seam"], bell, 18, 12)
    return bell


def animate(animal, body, head, neck, ears, tail, legs, hooves, bell, leg_positions, forward_gait=False, body_z=1.25, leg_anchor=None, held=(), pinned=()):
    walk = [body, head, neck, *ears, tail, *legs, *hooves, bell, *held]
    for obj in walk:
        begin_action(obj, f"BALLOON {animal.upper()} · WALK")
    for frame, phase in zip(FRAMES, PHASES):
        bpy.context.scene.frame_set(frame)
        for obj in held:
            # Flat while awake, but not constant: a constant channel is dropped on export and the
            # node falls back to its rest scale, which would leave the eyes shut.
            key(obj, frame, scale=(1, 1, .001 + .004 * (1 + math.sin(phase))))
        for obj, base in pinned:
            key(obj, frame, location=(base[0], base[1], base[2] + .0015 * math.sin(phase)))
        bob = .025 + .045 * (.5 - .5 * math.cos(2 * phase))
        key(body, frame, location=(0, 0, body_z + bob), rotation=(math.radians(1.5 * math.sin(phase)), 0, math.radians(.8 * math.sin(phase + .4))), scale=(1 + .008 * math.sin(phase), 1, 1 + .012 * math.cos(2 * phase)))
        key(head, frame, rotation=(math.radians(1.7 * math.sin(phase - .3)), math.radians(1.4 * math.sin(phase + .4)), math.radians(1.1 * math.sin(phase + .2))))
        key(neck, frame, rotation=(math.radians(1.0 * math.sin(phase)), math.radians(1.5 * math.sin(phase + .2)), 0))
        key(bell, frame, rotation=(math.radians(4 * math.sin(phase + .4)), math.radians(7 * math.sin(phase + .6)), math.radians(3 * math.sin(phase))))
        for index, ear in enumerate(ears):
            if animal.lower() in ("chicken", "duck", "goose"):
                side = -1 if index == 0 else 1
                amplitude = {"chicken": 11, "duck": 4.5, "goose": 2.0}[animal.lower()]
                rest_angle = {"chicken": 15, "duck": 4, "goose": 1.5}[animal.lower()]
                flap = math.radians(rest_angle + amplitude * math.sin(2 * phase + index * .7))
                key(ear, frame, rotation=(side * flap, math.radians(2 * math.sin(phase + index)), math.radians(2 * math.sin(phase + index + .5))))
            else:
                base_angle = (-.12 if index == 0 else .12)
                key(ear, frame, rotation=(math.radians(2 * math.sin(phase + index)), math.radians(5 * math.sin(phase + index * .7)), base_angle + math.radians(3 * math.sin(phase + index + .5))))
        key(tail, frame, rotation=(math.radians(3 * math.sin(phase + .6)), math.radians(10 * math.sin(phase + 1.1)), math.radians(5 * math.sin(phase + .4))))
        for index, (leg, hoof, (x, y, _)) in enumerate(zip(legs, hooves, leg_positions)):
            stride = phase + (math.pi if index in (1, 2) else 0)
            if forward_gait:
                # Starts with a forward plant, rolls the planted foot rearward, then
                # lifts through the air and swings forward to repeat (local +X is front).
                swing = -math.cos(stride)
                lift = max(0, -math.sin(stride)) * .13
                anchor = leg_anchor if leg_anchor is not None else -.45
            else:
                lift = max(0, math.sin(stride)) * .12
                swing = math.cos(stride)
                anchor = leg_anchor if leg_anchor is not None else -.52
            key(leg, frame, location=(x, y, anchor + lift - bob), rotation=(math.radians(1.5 * math.sin(stride)), math.radians((25 if forward_gait else 19) * swing), math.radians(1.2 * math.sin(stride + .3))))
            key(hoof, frame, rotation=(0, math.radians((-8 if not forward_gait else 8) * max(0, -math.sin(stride) if forward_gait else math.sin(stride))), math.radians(-1.5 * swing)))
    finish_action(walk, "WALK", animal)

    idle = [body, head, neck, *ears, tail, *legs, *hooves, bell, *held]
    for obj in idle:
        begin_action(obj, f"BALLOON {animal.upper()} · IDLE")
    for frame, phase in zip(FRAMES, PHASES):
        bpy.context.scene.frame_set(frame)
        for obj in held:
            # Flat while awake, but not constant: a constant channel is dropped on export and the
            # node falls back to its rest scale, which would leave the eyes shut.
            key(obj, frame, scale=(1, 1, .001 + .004 * (1 + math.sin(phase))))
        for obj, base in pinned:
            key(obj, frame, location=(base[0], base[1], base[2] + .0015 * math.sin(phase)))
        idle_bob = .017 * math.sin(phase)
        key(body, frame, location=(0, 0, body_z + idle_bob), rotation=(0, math.radians(.5 * math.sin(phase)), math.radians(.35 * math.sin(phase))))
        key(head, frame, rotation=(math.radians(.5 * math.sin(phase)), math.radians(.9 * math.sin(phase + .3)), math.radians(.8 * math.sin(phase + .8))))
        key(neck, frame, rotation=(0, math.radians(.7 * math.sin(phase + .3)), 0))
        key(bell, frame, rotation=(math.radians(1.6 * math.sin(phase)), math.radians(2.2 * math.sin(phase + .5)), math.radians(1.5 * math.sin(phase))))
        for index, ear in enumerate(ears):
            if animal.lower() in ("chicken", "duck", "goose"):
                side = -1 if index == 0 else 1
                rest_angle = {"chicken": 8, "duck": 2, "goose": 0.5}[animal.lower()]
                flap = math.radians(rest_angle + 2.5 * math.sin(phase + index))
                key(ear, frame, rotation=(side * flap, math.radians(.6 * math.sin(phase + index)), 0))
            else:
                key(ear, frame, rotation=(math.radians(.5 * math.sin(phase + index)), math.radians(1.1 * math.sin(phase + index)), (-.12 if index == 0 else .12) + math.radians(1.3 * math.sin(phase + index))))
        key(tail, frame, rotation=(0, math.radians(2.5 * math.sin(phase)), math.radians(2.0 * math.sin(phase + .5))))
        idle_anchor = leg_anchor if leg_anchor is not None else (-.45 if forward_gait else -.52)
        for index, (leg, hoof, (x, y, _)) in enumerate(zip(legs, hooves, leg_positions)):
            key(leg, frame, location=(x, y, idle_anchor - idle_bob), rotation=(0, math.radians(.35 * math.sin(phase + index)), 0))
            key(hoof, frame, rotation=(0, math.radians(.25 * math.sin(phase + index)), 0))
    finish_action(idle, "IDLE", animal)


def portrait(animal, m):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x, scene.render.resolution_y = 1200, 1000
    scene.render.resolution_percentage = 100
    scene.eevee.taa_render_samples = 64
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = .12
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 8
    scene.world = bpy.data.worlds.new(f"{animal.title()} portrait · spring morning")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = rgba("#b8ded5")
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = .58

    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.07))
    floor = bpy.context.object
    floor.name = "STAGE · buttercream floor"
    floor.data.materials.append(m["cream"])
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 7, 6))
    wall = bpy.context.object
    wall.name = "STAGE · mint studio backdrop"
    wall.dimensions = (200, .25, 14)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    wall.data.materials.append(m["mint"])
    for index, (x, z, color) in enumerate(((-4.1, 2.5, m["lilac"]), (4.1, 3.5, m["coral"]), (-3.7, 5.3, m["yellow"]), (3.8, .2, m["lilac"]))):
        sphere(f"STAGE · flower stem {index}", (x, 5.8, z - .34), (.028, .028, .34), m["green"], segments=16, rings=10)
        for petal in range(6):
            angle = petal * math.tau / 6
            sphere(f"STAGE · flower {index} petal {petal}", (x + math.cos(angle) * .16, 5.76, z + math.sin(angle) * .16), (.12, .07, .095), color, segments=16, rings=10)
        sphere(f"STAGE · flower {index} heart", (x, 5.70, z), (.075, .055, .075), m["gold"], segments=16, rings=10)
    camera_data = bpy.data.cameras.new(f"STAGE · {animal} portrait camera")
    camera = bpy.data.objects.new(f"STAGE · {animal} portrait camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (5.25, -10.2, 6.05)
    camera.rotation_euler = (Vector((0, 0, 1.17)) - Vector(camera.location)).to_track_quat("-Z", "Y").to_euler()
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 8.25
    scene.camera = camera
    for name, location, energy, size, color in (
        ("STAGE LIGHT · warm softbox", (1, -5, 9), 1450, 6, (1, .83, .75)),
        ("STAGE LIGHT · cool mint fill", (-7, -1, 6), 1150, 6, (.76, .94, 1)),
        ("STAGE LIGHT · rosy rim", (3, 5, 8), 1750, 5, (1, .73, .72)),
        ("STAGE LIGHT · low bounce", (-1, -4, 2.4), 320, 4, (1, .91, .74)),
    ):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.shape = "DISK"
        data.size = size
        data.color = color
        lamp = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(lamp)
        lamp.location = location
        lamp.rotation_euler = (Vector((0, 0, 1.1)) - lamp.location).to_track_quat("-Z", "Y").to_euler()


def export_asset(root, animal, review_yaw=0.0, review_frame=7, texcoords=True):
    """Save, render the review portrait, and export the GLB.

    `review_yaw` turns the whole rig for the still only (degrees about Z) and is
    undone before the GLB is written, so a species with a forward-facing face
    can be shown three-quarter to the portrait camera without changing the asset.
    `texcoords=False` leaves out UVs: the animals are untextured, so they are dead weight.
    """
    stem = f"balloon-{animal}"
    blend_path = OUTPUT / f"{stem}.blend"
    render_path = OUTPUT / f"{stem}-review.png"
    glb_path = OUTPUT / f"{stem}.glb"
    scene = bpy.context.scene
    scene.frame_set(review_frame)
    scene.render.filepath = str(render_path)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    root.rotation_euler[2] = math.radians(review_yaw)
    bpy.ops.render.render(write_still=True)
    root.rotation_euler[2] = 0
    bpy.ops.object.select_all(action="DESELECT")

    def select_tree(obj):
        obj.select_set(True)
        for child in obj.children:
            select_tree(child)

    select_tree(root)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path), export_format="GLB", use_selection=True,
        export_apply=True, export_animations=True, export_animation_mode="NLA_TRACKS",
        export_nla_strips=True, export_nla_strips_merged_animation_name=f"BALLOON {animal.upper()}",
        export_force_sampling=True, export_frame_step=1, export_materials="EXPORT",
        export_cameras=False, export_lights=False, export_texcoords=texcoords,
    )
    print(f"{animal.title()} Blender source: {blend_path}")
    print(f"{animal.title()} art review: {render_path}")
    print(f"{animal.title()} animated GLB: {glb_path} · clips WALK/IDLE · Blender Z-up · forward +X")


def make_sheep():
    m = materials("SHEEP")
    root = pivot("BALLOON SHEEP · export root · forward +X", (0, 0, 0))
    root["asset_id"] = "animal_balloon_sheep"
    root["description"] = "Pearlescent cloud-wool sheep with apricot face, rosy ears and tiny brass bell"
    body = pivot("SHEEP RIG · cloud body", (0, 0, 1.25), root)
    head = pivot("SHEEP RIG · curious face", (.76, 0, .36), body)
    neck = pivot("SHEEP RIG · soft neck", (.49, 0, .10), body)
    sphere("SHEEP · plump ivory balloon body", (0, 0, 0), (1.02, .65, .64), m["ivory"], body, 48, 32)
    # An airy, overlapping cloud of hand-placed round balloon curls wraps the body.
    curls = [
        (-.78, 0, .48, .31), (-.27, 0, .59, .34), (.27, 0, .56, .33), (.73, 0, .38, .29),
        (-.83, -.43, .25, .31), (-.33, -.57, .24, .34), (.18, -.58, .23, .34), (.66, -.48, .27, .31),
        (-.83, .43, .25, .31), (-.33, .57, .24, .34), (.18, .58, .23, .34), (.66, .48, .27, .31),
        (-.61, -.43, -.34, .30), (-.08, -.55, -.38, .32), (.47, -.45, -.34, .30),
        (-.61, .43, -.34, .30), (-.08, .55, -.38, .32), (.47, .45, -.34, .30),
    ]
    for index, (x, y, z, radius) in enumerate(curls):
        tint = m["woolshade"] if index in (2, 7, 11, 15) else m["wool"]
        puff = sphere(f"SHEEP · airy wool curl {index + 1:02d}", (x, y, z), (radius, radius * .91, radius), tint, body, 32, 22)
        if index % 4 == 0:
            puff.rotation_euler[1] = math.radians(-8)
    sphere("SHEEP · neck cloud", (0, 0, 0), (.48, .48, .50), m["wool"], neck)
    sphere("SHEEP · sweet apricot face balloon", (.03, 0, .06), (.52, .445, .56), m["face"], head, 44, 30)
    sphere("SHEEP · creamy muzzle puff", (.42, 0, -.13), (.27, .32, .22), m["muzzle"], head)
    sphere("SHEEP · tiny strawberry nose", (.665, 0, -.035), (.055, .105, .065), m["inner"], head, 24, 16)
    for side in (-1, 1):
        sphere(f"SHEEP · nose dimple {side}", (.692, side * .052, -.065), (.016, .022, .021), m["seam"], head, 16, 10)
    curve("SHEEP · little smile", [(.50, -.273, -.24), (.60, -.25, -.28), (.69, -.20, -.24)], .014, m["seam"], head, 2)
    add_face_details(head, m, "SHEEP")
    ears = []
    for side, label in ((-1, "near"), (1, "far")):
        ear = pivot(f"SHEEP RIG · {label} floppy ear", (-.12, side * .31, .31), head)
        ears.append(ear)
        ear.rotation_euler = (math.radians(side * 10), math.radians(-7), math.radians(side * -8))
        sphere(f"SHEEP · {label} soft ear balloon", (-.06, side * .24, -.035), (.31, .16, .135), m["face"], ear)
        sphere(f"SHEEP · {label} rose-pink ear inset", (-.02, side * .355, -.02), (.205, .025, .078), m["inner"], ear, 28, 18)
    # A jaunty fluffy fringe makes the face silhouette distinct from the woolly body.
    for index, (x, y, z, radius) in enumerate(((.19, -.18, .48, .19), (.30, .04, .50, .20), (.18, .19, .46, .18), (-.01, 0, .53, .18))):
        sphere(f"SHEEP · forehead curl {index + 1}", (x, y, z), (radius, radius * .86, radius * .80), m["wool" if index % 2 == 0 else "highlight"], head, 28, 18)
    bell = add_collar(body, neck, m, "SHEEP")
    # Tiny looped wool tail with a soft pearl pom at the back.
    tail = pivot("SHEEP RIG · bobbing wool tail", (-.91, 0, .10), body)
    curve("SHEEP · little curled tail tie", [(0, 0, 0), (-.19, 0, -.02), (-.24, 0, .12), (-.14, 0, .20)], .037, m["face"], tail, 3)
    sphere("SHEEP · tail pearl", (-.12, 0, .20), (.15, .14, .15), m["wool"], tail, 24, 16)
    positions, legs, hooves = make_legs(root, body, m, "SHEEP")
    animate("sheep", body, head, neck, ears, tail, legs, hooves, bell, positions)
    portrait("sheep", m)
    export_asset(root, "sheep")


def make_cow():
    m = materials("COW")
    root = pivot("BALLOON COW · export root · forward +X", (0, 0, 0))
    root["asset_id"] = "animal_balloon_cow"
    root["description"] = "Ivory balloon calf with blackberry spots, rose muzzle and a golden bell"
    body = pivot("COW RIG · spotted balloon body", (0, 0, 1.25), root)
    head = pivot("COW RIG · friendly head", (.79, 0, .36), body)
    neck = pivot("COW RIG · rounded neck", (.49, 0, .10), body)
    rx, ry, rz = 1.12, .69, .67
    sphere("COW · big vanilla balloon body", (0, 0, 0), (rx, ry, rz), m["ivory"], body, 48, 32)
    # Patches are independent smooth balloon decals sunk just into the ellipsoid surface.
    spots = [(-.72, .23, .20, .19, -.22), (-.25, -.18, .30, .23, .30), (.32, .24, .22, .25, -.30), (-.57, -.43, .16, .16, .18), (.70, -.13, .17, .18, .4)]
    for index, (x, z, sx, sz, tilt) in enumerate(spots):
        y = -ry * math.sqrt(max(.10, 1 - (x / rx) ** 2 - (z / rz) ** 2)) - .012
        patch = sphere(f"COW · near-side blackberry marking {index + 1}", (x, y, z), (sx, .055, sz), m["spot"], body, 32, 22)
        patch.rotation_euler[1] = tilt
    far_spots = [(-.67, -.10, .19, .20, .25), (-.18, .31, .25, .19, -.20), (.43, -.29, .26, .20, .34)]
    for index, (x, z, sx, sz, tilt) in enumerate(far_spots):
        y = ry * math.sqrt(max(.10, 1 - (x / rx) ** 2 - (z / rz) ** 2)) + .012
        patch = sphere(f"COW · far-side blackberry marking {index + 1}", (x, y, z), (sx, .055, sz), m["spot"], body, 32, 22)
        patch.rotation_euler[1] = tilt
    # Little pearly shine and balloon-tie detail at the back.
    sphere("COW · satin body gleam", (-.10, -.687, .20), (.43, .025, .25), m["highlight"], body, 28, 18).rotation_euler[1] = math.radians(-15)
    sphere("COW · dark balloon knot", (-1.04, 0, -.02), (.12, .14, .13), m["spot"], body, 22, 16)
    sphere("COW · rounded ivory face", (.02, 0, .045), (.57, .48, .59), m["face"], head, 44, 30)
    # A pair of smaller markings peeks out above the eyes without hiding their expression.
    for side, label in ((-1, "near"), (1, "far")):
        sphere(f"COW · {label} forehead spot", (.02, side * .414, .43), (.15, .037, .105), m["spot"], head, 26, 18)
    muzzle = pivot("COW RIG · wiggly rose muzzle", (.45, 0, -.13), head)
    sphere("COW · plump strawberry-milk muzzle", (.10, 0, -.01), (.34, .39, .27), m["muzzle"], muzzle, 40, 26)
    sphere("COW · soft muzzle bridge", (.28, 0, .07), (.14, .28, .17), m["inner"], muzzle, 28, 18)
    for side, label in ((-1, "left"), (1, "right")):
        sphere(f"COW · {label} velvet nostril", (.414, side * .16, .015), (.026, .055, .061), m["seam"], muzzle, 24, 16)
        sphere(f"COW · {label} muzzle shine", (.433, side * .17 - .012, .048), (.012, .021, .017), m["highlight"], muzzle, 16, 10)
    curve("COW · happy smile", [(.30, -.27, -.16), (.40, -.29, -.21), (.51, -.26, -.17)], .015, m["seam"], muzzle, 2)
    add_face_details(head, m, "COW")
    ears = []
    for side, label in ((-1, "near"), (1, "far")):
        ear = pivot(f"COW RIG · {label} perky ear", (-.15, side * .34, .34), head)
        ears.append(ear)
        ear.rotation_euler = (math.radians(side * 12), math.radians(-8), math.radians(side * -9))
        sphere(f"COW · {label} ivory ear", (-.02, side * .25, .02), (.30, .17, .13), m["face"], ear)
        sphere(f"COW · {label} dusty-rose ear lining", (.015, side * .375, .035), (.20, .025, .075), m["inner"], ear, 28, 18)
    # Cream-gold softly curved horns; they read clearly but stay small and friendly.
    for side, label in ((-1, "near"), (1, "far")):
        curve(f"COW · {label} little honey horn", [(-.12, side * .29, .44), (-.16, side * .34, .62), (-.05, side * .36, .76)], .072, m["horn"], head, 3)
        sphere(f"COW · {label} horn pearl tip", (-.05, side * .36, .755), (.046, .046, .05), m["gold"], head, 20, 14)
    sphere("COW · tiny forehead forelock", (.20, 0, .53), (.22, .28, .16), m["highlight"], head, 30, 20)
    bell = add_collar(body, neck, m, "COW")
    tail = pivot("COW RIG · swishing tail", (-1.02, 0, .13), body)
    curve("COW · slender ivory tail", [(0, 0, 0), (-.15, 0, -.02), (-.27, 0, .12), (-.34, 0, .30), (-.27, 0, .42)], .035, m["ivory"], tail, 3)
    sphere("COW · dark satin tail tuft", (-.27, 0, .41), (.11, .095, .13), m["spot"], tail, 24, 16)
    positions, legs, hooves = make_legs(root, body, m, "COW", connected=True)
    animate("cow", body, head, neck, ears, tail, legs, hooves, bell, positions, forward_gait=True, leg_anchor=-.45)
    portrait("cow", m)
    export_asset(root, "cow")


def make_chicken():
    m = materials("CHICKEN")
    root = pivot("BALLOON CHICKEN · export root · forward +X", (0, 0, 0))
    root["asset_id"] = "animal_balloon_chicken"
    root["description"] = "Golden balloon hen with cream bib, flapping wings, coral comb and orange feet"
    body_z = 1.28
    body = pivot("CHICKEN RIG · sunny egg-shaped body", (0, 0, body_z), root)
    neck = pivot("CHICKEN RIG · little balloon neck", (.25, 0, .24), body)
    head = pivot("CHICKEN RIG · bright curious head", (.29, 0, .48), body)
    sphere("CHICKEN · plump upright golden balloon body", (0, 0, 0), (.69, .60, .80), m["body"], body, 48, 32)
    sphere("CHICKEN · soft vanilla front bib balloon", (.665, 0, -.10), (.045, .39, .51), m["belly"], body, 36, 24).rotation_euler[2] = math.radians(-7)
    sphere("CHICKEN · rounded golden neck balloon", (0, 0, 0), (.35, .36, .40), m["body"], neck)
    sphere("CHICKEN · buttery round head balloon", (0, 0, .02), (.43, .39, .46), m["body"], head, 44, 30)
    # A tiny scalloped three-lobed comb, polished like tied red balloon beads.
    sphere("CHICKEN · comb cushion", (-.10, 0, .405), (.17, .20, .145), m["comb"], head, 30, 20)
    for index, (x, y, z, radius) in enumerate(((-.10, 0, .52, .145), (.035, -.105, .485, .125), (.035, .105, .485, .125), (.19, 0, .405, .105))):
        sphere(f"CHICKEN · ruby comb lobe {index + 1}", (x, y, z), (radius, radius * .88, radius * .92), m["comb"], head, 28, 18)
    # The beak's taper points along the same +X direction as the little walk cycle.
    bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=.155, radius2=.025, depth=.34, location=(0, 0, 0))
    beak = bpy.context.object
    beak.name = "CHICKEN · tapered tangerine balloon beak"
    beak.data.name = beak.name + " · mesh"
    beak.data.materials.append(m["beak"])
    for face in beak.data.polygons:
        face.use_smooth = True
    beak.rotation_euler[1] = math.pi / 2
    local(beak, head, (.49, 0, -.005))
    sphere("CHICKEN · lower beak smile", (.45, 0, -.11), (.22, .19, .075), m["beak"], head, 28, 18)
    sphere("CHICKEN · soft coral wattle", (.34, 0, -.235), (.10, .12, .155), m["wattle"], head, 28, 18)
    for side, label in ((-1, "near"), (1, "far")):
        sphere(f"CHICKEN · {label} ivory eye", (.125, side * .341, .145), (.133, .064, .15), m["white"], head, 32, 22)
        sphere(f"CHICKEN · {label} espresso pupil", (.177, side * .392, .15), (.061, .032, .084), m["eye"], head, 26, 18)
        sphere(f"CHICKEN · {label} eye catchlight", (.194, side * .419, .188), (.027, .014, .03), m["white"], head, 16, 12)
        curve(f"CHICKEN · {label} happy brow", [(.01, side * .33, .27), (.12, side * .365, .32), (.24, side * .34, .28)], .022, m["comb"], head, 2)
        cheek = sphere(f"CHICKEN · {label} peach cheek", (.285, side * .35, -.035), (.075, .022, .045), m["inner"], head, 22, 14)
        cheek.rotation_euler[1] = math.radians(-12)

    # Cream flight feathers frame a pair of honey-gold latex wings.
    wings = []
    for side, label in ((-1, "near"), (1, "far")):
        wing = pivot(f"CHICKEN RIG · {label} flapping wing", (-.10, side * .46, -.005), body)
        wings.append(wing)
        sphere(f"CHICKEN · {label} honey balloon wing", (0, side * .105, .015), (.36, .16, .32), m["wing"], wing, 36, 24)
        for index, (x, z, size) in enumerate(((-.26, -.11, .18), (-.31, .015, .18), (-.24, .14, .17))):
            feather = sphere(f"CHICKEN · {label} pearl flight feather {index + 1}", (x, side * .205, z), (size, .068, .105), m["feather"], wing, 26, 18)
            feather.rotation_euler[1] = math.radians(-14 - index * 5)
    # A jaunty fan of tiny ivory balloon feathers gives the tail a clear bird silhouette.
    tail = pivot("CHICKEN RIG · wagging feather tail", (-.56, 0, .22), body)
    for index, side in enumerate((-1, 0, 1)):
        feather = sphere(f"CHICKEN · tail plume {index + 1}", (-.14, side * .13, .10), (.23, .105, .13), m["feather"], tail, 28, 18)
        feather.rotation_euler[1] = math.radians(18 + index * 7)
    bell = add_collar(body, neck, m, "CHICKEN")

    # Two orange shanks emerge from rounded golden hip bladders and flow into splayed toes.
    legs, feet, leg_positions = [], [], []
    for index, (side, label) in enumerate(((-1, "near"), (1, "far"))):
        sphere(f"CHICKEN · {label} integrated hip balloon", (.03, side * .235, -.63), (.19, .17, .20), m["body"], body, 28, 18)
        leg = pivot(f"CHICKEN RIG · {label} orange shank", (.045, side * .235, -.72), body)
        legs.append(leg)
        curve(f"CHICKEN · {label} continuous orange leg", [(0, 0, .04), (.015, 0, -.14), (.04, 0, -.34), (.055, 0, -.43)], .043, m["leg"], leg, 3)
        sphere(f"CHICKEN · {label} soft ankle", (.055, 0, -.41), (.082, .075, .074), m["leg"], leg, 22, 14)
        foot = pivot(f"CHICKEN RIG · {label} splayed foot", (.055, 0, -.46), leg)
        feet.append(foot)
        curve(f"CHICKEN · {label} center toe", [(0, 0, 0), (.10, 0, -.025), (.28, 0, -.045)], .045, m["leg"], foot, 3)
        curve(f"CHICKEN · {label} left toe", [(.02, 0, -.005), (.14, -.055, -.028), (.245, -.12, -.05)], .037, m["leg"], foot, 3)
        curve(f"CHICKEN · {label} right toe", [(.02, 0, -.005), (.14, .055, -.028), (.245, .12, -.05)], .037, m["leg"], foot, 3)
        curve(f"CHICKEN · {label} little back toe", [(-.015, 0, 0), (-.075, side * .045, -.025), (-.15, side * .065, -.04)], .032, m["leg"], foot, 3)
        leg_positions.append((.045, side * .235, label))

    animate("chicken", body, head, neck, wings, tail, legs, feet, bell, leg_positions,
            forward_gait=True, body_z=body_z, leg_anchor=-.72)
    portrait("chicken", m)
    export_asset(root, "chicken")


def add_bill(head, m, animal, base_position, upper_size, lower_size):
    bill = pivot(f"{animal.upper()} RIG · wiggly bill", base_position, head)
    sphere(f"{animal.upper()} · smooth upper bill balloon", (upper_size[0] * .38, 0, upper_size[1] * -.16), upper_size, m["bill"], bill, 36, 24)
    sphere(f"{animal.upper()} · lower bill balloon", (upper_size[0] * .34, 0, -upper_size[1] * .62), lower_size, m["bill"], bill, 32, 22)
    curve(f"{animal.upper()} · fine bill smile", [(upper_size[0] * .47, -.13, -upper_size[1] * .59), (upper_size[0] * .62, 0, -upper_size[1] * .69), (upper_size[0] * .47, .13, -upper_size[1] * .59)], .012, m["seam"], bill, 2)
    return bill


def add_waterfowl_legs(body, m, animal, leg_anchor, shank_length=.38):
    positions, legs, feet = [], [], []
    for side, label in ((-1, "near"), (1, "far")):
        sphere(f"{animal.upper()} · {label} integrated hip balloon", (.04, side * .27, -.40), (.19, .17, .20), m["body"], body, 28, 18)
        leg = pivot(f"{animal.upper()} RIG · {label} orange shank", (.055, side * .27, leg_anchor), body)
        legs.append(leg)
        curve(f"{animal.upper()} · {label} continuous orange leg", [(0, 0, .02), (.005, 0, -.12), (.025, 0, -shank_length * .72), (.045, 0, -shank_length)], .043 if animal == "duck" else .047, m["leg"], leg, 3)
        sphere(f"{animal.upper()} · {label} soft ankle", (.045, 0, -shank_length), (.078, .072, .064), m["leg"], leg, 22, 14)
        foot = pivot(f"{animal.upper()} RIG · {label} splayed webbed foot", (.055, 0, -shank_length - .035), leg)
        feet.append(foot)
        sphere(f"{animal.upper()} · {label} webbed foot pad", (.035, 0, -.012), (.15, .135, .048), m["leg"], foot, 28, 18)
        center_toe = sphere(f"{animal.upper()} · {label} center webbed toe", (.21, 0, -.023), (.23, .067, .045), m["leg"], foot, 24, 16)
        center_toe.rotation_euler[2] = math.radians(-4)
        for toe_index, side_sign in enumerate((-1, 1)):
            toe = sphere(f"{animal.upper()} · {label} outer webbed toe {toe_index + 1}", (.165, side_sign * .112, -.026), (.195, .066, .043), m["leg"], foot, 24, 16)
            toe.rotation_euler[2] = math.radians(side_sign * 25)
            curve(f"{animal.upper()} · {label} toe seam {toe_index + 1}", [(.065, side_sign * .055, -.006), (.17, side_sign * .105, -.008), (.29, side_sign * .17, -.012)], .008, m["bill"], foot, 2)
        hind_toe = sphere(f"{animal.upper()} · {label} tiny rear toe", (-.115, 0, -.014), (.13, .043, .034), m["leg"], foot, 20, 14)
        hind_toe.rotation_euler[2] = math.radians(12)
        positions.append((.055, side * .27, label))
    return positions, legs, feet


def make_duck():
    m = materials("DUCK")
    root = pivot("BALLOON DUCK · export root · forward +X", (0, 0, 0))
    root["asset_id"] = "animal_balloon_duck"
    root["forward_axis"] = "+X"
    root["description"] = "Emerald-headed mallard with honey-gold body, chestnut chest and orange webbed feet"
    body_z = .98
    body = pivot("DUCK RIG · buoyant mallard body", (0, 0, body_z), root)
    sphere("DUCK · broad honey-gold balloon body", (0, 0, 0), (.96, .65, .55), m["body"], body, 48, 32)
    sphere("DUCK · soft chestnut breast balloon", (.52, 0, -.13), (.53, .54, .43), m["breast"], body, 42, 28)
    sphere("DUCK · satin body gleam", (-.12, -.641, .16), (.42, .024, .22), m["highlight"], body, 28, 18).rotation_euler[1] = math.radians(-13)

    neck = pivot("DUCK RIG · curved green neck", (.60, 0, .12), body)
    sphere("DUCK · mallard green neck balloon", (.015, 0, .12), (.28, .30, .40), m["head"], neck, 38, 26)
    bpy.ops.mesh.primitive_torus_add(major_radius=.285, minor_radius=.035, major_segments=36, minor_segments=10, location=(0, 0, 0))
    collar = bpy.context.object
    collar.name = "DUCK · ivory mallard neck ring"
    collar.data.name = collar.name + " · mesh"
    collar.data.materials.append(m["highlight"])
    local(collar, neck, (0, 0, .19))
    head = pivot("DUCK RIG · bright emerald head", (.015, 0, .46), neck)
    sphere("DUCK · glossy green balloon head", (0, 0, .025), (.405, .365, .395), m["head"], head, 44, 30)
    for side, label in ((-1, "near"), (1, "far")):
        sphere(f"DUCK · {label} bright eye", (.115, side * .318, .14), (.137, .075, .151), m["white"], head, 30, 20)
        sphere(f"DUCK · {label} dark pupil", (.177, side * .374, .146), (.066, .037, .088), m["eye"], head, 24, 16)
        sphere(f"DUCK · {label} eye glint", (.199, side * .403, .185), (.027, .015, .03), m["white"], head, 16, 10)
        curve(f"DUCK · {label} softly raised brow", [(.01, side * .31, .28), (.13, side * .35, .33), (.25, side * .31, .29)], .021, m["seam"], head, 2)
    bill = add_bill(head, m, "duck", (.325, 0, -.025), (.30, .20, .21), (.245, .115, .075))
    sphere("DUCK · bill nostril near", (.39, -.165, .035), (.024, .018, .016), m["seam"], bill, 14, 10)
    sphere("DUCK · bill nostril far", (.39, .165, .035), (.024, .018, .016), m["seam"], bill, 14, 10)

    wings = []
    for side, label in ((-1, "near"), (1, "far")):
        wing = pivot(f"DUCK RIG · {label} folded feather wing", (-.10, side * .49, -.015), body)
        wings.append(wing)
        sphere(f"DUCK · {label} chestnut wing balloon", (-.015, side * .12, .015), (.49, .145, .27), m["wing"], wing, 38, 26)
        sphere(f"DUCK · {label} iridescent teal wing flash", (-.05, side * .254, .01), (.23, .028, .115), m["speculum"], wing, 28, 18)
        for index, x in enumerate((-.37, -.20, -.03)):
            feather = sphere(f"DUCK · {label} golden flight feather {index + 1}", (x, side * .16, -.14), (.20, .105, .105), m["feather"], wing, 24, 16)
            feather.rotation_euler[1] = math.radians(10)
    tail = pivot("DUCK RIG · jaunty fan tail", (-.82, 0, .12), body)
    for index, side in enumerate((-1, 0, 1)):
        plume = sphere(f"DUCK · tail feather {index + 1}", (-.12, side * .12, .12), (.26, .085, .11), m["wing"], tail, 26, 18)
        plume.rotation_euler[1] = math.radians(-20)
    bell = add_collar(body, neck, m, "DUCK")
    positions, legs, feet = add_waterfowl_legs(body, m, "duck", -.48, .37)
    animate("duck", body, head, neck, wings, tail, legs, feet, bell, positions,
            forward_gait=True, body_z=body_z, leg_anchor=-.48)
    portrait("duck", m)
    export_asset(root, "duck")


def make_goose():
    m = materials("GOOSE")
    root = pivot("BALLOON GOOSE · export root · forward +X", (0, 0, 0))
    root["asset_id"] = "animal_balloon_goose"
    root["forward_axis"] = "+X"
    root["description"] = "Tall ivory balloon goose with graceful neck, orange bill, feathered wings and webbed feet"
    body_z = 1.02
    body = pivot("GOOSE RIG · long buoyant body", (0, 0, body_z), root)
    sphere("GOOSE · plump ivory balloon body", (0, 0, 0), (.99, .66, .56), m["body"], body, 48, 32)
    sphere("GOOSE · smooth breast balloon", (.52, 0, -.12), (.43, .54, .44), m["body"], body, 38, 26)
    sphere("GOOSE · satin wing-side gleam", (-.14, -.651, .18), (.43, .022, .23), m["highlight"], body, 28, 18).rotation_euler[1] = math.radians(-12)

    neck = pivot("GOOSE RIG · tall swanlike neck", (.57, 0, .12), body)
    curve("GOOSE · gently S-curved ivory neck balloon", [(-.04, 0, -.10), (.06, 0, .12), (.07, 0, .40), (-.015, 0, .68), (.015, 0, .91)], .18, m["body"], neck, 4)
    sphere("GOOSE · neck-to-body balloon join", (-.025, 0, .07), (.245, .25, .31), m["body"], neck, 32, 22)
    head = pivot("GOOSE RIG · proud little head", (.025, 0, .83), neck)
    sphere("GOOSE · rounded ivory head balloon", (0, 0, .035), (.365, .33, .365), m["body"], head, 42, 28)
    for side, label in ((-1, "near"), (1, "far")):
        sphere(f"GOOSE · {label} bright eye", (.10, side * .286, .14), (.125, .068, .14), m["white"], head, 28, 18)
        sphere(f"GOOSE · {label} dark pupil", (.155, side * .335, .146), (.06, .034, .082), m["eye"], head, 22, 16)
        sphere(f"GOOSE · {label} tiny eye glint", (.176, side * .362, .182), (.024, .013, .027), m["white"], head, 14, 10)
        curve(f"GOOSE · {label} fine brow", [(.005, side * .28, .265), (.11, side * .31, .30), (.22, side * .285, .27)], .018, m["seam"], head, 2)
    bill = add_bill(head, m, "goose", (.29, 0, -.045), (.29, .165, .17), (.22, .095, .062))
    sphere("GOOSE · near bill nostril", (.385, -.122, .018), (.019, .014, .012), m["seam"], bill, 12, 8)
    sphere("GOOSE · far bill nostril", (.385, .122, .018), (.019, .014, .012), m["seam"], bill, 12, 8)

    wings = []
    for side, label in ((-1, "near"), (1, "far")):
        wing = pivot(f"GOOSE RIG · {label} folded feather wing", (-.14, side * .50, .015), body)
        wings.append(wing)
        sphere(f"GOOSE · {label} pearl-grey wing balloon", (-.015, side * .105, .025), (.50, .145, .28), m["wing"], wing, 38, 26)
        for index, (x, z) in enumerate(((-.36, -.10), (-.17, -.16), (.02, -.12))):
            feather = sphere(f"GOOSE · {label} ivory flight feather {index + 1}", (x, side * .16, z), (.23, .085, .105), m["feather"], wing, 26, 18)
            feather.rotation_euler[1] = math.radians(-12 + index * 5)
    tail = pivot("GOOSE RIG · soft raised tail", (-.83, 0, .13), body)
    for index, side in enumerate((-1, 0, 1)):
        plume = sphere(f"GOOSE · tail plume {index + 1}", (-.14, side * .13, .13), (.25, .09, .115), m["feather"], tail, 24, 16)
        plume.rotation_euler[1] = math.radians(-22)
    bell = add_collar(body, neck, m, "GOOSE")
    positions, legs, feet = add_waterfowl_legs(body, m, "goose", -.49, .40)
    animate("goose", body, head, neck, wings, tail, legs, feet, bell, positions,
            forward_gait=True, body_z=body_z, leg_anchor=-.49)
    portrait("goose", m)
    export_asset(root, "goose")


def add_frog_legs(body, m, animal):
    """Front arms held just off the ground; long folded back legs with webbed feet."""
    positions, legs, feet = [], [], []
    for side, label in ((-1, "near"), (1, "far")):
        sphere(f"{animal.upper()} · {label} shoulder balloon", (.46, side * .40, -.16), (.17, .15, .16), m["body"], body, 26, 18)
        arm = pivot(f"{animal.upper()} RIG · {label} front arm", (.50, side * .42, -.28), body)
        legs.append(arm)
        sphere(f"{animal.upper()} · {label} little arm balloon", (0, 0, -.09), (.11, .10, .15), m["body"], arm, 24, 16)
        hand = pivot(f"{animal.upper()} RIG · {label} small hand", (.02, 0, -.22), arm)
        feet.append(hand)
        for toe_index, spread in enumerate((-.055, 0, .055)):
            sphere(f"{animal.upper()} · {label} hand toe {toe_index + 1}", (.085 + abs(spread), spread * 1.7, -.018), (.115, .048, .04), m["foot"], hand, 18, 12)
        positions.append((.50, side * .42, label))
    for side, label in ((-1, "near"), (1, "far")):
        sphere(f"{animal.upper()} · {label} integrated hip balloon", (-.30, side * .40, -.30), (.24, .20, .22), m["body"], body, 30, 20)
        leg = pivot(f"{animal.upper()} RIG · {label} back leg", (-.42, side * .48, -.28), body)
        legs.append(leg)
        sphere(f"{animal.upper()} · {label} folded thigh balloon", (-.06, 0, -.06), (.30, .24, .26), m["body"], leg, 34, 22)
        curve(f"{animal.upper()} · {label} long moss shank", [(-.02, 0, -.14), (-.01, 0, -.22), (.02, 0, -.28)], .055, m["leg"], leg, 3)
        sphere(f"{animal.upper()} · {label} soft ankle", (.025, 0, -.24), (.082, .076, .068), m["leg"], leg, 22, 14)
        foot = pivot(f"{animal.upper()} RIG · {label} webbed foot", (.03, 0, -.29), leg)
        feet.append(foot)
        sphere(f"{animal.upper()} · {label} webbed foot pad", (0, 0, -.005), (.17, .15, .05), m["foot"], foot, 26, 16)
        center_toe = sphere(f"{animal.upper()} · {label} center webbed toe", (.24, 0, -.025), (.24, .07, .045), m["foot"], foot, 22, 14)
        center_toe.rotation_euler[2] = math.radians(-3)
        for toe_index, side_sign in enumerate((-1, 1)):
            toe = sphere(f"{animal.upper()} · {label} outer webbed toe {toe_index + 1}", (.19, side_sign * .11, -.022), (.20, .068, .042), m["foot"], foot, 22, 14)
            toe.rotation_euler[2] = math.radians(side_sign * 24)
            curve(f"{animal.upper()} · {label} toe seam {toe_index + 1}", [(.07, side_sign * .05, -.005), (.16, side_sign * .095, -.007), (.27, side_sign * .16, -.01)], .008, m["seam"], foot, 2)
        positions.append((-.42, side * .48, label))
    return positions, legs, feet


def make_frog():
    m = materials("FROG")
    root = pivot("BALLOON FROG · export root · forward +X", (0, 0, 0))
    root["asset_id"] = "animal_balloon_frog"
    root["forward_axis"] = "+X"
    root["description"] = "Leaf-green balloon frog with a buttercream belly, blink-bulge eyes and long webbed feet"
    body_z = .62
    body = pivot("FROG RIG · squat lily-pad body", (0, 0, body_z), root)
    sphere("FROG · wide leaf-green balloon body", (0, 0, 0), (1.05, .74, .48), m["body"], body, 48, 32)
    # The belly has to sit *inside* the body ellipsoid, not merely overlap it:
    # any wider and its flank grazes the body's surface around the front quarter
    # and starts to break the silhouette. Tucked to this size it still reads as
    # a cream underside but cannot burst out of the frog's side.
    sphere("FROG · buttercream belly balloon", (.24, 0, -.28), (.60, .50, .36), m["belly"], body, 42, 28)
    # No satin gleam on the flank: at the booth's close framing that lens read
    # as a hard white patch stuck to the frog's side, not as a highlight.

    neck = pivot("FROG RIG · short neck", (.44, 0, .06), body)
    sphere("FROG · neck-to-body balloon join", (-.03, 0, .02), (.30, .30, .34), m["body"], neck, 32, 22)
    head = pivot("FROG RIG · broad head", (0, 0, .34), neck)
    sphere("FROG · spring-green head balloon", (.02, 0, .02), (.52, .40, .42), m["head"], head, 44, 30)

    # Two blink-bulge mounds carry the eyes the way a frog's skull does, so the
    # eyes read as part of the head rather than balloons stuck to its sides.
    # They are the `ears` argument of animate(): a tiny idle wobble, and the
    # capture flourish's signature googly-eyed pop (see buildRigPose).
    bulges = []
    for side, label in ((-1, "near"), (1, "far")):
        bulge = pivot(f"FROG RIG · {label} eye bulge", (-.02, side * .30, .40), head)
        bulges.append(bulge)
        sphere(f"FROG · {label} eye bulge balloon", (0, 0, .02), (.165, .165, .15), m["head"], bulge, 30, 20)
        sphere(f"FROG · {label} bulge gleam", (.06, side * .10, .13), (.030, .018, .020), m["highlight"], bulge, 14, 10)

    # Eyes sit just under each bulge, poking out of the wide head sides. Keep
    # the `dark pupil` / `starry catchlight` names: heart eyes match them.
    for side, label in ((-1, "near"), (1, "far")):
        sphere(f"FROG · {label} bright eye", (.16, side * .39, .17), (.135, .075, .15), m["white"], head, 28, 18)
        sphere(f"FROG · {label} dark pupil", (.22, side * .45, .175), (.062, .034, .084), m["eye"], head, 22, 14)
        sphere(f"FROG · {label} starry catchlight", (.245, side * .475, .21), (.024, .014, .026), m["white"], head, 14, 10)
        cheek = sphere(f"FROG · {label} rosy cheek", (.30, side * .42, -.10), (.075, .022, .045), m["inner"], head, 22, 14)
        cheek.rotation_euler[1] = math.radians(-12)

    # No mouth: a seam across the face was fussy detail the frog reads better
    # without, especially this close. The nostrils stay as the only face marks.
    for side, label in ((-1, "near"), (1, "far")):
        sphere(f"FROG · {label} nostril", (.50, side * .10, .18), (.020, .016, .014), m["seam"], head, 14, 10)

    bell = add_collar(body, neck, m, "FROG")
    tail = pivot("FROG RIG · balloon knot wobble", (-.98, 0, .04), body)
    sphere("FROG · tied tail-end balloon knot", (0, 0, 0), (.11, .13, .11), m["leg"], tail, 22, 16)
    positions, legs, feet = add_frog_legs(body, m, "frog")
    animate("frog", body, head, neck, bulges, tail, legs, feet, bell, positions,
            forward_gait=True, body_z=body_z, leg_anchor=-.28)
    portrait("frog", m)
    export_asset(root, "frog")


OWL_FLAP_FRAMES = (1, 4, 7, 10, 13, 16, 19, 22, 25)
OWL_FLAP_PHASES = tuple(math.tau * index / 8 for index in range(9))


def make_owl():
    """Night-shift balloon owl: a plump hazelnut balloon that barely has to flap.

    Clips: WALK is the *flight* cycle (the runtime only knows WALK/IDLE) and IDLE
    is the perched pose with a slow head turn and a blink. Wings hang at the
    sides at rest; the flight clip lifts them out about halfway and rocks them
    through a lazy arc, because a balloon is already most of the way to flying.
    """
    m = materials("OWL")
    root = pivot("BALLOON OWL · export root · forward +X", (0, 0, 0))
    root["asset_id"] = "animal_balloon_owl"
    root["forward_axis"] = "+X"
    root["description"] = "Hazelnut balloon owl with a moon-cream face, amber lantern eyes, ear tufts and long drifting wings"
    body_z = 1.30
    body = pivot("OWL RIG · plump hazelnut body", (0, 0, body_z), root)
    neck = pivot("OWL RIG · tucked neck", (.10, 0, .52), body)
    head = pivot("OWL RIG · swivel head", (.12, 0, .74), body)
    sphere("OWL · tall egg-shaped hazelnut balloon body", (0, 0, 0), (.70, .62, .86), m["body"], body, 48, 32)
    sphere("OWL · buttercream chest balloon", (.30, 0, -.14), (.46, .47, .64), m["belly"], body, 42, 28)
    flecks = ((.60, -.20, .12), (.64, .0, .02), (.60, .20, .12), (.66, -.12, -.20), (.66, .12, -.20), (.58, 0, -.44), (.54, -.24, -.38), (.54, .24, -.38))
    for index, (x, y, z) in enumerate(flecks):
        fleck = sphere(f"OWL · chest fleck {index + 1}", (x, y, z), (.05, .075, .035), m["fleck"], body, 16, 10)
        fleck.rotation_euler[1] = math.radians(-8)
    sphere("OWL · neck balloon join", (0, 0, 0), (.38, .38, .34), m["body"], neck, 30, 20)
    sphere("OWL · broad hazelnut head balloon", (0, 0, 0), (.62, .66, .50), m["head"], head, 48, 32)

    # The facial disc: two moon-cream saucers framing big amber eyes, owl-style.
    for side, label in ((-1, "near"), (1, "far")):
        rim = sphere(f"OWL · {label} caramel disc rim", (.40, side * .205, -.01), (.115, .325, .35), m["rim"], head, 36, 24)
        rim.rotation_euler[2] = math.radians(side * -8)
        disc = sphere(f"OWL · {label} moon-cream facial disc", (.435, side * .205, -.005), (.10, .30, .325), m["disc"], head, 36, 24)
        disc.rotation_euler[2] = math.radians(side * -8)
    eyes = []
    for side, label in ((-1, "near"), (1, "far")):
        eye = pivot(f"OWL RIG · {label} blinking eye", (.505, side * .205, .015), head)
        eyes.append(eye)
        sphere(f"OWL · {label} bright eye", (0, 0, 0), (.075, .19, .205), m["iris"], eye, 36, 24)
        sphere(f"OWL · {label} dark pupil", (.062, 0, 0), (.04, .105, .115), m["eye"], eye, 28, 18)
        sphere(f"OWL · {label} starry catchlight", (.092, side * -.03, .06), (.022, .042, .046), m["white"], eye, 16, 12)
        curve(f"OWL · {label} soft brow", [(.47, side * .07, .27), (.50, side * .21, .31), (.45, side * .33, .25)], .026, m["rim"], head, 2)
    # A short hooked beak, tucked between the eyes and angled gently down.
    beak = pivot("OWL RIG · little beak", (.55, 0, -.105), head)
    bpy.ops.mesh.primitive_cone_add(vertices=14, radius1=.115, radius2=.012, depth=.27, location=(0, 0, 0))
    upper = bpy.context.object
    upper.name = "OWL · hooked honey beak"
    upper.data.name = upper.name + " · mesh"
    upper.data.materials.append(m["beak"])
    for face in upper.data.polygons:
        face.use_smooth = True
    upper.rotation_euler[1] = math.radians(90 + 18)
    upper.scale = (1, 1.0, .86)
    local(upper, beak, (.07, 0, -.02))
    sphere("OWL · beak base", (0, 0, .02), (.085, .105, .075), m["beak"], beak, 22, 14)
    for side, label in ((-1, "near"), (1, "far")):
        cheek = sphere(f"OWL · {label} blush cheek", (.43, side * .34, -.17), (.07, .035, .05), m["inner"], head, 20, 14)
        cheek.rotation_euler[1] = math.radians(-10)

    # Ear tufts are small cones with soft cream tips; they twitch in IDLE.
    tufts = []
    for side, label in ((-1, "near"), (1, "far")):
        tuft = pivot(f"OWL RIG · {label} ear tuft", (.02, side * .30, .40), head)
        tufts.append(tuft)
        bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=.145, radius2=.012, depth=.40, location=(0, 0, 0))
        horn = bpy.context.object
        horn.name = f"OWL · {label} tapered ear tuft"
        horn.data.name = horn.name + " · mesh"
        horn.data.materials.append(m["wing"])
        for face in horn.data.polygons:
            face.use_smooth = True
        horn.rotation_euler[0] = math.radians(side * -14)
        local(horn, tuft, (-.01, side * .03, .17))
        sphere(f"OWL · {label} tuft tip", (-.012, side * .06, .35), (.045, .04, .06), m["tip"], tuft, 16, 10)

    # Wings: shoulder pivots with a long hanging balloon, a cream-tipped feather
    # fan, and a tip joint that trails the arm so the wave has follow-through.
    wings, tips = [], []
    for side, label in ((-1, "near"), (1, "far")):
        wing = pivot(f"OWL RIG · {label} flapping wing", (-.04, side * .60, .18), body)
        wings.append(wing)
        arm = sphere(f"OWL · {label} cocoa wing balloon", (-.03, side * .075, -.42), (.30, .105, .56), m["wing"], wing, 40, 26)
        arm.rotation_euler[0] = math.radians(side * -3)
        sphere(f"OWL · {label} shoulder join", (0, side * .02, -.02), (.2, .16, .2), m["wing"], wing, 22, 14)
        tip = pivot(f"OWL RIG · {label} wing tip", (-.03, side * .09, -.84), wing)
        tips.append(tip)
        fan = ((.15, .0, .27), (.05, .01, .31), (-.05, .02, .33), (-.15, .03, .28))
        for index, (x, offset, length) in enumerate(fan):
            quill = sphere(f"OWL · {label} butterscotch flight feather {index + 1}", (x, side * offset, -length * .62), (.075, .052, length * .72), m["feather"], tip, 22, 14)
            quill.rotation_euler[0] = math.radians(side * -2)
            sphere(f"OWL · {label} cream feather tip {index + 1}", (x, side * offset, -length * 1.28), (.07, .05, .07), m["tip"], tip, 16, 10)

    tail = pivot("OWL RIG · feather tail", (-.46, 0, -.34), body)
    # A root balloon buried in the body anchors the fan, so the tail reads as grown
    # from the owl rather than hung beside it.
    sphere("OWL · tail root balloon", (-.04, 0, -.02), (.22, .24, .26), m["body"], tail, 20, 14)
    for index, side in enumerate((-2, -1, 0, 1, 2)):
        feather = sphere(f"OWL · tail feather {index + 1}", (-.10, side * .095, -.17), (.11, .08, .30 - abs(side) * .03), m["feather"], tail, 20, 14)
        feather.rotation_euler[1] = math.radians(-14)
        feather.rotation_euler[0] = math.radians(side * 6)
        sphere(f"OWL · tail tip {index + 1}", (-.14, side * .105, -.43 + abs(side) * .03), (.065, .05, .055), m["tip"], tail, 14, 10)
    bell = add_collar(body, neck, m, "OWL")

    # Feathered trousers and tucked talons, gripping straight down at the perch.
    for side, label in ((-1, "near"), (1, "far")):
        sphere(f"OWL · {label} feather trousers", (.12, side * .22, -.70), (.22, .20, .30), m["belly"], body, 28, 18)
        leg = pivot(f"OWL RIG · {label} talon leg", (.14, side * .22, -.92), body)
        curve(f"OWL · {label} sandy shank", [(0, 0, .04), (.01, 0, -.08), (.03, 0, -.16)], .042, m["leg"], leg, 3)
        foot = pivot(f"OWL RIG · {label} gripping foot", (.03, 0, -.19), leg)
        sphere(f"OWL · {label} talon pad", (.03, 0, -.01), (.10, .10, .045), m["leg"], foot, 22, 14)
        for toe, angle in enumerate((-22, 0, 22)):
            lateral = math.sin(math.radians(angle))
            curve(f"OWL · {label} talon toe {toe + 1}", [(.03, 0, -.01), (.10, lateral * .05, -.015), (.17, lateral * .10, -.035)], .036, m["leg"], foot, 3)
            sphere(f"OWL · {label} talon tip {toe + 1}", (.18, lateral * .105, -.04), (.03, .025, .023), m["seam"], foot, 12, 8)

    animate_owl(body, neck, head, tufts, wings, tips, tail, eyes, bell, body_z)
    portrait("owl", m)
    # Owls look straight ahead, so turn the rig toward the portrait camera for the still.
    export_asset(root, "owl", review_yaw=-38, review_frame=1)


def animate_owl(body, neck, head, tufts, wings, tips, tail, eyes, bell, body_z):
    """WALK is the lazy flight cycle; IDLE is the perch with a head turn and a blink."""
    flight_rig = [body, neck, head, *tufts, *wings, *tips, tail, bell]
    for obj in flight_rig:
        begin_action(obj, "BALLOON OWL · WALK")
    out = math.radians(62)  # wings held out about two-thirds of the way up
    for frame, phase in zip(OWL_FLAP_FRAMES, OWL_FLAP_PHASES):
        bpy.context.scene.frame_set(frame)
        beat = math.sin(phase)
        key(body, frame, location=(0, 0, body_z + .09 * beat), rotation=(math.radians(1.4 * beat), 0, 0))
        key(neck, frame, rotation=(0, math.radians(1.5 * math.sin(phase - .6)), 0))
        key(head, frame, location=(.12, 0, .74 - .04 * beat), rotation=(math.radians(-1.6 * beat), math.radians(2.6 * math.sin(phase * .5)), 0))
        key(bell, frame, rotation=(math.radians(5 * math.sin(phase + .5)), math.radians(7 * math.sin(phase + .9)), math.radians(3 * beat)))
        key(tail, frame, rotation=(0, math.radians(7 + 5 * math.sin(phase - .8)), math.radians(3 * math.sin(phase * .5))))
        for index, tuft in enumerate(tufts):
            side = -1 if index == 0 else 1
            key(tuft, frame, rotation=(side * math.radians(-6 + 3 * math.sin(phase - .4)), math.radians(8 + 2 * beat), 0))
        for index, (wing, tip) in enumerate(zip(wings, tips)):
            side = -1 if index == 0 else 1
            key(wing, frame, rotation=(side * (out + math.radians(24) * beat), math.radians(-3 * beat), 0))
            key(tip, frame, rotation=(side * math.radians(16) * math.sin(phase - .9), 0, 0))
    finish_action(flight_rig, "WALK", "owl")

    perch = [body, neck, head, *tufts, *wings, *tips, tail, bell, *eyes]
    for obj in perch:
        begin_action(obj, "BALLOON OWL · IDLE")
    for frame, phase in zip(FRAMES, PHASES):
        bpy.context.scene.frame_set(frame)
        breath = math.sin(phase)
        key(body, frame, location=(0, 0, body_z + .012 * breath), rotation=(0, 0, 0), scale=(1 + .006 * breath, 1 + .006 * breath, 1 + .01 * breath))
        key(neck, frame, rotation=(0, 0, math.radians(8 * math.sin(phase * .5 - .4))))
        key(head, frame, location=(.12, 0, .74), rotation=(math.radians(1.2 * breath), math.radians(1.4 * math.sin(phase + .3)), math.radians(26 * math.sin(phase * .5))))
        key(bell, frame, rotation=(math.radians(1.6 * breath), math.radians(2.2 * math.sin(phase + .5)), 0))
        key(tail, frame, rotation=(0, math.radians(5), math.radians(2.5 * math.sin(phase + .5))))
        for index, tuft in enumerate(tufts):
            side = -1 if index == 0 else 1
            twitch = math.radians(8) if frame == 19 else 0
            key(tuft, frame, rotation=(side * (math.radians(-5) - twitch), math.radians(6), 0))
        for index, (wing, tip) in enumerate(zip(wings, tips)):
            side = -1 if index == 0 else 1
            key(wing, frame, rotation=(side * math.radians(4 + 1.2 * breath), 0, 0))
            key(tip, frame, rotation=(side * math.radians(1.5 * breath), 0, 0))
    # A quick blink between the slow head turns: tight keys on the eye pivots.
    for eye in eyes:
        for frame, squash in ((1, 1), (15, 1), (17, .1), (19, 1), (25, 1)):
            eye.scale = (1, 1, squash)
            eye.keyframe_insert(data_path="scale", frame=frame, group=eye.name)
    finish_action(perch, "IDLE", "owl")


def animate_sleep(animal, body, head, neck, ears, tail, legs, hooves, bell, leg_positions, lids, body_z=1.2, tail_pitch=-24):
    """A third clip, SLEEP: a curled-up ball, head tucked onto the flank, tail wrapped round, eyes shut.

    The runtime picks it up by name (any clip containing SLEEP) and only for a species that
    ships one; everything else falls back to a crouched IDLE. Call this BEFORE `animate()` so
    its NLA track sits underneath WALK and IDLE and never wins the review portrait.
    """
    everything = [body, head, neck, *ears, tail, *legs, *hooves, bell, *lids]
    for obj in everything:
        begin_action(obj, f"BALLOON {animal.upper()} · SLEEP")
    lying_z = .81  # the hip balloons (body-local -.72, x1.1 puff) rest on the lawn
    for frame, phase in zip(FRAMES, PHASES):
        bpy.context.scene.frame_set(frame)
        breath = math.sin(phase)
        # Every channel breathes a hair. The glTF exporter DROPS any channel that never changes,
        # and a dropped channel leaves that node in its standing rest pose: the first SLEEP export
        # lowered only the body and left the legs, head and eyes standing. Keep this variation.
        tremor = math.radians(.6) * breath
        wob = .004 * breath
        # A curled ball, as a real raccoon sleeps: the body puffs rounder and sits low, the head is
        # tucked round onto the near flank, and the tail wraps along that flank so its tip meets the
        # nose. The legs fold underneath and only the paws show. "Near" is the -Y side.
        key(body, frame, location=(0, 0, lying_z + .012 * breath), rotation=(0, 0, 0), scale=(.96 + .012 * breath, 1.08 + .02 * breath, 1.1 + .03 * breath))
        key(head, frame, location=(.56, -.40 + wob, -.06), rotation=(0, math.radians(30) + tremor, math.radians(-64)))
        key(neck, frame, rotation=(0, math.radians(8) + tremor, math.radians(-20)))
        key(bell, frame, rotation=(0, math.radians(2) * breath, 0))
        for index, ear in enumerate(ears):
            side = -1 if index == 0 else 1
            key(ear, frame, rotation=(math.radians(side * 38) + tremor, math.radians(-6), math.radians(side * -16)))
        key(tail, frame, location=(-.62, -.66 + wob, -.34), rotation=(0, math.radians(tail_pitch) + tremor, math.radians(168)))
        for index, (leg, hoof, (x, y, _)) in enumerate(zip(legs, hooves, leg_positions)):
            front = index < 2
            # Front paws tuck under the chin; hind legs fold forward under the belly.
            key(leg, frame, location=(x - (.05 if front else -.18), y * .55, -.42 + wob), rotation=(0, math.radians(-84 if front else -86) + tremor, math.radians(0)))
            key(hoof, frame, rotation=(0, tremor, 0))
        for lid in lids:
            key(lid, frame, scale=(1 + .01 * breath, 1, 1 + .01 * breath))
    finish_action(everything, "SLEEP", animal)


def make_raccoon():
    m = materials("RACCOON")
    root = pivot("BALLOON RACCOON · export root · forward +X", (0, 0, 0))
    root["asset_id"] = "animal_balloon_raccoon"
    root["description"] = "Moonlit-grey balloon raccoon with a charcoal bandit mask and a ringed tail"
    body = pivot("RACCOON RIG · round grey body", (0, 0, 1.2), root)
    head = pivot("RACCOON RIG · bandit head", (.74, 0, .34), body)
    neck = pivot("RACCOON RIG · soft neck", (.47, 0, .10), body)
    sphere("RACCOON · plump grey balloon body", (0, 0, 0), (.98, .66, .62), m["body"], body, 48, 32)
    sphere("RACCOON · pale smoke belly", (.05, 0, -.32), (.72, .50, .36), m["belly"], body, 36, 24)
    # Lighter frosted back streak so the grey is not one flat colour.
    sphere("RACCOON · frosted back sheen", (-.05, 0, .42), (.62, .30, .20), m["face"], body, 28, 18)
    sphere("RACCOON · neck ruff", (0, 0, 0), (.50, .50, .50), m["body"], neck)
    sphere("RACCOON · silver-grey face balloon", (.03, 0, .04), (.54, .50, .50), m["face"], head, 44, 30)
    sphere("RACCOON · cream snout balloon", (.42, 0, -.12), (.30, .30, .21), m["muzzle"], head)
    sphere("RACCOON · button nose", (.69, 0, -.045), (.075, .105, .07), m["mask"], head, 24, 16)
    curve("RACCOON · tiny smile", [(.50, -.22, -.24), (.60, -.20, -.27), (.68, -.15, -.24)], .013, m["seam"], head, 2)
    # The bandit mask: a charcoal band across the eyes, tapering toward the temples.
    for side, label in ((-1, "near"), (1, "far")):
        patch = sphere(f"RACCOON · {label} mask patch", (.13, side * .36, .17), (.25, .085, .20), m["mask"], head, 32, 22)
        patch.rotation_euler[0] = math.radians(side * -10)
        sphere(f"RACCOON · {label} mask temple", (-.02, side * .43, .22), (.17, .07, .09), m["mask"], head, 24, 16)
    sphere("RACCOON · brow bridge", (.22, 0, .34), (.16, .30, .06), m["mask"], head, 24, 16)
    # Eyes sit on the mask; reuse the shared face but it adds cheeks and brows too.
    add_face_details(head, m, "RACCOON")
    ears = []
    for side, label in ((-1, "near"), (1, "far")):
        ear = pivot(f"RACCOON RIG · {label} round ear", (-.10, side * .30, .40), head)
        ears.append(ear)
        ear.rotation_euler = (math.radians(side * 14), math.radians(-6), math.radians(side * -8))
        sphere(f"RACCOON · {label} grey ear balloon", (-.02, side * .12, .06), (.17, .15, .21), m["body"], ear, 28, 18)
        sphere(f"RACCOON · {label} dusky ear lining", (.02, side * .17, .06), (.11, .06, .14), m["inner"], ear, 24, 16)
    bell = add_collar(body, neck, m, "RACCOON")
    # The ringed tail: charcoal and grey balloons strung along a curve.
    tail = pivot("RACCOON RIG · ringed tail", (-.88, 0, .02), body)
    stops = [(-.05, 0, .0), (-.28, 0, .0), (-.50, 0, .08), (-.70, 0, .20), (-.86, 0, .34)]
    for index, (x, y, z) in enumerate(stops):
        radius = .19 - index * .012
        tone = m["ring"] if index % 2 else m["body"]
        sphere(f"RACCOON · tail ring {index + 1}", (x, y, z), (radius * 1.15, radius, radius), tone, tail, 28, 18)
    sphere("RACCOON · tail tip", (-.97, 0, .40), (.13, .115, .12), m["ring"], tail, 24, 16)
    positions, legs, hooves = make_legs(root, body, m, "RACCOON", connected=True)
    # Eyelids: flat slivers on the mask while awake, swelling shut in the SLEEP clip.
    lids = []
    for side, label in ((-1, "near"), (1, "far")):
        lid = pivot(f"RACCOON RIG · {label} eyelid", (.15, side * .43, .19), head)
        lids.append(lid)
        sphere(f"RACCOON · {label} sleepy eyelid", (0, side * .02, 0), (.17, .10, .18), m["mask"], lid, 24, 16)
        curve(f"RACCOON · {label} closed-eye line", [(-.08, side * .10, .0), (.02, side * .105, -.045), (.13, side * .10, .0)], .012, m["white"], lid, 2)
    # SLEEP moves the head and tail *position*, which WALK and IDLE never key. Without pinning
    # their standing position in those clips, the exported rest pose is the lying one and the
    # awake raccoon walks around with its head sunk inside its body.
    pinned = [(head, tuple(head.location)), (tail, tuple(tail.location))]
    animate_sleep("raccoon", body, head, neck, ears, tail, legs, hooves, bell, positions, lids)
    animate("raccoon", body, head, neck, ears, tail, legs, hooves, bell, positions, forward_gait=True, body_z=1.2, leg_anchor=-.45, held=lids, pinned=pinned)
    portrait("raccoon", m)
    export_asset(root, "raccoon")


def add_rodent_head(head, m, animal, ear_size, snout_length):
    """A pointed rodent face on the standard +X head: snout, pink nose, whiskers, round ears."""
    upper = animal.upper()
    sphere(f"{upper} · {animal} face balloon", (.03, 0, .04), (.50, .44, .44), m["face"], head, 44, 30)
    sphere(f"{upper} · pointed snout balloon", (.30 + snout_length * .5, 0, -.08), (.24 + snout_length, .25, .21), m["muzzle"], head, 36, 24)
    sphere(f"{upper} · pink button nose", (.52 + snout_length * 1.6, 0, -.02), (.075, .085, .07), m["pink"], head, 24, 16)
    curve(f"{upper} · tiny smile", [(.42 + snout_length, -.10, -.20), (.48 + snout_length, 0, -.22), (.42 + snout_length, .10, -.20)], .011, m["seam"], head, 2)
    for side, label in ((-1, "near"), (1, "far")):
        for row, spread in enumerate((.02, -.05)):
            tip_x = .38 + snout_length * 1.2
            curve(f"{upper} · {label} whisker {row + 1}", [(tip_x, side * .16, spread), (tip_x + .08, side * .40, spread * 2 + .03), (tip_x + .02, side * .58, spread * 3)], .006, m["whisker"], head, 1)
    add_face_details(head, m, upper)
    ears = []
    for side, label in ((-1, "near"), (1, "far")):
        ear = pivot(f"{upper} RIG · {label} round ear", (-.12, side * .30, .36), head)
        ears.append(ear)
        ear.rotation_euler = (math.radians(side * 16), math.radians(-8), math.radians(side * -10))
        sphere(f"{upper} · {label} round ear balloon", (0, side * .10, ear_size * .8), (ear_size * .85, .07, ear_size), m["body"], ear, 30, 20)
        sphere(f"{upper} · {label} pink ear lining", (.035, side * .11, ear_size * .8), (ear_size * .64, .04, ear_size * .74), m["inner"], ear, 26, 16)
    return ears


def add_rodent_tail(body, m, animal, length, lift):
    """A long, thin, gently curling pink tail: one bevelled curve on a tail pivot."""
    tail = pivot(f"{animal.upper()} RIG · long pink tail", (-.86, 0, -.06), body)
    points = []
    for index in range(7):
        t = index / 6
        points.append((-length * t, .16 * math.sin(t * math.pi * 1.4), lift * t * t - .04 * t))
    curve(f"{animal.upper()} · long pink tail", points, .055, m["pink"], tail, 3)
    sphere(f"{animal.upper()} · tail root balloon", (0, 0, 0), (.12, .11, .11), m["body"], tail, 20, 14)
    return tail


def make_mouse():
    global DETAIL
    DETAIL = LEAN_DETAIL
    m = materials("MOUSE")
    root = pivot("BALLOON MOUSE · export root · forward +X", (0, 0, 0))
    root["asset_id"] = "animal_balloon_mouse"
    root["description"] = "Harvest-fawn balloon field mouse with big pink-lined ears and a long curling tail"
    body = pivot("MOUSE RIG · pear-round body", (0, 0, 1.2), root)
    head = pivot("MOUSE RIG · pointed head", (.74, 0, .30), body)
    neck = pivot("MOUSE RIG · soft neck", (.47, 0, .08), body)
    # Pear-shaped: plump hindquarters, a narrower shoulder into the head.
    sphere("MOUSE · plump fawn balloon body", (-.08, 0, 0), (.96, .68, .64), m["body"], body, 48, 32)
    sphere("MOUSE · shoulder balloon", (.36, 0, .04), (.52, .50, .50), m["body"], body, 36, 24)
    sphere("MOUSE · oat-cream belly", (.08, 0, -.32), (.70, .50, .36), m["belly"], body, 36, 24)
    sphere("MOUSE · neck ruff", (0, 0, 0), (.44, .44, .44), m["body"], neck)
    ears = add_rodent_head(head, m, "mouse", ear_size=.34, snout_length=.06)
    bell = add_collar(body, neck, m, "MOUSE")
    tail = add_rodent_tail(body, m, "mouse", length=1.75, lift=.55)
    positions, legs, paws = make_legs(root, body, m, "MOUSE", connected=True)
    animate("mouse", body, head, neck, ears, tail, legs, paws, bell, positions, forward_gait=True, body_z=1.2, leg_anchor=-.45)
    portrait("mouse", m)
    export_asset(root, "mouse", texcoords=False)


def make_rat():
    global DETAIL
    DETAIL = LEAN_DETAIL
    m = materials("RAT")
    root = pivot("BALLOON RAT · export root · forward +X", (0, 0, 0))
    root["asset_id"] = "animal_balloon_rat"
    root["description"] = "Dusk-slate balloon rat with a long snout, rosy paws and a long tail; sleeps curled by day"
    body = pivot("RAT RIG · long slate body", (0, 0, 1.2), root)
    head = pivot("RAT RIG · long-snouted head", (.74, 0, .34), body)
    neck = pivot("RAT RIG · soft neck", (.47, 0, .10), body)
    sphere("RAT · long slate balloon body", (-.06, 0, 0), (1.06, .64, .60), m["body"], body, 48, 32)
    sphere("RAT · moth-grey belly", (.05, 0, -.32), (.78, .48, .34), m["belly"], body, 36, 24)
    sphere("RAT · darker back saddle", (-.10, 0, .38), (.70, .32, .22), m["wool"], body, 28, 18)
    sphere("RAT · neck ruff", (0, 0, 0), (.48, .48, .48), m["body"], neck)
    ears = add_rodent_head(head, m, "rat", ear_size=.22, snout_length=.16)
    bell = add_collar(body, neck, m, "RAT")
    tail = add_rodent_tail(body, m, "rat", length=1.95, lift=.30)
    positions, legs, paws = make_legs(root, body, m, "RAT", connected=True)
    # Eyelids: flat slivers while awake, swelling shut in the SLEEP clip (the raccoon's recipe).
    lids = []
    for side, label in ((-1, "near"), (1, "far")):
        lid = pivot(f"RAT RIG · {label} eyelid", (.15, side * .43, .19), head)
        lids.append(lid)
        sphere(f"RAT · {label} sleepy eyelid", (0, side * .02, 0), (.16, .10, .17), m["mask"], lid, 24, 16)
        curve(f"RAT · {label} closed-eye line", [(-.08, side * .10, .0), (.02, side * .105, -.045), (.13, side * .10, .0)], .012, m["white"], lid, 2)
    pinned = [(head, tuple(head.location)), (tail, tuple(tail.location))]
    animate_sleep("rat", body, head, neck, ears, tail, legs, paws, bell, positions, lids, tail_pitch=-12)
    animate("rat", body, head, neck, ears, tail, legs, paws, bell, positions, forward_gait=True, body_z=1.2, leg_anchor=-.45, held=lids, pinned=pinned)
    portrait("rat", m)
    export_asset(root, "rat", texcoords=False)


SNAKE_SEGMENTS = 13
SNAKE_SPACING = .27


def snake_segment(index):
    """Rest shape of one body segment: x along the body, a gentle S to the side, and its radius."""
    t = index / (SNAKE_SEGMENTS - 1)
    x = .30 - index * SNAKE_SPACING
    side = .30 * math.sin(t * math.pi * 1.6)
    radius = .27 - .19 * t ** 1.4
    return x, side, radius


def make_snake():
    """A balloon snake: one long tapering balloon tube in a lazy S, head raised.

    A new body plan (no legs). The tube is a chain of overlapping segment
    balloons, each its own pivot under the body, so WALK can pass a travelling
    wave down it and the body slithers while the head stays on course. IDLE is
    a slow sway, a head turn and a tongue flick. Every segment rests at its
    radius above z = 0 so the whole belly lies on the lawn.
    """
    global DETAIL
    DETAIL = LEAN_DETAIL
    m = materials("SNAKE")
    root = pivot("BALLOON SNAKE · export root · forward +X", (0, 0, 0))
    root["asset_id"] = "animal_balloon_snake"
    root["description"] = "Meadow-emerald balloon snake with dark diamond markings, a raised head and a cherry tongue"
    body = pivot("SNAKE RIG · coiled body", (0, 0, 0), root)
    segments = []
    for index in range(SNAKE_SEGMENTS):
        x, side, radius = snake_segment(index)
        # The glTF exporter writes a location-keyed node's rest translation as zero, which
        # collapsed the whole body onto the origin at rest (and the runtime sizes the model
        # from its rest pose). So each segment hangs from an unkeyed anchor at its rest spot,
        # and only the sway pivot under it is keyed, as an offset from that spot.
        anchor = pivot(f"SNAKE · body segment {index + 1} anchor", (x, side, radius), body)
        segment = pivot(f"SNAKE RIG · body segment {index + 1}", (0, 0, 0), anchor)
        segments.append(segment)
        # Long, overlapping balloons: neighbours run into each other so the body reads as one tube.
        sphere(f"SNAKE · balloon segment {index + 1}", (0, 0, 0), (SNAKE_SPACING * 1.15 + radius * .35, radius, radius * .92), m["body"], segment, 30, 20)
        sphere(f"SNAKE · belly scale {index + 1}", (0, 0, -radius * .52), (SNAKE_SPACING * .95, radius * .80, radius * .46), m["belly"], segment, 22, 14)
        diamond = sphere(f"SNAKE · back diamond {index + 1}", (0, 0, radius * .80), (radius * .55, radius * .42, radius * .22), m["spot"], segment, 20, 12)
        diamond.rotation_euler[2] = math.radians(45)
    sphere("SNAKE · tail-tip knot", (-SNAKE_SPACING * .9, 0, 0), (.07, .05, .05), m["body"], segments[-1], 18, 12)
    neck_anchor = pivot("SNAKE · raised neck anchor", (.58, 0, .34), body)
    neck = pivot("SNAKE RIG · raised neck", (0, 0, 0), neck_anchor)
    sphere("SNAKE · rising neck balloon", (-.10, 0, -.08), (.36, .25, .28), m["body"], neck, 30, 20)
    sphere("SNAKE · neck belly", (-.04, 0, -.16), (.30, .20, .18), m["belly"], neck, 22, 14)
    head = pivot("SNAKE RIG · wedge head", (.28, 0, .14), neck)
    sphere("SNAKE · emerald head balloon", (.10, 0, 0), (.44, .34, .26), m["head"], head, 40, 28)
    sphere("SNAKE · cream chin", (.14, 0, -.12), (.34, .26, .12), m["belly"], head, 30, 20)
    sphere("SNAKE · crown diamond", (.0, 0, .22), (.12, .09, .05), m["spot"], head, 18, 12)
    for side, label in ((-1, "near"), (1, "far")):
        sphere(f"SNAKE · {label} nostril", (.50, side * .08, .06), (.020, .016, .014), m["seam"], head, 14, 10)
        # Big friendly eyes high on the head; no brows (they read as feelers). The names match
        # the heart-eye swap: "bright eye", "dark pupil", "starry catchlight".
        sphere(f"SNAKE · {label} bright eye", (.16, side * .25, .12), (.12, .075, .13), m["white"], head, 28, 18)
        sphere(f"SNAKE · {label} dark pupil", (.21, side * .31, .125), (.055, .034, .085), m["eye"], head, 22, 14)
        sphere(f"SNAKE · {label} starry catchlight", (.235, side * .335, .16), (.022, .014, .026), m["white"], head, 14, 10)
        cheek = sphere(f"SNAKE · {label} rosy cheek", (.30, side * .27, -.06), (.07, .02, .04), m["inner"], head, 20, 12)
        cheek.rotation_euler[1] = math.radians(-12)
    tongue = pivot("SNAKE RIG · flicking tongue", (.50, 0, -.06), head)
    curve("SNAKE · forked tongue", [(0, 0, 0), (.16, 0, -.01), (.26, -.05, -.02)], .016, m["tongue"], tongue, 2)
    curve("SNAKE · tongue fork", [(.16, 0, -.01), (.26, .05, -.02)], .016, m["tongue"], tongue, 2)
    # The keepsake bell hangs under the chin from a ribbon sized to the neck, not a quadruped's.
    ring = [(.24 * math.cos(i * math.tau / 32) - .06, .25 * math.sin(i * math.tau / 32), -.12 + .05 * math.cos(i * math.tau / 32)) for i in range(32)]
    curve("SNAKE · satin bell collar", ring, .022, m["collar"], neck, 3)
    bell = pivot("SNAKE RIG · keepsake bell", (.14, 0, -.30), neck)
    sphere("SNAKE · rounded golden bell", (0, 0, 0), (.10, .095, .105), m["gold"], bell, 26, 18)
    sphere("SNAKE · tiny bell clapper", (.015, -.012, -.09), (.028, .028, .034), m["seam"], bell, 16, 10)

    def pose(clip, amplitude, lag_step, s_curve, flick):
        objects = [body, neck, head, tongue, bell, *segments]
        for obj in objects:
            begin_action(obj, f"BALLOON SNAKE · {clip}")
        for frame, phase in zip(FRAMES, PHASES):
            bpy.context.scene.frame_set(frame)
            key(body, frame, location=(0, 0, .004 * math.cos(2 * phase)), rotation=(0, 0, math.radians(1.0 * math.sin(phase))))
            for index, segment in enumerate(segments):
                x, side, radius = snake_segment(index)
                # A travelling wave: each segment lags the one ahead, and the swing grows toward the tail.
                lag = index * lag_step
                reach = amplitude * (.2 + .8 * index / (SNAKE_SEGMENTS - 1))
                lateral = side * s_curve + reach * math.sin(phase - lag)
                key(segment, frame, location=(0, lateral - side, .004 * math.sin(phase + index)), rotation=(0, 0, math.radians(55 * amplitude * math.cos(phase - lag))))
            key(neck, frame, location=(0, amplitude * .15 * math.sin(phase + .5), .02 * math.cos(2 * phase)), rotation=(0, math.radians(-6 + 2 * math.cos(2 * phase)), math.radians(6 * math.sin(phase + .3))))
            key(head, frame, rotation=(math.radians(2 * math.sin(phase)), math.radians(4 + 2 * math.sin(phase + 1)), math.radians(-7 * math.sin(phase + .3))))
            out = flick(phase)
            key(tongue, frame, location=(.36 + .14 * out, 0, -.06), scale=(.2 + .8 * out, 1, 1), rotation=(0, math.radians(8 * math.sin(phase)), 0))
            key(bell, frame, rotation=(math.radians(4 * math.sin(phase + .4)), math.radians(6 * math.sin(phase + .6)), math.radians(1 * math.sin(phase))))
        finish_action(objects, clip, "snake")

    pose("WALK", .26, .7, .35, lambda phase: max(0.0, math.sin(phase)))
    pose("IDLE", .04, .5, 1.0, lambda phase: .1 + .9 * max(0.0, math.sin(phase)) ** 2)
    portrait("snake", m)
    export_asset(root, "snake", review_yaw=-20, texcoords=False)


def reset_scene():
    global DETAIL
    DETAIL = 1.0
    scene = bpy.context.scene
    scene.world = None
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights, bpy.data.worlds, bpy.data.actions):
        for block in list(collection):
            if block.users == 0:
                collection.remove(block)


MAKERS = {"sheep": make_sheep, "cow": make_cow, "chicken": make_chicken, "duck": make_duck, "goose": make_goose, "frog": make_frog, "owl": make_owl, "raccoon": make_raccoon, "mouse": make_mouse, "rat": make_rat, "snake": make_snake}
arguments = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
requested = [value.lower() for value in arguments] if arguments else ["duck", "goose"]  # Preserve approved assets unless named explicitly.
invalid = [value for value in requested if value not in MAKERS]
if invalid:
    raise SystemExit(f"Unknown animal(s): {', '.join(invalid)}. Choose from {', '.join(MAKERS)}.")
for animal in requested:
    reset_scene()
    MAKERS[animal]()
