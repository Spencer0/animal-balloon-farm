"""Animal Balloon Farm: the oak tree the shop sells, and the owl's roost.

Run from repository root:
  blender --background --factory-startup --python art/blender/oak_tree.py

Regenerates public/assets/props/oak.blend, oak-review.png and oak.glb. It is a
separate script from shop_props.py on purpose: that one rebuilds the approved
fountain, statue, fence and coop in a single destructive run, and an oak does not
need to touch any of them.

Authoring frame matches shop_props.py: Z-up, resting on z = 0 and centred on the
origin in X/Y, so the glTF exporter lands it in Three.js with the trunk on the
origin and the crown up +Y. The footprint is two lattice cells (4 m) square.

The one thing the game reads out of the model is the node named `OAK roost`. It
is an Empty sitting on top of the thick side branch, where an owl's talons go.
GLTFLoader sanitizes the name to `OAK_roost`, so src/scene/garden-props.ts looks
it up under that spelling. Move the branch and the roost together.

Verify the export with `node scripts/inspect-glb.mjs public/assets/props/oak.glb`.
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
random.seed(8841)

TRUNK_HEIGHT = 3.7
BRANCH_Z = 3.05
BRANCH_LENGTH = 1.9


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


def parent_local(obj, parent, location):
    if parent:
        obj.parent = parent
        obj.matrix_parent_inverse.identity()
    obj.location = location
    return obj


def sphere(name, location, scale, mat, parent=None, segments=20, rings=14):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + " · mesh"
    obj.scale = scale
    obj.data.materials.append(mat)
    for face in obj.data.polygons:
        face.use_smooth = True
    return parent_local(obj, parent, location)


def cone_frustum(name, location, radius_bottom, radius_top, depth, mat, parent=None, segments=20):
    bpy.ops.mesh.primitive_cone_add(vertices=segments, radius1=radius_bottom, radius2=radius_top, depth=depth, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + " · mesh"
    obj.data.materials.append(mat)
    for face in obj.data.polygons:
        face.use_smooth = True
    return parent_local(obj, parent, location)


def pivot(name, location, parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = .25
    if parent:
        obj.parent = parent
        obj.matrix_parent_inverse.identity()
    obj.location = location
    return obj


def flatten_material_colours():
    for mat in bpy.data.materials:
        if not mat.use_nodes or mat.node_tree is None:
            continue
        shader = mat.node_tree.nodes.get("Principled BSDF")
        if shader is None or not shader.inputs["Base Color"].is_linked:
            continue
        for link in list(shader.inputs["Base Color"].links):
            mat.node_tree.links.remove(link)
        shader.inputs["Base Color"].default_value = mat.diffuse_color


# Fresh authoring scene; the named outputs below are intentionally regenerated.
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for collection in (bpy.data.meshes, bpy.data.curves, bpy.data.materials,
                   bpy.data.cameras, bpy.data.lights, bpy.data.worlds, bpy.data.actions):
    for block in list(collection):
        if block.users == 0:
            collection.remove(block)

M = {
    "bark": make_material("OAK · warm bark", "#8d6141", .84, 0, .04),
    "barkDark": make_material("OAK · shaded bark", "#6e4a31", .86, 0, .03),
    "barkLight": make_material("OAK · sunlit branch top", "#a67a54", .8, 0, .05),
    "leafDeep": make_material("OAK · deep leaf balloon", "#4c8745", .34, .01, .5),
    "leaf": make_material("OAK · leaf balloon", "#639f50", .32, .01, .52),
    "leafBright": make_material("OAK · sunlit leaf balloon", "#80b85f", .3, .01, .54),
    "acorn": make_material("OAK · acorn", "#c9944f", .5, 0, .2),
    "acornCap": make_material("OAK · acorn cap", "#6d4a2c", .7, 0, .08),
    "stageFloor": make_material("STAGE · buttercream floor", "#f6e6c6", .88, 0, .02),
    "stageBack": make_material("STAGE · mint studio backdrop", "#a6d8cf", .9, 0, .02),
}

root = pivot("PROP OAK · export root", (0, 0, 0))
root["design_size"] = "2 x 2 cells, about 6.4 m tall"

# Trunk: a flared base, a slightly tapering column, and root buttresses.
cone_frustum("OAK · flared trunk base", (0, 0, .42), .78, .56, .84, M["bark"], root)
cone_frustum("OAK · trunk", (0, 0, 2.25), .56, .44, 3.0, M["bark"], root)
for index in range(5):
    angle = index * math.tau / 5 + .3
    buttress = sphere(f"OAK · root buttress {index + 1}", (math.cos(angle) * .66, math.sin(angle) * .66, .2), (.34, .17, .17), M["barkDark"], root, 12, 8)
    buttress.rotation_euler[2] = angle
# Bark seams, as soft dark ridges up the trunk.
for index in range(4):
    angle = index * math.tau / 4 + .6
    seam = sphere(f"OAK · bark ridge {index + 1}", (math.cos(angle) * .5, math.sin(angle) * .5, 1.9 + index * .22), (.05, .05, .95), M["barkDark"], root, 12, 10)

# The roost: a thick side branch an owl can grip, rising a little toward its tip.
branch = cone_frustum("OAK · roost branch", (BRANCH_LENGTH / 2 + .1, 0, BRANCH_Z), .26, .17, BRANCH_LENGTH, M["bark"], root, 20)
branch.rotation_euler[1] = math.radians(90 - 5)
sphere("OAK · roost branch knuckle", (.28, 0, BRANCH_Z - .04), (.4, .32, .3), M["bark"], root, 16, 10)
sphere("OAK · roost branch top", (BRANCH_LENGTH * .55, 0, BRANCH_Z + .15), (BRANCH_LENGTH * .42, .13, .08), M["barkLight"], root, 14, 8)
sphere("OAK · roost branch tip", (BRANCH_LENGTH + .08, 0, BRANCH_Z + .09), (.2, .17, .17), M["bark"], root, 12, 8)
# The owl's talons land here.
pivot("OAK roost", (BRANCH_LENGTH * .8, 0, BRANCH_Z + .21), root)
# A little twig and a pair of acorns on the branch, for the story.
twig = cone_frustum("OAK · twig", (BRANCH_LENGTH * .4, -.2, BRANCH_Z + .02), .06, .03, .5, M["bark"], root, 12)
twig.rotation_euler = (math.radians(70), math.radians(80), 0)
for index, x in enumerate((BRANCH_LENGTH * .3, BRANCH_LENGTH * .42)):
    sphere(f"OAK · acorn {index + 1}", (x, -.42, BRANCH_Z - .02 - index * .06), (.07, .07, .09), M["acorn"], root, 14, 10)
    sphere(f"OAK · acorn cap {index + 1}", (x, -.42, BRANCH_Z + .05 - index * .06), (.085, .085, .045), M["acornCap"], root, 14, 8)

# Crown: a cloud of leaf balloons in three tones, built low-to-high so the
# silhouette is round and the roost branch reads clearly under it.
CROWN = [
    # x, y, z, radius, material
    (0.0, 0.0, 5.0, 1.55, "leaf"),
    (-1.2, 0.5, 4.5, 1.25, "leafDeep"),
    (1.15, -0.5, 4.6, 1.2, "leaf"),
    (0.3, 1.25, 4.45, 1.1, "leafDeep"),
    (-0.4, -1.25, 4.5, 1.15, "leaf"),
    (-0.3, 0.1, 6.0, 1.0, "leafBright"),
    (0.95, 0.7, 5.35, 0.95, "leafBright"),
    (-0.95, -0.55, 5.45, 0.95, "leaf"),
    (1.55, 0.35, 4.15, 0.78, "leafDeep"),
    (-1.5, -0.4, 4.0, 0.74, "leafDeep"),
]
for index, (x, y, z, radius, tone) in enumerate(CROWN):
    sphere(f"OAK · crown balloon {index + 1}", (x, y, z), (radius, radius * .96, radius * .88), M[tone], root, 18, 12)

# Contact-sheet stage, excluded from the export selection.
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE_NEXT"
scene.render.resolution_x, scene.render.resolution_y = 900, 1100
scene.render.resolution_percentage = 100
scene.eevee.taa_render_samples = 64
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.view_settings.exposure = .2
scene.render.threads_mode = "FIXED"
scene.render.threads = 8
scene.world = bpy.data.worlds.new("Oak review · mint fairground morning")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = color_rgba("#b7dcd2")
scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = .68

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

camera_data = bpy.data.cameras.new("STAGE · oak camera")
camera = bpy.data.objects.new("STAGE · oak camera", camera_data)
bpy.context.collection.objects.link(camera)
camera.location = (7, -17, 6.2)
camera.rotation_euler = (Vector((0, 0, 3.4)) - Vector(camera.location)).to_track_quat("-Z", "Y").to_euler()
camera_data.type = "ORTHO"
camera_data.ortho_scale = 9.4
scene.camera = camera

for name, location, energy, size, tint in [
    ("STAGE LIGHT · warm key", (3, -9, 14), 3000, 9, (1.0, .93, .82)),
    ("STAGE LIGHT · cool fill", (-13, -4, 8), 1700, 9, (.76, .92, 1.0)),
    ("STAGE LIGHT · soft rim", (11, 5, 11), 2200, 8, (1.0, .82, .72)),
]:
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = tint
    lamp = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(lamp)
    lamp.location = location
    lamp.rotation_euler = (Vector((0, 0, 2.5)) - lamp.location).to_track_quat("-Z", "Y").to_euler()

blend_path = OUTPUT / "oak.blend"
render_path = OUTPUT / "oak-review.png"
scene.render.filepath = str(render_path)
bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
bpy.ops.render.render(write_still=True)

flatten_material_colours()
bpy.ops.object.select_all(action="DESELECT")


def select_tree(obj):
    obj.select_set(True)
    for child in obj.children:
        select_tree(child)


select_tree(root)
bpy.context.view_layer.objects.active = root
glb_path = OUTPUT / "oak.glb"
bpy.ops.export_scene.gltf(
    filepath=str(glb_path), export_format="GLB", use_selection=True,
    export_apply=True, export_animations=False, export_materials="EXPORT",
    export_cameras=False, export_lights=False,
)
print("Oak Blender source:", blend_path)
print("Oak art review:", render_path)
print("Oak GLB:", glb_path)
