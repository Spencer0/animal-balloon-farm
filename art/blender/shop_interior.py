"""Animal Balloon Farm: the storefront screen's counter, shelf and crate.

Run from repository root:
  blender --background --factory-startup --python art/blender/shop_interior.py

Regenerates public/assets/ui/shop-interior.blend, shop-interior-review.png and
three UI prop GLBs: ui-counter.glb, ui-shelf.glb, ui-crate.glb. The storefront
screen composes them through the same `requestUIProp` pipeline the menu's
signboard uses, so the shop's furniture is carved woodwork like every other
surface in the game.

A separate script from `ui_props.py` on purpose: that generator regenerates all
four approved props in one destructive run, and the pipeline rule is not to
re-run a generator over art you did not intend to rebuild.

Orientation convention matches `ui_props.py`: authored standing, width along +X,
height along +Z, thickness along Y with the painted face toward -Y. The glTF
Z-up to Y-up conversion lands the prop with width +X, height +Y and the face
toward +Z, which is what the orthographic UI layer wants.

Verify with `node scripts/inspect-glb.mjs public/assets/ui/ui-counter.glb`.
"""
from __future__ import annotations

import math
import random
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "public" / "assets" / "ui"
OUTPUT.mkdir(parents=True, exist_ok=True)
random.seed(20463)

FACE = -1.0


def color_rgba(value: str):
    raw = value.lstrip("#")
    rgb = [int(raw[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    rgb = [c / 12.92 if c < .04045 else ((c + .055) / 1.055) ** 2.4 for c in rgb]
    return (*rgb, 1.0)


def make_material(name, value, roughness=.62, metallic=0.0, coat=.12):
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


def add_wood_grain(mat, dark, light, scale=3.2, distortion=7.5, detail=3.0):
    tree = mat.node_tree
    shader = tree.nodes.get("Principled BSDF")
    coord = tree.nodes.new("ShaderNodeTexCoord")
    mapping = tree.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (1.0, scale, 1.0)
    noise = tree.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Distortion"].default_value = distortion
    noise.inputs["Detail"].default_value = detail
    ramp = tree.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = .34
    ramp.color_ramp.elements[0].color = color_rgba(dark)
    ramp.color_ramp.elements[1].position = .66
    ramp.color_ramp.elements[1].color = color_rgba(light)
    tree.links.new(coord.outputs["Object"], mapping.inputs["Vector"])
    tree.links.new(mapping.outputs["Vector"], noise.inputs["Vector"])
    tree.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    tree.links.new(ramp.outputs["Color"], shader.inputs["Base Color"])
    return mat


def flatten_material_colours():
    """Fall the procedural Base Color back to its flat tone before export.

    glTF cannot carry a noise-to-ramp node graph, so a linked Base Color exports
    white; the counter and shelf would arrive in the game as blank plaster. The
    .blend and the review render keep the grain, only the runtime GLB flattens.
    """
    for mat in bpy.data.materials:
        if not mat.use_nodes or mat.node_tree is None:
            continue
        shader = mat.node_tree.nodes.get("Principled BSDF")
        if shader is None:
            continue
        socket = shader.inputs["Base Color"]
        if not socket.is_linked:
            continue
        for link in list(socket.links):
            mat.node_tree.links.remove(link)
        socket.default_value = mat.diffuse_color


def parent_local(obj, parent, location):
    if parent:
        obj.parent = parent
        obj.matrix_parent_inverse.identity()
        obj.location = location
    else:
        obj.location = location
    return obj


def box(name, dimensions, location, mat, parent=None, bevel=0.0, segments=4, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + " · mesh"
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0.0:
        mod = obj.modifiers.new("soft carved edge", "BEVEL")
        mod.width = min(bevel, min(dimensions) * .45)
        mod.segments = segments
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(30)
    if any(rotation):
        obj.rotation_euler = rotation
    obj.data.materials.append(mat)
    return parent_local(obj, parent, location)


def sphere(name, location, scale, mat, parent=None, segments=24, rings=18):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + " · mesh"
    obj.scale = scale
    obj.data.materials.append(mat)
    for face in obj.data.polygons:
        face.use_smooth = True
    return parent_local(obj, parent, location)


def cylinder(name, location, radius, depth, mat, parent=None, axis="Z", segments=28, bevel=0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=segments, radius=radius, depth=depth, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + " · mesh"
    if bevel > 0.0:
        mod = obj.modifiers.new("rounded rim", "BEVEL")
        mod.width = bevel
        mod.segments = 3
        mod.limit_method = "ANGLE"
    obj.data.materials.append(mat)
    for face in obj.data.polygons:
        face.use_smooth = len(face.vertices) == 4
    parent_local(obj, parent, location)
    if axis == "Y":
        obj.rotation_euler = (math.radians(90), 0, 0)
    elif axis == "X":
        obj.rotation_euler = (0, math.radians(90), 0)
    return obj


def pivot(name, location, parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = .2
    if parent:
        obj.parent = parent
        obj.matrix_parent_inverse.identity()
    obj.location = location
    return obj


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for collection in (bpy.data.meshes, bpy.data.curves, bpy.data.materials,
                   bpy.data.cameras, bpy.data.lights, bpy.data.worlds, bpy.data.actions):
    for block in list(collection):
        if block.users == 0:
            collection.remove(block)

M = {
    "wood": add_wood_grain(make_material("UI · weathered barn wood", "#b07a4e", .74, 0, .06), "#8a5734", "#c99464"),
    "woodDark": add_wood_grain(make_material("UI · dark stained post", "#7d4f30", .78, 0, .04), "#5d3822", "#96663f"),
    "cream": make_material("UI · buttercream painted face", "#fbf0d6", .66, 0, .18),
    "red": make_material("UI · barn red trim", "#c4483c", .55, 0, .24),
    "green": make_material("UI · meadow green trim", "#5c8f52", .58, 0, .2),
    "gold": make_material("UI · carnival brass", "#e8b657", .28, .62, .3),
    "iron": make_material("UI · aged iron bolt", "#5b5148", .42, .7, .1),
    "stageFloor": make_material("STAGE · buttercream floor", "#f6e6c6", .88, 0, .02),
    "stageBack": make_material("STAGE · mint studio backdrop", "#a6d8cf", .9, 0, .02),
}

PROPS: list[tuple[str, object, float]] = []


def build_counter() -> None:
    """The shopkeeper's counter: 2.0 wide x 1.05 tall, with a brass rail."""
    root = pivot("UI COUNTER · export root", (0, 0, 0))
    root["asset_id"] = "ui_counter"
    root["design_size"] = "2.0 x 1.05"
    root["description"] = "Carved barn-wood shop counter for the Animal Balloon Farm storefront"

    box("UI · counter body", (1.94, .62, .8), (0, 0, .4), M["wood"], root, bevel=.05)
    box("UI · counter top", (2.0, .72, .12), (0, 0, .86), M["woodDark"], root, bevel=.045)
    box("UI · counter cream face", (1.6, .04, .5), (0, FACE * .315, .42), M["cream"], root, bevel=.02)
    box("UI · counter red band", (1.94, .05, .14), (0, FACE * .30, .70), M["red"], root, bevel=.02)
    # A brass foot rail and a pair of panel posts, so the counter reads as furniture.
    cylinder("UI · counter foot rail", (0, FACE * .34, .16), .05, 1.7, M["gold"], root, axis="X", segments=16)
    for side in (-1, 1):
        box(f"UI · counter post {side}", (.12, .12, .8), (side * .9, FACE * .3, .4), M["woodDark"], root, bevel=.03)
        sphere(f"UI · counter post cap {side}", (side * .9, FACE * .3, .82), (.075, .075, .07), M["gold"], root, 18, 12)
    for index in range(4):
        sphere(f"UI · counter bolt {index}", (-.66 + index * .44, FACE * .33, .42), (.04, .03, .04), M["gold"], root, 14, 10)
    PROPS.append(("ui_counter", root, .52))


def build_shelf() -> None:
    """A wall shelf of stock: 1.6 wide x 1.9 tall, three shelves."""
    root = pivot("UI SHELF · export root", (0, 0, 0))
    root["asset_id"] = "ui_shelf"
    root["design_size"] = "1.6 x 1.9"
    root["description"] = "Carved barn-wood display shelf for the Animal Balloon Farm storefront"

    for side in (-1, 1):
        box(f"UI · shelf side {side}", (.14, .42, 1.9), (side * .73, 0, .95), M["wood"], root, bevel=.04)
    for index, height in enumerate((.22, .78, 1.34)):
        box(f"UI · shelf board {index}", (1.6, .42, .09), (0, 0, height), M["woodDark"], root, bevel=.03)
    box("UI · shelf back panel", (1.46, .06, 1.72), (0, -.2, .95), M["cream"], root, bevel=.02)
    for index, height in enumerate((.32, .88, 1.44)):
        box(f"UI · shelf trim {index}", (1.44, .05, .07), (0, -.185, height - .18), M["green"], root, bevel=.015)
    box("UI · shelf crown", (1.74, .5, .12), (0, 0, 1.87), M["woodDark"], root, bevel=.04)
    for side in (-1, 1):
        sphere(f"UI · shelf finial {side}", (side * .8, 0, 1.92), (.08, .08, .08), M["gold"], root, 18, 14)
    PROPS.append(("ui_shelf", root, 1.0))


def build_crate() -> None:
    """A produce crate: 0.8 wide x 0.62 tall, slatted and brass-cornered."""
    root = pivot("UI CRATE · export root", (0, 0, 0))
    root["asset_id"] = "ui_crate"
    root["design_size"] = "0.8 x 0.62"
    root["description"] = "Carved barn-wood produce crate for the Animal Balloon Farm storefront"

    box("UI · crate body", (.8, .56, .5), (0, 0, .27), M["wood"], root, bevel=.05)
    box("UI · crate rim", (.84, .6, .09), (0, 0, .56), M["woodDark"], root, bevel=.04)
    box("UI · crate base", (.86, .62, .08), (0, 0, .04), M["woodDark"], root, bevel=.03)
    for index in range(3):
        box(f"UI · crate slat {index}", (.72, .04, .07), (0, FACE * .29, .15 + index * .17), M["cream"], root, bevel=.015)
    for side in (-1, 1):
        for depth in (-1, 1):
            sphere(f"UI · crate corner bolt {side}{depth}", (side * .36, depth * .24, .55),
                   (.045, .045, .035), M["gold"], root, 14, 10)
    PROPS.append(("ui_crate", root, .3))


for builder in (build_counter, build_shelf, build_crate):
    builder()

LAYOUT = [(-2.6, "ui_counter"), (0.9, "ui_shelf"), (3.0, "ui_crate")]

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE_NEXT"
scene.render.resolution_x, scene.render.resolution_y = 1700, 900
scene.render.resolution_percentage = 100
scene.eevee.taa_render_samples = 64
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.view_settings.exposure = .2
scene.render.threads_mode = "FIXED"
scene.render.threads = 8
scene.world = bpy.data.worlds.new("Shop interior review · mint fairground morning")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = color_rgba("#b7dcd2")
scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = .68

bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, 0))
floor = bpy.context.object
floor.name = "STAGE · buttercream floor"
floor.data.materials.append(M["stageFloor"])
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 9, 7))
backdrop = bpy.context.object
backdrop.name = "STAGE · mint studio backdrop"
backdrop.dimensions = (200, .25, 16)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
backdrop.data.materials.append(M["stageBack"])

camera_data = bpy.data.cameras.new("STAGE · shop interior contact sheet")
camera = bpy.data.objects.new("STAGE · shop interior contact sheet", camera_data)
bpy.context.collection.objects.link(camera)
camera.location = (-1.2, -22, 2.3)
camera.rotation_euler = (Vector((0, 0, 1.0)) - Vector(camera.location)).to_track_quat("-Z", "Y").to_euler()
camera_data.type = "ORTHO"
camera_data.ortho_scale = 13.0
scene.camera = camera

for name, location, energy, size, tint in [
    ("STAGE LIGHT · warm key", (0, -7, 11), 2600, 8, (1.0, .93, .82)),
    ("STAGE LIGHT · cool fill", (-11, -3, 6), 1500, 8, (.76, .92, 1.0)),
    ("STAGE LIGHT · soft rim", (9, 4, 9), 2100, 7, (1.0, .82, .72)),
    ("STAGE LIGHT · gentle bounce", (0, -6, 1.2), 420, 6, (1.0, .92, .74)),
]:
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = tint
    lamp = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(lamp)
    lamp.location = location
    lamp.rotation_euler = (Vector((0, 0, 1.2)) - lamp.location).to_track_quat("-Z", "Y").to_euler()

blend_path = OUTPUT / "shop-interior.blend"
render_path = OUTPUT / "shop-interior-review.png"

for x, asset_id in LAYOUT:
    for prop_id, root, _lift in PROPS:
        if prop_id == asset_id:
            root.location.x = x
            rock = math.sin(x * 1.7)
            if root.children:
                root.rotation_euler = (0, math.radians(rock * 2.4), 0)
            break
for prop_id, root, lift in PROPS:
    root.location.z = lift

scene.render.filepath = str(render_path)
bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
bpy.ops.render.render(write_still=True)

# After the .blend and the render, so the grain survives in both, and before the
# GLB, so the runtime gets a real colour instead of white.
flatten_material_colours()

for asset_id, root, _lift in PROPS:
    root.location = (0, 0, 0)
    root.rotation_euler = (0, 0, 0)
    bpy.ops.object.select_all(action="DESELECT")

    def select_tree(obj):
        obj.select_set(True)
        for child in obj.children:
            select_tree(child)

    select_tree(root)
    bpy.context.view_layer.objects.active = root
    glb_path = OUTPUT / f"{asset_id.replace('_', '-')}.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path), export_format="GLB", use_selection=True,
        export_apply=True, export_animations=False, export_materials="EXPORT",
        export_cameras=False, export_lights=False,
    )
    print("GLB:", glb_path)

print("Blender source:", blend_path)
print("Art review:", render_path)
for asset_id, root, _lift in PROPS:
    print(f"  {asset_id}: design size {root['design_size']}")
