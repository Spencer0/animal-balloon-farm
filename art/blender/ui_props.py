"""Animal Balloon Farm: carnival UI props (buttons, signboard, bunting, mailbox).

Run from repository root:
  blender --background --factory-startup --python art/blender/ui_props.py

Regenerates public/assets/ui/ui-props.blend, ui-props-review.png and one GLB per
prop. These are the 3D pieces the main menu, journal launcher and tool HUD are
built from, so every surface in the game shares one carved-wood language.

Orientation convention: Blender is Z-up and so is glTF's source here, so each
prop is authored already standing -- width along +X, height along +Z, thickness
along Y with the painted face toward -Y. The glTF exporter's Z-up to Y-up
conversion then lands the prop in Three.js with width +X, height +Y and the
painted face toward +Z, which is exactly what the orthographic UI layer wants.
Authoring standing (rather than laying the prop flat and tipping the export
root) keeps `export_apply` from baking a root rotation into some assets and not
others. Verify with `node scripts/inspect-glb.mjs public/assets/ui/ui-button.glb`.
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
random.seed(20460)

# Authoring frame: X = width, Y = depth (painted face toward -Y), Z = height.
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
    """Painted-wood grain: a stretched noise field remapped between two tones.

    Keeps the planks from reading as flat plastic without baking a texture, and
    stays fully deterministic so regenerating the props is reproducible.
    """
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


def parent_local(obj, parent, location):
    if parent:
        obj.parent = parent
        obj.matrix_parent_inverse.identity()
        obj.location = location
    else:
        obj.location = location
    return obj


def box(name, dimensions, location, mat, parent=None, bevel=0.0, segments=4):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + " · mesh"
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0.0:
        # Clamp so a bevel can never eat a whole thin board.
        mod = obj.modifiers.new("soft carved edge", "BEVEL")
        mod.width = min(bevel, min(dimensions) * .45)
        mod.segments = segments
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(30)
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


def cylinder(name, location, radius, depth, mat, parent=None, axis="Y", segments=32, bevel=0.0):
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
    return obj


def tube(name, points, bevel, mat, parent=None, resolution=3):
    data = bpy.data.curves.new(name + " · curve", "CURVE")
    data.dimensions = "3D"
    data.resolution_u = 12
    data.bevel_depth = bevel
    data.bevel_resolution = resolution
    spline = data.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, position in zip(spline.bezier_points, points):
        point.co = position
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    data.materials.append(mat)
    if parent:
        obj.parent = parent
    return obj


def pennant(name, location, width, height, mat, parent=None, tilt=0.0, thickness=0.022):
    """A hanging cloth triangle built from real vertices in the XZ plane.

    A cone would not do: its triangular cross-section lies in the wrong plane and
    its silhouette from the front is a disc, not a flag.
    """
    mesh = bpy.data.meshes.new(name + " · mesh")
    half = width / 2
    mesh.from_pydata([(-half, 0, 0), (half, 0, 0), (0, 0, -height)], [], [(0, 1, 2)])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    mesh.materials.append(mat)
    mod = obj.modifiers.new("cloth thickness", "SOLIDIFY")
    mod.thickness = thickness
    mod.offset = 0.0
    parent_local(obj, parent, location)
    obj.rotation_euler = (0, math.radians(tilt), 0)
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
    "wood": add_wood_grain(make_material("UI · weathered barn wood", "#b07a4e", .74, 0, .06), "#8a5734", "#c99464"),
    "woodDark": add_wood_grain(make_material("UI · dark stained post", "#7d4f30", .78, 0, .04), "#5d3822", "#96663f"),
    "cream": make_material("UI · buttercream painted face", "#fbf0d6", .66, 0, .18),
    "red": make_material("UI · barn red trim", "#c4483c", .55, 0, .24),
    "green": make_material("UI · meadow green trim", "#5c8f52", .58, 0, .2),
    "gold": make_material("UI · carnival brass", "#e8b657", .28, .62, .3),
    "iron": make_material("UI · aged iron bolt", "#5b5148", .42, .7, .1),
    "mail": make_material("UI · mailbox red", "#bf4b3e", .5, 0, .26),
    "mailLid": make_material("UI · mailbox lid", "#d2604c", .46, 0, .3),
    "flagA": make_material("UI · pennant coral", "#ef7d91", .66, 0, .1),
    "flagB": make_material("UI · pennant butter", "#f1c558", .66, 0, .1),
    "flagC": make_material("UI · pennant lilac", "#b59ad6", .66, 0, .1),
    "flagD": make_material("UI · pennant sage", "#7fb173", .66, 0, .1),
    "stageFloor": make_material("STAGE · buttercream floor", "#f6e6c6", .88, 0, .02),
    "stageBack": make_material("STAGE · mint studio backdrop", "#a6d8cf", .9, 0, .02),
}

# (asset_id, export root, world-Z lift that rests the prop on the floor plane)
PROPS: list[tuple[str, object, float]] = []


def build_button() -> None:
    """A carved barn-board plaque: the one button every screen shares.

    2.0 x 0.92 units. The UI layer paints its label onto the inset cream face at
    runtime, so this single mesh serves ENTER, VIEWER, OPTIONS, the journal
    launcher and the garden tools.
    """
    root = pivot("UI BUTTON · export root", (0, 0, 0))
    root["asset_id"] = "ui_button"
    root["design_size"] = "2.0 x 0.92"
    root["description"] = "Carved barn-board button plaque for Animal Balloon Farm menus"

    box("UI · button board", (2.0, .15, .92), (0, 0, 0), M["wood"], root, bevel=.07)
    # Two painted layers over the board make a crisp pinstripe border that still
    # reads when the plaque is only ~90 px tall on screen.
    box("UI · button barn-red pinstripe", (1.86, .04, .78), (0, FACE * .077, 0), M["red"], root, bevel=.018)
    box("UI · button cream writing face", (1.7, .045, .62), (0, FACE * .10, 0), M["cream"], root, bevel=.02)
    for sx in (-1, 1):
        for sz in (-1, 1):
            sphere(f"UI · button corner bolt {sx}{sz}", (sx * .88, FACE * .085, sz * .39),
                   (.05, .05, .05), M["gold"], root, 20, 14)
    PROPS.append(("ui_button", root, .46))


def build_signboard() -> None:
    """The big painted farm sign that titles the main menu."""
    root = pivot("UI SIGNBOARD · export root", (0, 0, 0))
    root["asset_id"] = "ui_signboard"
    root["design_size"] = "5.4 x 2.05"
    root["description"] = "Painted farm signboard with a shingle roof for the Animal Balloon Farm menu"

    box("UI · sign board", (5.4, .18, 1.5), (0, 0, 0), M["wood"], root, bevel=.07)
    box("UI · sign green field", (5.16, .05, 1.28), (0, FACE * .093, 0), M["green"], root, bevel=.02)
    box("UI · sign cream panel", (4.86, .05, 1.0), (0, FACE * .121, 0), M["cream"], root, bevel=.02)
    # A shingled little roof, so the silhouette is not just another rectangle.
    for row, (height, half_width) in enumerate([(.88, 2.62), (1.03, 2.42)]):
        for index in range(7):
            x = -half_width + (index + .5) * (half_width * 2 / 7)
            box(f"UI · sign shingle {row}-{index}", (half_width * 2 / 7 * .96, .07, .2),
                (x, FACE * .12, height), M["red"], root, bevel=.012)
    box("UI · sign ridge cap", (5.3, .1, .16), (0, FACE * .12, 1.16), M["woodDark"], root, bevel=.03)
    for sx in (-1, 1):
        sphere(f"UI · sign finial {sx}", (sx * 2.55, FACE * .12, 1.16), (.1, .1, .1), M["gold"], root, 22, 16)
    PROPS.append(("ui_signboard", root, .75))


def build_bunting() -> None:
    """A sagging strand of carnival pennants for the top of a screen."""
    root = pivot("UI BUNTING · export root", (0, 0, 0))
    root["asset_id"] = "ui_bunting"
    root["design_size"] = "6.4 x 1.05"
    root["description"] = "Catenary strand of carnival pennants for Animal Balloon Farm screens"

    span, sag, count = 6.4, .68, 11
    strand = []
    for step in range(count + 1):
        t = step / count
        strand.append((-span / 2 + span * t, 0, -sag * math.sin(math.pi * t) * .92))
    tube("UI · bunting cord", strand, .022, M["woodDark"], root, 3)
    pennant_mats = [M["flagA"], M["flagB"], M["flagC"], M["flagD"]]
    for index in range(count):
        t = (index + .5) / count
        # Each flag is nudged a degree or two: hand-tied bunting is never even,
        # and the tiny variation is what makes the strand feel like cloth.
        pennant(f"UI · pennant {index}", (-span / 2 + span * t, 0, -sag * math.sin(math.pi * t) * .92 - .01),
                .4, .42, pennant_mats[index % 4], root, tilt=math.sin(index * 1.7) * 3.0)
    PROPS.append(("ui_bunting", root, sag * .92 + .42))


def build_mailbox() -> None:
    """A farm mailbox on a post: the 'there is mail' sparkle beside the menu."""
    root = pivot("UI MAILBOX · export root", (0, 0, 0))
    root["asset_id"] = "ui_mailbox"
    root["design_size"] = "1.18 x 1.75"
    root["description"] = "Barn-red mailbox on a wooden post for Animal Balloon Farm"

    box("UI · mailbox post", (.2, .2, 1.5), (0, 0, -.55), M["woodDark"], root, bevel=.03)
    box("UI · mailbox post collar", (.42, .42, .18), (0, 0, -.5), M["wood"], root, bevel=.04)
    box("UI · mailbox body", (1.18, .66, .36), (0, 0, .30), M["mail"], root, bevel=.1, segments=5)
    # Half-cylinder lid arching across the body's width, seated on its top face.
    cylinder("UI · mailbox curved lid", (0, 0, .48), .59, .66, M["mailLid"], root, bevel=.04)
    box("UI · mailbox flag post", (.06, .06, .34), (.52, FACE * .1, .62), M["iron"], root)
    box("UI · mailbox raised flag", (.06, .3, .16), (.52, FACE * .2, .78), M["red"], root, bevel=.02)
    PROPS.append(("ui_mailbox", root, 1.3))


for builder in (build_button, build_signboard, build_bunting, build_mailbox):
    builder()

# Lay the four props out for a single contact-sheet review render, each resting
# on the floor plane at z = 0.
LAYOUT = [(-6.4, "ui_button"), (-2.2, "ui_signboard"), (2.7, "ui_bunting"), (6.4, "ui_mailbox")]
for x, asset_id in LAYOUT:
    for prop_id, root, lift in PROPS:
        if prop_id == asset_id:
            root.location.x = x
            root.location.z = lift
            break

# Review stage, excluded from every export selection.
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE_NEXT"
scene.render.resolution_x, scene.render.resolution_y = 1800, 780
scene.render.resolution_percentage = 100
scene.eevee.taa_render_samples = 64
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.view_settings.exposure = .2
scene.render.threads_mode = "FIXED"
scene.render.threads = 8
scene.world = bpy.data.worlds.new("UI props review · mint fairground morning")
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

camera_data = bpy.data.cameras.new("STAGE · props contact sheet")
camera = bpy.data.objects.new("STAGE · props contact sheet", camera_data)
bpy.context.collection.objects.link(camera)
# Painted faces point toward -Y, so the reviewer camera sits on that side.
camera.location = (0, -24, 1.6)
camera.rotation_euler = (Vector((0, 0, 1.6)) - Vector(camera.location)).to_track_quat("-Z", "Y").to_euler()
camera_data.type = "ORTHO"
camera_data.ortho_scale = 18.4
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


def curves_to_meshes(root):
    """glTF only ships meshes, so bake the bunting cord before exporting."""
    bpy.ops.object.select_all(action="DESELECT")
    for obj in [root] + list(root.children_recursive):
        if obj.type == "CURVE":
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.convert(target="MESH")


blend_path = OUTPUT / "ui-props.blend"
render_path = OUTPUT / "ui-props-review.png"
scene.render.filepath = str(render_path)
bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
bpy.ops.render.render(write_still=True)

for asset_id, root, _lift in PROPS:
    # The review render lays the props out side by side; the runtime wants each
    # prop centred on its own origin, so undo the layout before exporting.
    root.location = (0, 0, 0)
    curves_to_meshes(root)
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
print("Convention: authored standing (width +X, height +Z, face -Y); the exporter lands the")
print("GLB in Three.js with width +X, height +Y and the painted face toward +Z.")
