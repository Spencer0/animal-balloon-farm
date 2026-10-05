"""Balloon nav icons: source, renders, review sheet.

Headless Blender authoring for the balloon radial launcher (feature
balloon-ui). Four icon-only quadrant badges plus the red balloon-person
player avatar, transparent background, flat emission materials matching the
shed/journal icon look.

Run from the project root in PowerShell:

    blender --background --factory-startup --python art/blender/balloon_nav_icons.py

Regeneration command: overwrites public/assets/ui/nav-<id>.png
(256x256, transparent), the contact sheet nav-review.png, and the editable
source nav-icons.blend. Icons are modelled upright (Z up) and rendered from
a front orthographic camera with unlit emission materials.
"""

import math
import os

import bpy

OUT_DIR = os.path.join("public", "assets", "ui")
SIZE = 256

CREAM = (0.96, 0.90, 0.76, 1.0)
BROWN = (0.45, 0.30, 0.20, 1.0)
DARK = (0.20, 0.12, 0.08, 1.0)
TERRA = (0.78, 0.35, 0.23, 1.0)
RED = (0.80, 0.20, 0.16, 1.0)
RED_DARK = (0.55, 0.12, 0.10, 1.0)
LEATHER = (0.55, 0.36, 0.20, 1.0)
GILT = (0.85, 0.64, 0.30, 1.0)
WHITE = (1.0, 1.0, 1.0, 1.0)


def mat_flat(name, rgba):
    key = "BN_" + name
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
        for node in material.node_tree.nodes:
            if node.type == "EMISSION":
                node.inputs["Color"].default_value = rgba
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


def face_onto(head_pos, head_r):
    dark = mat_flat("ink", DARK)
    white = mat_flat("catch", WHITE)
    for sx in (-1.0, 1.0):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.085, segments=12, ring_count=6)
        put(bpy.context.active_object,
            location=(head_pos[0] + sx * 0.20, head_pos[1] - 0.40, head_pos[2] + 0.11),
            material=dark)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.032, segments=8, ring_count=4)
        put(bpy.context.active_object,
            location=(head_pos[0] + sx * 0.175, head_pos[1] - 0.47, head_pos[2] + 0.15),
            material=white)


def build_journal():
    cover = mat_flat("cover", TERRA)
    page = mat_flat("page", CREAM)
    spine = mat_flat("spine", BROWN)
    for sx in (-1.0, 1.0):
        bpy.ops.mesh.primitive_cube_add(size=1.0)
        put(bpy.context.active_object, location=(sx * 0.40, 0.10, 0.0),
            rotation=(0, 0, -sx * 0.30), scale=(0.80, 0.14, 1.10), material=cover)
        bpy.ops.mesh.primitive_cube_add(size=1.0)
        put(bpy.context.active_object, location=(sx * 0.38, -0.06, 0.02),
            rotation=(0, 0, -sx * 0.30), scale=(0.72, 0.12, 1.00), material=page)
    bpy.ops.mesh.primitive_cube_add(size=1.0)
    put(bpy.context.active_object, location=(0, -0.02, 0.0), scale=(0.14, 0.30, 1.02), material=spine)

def build_shed():
    wall = mat_flat("wall", BROWN)
    roof = mat_flat("roof", TERRA)
    door = mat_flat("door", DARK)
    trim = mat_flat("trim", CREAM)
    bpy.ops.mesh.primitive_cube_add(size=1.0)
    put(bpy.context.active_object, location=(0, 0, -0.15), scale=(1.5, 1.1, 1.1), material=wall)
    for sx in (-1.0, 1.0):
        bpy.ops.mesh.primitive_cube_add(size=1.0)
        put(bpy.context.active_object, location=(sx * 0.42, 0, 0.78),
            rotation=(0, sx * math.radians(38), 0), scale=(1.05, 1.15, 0.14), material=roof)
    bpy.ops.mesh.primitive_cube_add(size=1.0)
    put(bpy.context.active_object, location=(0, -0.56, -0.25), scale=(0.55, 0.06, 0.85), material=door)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.14, segments=12, ring_count=6)
    put(bpy.context.active_object, location=(0, -0.56, 0.42), scale=(1.0, 0.4, 1.0), material=trim)


def build_player():
    body = mat_flat("red", RED)
    dark = mat_flat("reddark", RED_DARK)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.62, segments=24, ring_count=12)
    put(bpy.context.active_object, location=(0, 0, -0.55), scale=(1.0, 0.85, 1.15), material=body)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.48, segments=24, ring_count=12)
    put(bpy.context.active_object, location=(0, 0, 0.55), material=body)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.16, segments=12, ring_count=6)
    put(bpy.context.active_object, location=(0, 0, 1.10), scale=(1.0, 1.0, 1.4), material=dark)
    for sx in (-1.0, 1.0):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.16, segments=12, ring_count=6)
        put(bpy.context.active_object, location=(sx * 0.52, 0, 0.62), scale=(1.3, 0.8, 1.0), material=body)
    face_onto((0, 0, 0.55), 0.48)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.16, minor_radius=0.045)
    put(bpy.context.active_object, location=(0, -0.42, 0.40), rotation=(math.radians(100), 0, 0), material=dark)


def build_post():
    wood = mat_flat("wood", LEATHER)
    box = mat_flat("box", BROWN)
    flag = mat_flat("flag", RED)
    gilt = mat_flat("gilt", GILT)
    bpy.ops.mesh.primitive_cube_add(size=1.0)
    put(bpy.context.active_object, location=(-0.45, 0, -0.45), scale=(0.16, 0.16, 1.3), material=wood)
    bpy.ops.mesh.primitive_cube_add(size=1.0)
    put(bpy.context.active_object, location=(0.1, 0, 0.30), scale=(1.0, 0.62, 0.55), material=box)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.31, depth=1.0, vertices=16)
    put(bpy.context.active_object, location=(0.1, 0, 0.58), rotation=(0, math.radians(90), 0), material=box)
    bpy.ops.mesh.primitive_cube_add(size=1.0)
    put(bpy.context.active_object, location=(0.1, -0.36, 0.55), scale=(0.10, 0.10, 0.55), material=gilt)
    bpy.ops.mesh.primitive_cube_add(size=1.0)
    put(bpy.context.active_object, location=(0.1, -0.36, 0.85), scale=(0.34, 0.08, 0.22), material=flag)


BUILDERS = {
    "nav-journal": build_journal,
    "nav-shed": build_shed,
    "nav-player": build_player,
    "nav-post": build_post,
}


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    cam = bpy.data.objects.get("BN_Camera")
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
        scene.world = bpy.data.worlds.new("BN_World")
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
    cam = bpy.data.objects.get("BN_Camera")
    if cam is None:
        cam_data = bpy.data.cameras.new("BN_Camera")
        cam = bpy.data.objects.new("BN_Camera", cam_data)
        bpy.context.collection.objects.link(cam)
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = scale
    cam.location = location
    cam.rotation_euler = rotation
    bpy.context.scene.camera = cam
    return cam


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for icon_id in ("nav-journal", "nav-shed", "nav-player", "nav-post"):
        clear_scene()
        ensure_camera((0, -6, 0.3), (math.radians(90), 0, 0), 3.6)
        BUILDERS[icon_id]()
        path = os.path.join(OUT_DIR, "%s.png" % icon_id)
        setup_render(os.path.abspath(path))
        bpy.ops.render.render(write_still=True)
        print("wrote " + path)

    clear_scene()
    ensure_camera((0, 0, 6), (0, 0, 0), 9.0)
    for i, icon_id in enumerate(("nav-journal", "nav-shed", "nav-player", "nav-post")):
        img_path = os.path.abspath(os.path.join(OUT_DIR, "%s.png" % icon_id))
        img = bpy.data.images.load(img_path)
        img_mat = bpy.data.materials.new("BN_Sheet_%s" % icon_id)
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
        put(tile, location=((i - 1.5) * 2.0, 0, 0), scale=(1.7, 1.7, 1.7), material=img_mat)
    setup_render(os.path.abspath(os.path.join(OUT_DIR, "nav-review.png")), 1024, 256)
    bpy.ops.render.render(write_still=True)
    print("wrote review sheet")
    bpy.ops.wm.save_as_mainfile(
        filepath=os.path.abspath(os.path.join(OUT_DIR, "nav-icons.blend")))
    print("saved nav-icons.blend")


main()
