"""Journal requirement icons: source, renders, review sheet.

Headless Blender authoring script for the Farm Journal (DOM redesign) progress
rows. Each requirement kind gets a small flat-shaded icon rendered with a
transparent background:

  tall-grass      grassArea conditions (cow, chicken, ...)
  pond-water      waterArea conditions (duck, goose, ...)
  open-pasture    flatArea conditions (sheep, ...)
  lily-pad        plantCount water-lily (frog)
  sprout          any other plantCount
  friend-paw      residentSpecies (pig wants a cow)
  balloon-bunting future bunting/string props + mockup parity
  circus-tent     stage 1 rows, which ask for nothing measurable

Run from the project root in PowerShell:

    blender --background --factory-startup --python art/blender/journal_icons.py

Regeneration command: clears the temporary in-memory scene per icon and
overwrites `public/assets/journal/*.png` (256x256, transparent), the contact
review sheet `journal-icons-review.png`, and the editable source
`journal-icons.blend` (kept on the final grid scene for inspection).

Framing: icons are modelled upright (Z up) and rendered from a front
orthographic camera on -Y, so blades rise, tents stand, and discs face the
viewer. Materials are unlit emission so the headless render needs no lamps.
"""

import math
import os

import bpy

OUT_DIR = os.path.join("public", "assets", "journal")
SIZE = 256
ICON_NAMES = [
    "tall-grass",
    "pond-water",
    "open-pasture",
    "lily-pad",
    "sprout",
    "friend-paw",
    "balloon-bunting",
    "circus-tent",
]


def mat_flat(name, rgba):
    key = "JI_" + name
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


def cone(name, r1, r2, depth, material, location, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(radius1=r1, radius2=r2, depth=depth)
    return put(bpy.context.active_object, location=location, rotation=rotation, material=material)


def disc(name, radius, depth, material, location):
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth)
    return put(bpy.context.active_object, location=location,
               rotation=(math.radians(90), 0, 0), material=material)


def ball(name, radius, material, location, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, segments=20, ring_count=12)
    return put(bpy.context.active_object, location=location, scale=scale, material=material)


def cube(name, material, location, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_cube_add(size=1.0)
    return put(bpy.context.active_object, location=location, scale=scale, material=material)


GREEN_D = (0.22, 0.52, 0.22, 1.0)
GREEN = (0.35, 0.68, 0.30, 1.0)
GREEN_L = (0.52, 0.80, 0.38, 1.0)
BLUE_D = (0.20, 0.50, 0.80, 1.0)
BLUE = (0.30, 0.64, 0.90, 1.0)
BLUE_L = (0.62, 0.85, 0.97, 1.0)
CREAM = (0.96, 0.89, 0.74, 1.0)
BROWN = (0.45, 0.30, 0.20, 1.0)
RED = (0.89, 0.34, 0.30, 1.0)
YELLOW = (0.95, 0.76, 0.31, 1.0)
TEAL = (0.31, 0.70, 0.66, 1.0)
PINK = (0.95, 0.55, 0.62, 1.0)
WHITE = (1.0, 1.0, 1.0, 1.0)


def build_tall_grass():
    g1 = mat_flat("grass1", GREEN)
    g2 = mat_flat("grass2", GREEN_L)
    g3 = mat_flat("grass3", GREEN_D)
    blades = [(-0.7, 1.4, 0.25, g1), (-0.35, 1.9, 0.1, g2), (0.0, 1.6, -0.12, g3),
              (0.35, 2.0, -0.25, g1), (0.7, 1.5, -0.35, g2)]
    for i, (x, h, tilt, m) in enumerate(blades):
        cone("blade%d" % i, 0.13, 0.02, h, m, (x, 0, h / 2 - 0.9), (0, tilt, 0))
    ball("mound", 0.8, mat_flat("soil", BROWN), (0, 0, -0.95), (1.2, 0.8, 0.35))


def build_pond_water():
    disc("pond", 1.1, 0.28, mat_flat("water", BLUE), (0, 0, -0.2))
    disc("inner", 0.78, 0.30, mat_flat("waterlight", BLUE_L), (0, 0, -0.19))
    ball("glint", 0.22, mat_flat("glint", WHITE), (-0.35, -0.18, 0.0), (1.4, 0.5, 0.7))
    ball("drop", 0.16, mat_flat("drop", BLUE_D), (0.45, -0.15, 0.35))
    cone("dropTop", 0.0, 0.10, 0.35, mat_flat("drop", BLUE_D), (0.45, -0.15, 0.6))


def build_open_pasture():
    cube("field", mat_flat("field", GREEN), (0, 0, -0.35), (2.2, 0.3, 1.2))
    for i, x in enumerate((-0.62, 0.0, 0.62)):
        cube("stripe%d" % i, mat_flat("stripe", GREEN_L), (x, -0.01, -0.35), (0.36, 0.32, 1.2))
    ball("sun", 0.3, mat_flat("sun", YELLOW), (0.62, -0.1, 0.72))


def build_lily_pad():
    disc("pad", 0.95, 0.12, mat_flat("pad", GREEN_D), (0, 0, -0.3))
    disc("padtop", 0.8, 0.13, mat_flat("padtop", GREEN), (0, 0, -0.29))
    for i in range(5):
        a = math.radians(i * 72.0)
        ball("petal%d" % i, 0.16, mat_flat("petal", PINK),
             (math.cos(a) * 0.24, -0.12, 0.28 + math.sin(a) * 0.1), (1, 0.6, 1))
    ball("heart", 0.12, mat_flat("heart", YELLOW), (0, -0.12, 0.3))


def build_sprout():
    bpy.ops.mesh.primitive_cylinder_add(radius=0.07, depth=1.3)
    put(bpy.context.active_object, location=(0, 0, -0.2), material=mat_flat("stem", GREEN_D))
    ball("leafL", 0.42, mat_flat("leaf", GREEN), (-0.45, 0, 0.15), (1.0, 0.35, 0.45))
    ball("leafR", 0.42, mat_flat("leaf", GREEN), (0.45, 0, 0.35), (1.0, 0.35, 0.45))
    ball("bud", 0.14, mat_flat("bud", GREEN_L), (0, 0, 0.55))
    ball("soil", 0.55, mat_flat("soil", BROWN), (0, 0, -0.9), (1.3, 0.9, 0.35))


def build_friend_paw():
    ball("pad", 0.5, mat_flat("paw", CREAM), (0, 0, -0.35), (1.0, 1.0, 0.55))
    for i, x in enumerate((-0.5, 0.0, 0.5)):
        ball("toe%d" % i, 0.2, mat_flat("paw", CREAM), (x, 0, 0.25))
    ball("heart", 0.16, mat_flat("heartred", RED), (0.48, 0, 0.35), (1, 1, 0.7))


def build_balloon_bunting():
    bpy.ops.mesh.primitive_cylinder_add(radius=0.03, depth=2.2)
    put(bpy.context.active_object, location=(0, 0, 0.8),
        rotation=(0, math.radians(90), 0), material=mat_flat("string", BROWN))
    for i, (x, m) in enumerate([(-0.7, RED), (0.0, YELLOW), (0.7, TEAL)]):
        mat = mat_flat("balloon%d" % i, m)
        ball("balloon%d" % i, 0.32, mat, (x, 0, 0.25), (1, 1, 1.15))
        cone("knot%d" % i, 0.05, 0.0, 0.12, mat, (x, 0, 0.62))
        bpy.ops.mesh.primitive_cylinder_add(radius=0.015, depth=0.35)
        put(bpy.context.active_object, location=(x, 0, 0.6),
            material=mat_flat("string", BROWN))


def build_circus_tent():
    bpy.ops.mesh.primitive_cylinder_add(radius=0.9, depth=0.55)
    put(bpy.context.active_object, location=(0, 0, -0.55), material=mat_flat("canvas", CREAM))
    cone("roof", 1.05, 0.02, 1.1, mat_flat("roof", RED), (0, 0, 0.25))
    bpy.ops.mesh.primitive_cylinder_add(radius=0.05, depth=1.9)
    put(bpy.context.active_object, location=(0, 0, 0.0), material=mat_flat("pole", BROWN))
    cube("flag", mat_flat("flag", YELLOW), (0.28, 0, 1.05), (0.5, 0.04, 0.28))
    disc("door", 0.28, 0.6, mat_flat("door", BROWN), (0, 0, -0.55))


BUILDERS = {
    "tall-grass": build_tall_grass,
    "pond-water": build_pond_water,
    "open-pasture": build_open_pasture,
    "lily-pad": build_lily_pad,
    "sprout": build_sprout,
    "friend-paw": build_friend_paw,
    "balloon-bunting": build_balloon_bunting,
    "circus-tent": build_circus_tent,
}


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    cam = bpy.data.objects.get("JI_Camera")
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
        scene.world = bpy.data.worlds.new("JI_World")
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
    cam = bpy.data.objects.get("JI_Camera")
    if cam is None:
        cam_data = bpy.data.cameras.new("JI_Camera")
        cam = bpy.data.objects.new("JI_Camera", cam_data)
        bpy.context.collection.objects.link(cam)
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = scale
    cam.location = location
    cam.rotation_euler = rotation
    bpy.context.scene.camera = cam
    return cam


FRONT = ((0, -6, 0.2), (math.radians(90), 0, 0), 3.6)
TOP = ((0, 0, 6), (0, 0, 0), 6.0)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for name in ICON_NAMES:
        clear_scene()
        ensure_camera(*FRONT)
        BUILDERS[name]()
        path = os.path.join(OUT_DIR, "journal-icon-%s.png" % name)
        setup_render(os.path.abspath(path))
        bpy.ops.render.render(write_still=True)
        print("wrote " + path)

    clear_scene()
    ensure_camera(*TOP)
    for i, name in enumerate(ICON_NAMES):
        img_path = os.path.abspath(os.path.join(OUT_DIR, "journal-icon-%s.png" % name))
        img = bpy.data.images.load(img_path)
        img_mat = bpy.data.materials.new("JI_Sheet_%s" % name)
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
        col = i % 4
        row = i // 4
        put(tile, location=((col - 1.5) * 1.3, (0.5 - row) * 1.3, 0), material=img_mat)
    setup_render(os.path.abspath(os.path.join(OUT_DIR, "journal-icons-review.png")), 1024, 512)
    bpy.ops.render.render(write_still=True)
    print("wrote review sheet")
    bpy.ops.wm.save_as_mainfile(
        filepath=os.path.abspath(os.path.join(OUT_DIR, "journal-icons.blend")))
    print("saved journal-icons.blend")


main()
