"""Animal Balloon Farm: the garbage can and the dumpster the raccoon asks for.

Run from repository root:
  blender --background --factory-startup --python art/blender/trash_props.py

Regenerates public/assets/props/{garbage-can,dumpster}.{blend,glb} and their
-review.png renders. Kept apart from shop_props.py and oak_tree.py so the approved
props are never rebuilt by accident.

Authoring frame matches the other props: Z-up, resting on z = 0 and centred on
the origin in X/Y. The dumpster is 2 cells long (X) by 1 cell deep (Y), with its
raccoon-sized front door on the -Y side; the garbage can fits one cell.

Neither model carries a node the game reads. The raccoon sleeps beside whichever
prop is placed, found through its footprint (see src/scene/garden-props.ts).

Verify the exports with `node scripts/inspect-glb.mjs public/assets/props/<id>.glb`.
"""
from __future__ import annotations

import math
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


def sphere(name, location, scale, mat, parent=None, segments=24, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + " · mesh"
    obj.scale = scale
    obj.data.materials.append(mat)
    smooth(obj)
    return parent_local(obj, parent, location)


def box(name, location, dims, mat, parent=None, bevel=.08):
    """A soft-cornered box; the bevel modifier is applied on export."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + " · mesh"
    obj.scale = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    modifier = obj.modifiers.new("soft edges", "BEVEL")
    modifier.width = bevel
    modifier.segments = 4
    modifier.limit_method = "NONE"
    obj.data.materials.append(mat)
    smooth(obj)
    return parent_local(obj, parent, location)


def cylinder(name, location, radius_bottom, radius_top, depth, mat, parent=None, segments=32, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=segments, radius1=radius_bottom, radius2=radius_top, depth=depth, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + " · mesh"
    obj.rotation_euler = rotation
    obj.data.materials.append(mat)
    smooth(obj)
    return parent_local(obj, parent, location)


def torus(name, location, major, minor, mat, parent=None, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_segments=28, minor_segments=10, major_radius=major, minor_radius=minor, location=(0, 0, 0))
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
        "tin": make_material("CAN · galvanised tin", "#aab2b6", .32, .55, .35),
        "tinDark": make_material("CAN · shaded tin ribs", "#7e878d", .36, .5, .3),
        "lid": make_material("CAN · lid tin", "#bcc4c8", .3, .55, .4),
        "green": make_material("DUMPSTER · bottle-green balloon steel", "#3f8a5e", .28, .05, .55),
        "greenDeep": make_material("DUMPSTER · deep green trim", "#2c6a47", .3, .05, .5),
        "greenLid": make_material("DUMPSTER · lid green", "#4a9b6b", .28, .05, .55),
        "rubber": make_material("TRASH · tyre rubber", "#33343c", .6, 0, .1),
        "door": make_material("DUMPSTER · cosy doorway shadow", "#241f2b", .8, 0, 0),
        "frame": make_material("DUMPSTER · doorway trim", "#e6c261", .3, .3, .45),
        "mat": make_material("DUMPSTER · welcome mat", "#c4483c", .7, 0, .1),
        "paper": make_material("TRASH · crumpled paper", "#f4ecdc", .55, 0, .2),
        "peel": make_material("TRASH · banana peel", "#f2cf55", .4, 0, .35),
        "can": make_material("TRASH · soda can", "#d9604c", .3, .5, .4),
        "bag": make_material("TRASH · plum bin bag", "#6b4f78", .3, 0, .6),
        "bone": make_material("TRASH · fish bone", "#f7f1e2", .45, 0, .3),
        "apple": make_material("TRASH · apple core", "#a8c95a", .4, 0, .4),
        "stageFloor": make_material("STAGE · buttercream floor", "#f6e6c6", .88, 0, .02),
        "stageBack": make_material("STAGE · mint studio backdrop", "#a6d8cf", .9, 0, .02),
    }


def stage():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x, scene.render.resolution_y = 900, 900
    scene.render.resolution_percentage = 100
    scene.eevee.taa_render_samples = 64
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = .2
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 8
    scene.world = bpy.data.worlds.new("Trash review · mint fairground morning")
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
    flatten_material_colours()
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
        export_cameras=False, export_lights=False,
    )
    print(f"{stem} Blender source: {blend_path}")
    print(f"{stem} art review: {render_path}")
    print(f"{stem} GLB: {glb_path}")


def litter(M, parent, spots):
    """Crumpled bits that peek out of an open lid. spots: (kind, x, y, z, size)."""
    for index, (kind, x, y, z, size) in enumerate(spots):
        if kind == "paper":
            sphere(f"TRASH · crumpled paper {index + 1}", (x, y, z), (size, size * .9, size * .85), M["paper"], parent, 12, 8)
        elif kind == "peel":
            peel = sphere(f"TRASH · banana peel {index + 1}", (x, y, z), (size * 1.5, size * .45, size * .35), M["peel"], parent, 14, 8)
            peel.rotation_euler[2] = math.radians(35 + index * 20)
        elif kind == "can":
            cylinder(f"TRASH · soda can {index + 1}", (x, y, z), size * .5, size * .5, size, M["can"], parent, 16, (math.radians(70), 0, math.radians(index * 40)))
        elif kind == "bag":
            sphere(f"TRASH · bin bag {index + 1}", (x, y, z), (size, size * .9, size * .75), M["bag"], parent, 16, 10)
        elif kind == "apple":
            sphere(f"TRASH · apple core {index + 1}", (x, y, z), (size * .6, size * .6, size * .8), M["apple"], parent, 12, 8)
        elif kind == "bone":
            bone = sphere(f"TRASH · fish bone {index + 1}", (x, y, z), (size * 1.6, size * .12, size * .12), M["bone"], parent, 10, 6)
            bone.rotation_euler[2] = math.radians(20 * index)


def make_garbage_can(M):
    root = pivot("PROP GARBAGE CAN · export root", (0, 0, 0))
    root["design_size"] = "1 cell, about 1.3 m tall"
    cylinder("CAN · tin body", (0, 0, .55), .46, .54, 1.1, M["tin"], root, 36)
    for index in range(3):
        z = .25 + index * .32
        torus(f"CAN · rib {index + 1}", (0, 0, z), .50 + index * .012, .03, M["tinDark"], root)
    cylinder("CAN · base ring", (0, 0, .04), .5, .5, .09, M["tinDark"], root, 36)
    # A lid propped a little ajar: tilted, resting on the rim at one side.
    lid = pivot("CAN · lid hinge", (-.48, 0, 1.1), root)
    lid.rotation_euler[1] = math.radians(-24)
    cylinder("CAN · lid", (.5, 0, .04), .56, .5, .1, M["lid"], lid, 36)
    sphere("CAN · lid knob", (.5, 0, .16), (.12, .12, .1), M["tinDark"], lid, 18, 12)
    for side, label in ((-1, "near"), (1, "far")):
        torus(f"CAN · {label} handle", (0, side * .54, .72), .12, .026, M["tinDark"], root, (math.radians(90), 0, 0)).scale = (1, 1, 1)
    litter(M, root, [("paper", .12, 0, 1.12, .17), ("peel", .22, .12, 1.15, .12), ("can", -.18, -.1, 1.1, .2), ("apple", -.05, .18, 1.12, .12)])
    return root


def make_dumpster(M):
    root = pivot("PROP DUMPSTER · export root", (0, 0, 0))
    root["design_size"] = "2 x 1 cells, about 1.5 m tall; raccoon door on -Y"
    length, depth, height = 3.2, 1.5, 1.3
    # The bin: a soft green box with a slightly wider rim.
    box("DUMPSTER · body", (0, 0, .38 + height / 2), (length, depth, height), M["green"], root, .12)
    box("DUMPSTER · rim", (0, 0, .38 + height + .02), (length + .1, depth + .1, .14), M["greenDeep"], root, .06)
    box("DUMPSTER · base rail", (0, 0, .34), (length - .1, depth - .1, .1), M["greenDeep"], root, .04)
    for index, x in enumerate((-1.0, 0, 1.0)):
        for side, label in ((-1, "front"), (1, "back")):
            box(f"DUMPSTER · {label} rib {index + 1}", (x, side * (depth / 2 + .012), .38 + height / 2), (.09, .05, height - .25), M["greenDeep"], root, .02)
    for sx in (-1.2, 1.2):
        for sy in (-.55, .55):
            cylinder(f"DUMPSTER · wheel {sx:+.1f}{sy:+.1f}", (sx, sy, .2), .2, .2, .16, M["rubber"], root, 20, (math.radians(90), 0, 0))
    # Two lids: one down, one flung open.
    lid_z = .38 + height + .1
    box("DUMPSTER · closed lid", (-.82, 0, lid_z + .05), (length / 2 - .08, depth + .1, .1), M["greenLid"], root, .05)
    hinge = pivot("DUMPSTER · open lid hinge", (.02, 0, lid_z), root)
    hinge.rotation_euler[1] = math.radians(-62)
    box("DUMPSTER · open lid", (.78, 0, .05), (length / 2 - .08, depth + .1, .1), M["greenLid"], hinge, .05)
    litter(M, root, [("bag", .5, .1, lid_z + .02, .34), ("paper", 1.0, -.2, lid_z + .0, .2), ("peel", .9, .3, lid_z + .02, .16),
                     ("can", .3, -.35, lid_z + .05, .24), ("bone", 1.2, .1, lid_z + .08, .2), ("apple", .1, .25, lid_z + .0, .15)])
    # The raccoon's front door: an arched dark opening in the -Y wall with trim and a welcome mat.
    door_y = -(depth / 2) - .02
    door = sphere("DUMPSTER · raccoon doorway", (.6, door_y, .38 + .46), (.38, .06, .46), M["door"], root, 28, 16)
    trim = torus("DUMPSTER · doorway trim", (.6, door_y - .02, .38 + .46), .4, .035, M["frame"], root, (math.radians(90), 0, 0))
    trim.scale = (1, 1, 1.18)
    sphere("DUMPSTER · welcome mat", (.6, door_y - .34, .395), (.34, .22, .025), M["mat"], root, 20, 10)
    sphere("DUMPSTER · doorstep lantern", (.18, door_y - .04, .38 + .9), (.07, .07, .09), M["frame"], root, 14, 10)
    return root


for stem, builder, target_z, scale in (("garbage-can", make_garbage_can, .65, .5), ("dumpster", make_dumpster, .85, .85)):
    clear_scene()
    stage()
    M = materials()
    build_stage(M, target_z, scale)
    save_render_export(builder(M), stem)
