"""Prop thumbnails: render the authored prop GLBs to review PNGs.

Headless Blender script for the Shed inventory and Pip shop (DOM redesign).
Each PROP_CATALOG entry already ships a runtime GLB under public/assets/props;
this script imports each one, auto-frames it, and renders a transparent icon
so the UI shows the actual prop instead of a colour swatch.

Run from the project root in PowerShell:

    blender --background --factory-startup --python art/blender/prop_thumbs.py

Regeneration command: overwrites `public/assets/props/prop-<id>.png`
(256x256, transparent) plus `props-review.png`. No .blend is kept: the GLBs
themselves are the source of truth.

Name props after `--` to re-render only those icons (the contact sheet is always
rebuilt from every icon on disk), e.g. `... prop_thumbs.py -- oak`.
"""

import math
import os
import sys

import bpy
from mathutils import Vector

OUT_DIR = os.path.join("public", "assets", "props")
SIZE = 256

PROPS = [
    ("statue", "assets/props/statue.glb"),
    ("fountain", "assets/props/fountain.glb"),
    ("fence", "assets/props/fence.glb"),
    ("coop", "assets/props/coop.glb"),
    ("barn", "assets/props/barn.glb"),
    ("oak", "assets/props/oak.glb"),
    ("garbage-can", "assets/props/garbage-can.glb"),
    ("dumpster", "assets/props/dumpster.glb"),
]


def clear_all():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in list(bpy.data.meshes):
        if block.users == 0:
            bpy.data.meshes.remove(block)
    for block in list(bpy.data.materials):
        if block.users == 0 and block.name.startswith("PT_"):
            bpy.data.materials.remove(block)


def add_light(name, kind, energy, location, size=1.0):
    data = bpy.data.lights.new(name, kind)
    data.energy = energy
    if kind == "AREA":
        data.size = size
    lamp = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(lamp)
    lamp.location = location
    lamp.rotation_euler = (Vector((0, 0, 1)) - lamp.location).to_track_quat("-Z", "Y").to_euler()
    return lamp


def setup_render(path):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = SIZE
    scene.render.resolution_y = SIZE
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.filepath = path
    if scene.world is None:
        scene.world = bpy.data.worlds.new("PT_World")
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get("Background")
    if bg is not None:
        bg.inputs["Color"].default_value = (0.9, 0.9, 0.9, 1.0)
        bg.inputs["Strength"].default_value = 0.25
    try:
        scene.eevee.taa_render_samples = 32
    except AttributeError:
        pass


def frame_objects(objects):
    corner_min = Vector((1e9, 1e9, 1e9))
    corner_max = Vector((-1e9, -1e9, -1e9))
    for obj in objects:
        if obj.type != "MESH":
            continue
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            corner_min = Vector(map(min, corner_min, world))
            corner_max = Vector(map(max, corner_max, world))
    center = (corner_min + corner_max) * 0.5
    size = corner_max - corner_min
    for obj in objects:
        obj.location -= center
    return max(size.x, size.y, size.z * 1.15)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    only = [name.lower() for name in sys.argv[sys.argv.index("--") + 1:]] if "--" in sys.argv else []
    for prop_id, glb in PROPS:
        if only and prop_id not in only:
            continue
        clear_all()
        src = os.path.abspath(os.path.join("public", glb))
        bpy.ops.import_scene.gltf(filepath=src)
        imported = [obj for obj in bpy.context.selected_objects]
        if not imported:
            print("WARN: nothing imported from " + src)
            continue
        biggest = frame_objects(imported)
        add_light("PT_Key", "AREA", 380, (-3.5, -4.0, 4.5), size=3.0)
        add_light("PT_Fill", "AREA", 140, (4.0, -3.0, 2.0), size=3.0)
        add_light("PT_Rim", "AREA", 200, (0.5, 4.5, 3.0), size=2.0)
        cam_data = bpy.data.cameras.new("PT_Camera")
        cam_data.type = "ORTHO"
        cam_data.ortho_scale = max(0.5, biggest * 1.45)
        cam = bpy.data.objects.new("PT_Camera", cam_data)
        bpy.context.collection.objects.link(cam)
        cam.location = (0, -6, biggest * 0.32)
        cam.rotation_euler = (Vector((0, 0, biggest * 0.1)) - cam.location).to_track_quat("-Z", "Y").to_euler()
        bpy.context.scene.camera = cam
        path = os.path.join(OUT_DIR, "prop-%s.png" % prop_id)
        setup_render(os.path.abspath(path))
        bpy.ops.render.render(write_still=True)
        print("wrote " + path)

    clear_all()
    cam_data = bpy.data.cameras.new("PT_SheetCamera")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 1.3 * len(PROPS)
    cam = bpy.data.objects.new("PT_SheetCamera", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = (0, 0, 6)
    cam.rotation_euler = (0, 0, 0)
    bpy.context.scene.camera = cam
    for i, (prop_id, _glb) in enumerate(PROPS):
        img = bpy.data.images.load(os.path.abspath(os.path.join(OUT_DIR, "prop-%s.png" % prop_id)))
        img_mat = bpy.data.materials.new("PT_Sheet_%s" % prop_id)
        img_mat.use_nodes = True
        nodes = img_mat.node_tree.nodes
        links = img_mat.node_tree.links
        nodes.clear()
        out = nodes.new("ShaderNodeOutputMaterial")
        emit = nodes.new("ShaderNodeEmission")
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = img
        links.new(tex.outputs["Color"], emit.inputs["Color"])
        links.new(emit.outputs["Emission"], out.inputs["Surface"])
        bpy.ops.mesh.primitive_plane_add(size=1.0)
        tile = bpy.context.active_object
        tile.location = ((i - (len(PROPS) - 1) / 2) * 1.3, 0, 0)
        tile.data.materials.clear()
        tile.data.materials.append(img_mat)
    scene = bpy.context.scene
    scene.render.resolution_x = 256 * len(PROPS)
    scene.render.resolution_y = 256
    scene.render.filepath = os.path.abspath(os.path.join(OUT_DIR, "props-review.png"))
    bpy.ops.render.render(write_still=True)
    print("wrote review sheet")


main()
