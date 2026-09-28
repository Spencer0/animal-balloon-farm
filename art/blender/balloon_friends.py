"""Create Animal Balloon Farm sheep, cow, chicken, duck and goose assets.

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
    data.resolution_u = 16
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


def animate(animal, body, head, neck, ears, tail, legs, hooves, bell, leg_positions, forward_gait=False, body_z=1.25, leg_anchor=None):
    walk = [body, head, neck, *ears, tail, *legs, *hooves, bell]
    for obj in walk:
        begin_action(obj, f"BALLOON {animal.upper()} · WALK")
    for frame, phase in zip(FRAMES, PHASES):
        bpy.context.scene.frame_set(frame)
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

    idle = [body, head, neck, *ears, tail, *legs, *hooves, bell]
    for obj in idle:
        begin_action(obj, f"BALLOON {animal.upper()} · IDLE")
    for frame, phase in zip(FRAMES, PHASES):
        bpy.context.scene.frame_set(frame)
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


def export_asset(root, animal):
    stem = f"balloon-{animal}"
    blend_path = OUTPUT / f"{stem}.blend"
    render_path = OUTPUT / f"{stem}-review.png"
    glb_path = OUTPUT / f"{stem}.glb"
    scene = bpy.context.scene
    scene.frame_set(7)
    scene.render.filepath = str(render_path)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    bpy.ops.render.render(write_still=True)
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
        export_cameras=False, export_lights=False,
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


def reset_scene():
    scene = bpy.context.scene
    scene.world = None
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights, bpy.data.worlds, bpy.data.actions):
        for block in list(collection):
            if block.users == 0:
                collection.remove(block)


MAKERS = {"sheep": make_sheep, "cow": make_cow, "chicken": make_chicken, "duck": make_duck, "goose": make_goose}
arguments = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
requested = [value.lower() for value in arguments] if arguments else ["duck", "goose"]  # Preserve approved assets unless named explicitly.
invalid = [value for value in requested if value not in MAKERS]
if invalid:
    raise SystemExit(f"Unknown animal(s): {', '.join(invalid)}. Choose from {', '.join(MAKERS)}.")
for animal in requested:
    reset_scene()
    MAKERS[animal]()
