"""Circus shed launcher sprite: source, render, review.

Headless Blender authoring script for the Shed inventory launcher. A cute
storybook garden shed with circus flair (cream plaster, red timber trim,
pyramid shingle roof, bunting, glowing lantern), rendered front three-quarter
as a transparent PNG billboard for the 3D launcher in `src/ui/shed-panel.ts`.

Run from the project root in PowerShell:

    blender --background --factory-startup --python art/blender/shed_launcher.py

Regeneration command: overwrites `public/assets/ui/shed-launcher.png`
(512x512, transparent), the cream-backdrop `shed-launcher-review.png`, and the
editable source `public/assets/ui/shed-launcher.blend`. Modelled upright
(Z up), unlit emission materials, orthographic camera.
"""

import math
import os

import bpy
from mathutils import Vector

OUT_DIR = os.path.join("public", "assets", "ui")
SIZE = 512

CREAM = (0.96, 0.90, 0.76, 1.0)
RED = (0.78, 0.30, 0.22, 1.0)
DARKRED = (0.55, 0.20, 0.15, 1.0)
WOOD = (0.45, 0.30, 0.20, 1.0)
DARKWOOD = (0.30, 0.19, 0.12, 1.0)
GOLD = (0.95, 0.72, 0.28, 1.0)
TEAL = (0.35, 0.64, 0.63, 1.0)
GLASS = (0.25, 0.32, 0.38, 1.0)
LANTERN = (1.0, 0.82, 0.45, 1.0)


def mat_flat(name, rgba):
    key = "SHED_" + name
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
    if material is not None and obj.data is not None and hasattr(obj.data, "materials"):
        obj.data.materials.clear()
        obj.data.materials.append(material)
    if obj.name not in bpy.context.collection.objects:
        bpy.context.collection.objects.link(obj)
    return obj


def box(location, scale, material, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0)
    return put(bpy.context.active_object, location=location, rotation=rotation,
               scale=scale, material=material)


def build_shed():
    cream = mat_flat("cream", CREAM)
    red = mat_flat("red", RED)
    darkred = mat_flat("darkred", DARKRED)
    wood = mat_flat("wood", WOOD)
    darkwood = mat_flat("darkwood", DARKWOOD)
    gold = mat_flat("gold", GOLD)
    teal = mat_flat("teal", TEAL)
    glass = mat_flat("glass", GLASS)
    lantern = mat_flat("lantern", LANTERN)

    box((0, 0, 1.3), (3.2, 2.6, 2.6), cream)
    box((0, 0, 0.12), (3.5, 2.9, 0.24), darkwood)
    for x in (-1.62, 1.62):
        box((x, 1.28, 1.3), (0.22, 0.14, 2.7), red)
        box((x, -1.28, 1.3), (0.22, 0.14, 2.7), red)
    box((0, 1.30, 2.68), (3.5, 0.14, 0.22), red)

    bpy.ops.mesh.primitive_cone_add(radius1=2.55, radius2=0.02, depth=1.7, vertices=4)
    put(bpy.context.active_object, location=(0, 0, 3.45),
        rotation=(0, 0, math.radians(45)), scale=(1.0, 0.86, 1.0), material=red)
    box((0, 0, 2.62), (3.62, 3.02, 0.16), darkwood)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.16, segments=12, ring_count=6)
    put(bpy.context.active_object, location=(0, 0, 4.42), material=gold)
    box((0, 0, 4.22), (0.1, 0.1, 0.3), darkwood)

    box((0, 1.30, 1.05), (0.9, 0.12, 1.7), darkwood)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.45, depth=0.12)
    put(bpy.context.active_object, location=(0, 1.30, 1.9),
        rotation=(math.radians(90), 0, 0), material=darkwood)
    box((-0.52, 1.31, 1.0), (0.12, 0.1, 1.8), wood)
    box((0.52, 1.31, 1.0), (0.12, 0.1, 1.8), wood)
    box((0, 1.31, 2.42), (1.16, 0.1, 0.14), wood)
    box((0, 1.38, 0.5), (0.1, 0.06, 0.1), gold)

    bpy.ops.mesh.primitive_torus_add(major_radius=0.42, minor_radius=0.11)
    put(bpy.context.active_object, location=(-0.95, 1.30, 1.75),
        rotation=(0, 0, 0), material=cream)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.40, depth=0.08)
    put(bpy.context.active_object, location=(-0.95, 1.28, 1.75),
        rotation=(math.radians(90), 0, 0), material=glass)
    box((-0.95, 1.30, 1.75), (0.08, 0.1, 0.8), cream)
    box((-0.95, 1.30, 1.75), (0.8, 0.1, 0.08), cream)

    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.17, segments=12, ring_count=6)
    put(bpy.context.active_object, location=(1.05, 1.38, 1.7), material=lantern)
    box((1.05, 1.38, 1.92), (0.2, 0.2, 0.08), darkwood)
    box((1.05, 1.38, 1.5), (0.06, 0.06, 0.22), darkwood)

    flag_mats = [red, gold, teal]
    for i in range(7):
        t = i / 6.0
        x = -1.5 + t * 3.0
        sag = math.sin(t * math.pi) * -0.22
        bpy.ops.mesh.primitive_cone_add(radius1=0.13, radius2=0.0, depth=0.3, vertices=3)
        put(bpy.context.active_object, location=(x, 1.55, 2.10 + sag),
            rotation=(math.radians(180), 0, math.radians(90)),
            material=flag_mats[i % 3])


def setup_render(path, width, height, transparent):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = transparent
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.filepath = path
    if scene.world is None:
        scene.world = bpy.data.worlds.new("SHED_World")
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get("Background")
    if bg is not None:
        if transparent:
            bg.inputs["Color"].default_value = (0, 0, 0, 1.0)
            bg.inputs["Strength"].default_value = 0.0
        else:
            bg.inputs["Color"].default_value = (0.98, 0.95, 0.89, 1.0)
            bg.inputs["Strength"].default_value = 1.0
    try:
        scene.eevee.taa_render_samples = 32
    except AttributeError:
        pass


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    build_shed()

    cam_data = bpy.data.cameras.new("SHED_Camera")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 6.2
    cam = bpy.data.objects.new("SHED_Camera", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = (5.2, 7.0, 3.2)
    cam.rotation_euler = (Vector((0, 0, 1.6)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam

    setup_render(os.path.abspath(os.path.join(OUT_DIR, "shed-launcher.png")), SIZE, SIZE, True)
    bpy.ops.render.render(write_still=True)
    print("wrote shed-launcher.png")

    setup_render(os.path.abspath(os.path.join(OUT_DIR, "shed-launcher-review.png")), 512, 512, False)
    bpy.ops.render.render(write_still=True)
    print("wrote shed-launcher-review.png")

    bpy.ops.wm.save_as_mainfile(
        filepath=os.path.abspath(os.path.join(OUT_DIR, "shed-launcher.blend")))
    print("saved shed-launcher.blend")


main()
