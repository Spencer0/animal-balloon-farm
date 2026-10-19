"""Animal Balloon Farm: the salt lick the deer would rather have than your garden.

Run from repository root:
  blender --background --factory-startup --python art/blender/salt_lick.py

Regenerates public/assets/props/salt-lick.{blend,glb} and salt-lick-review.png.
Then run `prop_thumbs.py -- salt-lick` for the shop icon.

Authoring frame matches the other props: Z-up, resting on z = 0 and centred on
the origin in X/Y, one cell (2 m) across. A stout cedar stump holds a rounded
block of rosy salt with a licked hollow on top; a few salt crumbs sit at its
foot. No node is read by the game: deer find the lick by its placement (see
src/game/deer-raid.ts).
"""
from __future__ import annotations

import math
import os
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "public" / "assets" / "props"
OUTPUT.mkdir(parents=True, exist_ok=True)


def color_rgba(value: str):
    raw = value.lstrip("#")
    rgb = [int(raw[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    rgb = [c / 12.92 if c < .04045 else ((c + .055) / 1.055) ** 2.4 for c in rgb]
    return (*rgb, 1.0)


def make_material(name, value, roughness=.5, metallic=0.0, coat=.3):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color_rgba(value)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color_rgba(value)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Coat Weight"].default_value = coat
    shader.inputs["Coat Roughness"].default_value = .22
    return mat


def parent_local(obj, parent, location):
    if parent:
        obj.parent = parent
        obj.matrix_parent_inverse.identity()
    obj.location = location
    return obj


def smooth(obj):
    for face in obj.data.polygons:
        face.use_smooth = True


def sphere(name, location, scale, mat, parent=None, segments=20, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + " · mesh"
    obj.scale = scale
    obj.data.materials.append(mat)
    smooth(obj)
    return parent_local(obj, parent, location)


def box(name, location, dims, mat, parent=None, bevel=.08, segments=3):
    """A soft-cornered box; the bevel modifier is applied on export."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + " · mesh"
    obj.scale = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    modifier = obj.modifiers.new("soft edges", "BEVEL")
    modifier.width = bevel
    modifier.segments = segments
    modifier.limit_method = "NONE"
    obj.data.materials.append(mat)
    smooth(obj)
    return parent_local(obj, parent, location)


def cylinder(name, location, radius_bottom, radius_top, depth, mat, parent=None, segments=28, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=segments, radius1=radius_bottom, radius2=radius_top, depth=depth, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + " · mesh"
    obj.rotation_euler = rotation
    obj.data.materials.append(mat)
    smooth(obj)
    return parent_local(obj, parent, location)


def pivot(name, location, parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = .25
    return parent_local(obj, parent, location)


def clear_scene():
    bpy.context.scene.world = None
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in (bpy.data.meshes, bpy.data.curves, bpy.data.materials,
                       bpy.data.cameras, bpy.data.lights, bpy.data.worlds, bpy.data.actions):
        for block in list(collection):
            if block.users == 0:
                collection.remove(block)


def materials():
    return {
        "salt": make_material("SALT LICK · rosy rock salt", "#f2d6cf", .38, 0, .45),
        "saltLight": make_material("SALT LICK · pale salt crust", "#fbeee8", .32, 0, .5),
        "saltDeep": make_material("SALT LICK · licked pink hollow", "#e3aea6", .3, 0, .55),
        "wood": make_material("SALT LICK · cedar stump bark", "#8a5a3a", .7, 0, .1),
        "woodTop": make_material("SALT LICK · cut cedar rings", "#d8a76e", .6, 0, .15),
        "ring": make_material("SALT LICK · growth ring line", "#a8723f", .6, 0, .1),
        "rope": make_material("SALT LICK · twine", "#d9bf86", .7, 0, .1),
        "moss": make_material("SALT LICK · moss tuft", "#6e9a52", .7, 0, .1),
        "stageFloor": make_material("STAGE · buttercream floor", "#f6e6c6", .88, 0, .02),
        "stageBack": make_material("STAGE · mint studio backdrop", "#a6d8cf", .9, 0, .02),
    }


def stage():
    scene = bpy.context.scene
    forced = os.environ.get("ABF_RENDER_ENGINE")
    for engine in ([forced] if forced else ["BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "CYCLES"]):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    if scene.render.engine == "CYCLES":
        scene.cycles.device = "CPU"
        scene.cycles.samples = int(os.environ.get("ABF_CYCLES_SAMPLES", "48"))
        scene.cycles.use_denoising = True
    else:
        scene.eevee.taa_render_samples = 64
    scene.render.resolution_x, scene.render.resolution_y = 900, 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    for look in ("AgX - Medium High Contrast", "Medium High Contrast"):
        try:
            scene.view_settings.look = look
            break
        except TypeError:
            pass
    scene.view_settings.exposure = .2
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 8
    scene.world = bpy.data.worlds.new("Salt lick review · mint fairground morning")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = color_rgba("#b7dcd2")
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = .68


def build_stage(M, target_z, scale):
    bpy.ops.mesh.primitive_plane_add(size=300, location=(0, 0, 0))
    floor = bpy.context.object
    floor.name = "STAGE · buttercream floor"
    floor.data.materials.append(M["stageFloor"])
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 14, 8))
    backdrop = bpy.context.object
    backdrop.name = "STAGE · mint studio backdrop"
    backdrop.dimensions = (300, .25, 24)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    backdrop.data.materials.append(M["stageBack"])
    camera_data = bpy.data.cameras.new("STAGE · camera")
    camera = bpy.data.objects.new("STAGE · camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (5.2 * scale, -10 * scale, 4.4 * scale)
    camera.rotation_euler = (Vector((0, 0, target_z)) - Vector(camera.location)).to_track_quat("-Z", "Y").to_euler()
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 5.6 * scale
    bpy.context.scene.camera = camera
    for name, location, energy, size, tint in [
        ("STAGE LIGHT · warm key", (3, -9, 12), 2600, 8, (1.0, .93, .82)),
        ("STAGE LIGHT · cool fill", (-10, -4, 7), 1500, 8, (.76, .92, 1.0)),
        ("STAGE LIGHT · soft rim", (9, 5, 9), 1900, 7, (1.0, .82, .72)),
    ]:
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.shape = "DISK"
        data.size = size
        data.color = tint
        lamp = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(lamp)
        lamp.location = location
        lamp.rotation_euler = (Vector((0, 0, target_z)) - lamp.location).to_track_quat("-Z", "Y").to_euler()


def save_render_export(root, stem):
    scene = bpy.context.scene
    blend_path = OUTPUT / f"{stem}.blend"
    render_path = OUTPUT / f"{stem}-review.png"
    glb_path = OUTPUT / f"{stem}.glb"
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
        export_apply=True, export_animations=False, export_materials="EXPORT",
        export_cameras=False, export_lights=False, export_texcoords=False,
    )
    print(f"{stem} Blender source: {blend_path}")
    print(f"{stem} art review: {render_path}")
    print(f"{stem} GLB: {glb_path}")


def make_salt_lick(M):
    root = pivot("PROP SALT LICK · export root", (0, 0, 0))
    root["design_size"] = "1 cell, about 1.2 m tall: a cedar stump with a block of rosy salt on top"
    # The stump: a slightly flared trunk with a cut top and root knuckles.
    cylinder("SALT LICK · cedar stump", (0, 0, .36), .46, .38, .72, M["wood"], root, 28)
    cylinder("SALT LICK · cut stump top", (0, 0, .73), .38, .38, .04, M["woodTop"], root, 28)
    for index, radius in enumerate((.12, .24, .33)):
        cylinder(f"SALT LICK · growth ring {index + 1}", (0, 0, .752), radius, radius, .006, M["ring"], root, 24)
        cylinder(f"SALT LICK · ring gap {index + 1}", (0, 0, .754), radius - .025, radius - .025, .006, M["woodTop"], root, 24)
    for index in range(5):
        angle = index * math.tau / 5 + .3
        knuckle = sphere(f"SALT LICK · root knuckle {index + 1}", (math.cos(angle) * .44, math.sin(angle) * .44, .07), (.2, .11, .1), M["wood"], root, 14, 8)
        knuckle.rotation_euler[2] = angle
    # The salt: a chunky rounded block, a bit worn, with a licked hollow in the top.
    salt = pivot("SALT LICK · salt block", (0, 0, .76), root)
    salt.rotation_euler[2] = math.radians(14)
    box("SALT LICK · rosy salt block", (0, 0, .25), (.62, .54, .5), M["salt"], salt, .12, 3)
    box("SALT LICK · pale salt crust", (0, 0, .48), (.5, .42, .06), M["saltLight"], salt, .03, 2)
    sphere("SALT LICK · licked hollow", (.06, -.04, .515), (.17, .13, .035), M["saltDeep"], salt, 20, 10)
    sphere("SALT LICK · lick groove", (.2, -.08, .44), (.06, .12, .1), M["saltDeep"], salt, 14, 8).rotation_euler[2] = math.radians(20)
    # A twine tie round the block, knotted at the front, so it reads as set out on purpose.
    box("SALT LICK · twine band", (0, 0, .2), (.65, .57, .05), M["rope"], salt, .02, 2)
    sphere("SALT LICK · twine knot", (0, -.29, .2), (.06, .04, .06), M["rope"], salt, 12, 8)
    # Crumbs at the foot and a moss tuft on the stump's shoulder.
    for index, (x, y, s) in enumerate(((.55, -.3, .07), (.62, -.12, .05), (-.48, -.45, .06), (.1, -.62, .045), (-.62, .2, .05))):
        crumb = box(f"SALT LICK · salt crumb {index + 1}", (x, y, s * .6), (s * 1.4, s * 1.2, s), M["saltLight" if index % 2 else "salt"], root, s * .3, 1)
        crumb.rotation_euler[2] = math.radians(index * 33)
    sphere("SALT LICK · moss tuft", (-.3, -.24, .7), (.14, .1, .06), M["moss"], root, 14, 8)
    sphere("SALT LICK · moss tuft small", (.34, .2, .5), (.09, .06, .07), M["moss"], root, 12, 8)
    return root


clear_scene()
stage()
M = materials()
build_stage(M, .6, .45)
save_render_export(make_salt_lick(M), "salt-lick")
