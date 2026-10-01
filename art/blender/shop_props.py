"""Animal Balloon Farm: the four shop props that stand in the garden.

Run from repository root:
  blender --background --factory-startup --python art/blender/shop_props.py

Regenerates public/assets/props/shop-props.blend, shop-props-review.png and one
GLB per prop (fountain, statue, fence, coop). These are the things the shop
sells and the player places on the 2 m lattice.

Authoring frame matches ui_props.py: Blender is Z-up, so width runs along +X,
depth along Y and height along +Z. Every prop rests on z = 0 with its footprint
centred on the origin in X/Y, except the fence, which is authored centred and
spanning exactly 2 m along X so it lines up with a lattice edge. The glTF
exporter lands each prop in Three.js with width +X, height +Y, footprint
centred at the origin.

Verify each export with `node scripts/inspect-glb.mjs public/assets/props/coop.glb`.
"""
from __future__ import annotations

import math
import random
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "public" / "assets" / "props"
OUTPUT.mkdir(parents=True, exist_ok=True)
random.seed(20461)


def color_rgba(value: str):
    raw = value.lstrip("#")
    rgb = [int(raw[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    rgb = [c / 12.92 if c < .04045 else ((c + .055) / 1.055) ** 2.4 for c in rgb]
    return (*rgb, 1.0)


def make_material(name, value, roughness=.75, metallic=0.0, coat=.06):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color_rgba(value)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color_rgba(value)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Coat Weight"].default_value = coat
    shader.inputs["Coat Roughness"].default_value = .26
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


def add_stone_speckle(mat, dark, light, scale=9.0):
    """A mottled speckle so the carved stone does not read as flat plastic."""
    tree = mat.node_tree
    shader = tree.nodes.get("Principled BSDF")
    noise = tree.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 6.0
    ramp = tree.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = .4
    ramp.color_ramp.elements[0].color = color_rgba(dark)
    ramp.color_ramp.elements[1].position = .62
    ramp.color_ramp.elements[1].color = color_rgba(light)
    tree.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    tree.links.new(ramp.outputs["Color"], shader.inputs["Base Color"])
    return mat


def flatten_material_colours():
    """Fall the procedural Base Color back to its flat tone before export.

    glTF has no way to carry a noise-to-ramp node graph, and the exporter writes
    white for a linked Base Color -- which would turn the wooden coop and the
    stone fountain white in the game. The .blend and the review render keep the
    grain; only the runtime GLB gets the flat colour.
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


def sphere(name, location, scale, mat, parent=None, segments=28, rings=20):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + " · mesh"
    obj.scale = scale
    obj.data.materials.append(mat)
    for face in obj.data.polygons:
        face.use_smooth = True
    return parent_local(obj, parent, location)


def cylinder(name, location, radius, depth, mat, parent=None, axis="Z", segments=32, bevel=0.0):
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


# Fresh authoring scene; the named outputs below are intentionally regenerated.
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for collection in (bpy.data.meshes, bpy.data.curves, bpy.data.materials,
                   bpy.data.cameras, bpy.data.lights, bpy.data.worlds, bpy.data.actions):
    for block in list(collection):
        if block.users == 0:
            collection.remove(block)

M = {
    "stone": add_stone_speckle(make_material("PROP · carved pale stone", "#cdc7b6", .82, 0, .04), "#a9a292", "#e2ddcd"),
    "stoneDark": add_stone_speckle(make_material("PROP · shadowed stone", "#a49d8d", .84, 0, .03), "#847e70", "#bdb6a5"),
    "moss": make_material("PROP · mossy stone trim", "#7f9663", .86, 0, .03),
    "water": make_material("PROP · fountain water", "#78c3d6", .12, 0, .4),
    "wood": add_wood_grain(make_material("PROP · fence timber", "#b98a55", .78, 0, .05), "#8f6438", "#d3a56d"),
    "woodDark": add_wood_grain(make_material("PROP · coop timber", "#8a5a39", .8, 0, .04), "#654027", "#a5744b"),
    "roof": make_material("PROP · coop shingles", "#c05a45", .74, 0, .06),
    "roofDark": make_material("PROP · coop ridge", "#9d4433", .76, 0, .05),
    "nest": make_material("PROP · nest box straw", "#e6c477", .88, 0, .02),
    "iron": make_material("PROP · wrought iron", "#4f4740", .48, .68, .08),
    "stageFloor": make_material("STAGE · buttercream floor", "#f6e6c6", .88, 0, .02),
    "stageBack": make_material("STAGE · mint studio backdrop", "#a6d8cf", .9, 0, .02),
}

PROPS: list[tuple[str, object, float]] = []


def build_fountain() -> None:
    """A tiered stone fountain, 2.6 m across and 1.6 m tall."""
    root = pivot("PROP FOUNTAIN · export root", (0, 0, 0))
    root["asset_id"] = "fountain"
    root["design_size"] = "2.6 x 2.6 x 1.6"
    root["description"] = "Tiered stone fountain for Animal Balloon Farm"

    cylinder("PROP · fountain base", (0, 0, .1), 1.3, .2, M["stoneDark"], root, bevel=.05, segments=48)
    cylinder("PROP · fountain basin wall", (0, 0, .36), 1.18, .34, M["stone"], root, bevel=.05, segments=48)
    cylinder("PROP · fountain water", (0, 0, .42), 1.02, .18, M["water"], root, segments=48)
    cylinder("PROP · fountain plinth", (0, 0, .66), .32, .44, M["stone"], root, bevel=.04, segments=24)
    cylinder("PROP · fountain upper bowl", (0, 0, .9), .62, .14, M["stone"], root, bevel=.05, segments=40)
    cylinder("PROP · fountain upper water", (0, 0, .97), .5, .06, M["water"], root, segments=40)
    cylinder("PROP · fountain upper plinth", (0, 0, 1.12), .16, .3, M["stone"], root, bevel=.03, segments=20)
    sphere("PROP · fountain finial", (0, 0, 1.36), (.2, .2, .2), M["stone"], root, 26, 18)
    for index in range(8):
        angle = index / 8 * math.tau
        sphere(f"PROP · fountain moss {index}", (math.cos(angle) * 1.2, math.sin(angle) * 1.2, .16),
               (.11, .11, .07), M["moss"], root, 16, 12)
    PROPS.append(("fountain", root, 0.0))


def build_statue() -> None:
    """A carved balloon friend in stone, 1.5 m tall on a stepped plinth."""
    root = pivot("PROP STATUE · export root", (0, 0, 0))
    root["asset_id"] = "statue"
    root["design_size"] = "0.95 x 0.95 x 1.5"
    root["description"] = "Carved stone balloon statue for Animal Balloon Farm"

    box("PROP · statue lower step", (.95, .95, .16), (0, 0, .08), M["stoneDark"], root, bevel=.03)
    box("PROP · statue upper step", (.76, .76, .14), (0, 0, .23), M["stone"], root, bevel=.03)
    box("PROP · statue plinth", (.5, .5, .58), (0, 0, .59), M["stone"], root, bevel=.04)
    box("PROP · statue plinth cap", (.62, .62, .1), (0, 0, .93), M["stone"], root, bevel=.03)
    # A balloon dog, carved: body, head, two ears, four legs, tail.
    body_y = .0
    sphere("PROP · statue body", (0, body_y, 1.12), (.3, .17, .18), M["stone"], root, 24, 16)
    sphere("PROP · statue chest", (.24, body_y, 1.16), (.15, .14, .16), M["stone"], root, 22, 14)
    sphere("PROP · statue head", (.38, body_y, 1.3), (.15, .14, .15), M["stone"], root, 22, 16)
    sphere("PROP · statue snout", (.5, body_y, 1.24), (.09, .07, .07), M["stone"], root, 18, 12)
    for side in (-1, 1):
        sphere(f"PROP · statue ear {side}", (.34, body_y + side * .1, 1.45), (.06, .05, .12), M["stone"], root, 16, 12)
        for depth in (-1, 1):
            box(f"PROP · statue leg {side}{depth}", (.09, .09, .22),
                (.22, body_y + side * .11, 1.0), M["stone"], root, bevel=.025)
    sphere("PROP · statue tail", (-.3, body_y, 1.2), (.09, .06, .1), M["stone"], root, 18, 12)
    PROPS.append(("statue", root, 0.0))


def build_fence() -> None:
    """One 2 m lattice segment: two posts and two rails, centred on the origin."""
    root = pivot("PROP FENCE · export root", (0, 0, 0))
    root["asset_id"] = "fence"
    root["design_size"] = "2.0 x 0.16 x 1.0"
    root["description"] = "A single 2 m garden fence segment for Animal Balloon Farm"

    for side in (-1, 1):
        box(f"PROP · fence post {side}", (.14, .14, 1.0), (side * .93, 0, .5), M["woodDark"], root, bevel=.03)
        sphere(f"PROP · fence post cap {side}", (side * .93, 0, 1.02), (.09, .09, .07), M["woodDark"], root, 18, 12)
    for height in (.34, .72):
        box(f"PROP · fence rail {height}", (1.9, .07, .15), (0, 0, height), M["wood"], root, bevel=.02)
    box("PROP · fence rail brace", (1.56, .06, .07), (0, 0, .53), M["woodDark"], root, bevel=.015,
        rotation=(0, math.radians(24), 0))
    PROPS.append(("fence", root, 0.0))


def build_coop() -> None:
    """A 4 x 3 x 2.2 m wooden chicken coop with a ramp and a nest box."""
    root = pivot("PROP COOP · export root", (0, 0, 0))
    root["asset_id"] = "coop"
    root["design_size"] = "4.0 x 3.0 x 2.2"
    root["description"] = "Wooden chicken coop for Animal Balloon Farm"

    box("PROP · coop floor", (3.8, 2.8, .18), (0, 0, .09), M["woodDark"], root, bevel=.04)
    box("PROP · coop back wall", (3.8, .14, 1.5), (0, -1.33, .93), M["wood"], root, bevel=.03)
    for side in (-1, 1):
        box(f"PROP · coop side wall {side}", (.14, 2.66, 1.5), (side * 1.83, 0, .93), M["wood"], root, bevel=.03)
    box("PROP · coop front wall", (3.8, .14, 1.5), (0, 1.33, .93), M["wood"], root, bevel=.03)
    box("PROP · coop door", (.86, .1, 1.0), (-1.0, 1.4, .62), M["woodDark"], root, bevel=.04)
    box("PROP · coop door frame", (1.0, .06, 1.12), (-1.0, 1.42, .64), M["roofDark"], root, bevel=.03)
    for offset in (-.1, .1):
        sphere(f"PROP · coop knob {offset}", (-1.0 + offset, 1.46, .5), (.05, .04, .05), M["iron"], root, 14, 10)
    # Gable roof: two slabs meeting at a ridge along X.
    for side in (-1, 1):
        box(f"PROP · coop roof {side}", (4.1, 1.72, .16), (0, side * .76, 2.05), M["roof"], root, bevel=.03,
            rotation=(math.radians(side * 24), 0, 0))
    box("PROP · coop ridge beam", (4.16, .22, .18), (0, 0, 2.28), M["roofDark"], root, bevel=.04)
    box("PROP · coop gable", (3.6, .12, .5), (0, 1.34, 1.86), M["wood"], root, bevel=.03)
    # Nest box bump on the right flank.
    box("PROP · coop nest box", (.9, 1.0, .7), (1.9, -.6, .6), M["wood"], root, bevel=.05)
    box("PROP · coop nest lid", (.98, 1.08, .12), (1.9, -.6, .98), M["roof"], root, bevel=.03)
    sphere("PROP · coop nest straw", (1.9, -.6, .96), (.34, .34, .07), M["nest"], root, 20, 14)
    # A ramp up to the door.
    box("PROP · coop ramp", (.7, 1.3, .09), (-1.0, 2.05, .3), M["wood"], root, bevel=.02,
        rotation=(math.radians(-22), 0, 0))
    for index in range(4):
        box(f"PROP · coop ramp cleat {index}", (.66, .06, .05), (-1.0, 1.62 + index * .3, .26 + index * .12),
            M["woodDark"], root)
    PROPS.append(("coop", root, 0.0))


for builder in (build_fountain, build_statue, build_fence, build_coop):
    builder()

# Contact sheet layout, each prop resting on the floor plane at z = 0.
LAYOUT = [(-9.0, "fountain"), (-4.4, "statue"), (0.0, "fence"), (5.4, "coop")]

# Review stage, excluded from every export selection.
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE_NEXT"
scene.render.resolution_x, scene.render.resolution_y = 1800, 900
scene.render.resolution_percentage = 100
scene.eevee.taa_render_samples = 64
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.view_settings.exposure = .2
scene.render.threads_mode = "FIXED"
scene.render.threads = 8
scene.world = bpy.data.worlds.new("Shop props review · mint fairground morning")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = color_rgba("#b7dcd2")
scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = .68

bpy.ops.mesh.primitive_plane_add(size=300, location=(0, 0, 0))
floor = bpy.context.object
floor.name = "STAGE · buttercream floor"
floor.data.materials.append(M["stageFloor"])
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 11, 8))
backdrop = bpy.context.object
backdrop.name = "STAGE · mint studio backdrop"
backdrop.dimensions = (300, .25, 20)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
backdrop.data.materials.append(M["stageBack"])

camera_data = bpy.data.cameras.new("STAGE · props contact sheet")
camera = bpy.data.objects.new("STAGE · props contact sheet", camera_data)
bpy.context.collection.objects.link(camera)
camera.location = (0, -30, 2.2)
camera.rotation_euler = (Vector((0, 0, 1.8)) - Vector(camera.location)).to_track_quat("-Z", "Y").to_euler()
camera_data.type = "ORTHO"
camera_data.ortho_scale = 23.0
scene.camera = camera

for name, location, energy, size, tint in [
    ("STAGE LIGHT · warm key", (0, -9, 14), 3200, 9, (1.0, .93, .82)),
    ("STAGE LIGHT · cool fill", (-13, -4, 8), 1800, 9, (.76, .92, 1.0)),
    ("STAGE LIGHT · soft rim", (11, 5, 11), 2400, 8, (1.0, .82, .72)),
    ("STAGE LIGHT · gentle bounce", (0, -7, 1.4), 500, 7, (1.0, .92, .74)),
]:
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = tint
    lamp = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(lamp)
    lamp.location = location
    lamp.rotation_euler = (Vector((0, 0, 1.4)) - lamp.location).to_track_quat("-Z", "Y").to_euler()

blend_path = OUTPUT / "shop-props.blend"
render_path = OUTPUT / "shop-props-review.png"

# Lay the props out for one review render; the runtime wants each centred on its
# own origin, so undo the layout before exporting.
for x, asset_id in LAYOUT:
    for prop_id, root, _lift in PROPS:
        if prop_id == asset_id:
            root.location.x = x
            break
scene.render.filepath = str(render_path)
bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
bpy.ops.render.render(write_still=True)

# After the .blend and the render, so the grain survives in both, and before the
# GLB, so the runtime gets a real colour instead of white.
flatten_material_colours()

for asset_id, root, _lift in PROPS:
    root.location = (0, 0, 0)
    bpy.ops.object.select_all(action="DESELECT")

    def select_tree(obj):
        obj.select_set(True)
        for child in obj.children:
            select_tree(child)

    select_tree(root)
    bpy.context.view_layer.objects.active = root
    glb_path = OUTPUT / f"{asset_id}.glb"
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
