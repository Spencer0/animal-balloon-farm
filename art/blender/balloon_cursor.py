"""Animal Balloon Farm: the balloon bumblebee that is the game's mouse pointer.

Run from repository root:
  blender --background --factory-startup --python art/blender/balloon_cursor.py

The pointer is the one piece of the interface the browser owns, so it has to be
a raster image. The previous version was a hand drawn pointing hand, which read
as a raised middle finger the moment it was tilted -- so the pointer is now a
little balloon bumblebee instead: a round body, two ball-tipped antennae and a
pair of eyes, which stays legible at 32 px and has no opinions about your
gesture.

Two frames are baked:

  bee-idle.png      the default, over anything that is not clickable
  bee-excited.png   over something you can press; it perks up and leans in

The hotspot is the bee's feet, so it reads as a little character standing on
the spot you are pointing at rather than as an arrowhead.
"""
from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "public" / "assets" / "cursors"
OUTPUT.mkdir(parents=True, exist_ok=True)

# Everything is authored at roughly 1.5 m across; the ortho cameras below frame
# it, and the exported GLB is metres so the bee can also stand in the garden.
BODY_Z = 0.60
BODY_R = 0.60


def color_rgba(value: str, alpha: float = 1.0):
    raw = value.lstrip("#")
    rgb = [int(raw[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    rgb = [c / 12.92 if c < .04045 else ((c + .055) / 1.055) ** 2.4 for c in rgb]
    return (*rgb, alpha)


def make_material(name, value, roughness=.22, metallic=0.0, coat=.55, alpha=1.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color_rgba(value, alpha)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color_rgba(value, alpha)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Coat Weight"].default_value = coat
    shader.inputs["Coat Roughness"].default_value = .14
    if alpha < 1.0:
        shader.inputs["Alpha"].default_value = alpha
        mat.blend_method = "BLEND"
    return mat


def sphere(name, location, scale, mat, parent=None, segments=40, rings=28):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + " · mesh"
    obj.scale = scale
    obj.data.materials.append(mat)
    for face in obj.data.polygons:
        face.use_smooth = True
    if parent:
        obj.parent = parent
        obj.matrix_parent_inverse.identity()
    obj.location = location
    return obj


def tube(name, points, bevel, mat, parent=None, resolution=3, cyclic=False):
    data = bpy.data.curves.new(name + " · curve", "CURVE")
    data.dimensions = "3D"
    data.resolution_u = 14
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
        obj.matrix_parent_inverse.identity()
    return obj


def ring(name, z, mat, parent, minor=.03):
    """A plum band hugging the body sphere.

    The band radius is the sphere's own radius at that height, so the torus
    straddles the surface and only a thin ridge of it shows. Making it any
    fatter turned the upper band into a hoop standing off the bee, which read
    as a hat.
    """
    dz = z - BODY_Z
    major = BODY_R * math.sqrt(max(0.0, 1.0 - (dz / BODY_R) ** 2))
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=56, minor_segments=12, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + " · mesh"
    obj.data.materials.append(mat)
    for face in obj.data.polygons:
        face.use_smooth = True
    if parent:
        obj.parent = parent
        obj.matrix_parent_inverse.identity()
    obj.location = (0, 0, z)
    return obj


def empty(name, location=(0, 0, 0), parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.empty_display_type = "SPHERE"
    obj.empty_display_size = .08
    if parent:
        obj.parent = parent
        obj.matrix_parent_inverse.identity()
    obj.location = location
    return obj


# Fresh authoring scene.
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for collection in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights, bpy.data.worlds):
    for block in list(collection):
        if block.users == 0:
            collection.remove(block)

M = {
    "body": make_material("BEE · butter balloon latex", "#f7d64e", .17, .02, .72),
    "band": make_material("BEE · plum balloon bands", "#5a3350", .24, .01, .4),
    "sheen": make_material("BEE · satin highlight", "#fff0a8", .15, .01, .7),
    "white": make_material("BEE · ivory eyes", "#fff9ec", .16, 0, .3),
    "pupil": make_material("BEE · espresso pupils", "#3a1f36", .12, .01, .45),
    "glint": make_material("BEE · eye catchlight", "#ffffff", .1, 0, .1),
    "cheek": make_material("BEE · peach blush", "#ff9db0", .26, 0, .3),
    "gold": make_material("BEE · carnival gold antennae", "#e9b957", .2, .5, .4),
    "wing": make_material("BEE · mint wing film", "#cdeee4", .12, 0, .8, alpha=.62),
    "foot": make_material("BEE · cocoa feet", "#7a4a55", .26, .01, .3),
}

bee = empty("BALLOON BEE · export root", (0, 0, 0))
bee["asset_id"] = "cursor_balloon_bee"
bee["description"] = "Round balloon bumblebee used as the Animal Balloon Farm mouse pointer"
body = empty("BEE RIG · body", (0, 0, BODY_Z), bee)

sphere("BEE · round balloon body", (0, 0, 0), (BODY_R, BODY_R, BODY_R * .97), M["body"], body, 48, 32)
# A horizontal band around a ball reads as a hoop, not a stripe: seen from
# slightly above, the far side of the ring shows above the body's own outline
# and the bee looks like it is wearing a Saturn ring. A plum patch low on the
# front does the same job as a bee marking and cannot do that.
sphere("BEE · plum belly marking", (0, -.30, -.36), (.33, .27, .21), M["band"], body, 32, 22)
sphere("BEE · satin highlight", (-.16, -.50, .22), (.20, .05, .26), M["sheen"], body, 28, 18).rotation_euler[1] = math.radians(16)
sphere("BEE · tiny rim glint", (.26, -.44, .34), (.09, .04, .06), M["sheen"], body, 20, 14).rotation_euler[1] = math.radians(-22)
sphere("BEE · plump rear", (0, .40, -.04), (.40, .30, .38), M["body"], body, 32, 22)
sphere("BEE · velvet stinger", (0, .60, -.10), (.10, .16, .10), M["band"], body, 24, 16)

# The face sits on the -Y side, square to the camera, so it reads at 32 px.
for side, label in [(-1, "left"), (1, "right")]:
    sphere(f"BEE · {label} ivory eye", (side * .215, -.475, .17), (.155, .085, .175), M["white"], body, 32, 24)
    sphere(f"BEE · {label} pupil", (side * .222, -.552, .175), (.074, .045, .092), M["pupil"], body, 28, 20)
    sphere(f"BEE · {label} catchlight", (side * .248, -.582, .222), (.033, .018, .038), M["glint"], body, 18, 12)
    sphere(f"BEE · {label} blush", (side * .345, -.435, -.055), (.095, .030, .052), M["cheek"], body, 24, 16)

tube("BEE · cheerful smile", [(-.13, -.505, -.13), (0, -.548, -.20), (.13, -.505, -.13)], .021, M["band"], body, 3)

antennae = []
for side, label in [(-1, "left"), (1, "right")]:
    pivot = empty(f"BEE RIG · {label} antenna", (side * .13, -.02, .50), body)
    antennae.append(pivot)
    tube(f"BEE · {label} antenna", [(0, 0, 0), (side * .07, -.01, .19), (side * .13, -.02, .33)], .019, M["gold"], pivot, 2)
    sphere(f"BEE · {label} antenna ball", (side * .13, -.02, .35), (.078, .078, .078), M["gold"], pivot, 24, 16)

wings = []
for side, label in [(-1, "left"), (1, "right")]:
    pivot = empty(f"BEE RIG · {label} wing", (side * .40, .16, .10), body)
    pivot.rotation_euler = (math.radians(-16), math.radians(side * 26), math.radians(side * -14))
    wings.append(pivot)
    sphere(f"BEE · {label} wing film", (side * .17, 0, 0), (.26, .045, .16), M["wing"], pivot, 28, 20)

for side, label in [(-1, "left"), (1, "right")]:
    sphere(f"BEE · {label} cocoa foot", (side * .19, -.15, -.53), (.105, .135, .075), M["foot"], body, 24, 16)


def pose_idle():
    bee.location = (0, 0, 0)
    bee.rotation_euler = (0, 0, 0)
    for index, pivot in enumerate(antennae):
        side = -1 if index == 0 else 1
        pivot.rotation_euler = (0, math.radians(side * -12), math.radians(side * -8))
    for index, pivot in enumerate(wings):
        side = -1 if index == 0 else 1
        pivot.rotation_euler = (math.radians(-16), math.radians(side * 26), math.radians(side * -14))


def pose_excited():
    """Leans toward the pointer, antennae up, wings lifted: "press me".

    The first pass moved the rig by a few millimetres, which at 32 px was
    indistinguishable from idle. It has to be a change of *pose* -- lifted,
    tipped forward and rolled, with the antennae straight up -- to read as a
    different frame at all.
    """
    bee.location = (0, -.10, .16)
    bee.rotation_euler = (math.radians(-17), math.radians(4), math.radians(5))
    for index, pivot in enumerate(antennae):
        side = -1 if index == 0 else 1
        pivot.rotation_euler = (math.radians(-20), math.radians(side * -2), math.radians(side * 26))
    for index, pivot in enumerate(wings):
        side = -1 if index == 0 else 1
        pivot.rotation_euler = (math.radians(-62), math.radians(side * 16), math.radians(side * -40))


# Cursor frames. Square, transparent, and framed so the bee's feet sit a few
# pixels above the bottom edge: the hotspot is the feet, and a cursor whose
# active pixel is flush with the border gets clipped on some platforms.
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 96
scene.cycles.use_denoising = True
# The browser cannot scale a cursor image, so the PNG has to be baked at the
# size it is drawn at. 64 px is a little over twice the classic 32 px pointer,
# which suits a mascot and still leaves it small next to the tool icons.
scene.render.resolution_x = 64
scene.render.resolution_y = 64
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.view_settings.view_transform = "Standard"

camera_data = bpy.data.cameras.new("BEE · cursor portrait")
camera = bpy.data.objects.new("BEE · cursor portrait", camera_data)
bpy.context.collection.objects.link(camera)
camera.location = (0, -7.2, 1.35)
camera.rotation_euler = (Vector((0, 0, 1.0)) - Vector(camera.location)).to_track_quat("-Z", "Y").to_euler()
camera_data.type = "ORTHO"
camera_data.ortho_scale = 2.35
scene.camera = camera

for name, location, energy, size, tint in [
    ("BEE LIGHT · warm key", (2.4, -3.6, 5.0), 900, 5, (1.0, .93, .74)),
    ("BEE LIGHT · cool fill", (-3.4, -2.0, 2.6), 480, 5, (.76, .92, 1.0)),
    ("BEE LIGHT · bright rim", (-1.0, 3.6, 3.4), 820, 4, (1.0, .80, .70)),
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

blend_path = OUTPUT / "balloon-bee-cursor.blend"
bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))

for name, pose in (("bee-idle", pose_idle), ("bee-excited", pose_excited)):
    pose()
    bpy.context.view_layer.update()
    scene.render.filepath = str(OUTPUT / (name + ".png"))
    bpy.ops.render.render(write_still=True)
    print("Cursor frame:", OUTPUT / (name + ".png"))

# The same mascot, exported for the world. The pointer does not need it -- a
# cursor is a flat image -- but the bee should be able to stand in the garden.
glb_path = OUTPUT / "balloon-bee.glb"
bpy.ops.object.select_all(action="DESELECT")


def select_tree(obj):
    obj.select_set(True)
    for child in obj.children:
        select_tree(child)


select_tree(bee)
bpy.context.view_layer.objects.active = bee
bpy.ops.export_scene.gltf(
    filepath=str(glb_path), export_format="GLB", use_selection=True,
    export_apply=True, export_animations=False, export_materials="EXPORT",
    export_cameras=False, export_lights=False,
)
print("Blender source:", blend_path)
print("World GLB:", glb_path)
print("Hotspot: the feet, low centre of each frame.")
