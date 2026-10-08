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


def to_linear(rgba):
    """The palette above is written as sRGB; Blender colour sockets are linear."""
    return tuple(c ** 2.2 for c in rgba[:3]) + (rgba[3],)


def mat_flat(name, rgba):
    rgba = to_linear(rgba)
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


def shade(rgba, factor):
    return (min(1.0, rgba[0] * factor), min(1.0, rgba[1] * factor), min(1.0, rgba[2] * factor), 1.0)


def blob(location, scale, material, rotation=(0, 0, 0), segments=16, rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1.0, segments=segments, ring_count=rings)
    return put(bpy.context.active_object, location=location, rotation=rotation, scale=scale, material=material)


def petals(count, ring, size, material, y, centre=(0.0, 0.0), start=90.0):
    """Petals fanned around a point, in the XZ plane facing the camera."""
    for index in range(count):
        angle = math.radians(start + index * 360.0 / count)
        x = centre[0] + math.cos(angle) * ring
        z = centre[1] + math.sin(angle) * ring
        # Rotating about Y turns the blob's long Z axis to point along the petal.
        blob((x, y, z), size, material, rotation=(0, math.radians(90.0 - math.degrees(angle) + 90.0 - 90.0), 0))


def build_motif(plant_id, badge_rgba, y):
    """One simple drawing per species, so a packet says what is inside it."""
    deep = mat_flat("deep_" + plant_id, shade(badge_rgba, 0.62))
    mid = mat_flat("mid_" + plant_id, badge_rgba)
    light = mat_flat("light_" + plant_id, shade(badge_rgba, 1.18))
    leaf = mat_flat("leaf", LEAF)
    if plant_id == "clover":
        for dx, dz in ((0.0, 0.2), (-0.18, 0.02), (0.18, 0.02)):
            blob((dx, y, -0.12 + dz), (0.17, 0.04, 0.17), mid)
            blob((dx, y - 0.02, -0.12 + dz), (0.1, 0.03, 0.1), light)
        bpy.ops.mesh.primitive_cylinder_add(radius=0.03, depth=0.28)
        put(bpy.context.active_object, location=(0.02, y, -0.34), rotation=(0, math.radians(14), 0), material=deep)
    elif plant_id == "dandelion":
        petals(12, 0.2, (0.05, 0.03, 0.15), mid, y, centre=(0, -0.08))
        blob((0, y - 0.02, -0.08), (0.14, 0.04, 0.14), deep)
        blob((0, y - 0.04, -0.08), (0.08, 0.03, 0.08), light)
    elif plant_id == "poppy":
        for dx, dz in ((-0.15, -0.02), (0.15, -0.02), (-0.1, -0.2), (0.1, -0.2)):
            blob((dx, y, -0.02 + dz), (0.2, 0.04, 0.2), mid)
        blob((0, y - 0.03, -0.14), (0.09, 0.04, 0.09), mat_flat("poppy_eye", (0.22, 0.14, 0.14, 1.0)))
    else:
        blob((0, y, -0.34), (0.42, 0.03, 0.1), leaf)
        petals(8, 0.2, (0.075, 0.03, 0.2), mid, y - 0.01, centre=(0, -0.02))
        petals(5, 0.11, (0.065, 0.03, 0.13), light, y - 0.03, centre=(0, -0.02), start=54.0)
        blob((0, y - 0.05, -0.02), (0.07, 0.03, 0.07), mat_flat("lily_eye", (0.98, 0.82, 0.3, 1.0)))


def build_packet(plant_id, badge_rgba):
    """A plump seed packet, upright and centred on the origin."""
    cream = mat_flat("packet", CREAM)
    cream_shade = mat_flat("packet_shade", shade(CREAM, 0.86))
    header = mat_flat("header", badge_rgba)
    header_shade = mat_flat("header_shade", shade(badge_rgba, 0.74))
    # Body, with a softly rounded edge.
    bpy.ops.mesh.primitive_cube_add(size=1.0)
    body = put(bpy.context.active_object, location=(0, 0, 0), scale=(1.3, 0.16, 1.78), material=cream)
    bevel = body.modifiers.new("soft", "BEVEL")
    bevel.width = 0.07
    bevel.segments = 3
    # Crimped top: a darker strip with scalloped teeth.
    bpy.ops.mesh.primitive_cube_add(size=1.0)
    put(bpy.context.active_object, location=(0, -0.03, 0.82), scale=(1.3, 0.2, 0.2), material=cream_shade)
    for index in range(9):
        x = -0.56 + index * 0.14
        blob((x, -0.14, 0.9), (0.065, 0.05, 0.07), cream_shade, segments=10, rings=6)
    # Header band in the species colour.
    bpy.ops.mesh.primitive_cube_add(size=1.0)
    put(bpy.context.active_object, location=(0, -0.09, 0.56), scale=(1.3, 0.18, 0.3), material=header)
    bpy.ops.mesh.primitive_cube_add(size=1.0)
    put(bpy.context.active_object, location=(0, -0.11, 0.405), scale=(1.3, 0.18, 0.04), material=header_shade)
    # Picture window: a ring around the motif.
    bpy.ops.mesh.primitive_cylinder_add(radius=0.55, depth=0.06, vertices=40)
    put(bpy.context.active_object, location=(0, -0.1, -0.12), rotation=(math.radians(90), 0, 0), material=header_shade)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.49, depth=0.07, vertices=40)
    put(bpy.context.active_object, location=(0, -0.11, -0.12), rotation=(math.radians(90), 0, 0), material=mat_flat("window", shade(CREAM, 1.04)))
    build_motif(plant_id, badge_rgba, -0.2)
    # Label strip with a few seeds along the bottom.
    bpy.ops.mesh.primitive_cube_add(size=1.0)
    put(bpy.context.active_object, location=(0, -0.1, -0.74), scale=(1.0, 0.18, 0.2), material=mat_flat("band", BROWN))
    for index, x in enumerate((-0.28, 0.0, 0.28)):
        blob((x, -0.2, -0.74), (0.07, 0.04, 0.045), mat_flat("seedbit", shade(CREAM, 0.95)), rotation=(0, math.radians(20 - index * 20), 0), segments=10, rings=6)


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
    # Standard keeps the flat colours as authored; AgX washed them to grey.
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
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
        ensure_camera((0, -6, 0.0), (math.radians(90), 0, 0), 2.35)
        build_packet(plant_id, badge)
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
