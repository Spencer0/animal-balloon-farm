"""Animal Balloon Farm: the balloon mouse pointer.

Run from repository root:
  blender --background --factory-startup --python art/blender/balloon_mouse_cursor.py

The pointer is a plain mouse arrow, the shape people already read as "click
here", inflated like a red balloon. It is a flat outline pushed out with a
large round bevel and a light subdivision, so every edge swells and rounds off
the way a filled balloon does.

Two frames are baked:

  balloon-mouse-idle.png   the resting pointer
  balloon-mouse-point.png  over something you can press: a touch brighter and
                           lit from inside, so it reads as "live"

The hotspot is the arrow's tip. Its pixel is printed when the script runs and
mirrored in src/ui/ui-cursor.ts.
"""
from __future__ import annotations

from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "public" / "assets" / "cursors"
OUTPUT.mkdir(parents=True, exist_ok=True)

FRAME_PX = 64
# Arrow outline in screen-space units: x to the right, y down, tip at (0, 0).
# Height is 1.0 from tip to tail, so the arrow stays the same size whatever the
# render resolution.
OUTLINE = [
    (0.0, 0.0),
    (0.0, 0.86),
    (0.20, 0.68),
    (0.34, 0.98),
    (0.46, 0.92),
    (0.32, 0.64),
    (0.62, 0.64),
]
# How far the bevel rounds the outline: the softer the edge, the more it reads as a balloon.
BEVEL_RADIUS = 0.05
# How thick the balloon is through the middle (the Y axis, towards the camera).
INFLATE_THICKNESS = 0.17


def to_world(point):
    """Screen-space arrow units to Blender: x right, z up, camera looks along +Y."""
    x, y = point
    return Vector((x, 0.0, -y))


def color_rgba(value: str, alpha: float = 1.0):
    raw = value.lstrip("#")
    rgb = [int(raw[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    rgb = [c / 12.92 if c < .04045 else ((c + .055) / 1.055) ** 2.4 for c in rgb]
    return (*rgb, alpha)


def make_material(name, value, roughness=.2, coat=.6, emission=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color_rgba(value)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Coat Weight"].default_value = coat
    shader.inputs["Coat Roughness"].default_value = .12
    if emission > 0:
        shader.inputs["Emission Color"].default_value = color_rgba(value)
        shader.inputs["Emission Strength"].default_value = emission
    return mat


def build_balloon(name, material):
    """Build the arrow as a flat polygon, then inflate it with modifiers.

    Solidify gives it body, Bevel rounds every edge by the same amount, and a
    light Subdivision smooths the result into a balloon rather than a cut-out.
    """
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    verts = [bm.verts.new(to_world(point)) for point in OUTLINE]
    bm.faces.new(verts)
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)

    solid = obj.modifiers.new("Inflate", type="SOLIDIFY")
    solid.thickness = INFLATE_THICKNESS
    solid.offset = 0.0
    bevel = obj.modifiers.new("Round", type="BEVEL")
    bevel.width = BEVEL_RADIUS
    bevel.segments = 6
    bevel.limit_method = "ANGLE"
    puff = obj.modifiers.new("Puff", type="SUBSURF")
    puff.levels = 1
    puff.render_levels = 2

    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    mesh_obj = bpy.context.object
    mesh_obj.name = name
    bpy.ops.object.shade_smooth()
    mesh_obj.data.materials.clear()
    mesh_obj.data.materials.append(material)
    return mesh_obj


# Scene: a transparent 64 px orthographic render, the same kind the other cursors use.
# The factory scene brings a default cube, light and camera; the cube would fill
# the frame, so clear them and build our own.
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 96
scene.cycles.use_denoising = True
scene.render.resolution_x = FRAME_PX
scene.render.resolution_y = FRAME_PX
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.view_settings.view_transform = "Standard"

# The arrow spans about 0.62 wide and 1.0 tall. Centre the frame on its middle
# and give it a little margin so the glossy edge never clips.
ARROW_CENTER = Vector((0.31, 0.0, -0.5))
VIEW_HEIGHT = 1.22

camera_data = bpy.data.cameras.new("MOUSE · cursor camera")
camera = bpy.data.objects.new("MOUSE · cursor camera", camera_data)
bpy.context.collection.objects.link(camera)
camera.location = ARROW_CENTER + Vector((0, -6.0, 0))
camera.rotation_euler = (1.5707963, 0.0, 0.0)
camera_data.type = "ORTHO"
camera_data.ortho_scale = VIEW_HEIGHT
scene.camera = camera

for name, location, energy, size, tint in [
    ("MOUSE LIGHT · warm key", (2.2, -3.2, 3.6), 620, 4, (1.0, .93, .86)),
    ("MOUSE LIGHT · cool fill", (-2.6, -2.4, -0.6), 260, 5, (.9, .95, 1.0)),
    ("MOUSE LIGHT · rim", (-0.8, 2.8, 2.6), 420, 3, (1.0, .86, .84)),
]:
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = tint
    lamp = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(lamp)
    lamp.location = ARROW_CENTER + Vector(location)
    lamp.rotation_euler = (Vector((0, 0, 0)) - lamp.location).to_track_quat("-Z", "Y").to_euler()

red_gloss = make_material("MOUSE · red balloon latex", "#e0343f", roughness=.16, coat=.7)
red_lit = make_material("MOUSE · red balloon latex lit", "#f2525c", roughness=.16, coat=.7, emission=0.14)
shine_material = make_material("MOUSE · balloon shine", "#fff7f2", roughness=.05, coat=0.0, emission=2.5)


def add_shine():
    """A small specular dot near the upper-left of the body, the glint a balloon has."""
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=1, location=to_world((0.17, 0.32)) + Vector((0, -0.14, 0)))
    shine = bpy.context.object
    shine.name = "MOUSE · shine"
    shine.scale = (0.05, 0.03, 0.07)
    shine.data.materials.append(shine_material)
    bpy.ops.object.shade_smooth()
    return shine


blend_path = OUTPUT / "balloon-mouse-cursor.blend"
frames = (("balloon-mouse-idle", red_gloss), ("balloon-mouse-point", red_lit))

for name, body_material in frames:
    # Clear last frame's arrow and shine; the camera and lights stay.
    for obj in list(bpy.data.objects):
        if obj.name.startswith("MOUSE · balloon") or obj.name.startswith("MOUSE · shine"):
            bpy.data.objects.remove(obj, do_unlink=True)
    build_balloon("MOUSE · balloon arrow", body_material)
    add_shine()
    bpy.context.view_layer.update()
    scene.render.filepath = str(OUTPUT / (name + ".png"))
    bpy.ops.render.render(write_still=True)
    print("Cursor frame:", OUTPUT / (name + ".png"))

# The tip sits at the arrow's top-left corner. Its pixel is the hotspot the game uses.
tip = to_world(OUTLINE[0])
scale = FRAME_PX / VIEW_HEIGHT
tip_px = (FRAME_PX / 2 + (tip.x - ARROW_CENTER.x) * scale, FRAME_PX / 2 - (tip.z - ARROW_CENTER.z) * scale)
print("Cursor tip pixel:", round(tip_px[0], 1), round(tip_px[1], 1))

bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
