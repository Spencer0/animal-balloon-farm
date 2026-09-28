"""Animal Balloon Farm: original balloon pig source and animated GLB exporter.

Run from repository root:
  blender --background --factory-startup --python art/blender/balloon_pig.py

Regenerates the editable Blender scene, PNG review portrait and runtime GLB.
"""
from __future__ import annotations

import math
import random
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "public" / "assets" / "animals"
OUTPUT.mkdir(parents=True, exist_ok=True)
random.seed(5104)


def color_rgba(value: str):
    raw = value.lstrip("#")
    rgb = [int(raw[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    rgb = [c / 12.92 if c < .04045 else ((c + .055) / 1.055) ** 2.4 for c in rgb]
    return (*rgb, 1.0)


def make_material(name, value, roughness=.27, metallic=0, coat=.3):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color_rgba(value)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color_rgba(value)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Coat Weight"].default_value = coat
    shader.inputs["Coat Roughness"].default_value = .17
    return mat


def parent_local(obj, parent, location):
    if parent:
        obj.parent = parent
        obj.matrix_parent_inverse.identity()
        obj.location = location
    else:
        obj.location = location
    return obj


def sphere(name, location, scale, mat, parent=None, segments=40, rings=28):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + " · mesh"
    obj.scale = scale
    obj.data.materials.append(mat)
    for face in obj.data.polygons:
        face.use_smooth = True
    return parent_local(obj, parent, location)


def tube(name, points, bevel, mat, parent=None, resolution=3, cyclic=False):
    data = bpy.data.curves.new(name + " · curve", "CURVE")
    data.dimensions = "3D"
    data.resolution_u = 16
    data.bevel_depth = bevel
    data.bevel_resolution = resolution
    spline = data.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, position in zip(spline.bezier_points, points):
        point.co = position
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    data.materials.append(mat)
    if parent:
        obj.parent = parent
    return obj


def pivot(name, location, parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.empty_display_type = "SPHERE"
    obj.empty_display_size = .095
    if parent:
        obj.parent = parent
    obj.location = location
    return obj


def key(obj, frame, location=None, rotation=None, scale=None):
    if location is not None:
        obj.location = location
        obj.keyframe_insert(data_path="location", frame=frame, group=obj.name)
    if rotation is not None:
        obj.rotation_euler = rotation
        obj.keyframe_insert(data_path="rotation_euler", frame=frame, group=obj.name)
    if scale is not None:
        obj.scale = scale
        obj.keyframe_insert(data_path="scale", frame=frame, group=obj.name)


def add_action(obj, name):
    obj.animation_data_create()
    action = bpy.data.actions.new(name)
    obj.animation_data.action = action
    return action


def finish_clip(objects, clip_name):
    for obj in objects:
        data = obj.animation_data
        action = data.action if data else None
        if not action:
            continue
        action.name = "BALLOON PIG · " + clip_name
        for fcurve in action.fcurves:
            for point in fcurve.keyframe_points:
                point.interpolation = "BEZIER"
                point.handle_left_type = "AUTO_CLAMPED"
                point.handle_right_type = "AUTO_CLAMPED"
        track = data.nla_tracks.new()
        track.name = clip_name
        strip = track.strips.new(clip_name, 1, action)
        strip.blend_type = "REPLACE"
        strip.extrapolation = "NOTHING"
        data.action = None


# Fresh authoring scene; exported named files below are intentionally regenerated.
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for collection in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights, bpy.data.worlds, bpy.data.actions):
    for block in list(collection):
        if block.users == 0:
            collection.remove(block)

M = {
    "pink": make_material("PIG · rose balloon latex", "#ed679d", .18, .025, .68),
    "light": make_material("PIG · pearlescent blush", "#ffacd0", .19, .015, .60),
    "seam": make_material("PIG · plum balloon ties", "#a83c70", .25, .01, .36),
    "ear": make_material("PIG · warm inner ears", "#db6191", .26, 0, .4),
    "snout": make_material("PIG · peach muzzle balloon", "#ffb0c2", .20, .01, .56),
    "nostril": make_material("PIG · mulberry nostrils", "#713044", .30, 0, .22),
    "white": make_material("PIG · ivory eyes", "#fff7e8", .18, 0, .2),
    "eye": make_material("PIG · espresso pupils", "#321d31", .13, .01, .42),
    "glint": make_material("PIG · eye catchlight", "#ffffff", .11, 0, .1),
    "cheek": make_material("PIG · strawberry blush", "#ff8eb5", .28, 0, .27),
    "hoof": make_material("PIG · cocoa hooves", "#76505d", .24, .015, .30),
    "hoofLight": make_material("PIG · hoof shine", "#df9ca4", .22, .02, .32),
    "gold": make_material("PIG · carnival gold", "#e9b957", .23, .48, .35),
    "cream": make_material("STAGE · buttercream", "#f8e8c7", .82, 0, .05),
    "mint": make_material("STAGE · mint", "#a6d8cf", .88, 0, .05),
    "leaf": make_material("STAGE · leaf green", "#4d8755", .84),
    "sage": make_material("STAGE · sage", "#639968", .86),
    "yellow": make_material("STAGE · calendula", "#f1c558", .62),
    "coral": make_material("STAGE · coral", "#ef7d91", .64),
    "lilac": make_material("STAGE · lilac", "#b59ad6", .62),
    "wood": make_material("STAGE · painted carnival wood", "#93654c", .67),
}

# Blender Z-up; pig's face + travel direction is local +X.
pig = pivot("BALLOON PIG · export root · forward +X", (0, 0, 0))
pig["asset_id"] = "animal_balloon_pig"
pig["forward_axis"] = "+X"
pig["description"] = "Handmade glossy balloon pig for Animal Balloon Farm"
body = pivot("PIG RIG · buoyant torso", (0, 0, 1.34), pig)
head = pivot("PIG RIG · curious head", (.77, 0, .40), body)
neck = pivot("PIG RIG · balloon neck", (.48, 0, .13), body)

sphere("PIG · large pear-shaped body", (0, 0, 0), (1.17, .72, .74), M["pink"], body, 48, 32)
sphere("PIG · soft rounded rump", (-.48, 0, .055), (.72, .68, .67), M["pink"], body, 40, 28)
sphere("PIG · soft shoulder volume", (.49, 0, .10), (.69, .67, .68), M["pink"], body, 40, 28)
sphere("PIG · neck balloon", (0, 0, 0), (.53, .52, .55), M["pink"], neck, 40, 28)
sphere("PIG · oversized expressive head balloon", (0, 0, 0), (.63, .55, .58), M["pink"], head, 48, 32)
sphere("PIG · near cheek puff", (.29, -.10, -.16), (.28, .36, .23), M["pink"], head, 32, 22)
sphere("PIG · far cheek puff", (.29, .10, -.16), (.28, .36, .23), M["pink"], head, 32, 22)

tube("PIG · dorsal balloon seam", [(-.93, 0, .23), (-.55, 0, .61), (0, 0, .74), (.52, 0, .66), (.96, 0, .38)], .014, M["seam"], body, 2)
sphere("PIG · satin highlight", (.03, -.689, .20), (.48, .038, .31), M["light"], body, 32, 22).rotation_euler[1] = math.radians(-17)
sphere("PIG · tiny rim-glint", (.55, -.63, .41), (.20, .028, .08), M["light"], body, 24, 16).rotation_euler[1] = math.radians(-27)
sphere("PIG · tied balloon nozzle", (-1.04, 0, -.025), (.14, .16, .15), M["seam"], body, 24, 18)
tube("PIG · signature curled balloon tail", [(-1.10, 0, -.03), (-1.32, 0, -.10), (-1.48, 0, -.01), (-1.44, 0, .15), (-1.30, 0, .16)], .046, M["seam"], body, 4)

# Ear cartilage and inset colors are independently pivoted, with the inner panel facing +Y.
ears = []
for side, label in [(-1, "near"), (1, "far")]:
    ear = pivot(f"PIG RIG · {label} floppy ear", (-.17, side * .31, .47), head)
    ear.rotation_euler = (math.radians(side * 7), math.radians(-24 if side < 0 else -31), math.radians(side * -4))
    ears.append(ear)
    sphere(f"PIG · {label} tapered ear balloon", (0, 0, .17), (.18, .17, .43), M["pink"], ear, 36, 26).rotation_euler[1] = math.radians(-8)
    sphere(f"PIG · {label} pink ear inset", (.025, side * .126, .17), (.105, .031, .29), M["ear"], ear, 32, 22).rotation_euler[1] = math.radians(-8)
    sphere(f"PIG · {label} ear highlight", (.015, side * .105, .42), (.08, .03, .10), M["light"], ear, 24, 16)

snout = pivot("PIG RIG · wiggly snout", (.55, 0, -.015), head)
snout.rotation_euler[1] = math.radians(-5)
sphere("PIG · plump peach balloon muzzle", (.14, 0, -.04), (.38, .36, .30), M["snout"], snout, 44, 30)
sphere("PIG · muzzle bridge", (.36, 0, .01), (.16, .28, .20), M["light"], snout, 32, 22)
for side, label in [(-1, "left"), (1, "right")]:
    sphere(f"PIG · {label} inset nostril", (.478, side * .145, .022), (.024, .054, .067), M["nostril"], snout, 28, 18)
    sphere(f"PIG · {label} nostril shine", (.499, side * .155 - .014, .051), (.011, .020, .013), M["light"], snout, 16, 12)
tube("PIG · joyful curled smile", [(.37, -.279, -.17), (.49, -.292, -.216), (.59, -.265, -.198), (.66, -.21, -.15)], .017, M["seam"], snout, 3)

for side, label in [(-1, "near"), (1, "far")]:
    sphere(f"PIG · {label} ivory eye", (.21, side * .422, .22), (.17, .095, .19), M["white"], head, 36, 26)
    sphere(f"PIG · {label} espresso pupil", (.27, side * .501, .225), (.081, .049, .104), M["eye"], head, 32, 22)
    sphere(f"PIG · {label} big catchlight", (.30, side * .542, .273), (.034, .018, .04), M["glint"], head, 20, 14)
    sphere(f"PIG · {label} tiny catchlight", (.245, side * .54, .192), (.014, .011, .017), M["glint"], head, 16, 10)
    tube(f"PIG · {label} expressive lid", [(.045, side * .43, .32), (.19, side * .468, .41), (.34, side * .442, .37)], .030, M["seam"], head, 2)
    blush = sphere(f"PIG · {label} strawberry blush", (.20, side * .494, -.115), (.104, .027, .054), M["cheek"], head, 28, 18)
    blush.rotation_euler[1] = math.radians(-10)

# Gold collar, a hanging bell and bead all ride the neck/torso pivot.
bell = pivot("PIG RIG · swinging carnival bell", (.30, 0, -.18), neck)
collar_points = []
for index in range(48):
    angle = index / 48 * math.tau
    collar_points.append((.39 * math.cos(angle), .41 * math.sin(angle), -.20))
tube("PIG · gold ribbon collar", collar_points, .032, M["gold"], neck, 3, True)
sphere("PIG · rounded gold bell", (0, 0, 0), (.145, .14, .15), M["gold"], bell, 32, 22)
sphere("PIG · tiny bell clapper", (.02, -.015, -.13), (.043, .044, .05), M["seam"], bell, 20, 14)

# Four articulated balloon legs. Feet remain close to floor; hind/front diagonals alternate.
leg_info = [(.62, -.43, "front near"), (.62, .43, "front far"), (-.66, -.43, "rear near"), (-.66, .43, "rear far")]
leg_pivots, hoof_pivots = [], []
for x, y, label in leg_info:
    # A fixed, plump hip blends each articulated limb into the underside of the torso.
    sphere(f"PIG · {label} integrated hip balloon", (x, y, -.49), (.245, .205, .225), M["pink"], body, 32, 22)
    leg = pivot(f"PIG RIG · {label} leg", (x, y, -.45), body)
    leg_pivots.append(leg)
    # The long upper balloon deliberately overlaps both the hip and lower ankle; no floating joints.
    sphere(f"PIG · {label} continuous upper leg balloon", (0, 0, -.15), (.18, .155, .32), M["pink"], leg, 36, 24)
    sphere(f"PIG · {label} rounded ankle joint", (.025, 0, -.40), (.145, .137, .17), M["pink"], leg, 30, 20)
    hoof = pivot(f"PIG RIG · {label} hoof hinge", (.045, 0, -.56), leg)
    hoof_pivots.append(hoof)
    sphere(f"PIG · {label} cocoa split hoof", (.025, 0, -.065), (.17, .148, .11), M["hoof"], hoof, 32, 22)
    sphere(f"PIG · {label} toe reflection", (.145, -.098, -.035), (.035, .015, .024), M["hoofLight"], hoof, 18, 12)
    tube(f"PIG · {label} ankle twist seam", [(-.08, 0, -.33), (0, 0, -.37), (.07, 0, -.35)], .011, M["seam"], leg, 2)

# WALK: body + local pivot animation creates diagonal gait, hooves, head lead, ear lag, bell follow-through.
scene = bpy.context.scene
scene.render.fps = 30
scene.frame_start, scene.frame_end = 1, 25
walk_parts = [pig, body, head, neck, snout, bell, *ears, *leg_pivots, *hoof_pivots]
for obj in walk_parts:
    add_action(obj, "BALLOON PIG · WALK")
frames = (1, 7, 13, 19, 25)
phases = (0, math.pi / 2, math.pi, 3 * math.pi / 2, math.tau)
for frame, phase in zip(frames, phases):
    scene.frame_set(frame)
    bob = .025 + .047 * (.5 - .5 * math.cos(2 * phase))
    key(body, frame, location=(0, 0, 1.34 + bob),
        rotation=(math.radians(1.6 * math.sin(phase)), 0, math.radians(1.0 * math.sin(phase + .4))),
        scale=(1 + .012 * math.sin(phase), 1, 1 + .018 * math.cos(2 * phase)))
    key(head, frame, rotation=(math.radians(2.0 * math.sin(phase - .35)), math.radians(1.8 * math.sin(phase + .6)), math.radians(1.4 * math.sin(phase + .3))))
    key(neck, frame, rotation=(math.radians(1.1 * math.sin(phase)), math.radians(1.5 * math.sin(phase + .3)), 0))
    key(snout, frame, rotation=(math.radians(.8 * math.sin(phase)), math.radians(-4 + 1.2 * math.sin(phase)), 0))
    key(bell, frame, rotation=(math.radians(4 * math.sin(phase + .4)), math.radians(8 * math.sin(phase + .7)), math.radians(4 * math.sin(phase))))
    for index, ear in enumerate(ears):
        side = -1 if index == 0 else 1
        key(ear, frame, rotation=(math.radians(side * 7 + 3 * math.sin(phase + index)), math.radians((-24 if index == 0 else -31) - 5 * math.sin(phase + index * .6)), math.radians(side * -4 + 3 * math.sin(phase + index + .4))))
    for index, (leg, hoof) in enumerate(zip(leg_pivots, hoof_pivots)):
        x, y, _ = leg_info[index]
        stride = phase + (math.pi if index in (1, 2) else 0)
        # Local +X is forward: negative Y leads the hoof forward, positive Y trails it.
        # The foot travels rearward in stance, lifts at the rear, then swings forward to plant.
        leg_swing = -math.cos(stride)
        lift = max(0.0, -math.sin(stride)) * .13
        key(leg, frame, location=(x, y, -.45 + lift - bob),
            rotation=(math.radians(1.5 * math.sin(stride)), math.radians(25 * leg_swing), math.radians(1.4 * math.sin(stride + .4))))
        key(hoof, frame, rotation=(0, math.radians(8 * max(0.0, -math.sin(stride))), math.radians(-2 * leg_swing)))
finish_clip(walk_parts, "WALK")

# IDLE: subtle inflation/breathing, tiny inquisitive glance and bell/ear secondary action.
idle_parts = [body, head, neck, bell, *ears, *leg_pivots, *hoof_pivots]
for obj in idle_parts:
    add_action(obj, "BALLOON PIG · IDLE")
for frame, phase in zip(frames, phases):
    scene.frame_set(frame)
    idle_bob = .018 * math.sin(phase)
    key(body, frame, location=(0, 0, 1.34 + idle_bob),
        rotation=(0, math.radians(.7 * math.sin(phase)), math.radians(.4 * math.sin(phase))))
    key(head, frame, rotation=(math.radians(.5 * math.sin(phase)), math.radians(1.1 * math.sin(phase)), math.radians(1.0 * math.sin(phase + .7))))
    key(neck, frame, rotation=(0, math.radians(.8 * math.sin(phase + .4)), 0))
    key(bell, frame, rotation=(math.radians(1.7 * math.sin(phase)), math.radians(2.0 * math.sin(phase + .4)), math.radians(2.6 * math.sin(phase))))
    for index, ear in enumerate(ears):
        key(ear, frame, rotation=(0, math.radians(1.4 * math.sin(phase + index)), math.radians(1.6 * math.sin(phase + index))))
    for index, (leg, hoof) in enumerate(zip(leg_pivots, hoof_pivots)):
        x, y, _ = leg_info[index]
        key(leg, frame, location=(x, y, -.45 - idle_bob), rotation=(0, math.radians(.5 * math.sin(phase + index)), 0))
        key(hoof, frame, rotation=(0, math.radians(.4 * math.sin(phase + index)), 0))
finish_clip(idle_parts, "IDLE")

# Review portrait stage, excluded from exported pig selection.
scene.frame_set(7)
scene.render.engine = "BLENDER_EEVEE_NEXT"
scene.render.resolution_x, scene.render.resolution_y = 1200, 1000
scene.render.resolution_percentage = 100
scene.eevee.taa_render_samples = 72
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.view_settings.exposure = .16
scene.render.threads_mode = "FIXED"
scene.render.threads = 8
scene.world = bpy.data.worlds.new("Pig portrait · mint fairground morning")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = color_rgba("#b7dcd2")
scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = .62

bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.08))
floor = bpy.context.object
floor.name = "STAGE · buttercream floor"
floor.data.materials.append(M["cream"])
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 7, 6))
backdrop = bpy.context.object
backdrop.name = "STAGE · mint studio backdrop"
backdrop.dimensions = (200, .25, 14)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
backdrop.data.materials.append(M["mint"])

for index, (x, z, height, petal_mat) in enumerate([
    (-4.0, -1.2, .72, M["yellow"]), (4.0, -.5, .78, M["coral"]),
    (-4.8, 3.6, .55, M["lilac"]), (4.9, 3.3, .56, M["yellow"]),
    (-2.9, 5.2, .42, M["coral"]), (3.0, 5.0, .44, M["lilac"]),
]):
    sphere(f"STAGE · flower stem {index}", (x, z, height / 2), (.032, .032, height / 2), M["leaf"], None, 16, 12)
    for petal in range(6):
        angle = petal * math.tau / 6
        sphere(f"STAGE · flower petal {index}-{petal}", (x + math.cos(angle) * .17, z + math.sin(angle) * .17, height), (.13, .105, .06), petal_mat, None, 18, 12)
    sphere(f"STAGE · flower heart {index}", (x, z, height), (.08, .08, .075), M["gold"], None, 18, 12)

# Small strand of carnival flags on the distant mint wall.
for index, (x, z) in enumerate(zip(range(-6, 7, 2), [5.15, 4.9, 5.15, 4.9, 5.15, 4.9, 5.15])):
    sphere(f"STAGE · tiny pennant {index}", (x, 5.9, z), (.42, .05, .23), [M["coral"], M["yellow"], M["lilac"], M["sage"]][index % 4], None, 20, 14)

camera_data = bpy.data.cameras.new("STAGE · pig three-quarter portrait")
camera = bpy.data.objects.new("STAGE · pig three-quarter portrait", camera_data)
bpy.context.collection.objects.link(camera)
camera.location = (5.6, -10.4, 6.3)
camera.rotation_euler = (Vector((0, 0, 1.0)) - Vector(camera.location)).to_track_quat("-Z", "Y").to_euler()
camera_data.type = "ORTHO"
camera_data.ortho_scale = 8.5
scene.camera = camera

for name, location, energy, size, tint in [
    ("STAGE LIGHT · soft rose key", (1, -5, 9), 1500, 6, (1.0, .78, .78)),
    ("STAGE LIGHT · cool mint fill", (-7, -1, 6), 1100, 6, (.72, .94, 1.0)),
    ("STAGE LIGHT · warm pink rim", (3, 5, 8), 1850, 5, (1.0, .70, .68)),
    ("STAGE LIGHT · soft bounce", (-1, -4, 2.4), 380, 4, (1.0, .90, .68)),
]:
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = tint
    lamp = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(lamp)
    lamp.location = location
    lamp.rotation_euler = (Vector((0, 0, 1)) - lamp.location).to_track_quat("-Z", "Y").to_euler()

blend_path = OUTPUT / "balloon-pig.blend"
render_path = OUTPUT / "balloon-pig-review.png"
glb_path = OUTPUT / "balloon-pig.glb"
scene.render.filepath = str(render_path)
bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
bpy.ops.render.render(write_still=True)

# Only pig root and descendants are selected for export; stage remains Blender-only.
bpy.ops.object.select_all(action="DESELECT")
def select_tree(obj):
    obj.select_set(True)
    for child in obj.children:
        select_tree(child)
select_tree(pig)
bpy.context.view_layer.objects.active = pig
bpy.ops.export_scene.gltf(
    filepath=str(glb_path), export_format="GLB", use_selection=True,
    export_apply=True, export_animations=True, export_animation_mode="NLA_TRACKS",
    export_nla_strips=True, export_nla_strips_merged_animation_name="BALLOON PIG",
    export_force_sampling=True, export_frame_step=1, export_materials="EXPORT",
    export_cameras=False, export_lights=False,
)
print("Blender source:", blend_path)
print("Art review:", render_path)
print("Animated GLB:", glb_path)
print("Rig: body, head, neck, snout, ears, four legs/hooves, bell; clips WALK and IDLE.")
print("Scale about 2.5 m long; Blender Z-up; local +X forward.")
