"""Shed seed icons: source, renders, review sheet.

Headless Blender authoring script for the Shed inventory (DOM redesign). One
seed-packet icon per PLANT_CATALOG species, rendered with a transparent
background. The packet is shared geometry; only the badge colour changes per
species, so a new plant needs one line in SPECIES below.

Run from the project root in PowerShell:

    blender --background --factory-startup --python art/blender/shed_icons.py

Regeneration command: overwrites `public/assets/seeds/seed-<id>.png`
(256x256, transparent), the contact sheet `seeds-review.png`, and the editable
source `seeds.blend`. Icons are modelled upright (Z up) and rendered from a
front orthographic camera with unlit emission materials.
"""

import math
import os

import bpy

OUT_DIR = os.path.join("public", "assets", "seeds")
SIZE = 256

# id, display name, badge colour (matches PLANT_CATALOG color).
SPECIES = [
    ("clover", "Clover", (0.47, 0.68, 0.35, 1.0)),
    ("dandelion", "Dandelion", (0.91, 0.77, 0.27, 1.0)),
    ("poppy", "Poppy", (0.91, 0.48, 0.38, 1.0)),
    ("water-lily", "Water lily", (0.85, 0.58, 0.79, 1.0)),
]

CREAM = (0.96, 0.90, 0.76, 1.0)
BROWN = (0.45, 0.30, 0.20, 1.0)
LEAF = (0.32, 0.62, 0.30, 1.0)
STEM = (0.25, 0.50, 0.25, 1.0)


def mat_flat(name, rgba):
    key = "SH_" + name
    material = bpy.data.materials.get(key)
    if material is None:
        material = bpy.data.materials.new(key)
        material.use_nodes = True
        nodes = material.node_tree.nodes
        links = material.node_tree.links
        nodes.clear()
        out = nodes.new("ShaderNodeOutputMaterial")
        emit = nodes.new("ShaderNodeEmission")
        emit.inputs["Color"].default_value = rgba
        emit.inputs["Strength"].default_value = 1.0
        links.new(emit.outputs["Emission"], out.inputs["Surface"])
    else:
        emit = None
        for node in material.node_tree.nodes:
            if node.type == "EMISSION":
                emit = node
        if emit is not None:
            emit.inputs["Color"].default_value = rgba
    return material


def put(obj, location=(0, 0, 0), rotation=(0, 0, 0), scale=(1, 1, 1), material=None):
    obj.location = location
    obj.rotation_euler = rotation
    obj.scale = scale
    if material is not None:
        if obj.data is not None and hasattr(obj.data, "materials"):
            obj.data.materials.clear()
            obj.data.materials.append(material)
    if obj.name not in bpy.context.collection.objects:
        bpy.context.collection.objects.link(obj)
    return obj


def build_packet(badge_rgba):
    bpy.ops.mesh.primitive_cube_add(size=1.0)
    put(bpy.context.active_object, location=(0, 0, -0.25), scale=(1.05, 0.28, 1.45),
        material=mat_flat("packet", CREAM))
    bpy.ops.mesh.primitive_cube_add(size=1.0)
    put(bpy.context.active_object, location=(0, -0.02, -0.85), scale=(1.05, 0.30, 0.28),
        material=mat_flat("band", BROWN))
    bpy.ops.mesh.primitive_cylinder_add(radius=0.42, depth=0.1)
    put(bpy.context.active_object, location=(0, -0.16, 0.05),
        rotation=(math.radians(90), 0, 0), material=mat_flat("badge", badge_rgba))
    bpy.ops.mesh.primitive_cylinder_add(radius=0.07, depth=0.55)
    put(bpy.context.active_object, location=(0, -0.24, 0.18), material=mat_flat("stem", STEM))
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.20, segments=16, ring_count=8)
    put(bpy.context.active_object, location=(-0.20, -0.24, 0.32), scale=(1.0, 0.4, 0.55),
        material=mat_flat("leaf", LEAF))
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.20, segments=16, ring_count=8)
    put(bpy.context.active_object, location=(0.20, -0.24, 0.32), scale=(1.0, 0.4, 0.55),
        material=mat_flat("leaf", LEAF))
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.09, segments=12, ring_count=6)
    put(bpy.context.active_object, location=(0, -0.24, 0.50), material=mat_flat("leaf", LEAF))


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    cam = bpy.data.objects.get("SH_Camera")
    if cam is not None:
        cam.select_set(False)
    bpy.ops.object.delete(use_global=False)


def setup_render(path, width=SIZE, height=SIZE):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.filepath = path
    if scene.world is None:
        scene.world = bpy.data.worlds.new("SH_World")
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get("Background")
    if bg is not None:
        bg.inputs["Color"].default_value = (0, 0, 0, 1.0)
        bg.inputs["Strength"].default_value = 0.0
    try:
        scene.eevee.taa_render_samples = 24
    except AttributeError:
        pass


def ensure_camera(location, rotation, scale):
    cam = bpy.data.objects.get("SH_Camera")
    if cam is None:
        cam_data = bpy.data.cameras.new("SH_Camera")
        cam = bpy.data.objects.new("SH_Camera", cam_data)
        bpy.context.collection.objects.link(cam)
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = scale
    cam.location = location
    cam.rotation_euler = rotation
    bpy.context.scene.camera = cam
    return cam


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for plant_id, _name, badge in SPECIES:
        clear_scene()
        ensure_camera((0, -6, 0.1), (math.radians(90), 0, 0), 3.0)
        build_packet(badge)
        path = os.path.join(OUT_DIR, "seed-%s.png" % plant_id)
        setup_render(os.path.abspath(path))
        bpy.ops.render.render(write_still=True)
        print("wrote " + path)

    clear_scene()
    ensure_camera((0, 0, 6), (0, 0, 0), 5.0)
    for i, (plant_id, _name, _badge) in enumerate(SPECIES):
        img_path = os.path.abspath(os.path.join(OUT_DIR, "seed-%s.png" % plant_id))
        img = bpy.data.images.load(img_path)
        img_mat = bpy.data.materials.new("SH_Sheet_%s" % plant_id)
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
        put(tile, location=((i - (len(SPECIES) - 1) / 2.0) * 1.4, 0, 0), scale=(1.2, 1.2, 1.2), material=img_mat)
    setup_render(os.path.abspath(os.path.join(OUT_DIR, "seeds-review.png")), 1024, 256)
    bpy.ops.render.render(write_still=True)
    print("wrote review sheet")
    bpy.ops.wm.save_as_mainfile(
        filepath=os.path.abspath(os.path.join(OUT_DIR, "seeds.blend")))
    print("saved seeds.blend")


main()
