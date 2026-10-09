"""Animal Balloon Farm: the animal houses the shop sells.

Run from repository root:
  blender --background --factory-startup --python art/blender/animal_houses.py
  blender --background --factory-startup --python art/blender/animal_houses.py -- sty owl-box

Regenerates, for each house named after `--` (all four by default):
  public/assets/props/<id>.blend, <id>-review.png and <id>.glb

The coop (chicken_coop.py), barn (barn_prop.py) and dumpster have their own
scripts. These four complete the set, one house per species:

  goose-house  a low A-frame shed with a wide door, a ramp and a water trough
  sty          a lean-to pig shelter behind a fenced mud wallow
  frog-house   a hollow stump with a round door, ringed with lily pads
  owl-box      a peaked nest box with a round entrance, up on a tall post

They share the coop's palette (cream boards, teal trim, terracotta roofs) so the
farm reads as one set. Authoring frame matches the other props: Z-up, resting on
z = 0, centred on the origin in X/Y. Every door faces -Y, which glTF turns into
+Z; the game walks animals to the +Z side of the footprint to go in and out.
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "public" / "assets" / "props"
OUTPUT.mkdir(parents=True, exist_ok=True)


# --------------------------------------------------------------------- helpers --

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


def box(name, location, size, mat, parent=None, bevel=.03, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + " · mesh"
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = obj.modifiers.new("soft", "BEVEL")
        mod.width = min(bevel, min(size) * .45)
        mod.segments = 2
        bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.data.materials.append(mat)
    for face in obj.data.polygons:
        face.use_smooth = True
    obj.rotation_euler = rotation
    return parent_local(obj, parent, location)


def cylinder(name, location, radius, depth, mat, parent=None, axis="Z", segments=20, rotation=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=segments, radius=radius, depth=depth, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + " · mesh"
    obj.data.materials.append(mat)
    for face in obj.data.polygons:
        face.use_smooth = len(face.vertices) == 4
    if rotation is not None:
        obj.rotation_euler = rotation
    elif axis == "Y":
        obj.rotation_euler = (math.pi / 2, 0, 0)
    elif axis == "X":
        obj.rotation_euler = (0, math.pi / 2, 0)
    return parent_local(obj, parent, location)


def cone(name, location, radius1, radius2, depth, mat, parent=None, segments=20):
    bpy.ops.mesh.primitive_cone_add(vertices=segments, radius1=radius1, radius2=radius2, depth=depth, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + " · mesh"
    obj.data.materials.append(mat)
    for face in obj.data.polygons:
        face.use_smooth = True
    return parent_local(obj, parent, location)


def blob(name, location, scale, mat, parent=None, segments=14, rings=10):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + " · mesh"
    obj.scale = scale
    obj.data.materials.append(mat)
    for face in obj.data.polygons:
        face.use_smooth = True
    return parent_local(obj, parent, location)


def triangle_wall(name, y, half_width, base, apex, mat, flip, parent=None):
    """A triangular gable in the XZ plane at the given y."""
    mesh = bpy.data.meshes.new(name + " · mesh")
    verts = [(-half_width, y, base), (half_width, y, base), (0, y, apex)]
    mesh.from_pydata(verts, [], [(2, 1, 0) if flip else (0, 1, 2)])
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    if parent:
        obj.parent = parent
        obj.matrix_parent_inverse.identity()
    return obj


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


def slab_along(name, centre, angle, length, width, thickness, mat, parent):
    """A roof slab tilted about Y by `angle`, centred at `centre`."""
    return box(name, tuple(centre), (length, width, thickness), mat, parent, .04, rotation=(0, angle, 0))


def shared_materials(prefix):
    return {
        "wall": make_material(f"{prefix} · cream boards", "#f1dca4", .6, 0, .12),
        "wallDark": make_material(f"{prefix} · shaded boards", "#d9c186", .62, 0, .1),
        "trim": make_material(f"{prefix} · teal trim", "#3e8c88", .55, 0, .16),
        "roof": make_material(f"{prefix} · terracotta roof", "#c4604a", .62, 0, .14),
        "roofDark": make_material(f"{prefix} · roof ridge", "#9a4636", .66, 0, .1),
        "dark": make_material(f"{prefix} · dark opening", "#3c2a24", .75, 0, .03),
        "wood": make_material(f"{prefix} · weathered wood", "#a77b4c", .78, 0, .05),
        "woodDark": make_material(f"{prefix} · dark wood", "#7b5632", .8, 0, .04),
        "straw": make_material(f"{prefix} · straw", "#e6c477", .9, 0, .02),
        "ground": make_material(f"{prefix} · packed earth", "#c9a66b", .95, 0, .0),
        "water": make_material(f"{prefix} · water", "#78c3d6", .12, 0, .35),
        "grass": make_material(f"{prefix} · grass tuft", "#79b45a", .8, 0, .04),
        "stone": make_material(f"{prefix} · river stone", "#b9b2a4", .7, 0, .04),
    }


def fresh_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


# ---------------------------------------------------------------- goose house --

def build_goose_house():
    M = shared_materials("GOOSE HOUSE")
    M["roof"] = make_material("GOOSE HOUSE · sage shingles", "#7fa77a", .62, 0, .14)
    M["roofDark"] = make_material("GOOSE HOUSE · sage ridge", "#5b8159", .66, 0, .1)
    root = pivot("PROP GOOSE HOUSE · export root", (0, 0, 0))
    root["asset_id"] = "goose-house"
    root["design_size"] = "2 x 2 cells, about 2.6 m tall"
    root["description"] = "Low A-frame goose shed with a wide door, ramp and water trough"

    HALF_W = 1.35          # half-width of the A-frame at its foot (x)
    Y0, Y1 = -.55, 1.75    # front / back of the shed (y)
    YC = (Y0 + Y1) / 2
    LENGTH = Y1 - Y0
    BASE = .28             # deck height: the shed sits on a low timber deck
    RIDGE = 2.45

    box("GOOSE HOUSE · deck", (0, YC, BASE / 2), (HALF_W * 2 + .3, LENGTH + .2, BASE), M["woodDark"], root, .04)
    for index in range(7):
        x = -HALF_W - .05 + index * (HALF_W * 2 + .1) / 6
        box(f"GOOSE HOUSE · deck board {index}", (x, YC, BASE + .005), (.04, LENGTH + .16, .02), M["wood"], root, 0)
    triangle_wall("GOOSE HOUSE · front gable", Y0 - .001, HALF_W - .05, BASE, RIDGE - .05, M["wall"], False, root)
    triangle_wall("GOOSE HOUSE · back gable", Y1 + .001, HALF_W - .05, BASE, RIDGE - .05, M["wallDark"], True, root)
    # Board lines on the front gable, shortening toward the apex.
    for index in range(5):
        z = BASE + .3 + index * .36
        half = (HALF_W - .05) * (1 - (z - BASE) / (RIDGE - .05 - BASE)) - .06
        if half > .12:
            box(f"GOOSE HOUSE · gable board {index}", (0, Y0 - .012, z), (half * 2, .02, .035), M["wallDark"], root, 0)

    # The A-frame roof comes down almost to the deck on both sides.
    slope = math.atan2(RIDGE - BASE, HALF_W)
    slab_len = math.hypot(HALF_W, RIDGE - BASE) + .22
    for side in (-1, 1):
        angle = side * slope
        centre = Vector((side * HALF_W / 2 + side * .05, YC, (BASE + RIDGE) / 2 + .06))
        slab_along(f"GOOSE HOUSE · roof slab {side}", centre, angle, slab_len, LENGTH + .42, .13, M["roof"], root)
        along = Vector((math.cos(angle), 0, -math.sin(angle)))
        normal = Vector((math.sin(angle), 0, math.cos(angle)))
        for course in range(4):
            u = -slab_len / 2 + .45 + course * .55
            at = centre + along * u + normal * .085
            box(f"GOOSE HOUSE · shingle course {side}{course}", tuple(at), (.07, LENGTH + .38, .05), M["roofDark"], root, 0, rotation=(0, angle, 0))
        # Teal barge boards along the front edge of each slab.
        front_at = centre + Vector((0, -(LENGTH + .42) / 2 + .02, 0)) + normal * .02
        box(f"GOOSE HOUSE · barge board {side}", tuple(front_at), (slab_len, .08, .16), M["trim"], root, .02, rotation=(0, angle, 0))
    cylinder("GOOSE HOUSE · ridge cap", (0, YC, RIDGE + .1), .09, LENGTH + .46, M["roofDark"], root, "Y", 12)

    # A wide arched door, low to the deck: geese walk straight in.
    box("GOOSE HOUSE · door frame", (0, Y0 - .02, BASE + .45), (1.0, .05, .9), M["trim"], root, .02)
    cylinder("GOOSE HOUSE · door arch frame", (0, Y0 - .02, BASE + .9), .5, .05, M["trim"], root, "Y", 28)
    box("GOOSE HOUSE · door", (0, Y0 - .045, BASE + .4), (.78, .05, .8), M["dark"], root, .01)
    cylinder("GOOSE HOUSE · door arch", (0, Y0 - .045, BASE + .8), .39, .05, M["dark"], root, "Y", 28)
    # A round window above, with a cross.
    cylinder("GOOSE HOUSE · window frame", (0, Y0 - .02, 1.85), .2, .05, M["trim"], root, "Y", 24)
    cylinder("GOOSE HOUSE · window", (0, Y0 - .045, 1.85), .14, .05, M["dark"], root, "Y", 24)
    box("GOOSE HOUSE · window cross a", (0, Y0 - .06, 1.85), (.28, .03, .035), M["trim"], root, 0)
    box("GOOSE HOUSE · window cross b", (0, Y0 - .06, 1.85), (.035, .03, .28), M["trim"], root, 0)

    # A broad cleated ramp from the deck down to the grass.
    ramp_run = .75
    ramp_angle = math.atan2(BASE, ramp_run)
    box("GOOSE HOUSE · ramp", (0, Y0 - .1 - ramp_run / 2, BASE / 2), (.9, math.hypot(ramp_run, BASE), .06), M["wood"], root, .015, rotation=(ramp_angle, 0, 0))
    for index in range(3):
        t = (index + .7) / 3.6
        box(f"GOOSE HOUSE · ramp cleat {index}", (0, Y0 - .1 - ramp_run + ramp_run * t, BASE * t + .05), (.86, .04, .035), M["woodDark"], root, 0, rotation=(ramp_angle, 0, 0))

    # A water trough to the right of the door, and a straw bale to the left.
    TX, TY = 1.25, -1.35
    box("GOOSE HOUSE · trough", (TX, TY, .2), (.95, .5, .36), M["woodDark"], root, .04)
    box("GOOSE HOUSE · trough water", (TX, TY, .36), (.8, .36, .04), M["water"], root, .01)
    for sx in (-1, 1):
        box(f"GOOSE HOUSE · trough leg {sx}", (TX + sx * .36, TY, .06), (.12, .58, .12), M["wood"], root, .02)
    box("GOOSE HOUSE · straw bale", (-1.3, -1.25, .25), (.75, .48, .48), M["straw"], root, .08)
    for sx in (-1, 1):
        box(f"GOOSE HOUSE · bale twine {sx}", (-1.3 + sx * .2, -1.25, .25), (.04, .5, .5), M["woodDark"], root, .01)
    # Pond-edge stones along the front.
    for index, (x, y, s) in enumerate([(-.75, -1.7, .16), (.55, -1.75, .13), (1.75, -.8, .15), (-1.75, -.55, .12), (.05, -1.9, .1)]):
        blob(f"GOOSE HOUSE · stone {index}", (x, y, s * .45), (s * 1.4, s, s * .8), M["stone"], root)
    for index, (x, y) in enumerate([(-1.75, -1.6), (1.8, -1.75), (-.4, -1.95), (1.9, .4)]):
        cone(f"GOOSE HOUSE · grass tuft {index}", (x, y, .14), .13, 0, .28, M["grass"], root, 6)
    return root, {"camera": (7, -12, 6.6), "target": (0, .1, 1.1), "ortho": 6.6}


# --------------------------------------------------------------------- pig sty --

def build_sty():
    M = shared_materials("STY")
    M["tin"] = make_material("STY · corrugated tin", "#c9cfd2", .38, .55, .1)
    M["tinRib"] = make_material("STY · tin ribs", "#aab2b6", .4, .55, .08)
    M["mud"] = make_material("STY · glossy mud", "#7a5233", .25, 0, .45)
    M["mudDry"] = make_material("STY · dry mud rim", "#9b7048", .9, 0, .0)
    M["pink"] = make_material("STY · rose sign", "#e58ba0", .5, 0, .2)
    root = pivot("PROP STY · export root", (0, 0, 0))
    root["asset_id"] = "sty"
    root["design_size"] = "2 x 2 cells, about 2.3 m tall"
    root["description"] = "Lean-to pig shelter behind a fenced mud wallow"

    HX = 1.5
    Y0, Y1 = .2, 1.85      # shelter front (open side) / back wall
    YC = (Y0 + Y1) / 2
    BACK_H, FRONT_H = 2.0, 1.45

    box("STY · floor", (0, YC, .06), (HX * 2, Y1 - Y0, .12), M["woodDark"], root, .03)
    box("STY · back wall", (0, Y1 - .08, BACK_H / 2), (HX * 2, .16, BACK_H), M["wood"], root, .03)
    for sx in (-1, 1):
        # Side walls: plank boxes stepped down toward the open front.
        for index in range(6):
            t = index / 5
            y = Y1 - .1 - t * (Y1 - Y0 - .2)
            h = BACK_H - t * (BACK_H - FRONT_H)
            box(f"STY · side plank {sx}{index}", (sx * (HX - .06), y, h / 2), (.12, (Y1 - Y0) / 6 + .02, h), M["wood"] if index % 2 else M["woodDark"], root, .015)
        box(f"STY · front post {sx}", (sx * (HX - .06), Y0, FRONT_H / 2), (.16, .16, FRONT_H), M["trim"], root, .02)
    for index in range(7):
        x = -HX + .2 + index * (HX * 2 - .4) / 6
        box(f"STY · back plank seam {index}", (x, Y1 - .17, BACK_H / 2), (.03, .02, BACK_H - .1), M["woodDark"], root, 0)
    # Shadowy interior and a heap of straw bedding.
    box("STY · interior shade", (0, Y1 - .2, FRONT_H / 2 + .05), (HX * 2 - .3, .04, FRONT_H - .1), M["dark"], root, 0)
    blob("STY · straw heap", (-.45, YC + .2, .16), (.75, .45, .2), M["straw"], root)
    blob("STY · straw heap small", (.55, YC + .3, .14), (.5, .35, .15), M["straw"], root)
    box("STY · lintel", (0, Y0, FRONT_H - .05), (HX * 2, .14, .14), M["trim"], root, .02)

    # Corrugated tin roof, sloping from the back wall down past the front.
    rise = BACK_H - FRONT_H
    run = Y1 - Y0
    angle = math.atan2(rise, run)
    length = math.hypot(rise, run) + .55
    centre = Vector((0, YC - .2, (BACK_H + FRONT_H) / 2 + .02))
    box("STY · roof", tuple(centre), (HX * 2 + .4, length, .07), M["tin"], root, .015, rotation=(angle, 0, 0))
    for index in range(10):
        x = -HX - .1 + index * (HX * 2 + .2) / 9
        box(f"STY · roof rib {index}", (x, centre.y, centre.z + .05), (.06, length, .05), M["tinRib"], root, .01, rotation=(angle, 0, 0))

    # A little rose plaque over the opening.
    box("STY · sign", (0, Y0 - .1, FRONT_H + .18), (.7, .05, .26), M["pink"], root, .04)
    blob("STY · sign snout", (0, Y0 - .14, FRONT_H + .18), (.09, .04, .065), M["roof"], root)

    # The wallow pen in front: posts and two rails, open toward the shelter.
    PX, PY0, PY1 = 1.65, -1.75, Y0 - .05
    box("STY · pen ground", (0, (PY0 + PY1) / 2, .02), (PX * 2, PY1 - PY0, .04), M["ground"], root, .02)
    blob("STY · mud rim", (.15, -.85, .03), (1.0, .62, .05), M["mudDry"], root, 24, 10)
    blob("STY · wallow", (.15, -.85, .05), (.85, .5, .05), M["mud"], root, 24, 10)
    for index, (x, y, s) in enumerate([(-.55, -.55, .1), (.7, -1.2, .08), (.95, -.55, .07)]):
        blob(f"STY · mud splat {index}", (x, y, .05), (s * 1.5, s, s * .4), M["mud"], root)
    POST_H = .85
    for x in (-PX, 0, PX):
        box(f"STY · pen post front {x}", (x, PY0, POST_H / 2), (.14, .14, POST_H), M["wood"], root, .02)
    for x in (-PX, PX):
        box(f"STY · pen post mid {x}", (x, (PY0 + PY1) / 2, POST_H / 2), (.14, .14, POST_H), M["wood"], root, .02)
    for z in (.75, .38):
        box(f"STY · pen rail front {z}", (0, PY0, z), (PX * 2, .07, .1), M["wood"], root, .015)
        for x in (-PX, PX):
            box(f"STY · pen rail side {x}{z}", (x, (PY0 + PY1) / 2, z), (.07, PY1 - PY0, .1), M["wood"], root, .015)
    # A feed trough against the left rail.
    box("STY · trough", (-1.2, -1.3, .14), (.4, .9, .24), M["woodDark"], root, .03)
    box("STY · trough slop", (-1.2, -1.3, .25), (.3, .78, .03), M["straw"], root, .01)
    for index, (x, y) in enumerate([(-1.85, -1.95), (1.85, -1.9), (1.9, 1.0)]):
        cone(f"STY · grass tuft {index}", (x, y, .14), .13, 0, .28, M["grass"], root, 6)
    return root, {"camera": (7, -12, 6.6), "target": (0, .0, .9), "ortho": 6.6}


# ------------------------------------------------------------------ frog house --

def build_frog_house():
    M = shared_materials("FROG HOUSE")
    M["bark"] = make_material("FROG HOUSE · stump bark", "#8a6240", .85, 0, .04)
    M["barkDark"] = make_material("FROG HOUSE · bark furrows", "#6b4a2f", .88, 0, .02)
    M["rings"] = make_material("FROG HOUSE · cut rings", "#e3c48d", .7, 0, .06)
    M["ringLine"] = make_material("FROG HOUSE · ring lines", "#c49d63", .75, 0, .04)
    M["moss"] = make_material("FROG HOUSE · moss", "#6fae4f", .85, 0, .03)
    M["pad"] = make_material("FROG HOUSE · lily pad", "#5aa04a", .45, 0, .25)
    M["bloom"] = make_material("FROG HOUSE · lily bloom", "#f3a6c0", .45, 0, .2)
    M["capRed"] = make_material("FROG HOUSE · toadstool", "#d9574a", .5, 0, .2)
    M["capDot"] = make_material("FROG HOUSE · toadstool dots", "#fff3dc", .6, 0, .05)
    root = pivot("PROP FROG HOUSE · export root", (0, 0, 0))
    root["asset_id"] = "frog-house"
    root["design_size"] = "1 x 1 cell, about 1.6 m tall"
    root["description"] = "Hollow stump with a round door, ringed with lily pads"

    R, H = .52, 1.05
    SY = .15  # the stump sits a little back, leaving room for the pool in front
    cylinder("FROG HOUSE · stump", (0, SY, H / 2), R, H, M["bark"], root, "Z", 24)
    cone("FROG HOUSE · stump flare", (0, SY, .12), R + .16, R, .24, M["bark"], root, 24)
    for index in range(10):
        a = index * math.tau / 10 + .2
        if abs(math.atan2(math.sin(a + math.pi / 2), math.cos(a + math.pi / 2))) < .55:
            continue  # leave the door side clear
        box(f"FROG HOUSE · bark furrow {index}", (math.cos(a) * (R + .005), SY + math.sin(a) * (R + .005), H / 2 + .05),
            (.05, .05, H - .2), M["barkDark"], root, .015, rotation=(0, 0, a))
    cylinder("FROG HOUSE · cut top", (0, SY, H + .015), R - .02, .04, M["rings"], root, "Z", 24)
    for index, r in enumerate((.12, .25, .38)):
        bpy.ops.mesh.primitive_torus_add(major_radius=r, minor_radius=.012, major_segments=24, minor_segments=6, location=(0, 0, 0))
        ring = bpy.context.object
        ring.name = f"FROG HOUSE · growth ring {index}"
        ring.data.name = ring.name + " · mesh"
        ring.data.materials.append(M["ringLine"])
        parent_local(ring, root, (0, SY, H + .035))
    # A toadstool roof leaning on the top, for a storybook silhouette.
    blob("FROG HOUSE · toadstool cap", (.12, SY + .05, H + .32), (.42, .42, .22), M["capRed"], root, 20, 12)
    cylinder("FROG HOUSE · toadstool stem", (.12, SY + .05, H + .14), .09, .26, M["capDot"], root, "Z", 12)
    for index, (dx, dy, dz) in enumerate([(.2, -.18, .12), (-.12, -.2, .1), (.32, .12, .1), (-.05, .25, .14), (.05, -.05, .21)]):
        blob(f"FROG HOUSE · cap dot {index}", (.12 + dx, SY + .05 + dy, H + .32 + dz), (.055, .055, .03), M["capDot"], root)
    blob("FROG HOUSE · moss", (-.3, SY - .2, H + .02), (.22, .16, .06), M["moss"], root)

    # Round door and a little window, facing -Y.
    DOOR_Z = .36
    cylinder("FROG HOUSE · door frame", (0, SY - R + .01, DOOR_Z), .25, .08, M["trim"], root, "Y", 24)
    cylinder("FROG HOUSE · door", (0, SY - R - .02, DOOR_Z), .19, .06, M["dark"], root, "Y", 24)
    blob("FROG HOUSE · door knob", (.11, SY - R - .06, DOOR_Z), (.03, .03, .03), M["straw"], root)
    box("FROG HOUSE · door step", (0, SY - R - .08, .05), (.36, .14, .08), M["stone"], root, .03)
    cylinder("FROG HOUSE · window frame", (-.25, SY - R + .12, .82), .1, .06, M["trim"], root, "Y", 18, rotation=(math.pi / 2, 0, -.5))
    cylinder("FROG HOUSE · window", (-.26, SY - R + .1, .82), .065, .06, M["dark"], root, "Y", 18, rotation=(math.pi / 2, 0, -.5))

    # A shallow pool in front with lily pads, and stones around it.
    cylinder("FROG HOUSE · pool rim", (.12, -.7, .02), .35, .04, M["stone"], root, "Z", 24)
    cylinder("FROG HOUSE · pool", (.12, -.7, .035), .3, .03, M["water"], root, "Z", 24)
    for index, (x, y, r, rot) in enumerate([(-.02, -.68, .1, .4), (.25, -.78, .09, 2.2), (.18, -.58, .07, 4.1), (-.62, -.25, .13, 1.0), (.68, .35, .12, 3.0), (-.65, .55, .1, 5.0)]):
        pad = cylinder(f"FROG HOUSE · lily pad {index}", (x, y, .06 if index < 3 else .03), r, .02, M["pad"], root, "Z", 16)
        pad.rotation_euler = (0, 0, rot)
        # The notch: a dark-green wedge would cost more triangles than it is worth at game scale.
    blob("FROG HOUSE · lily bloom", (.25, -.78, .1), (.05, .05, .04), M["bloom"], root)
    for index in range(5):
        a = index * math.tau / 5
        blob(f"FROG HOUSE · bloom petal {index}", (.25 + math.cos(a) * .045, -.78 + math.sin(a) * .045, .095), (.04, .025, .02), M["bloom"], root)
    for index, (x, y, s) in enumerate([(.55, -.85, .08), (-.35, -.85, .07), (.6, -.35, .06)]):
        blob(f"FROG HOUSE · pebble {index}", (x, y, s * .4), (s * 1.3, s, s * .7), M["stone"], root)
    for index, (x, y) in enumerate([(-.8, -.8), (.85, -.05), (-.75, .1)]):
        cone(f"FROG HOUSE · reed {index}", (x, y, .2), .05, 0, .4, M["grass"], root, 5)
    return root, {"camera": (4.2, -7.2, 4.0), "target": (0, -.1, .55), "ortho": 2.9}


# --------------------------------------------------------------------- owl box --

def build_owl_box():
    M = shared_materials("OWL BOX")
    root = pivot("PROP OWL BOX · export root", (0, 0, 0))
    root["asset_id"] = "owl-box"
    root["design_size"] = "1 x 1 cell, about 3.2 m tall"
    root["description"] = "Peaked nest box with a round entrance, on a tall post"

    POST_H = 2.05
    # A stone-ringed mound and the post.
    blob("OWL BOX · mound", (0, 0, .02), (.7, .7, .12), M["grass"], root, 20, 10)
    for index in range(7):
        a = index * math.tau / 7
        blob(f"OWL BOX · ring stone {index}", (math.cos(a) * .55, math.sin(a) * .55, .07), (.12, .1, .08), M["stone"], root)
    box("OWL BOX · post", (0, .08, POST_H / 2), (.18, .18, POST_H), M["woodDark"], root, .03)
    for side in (-1, 1):
        box(f"OWL BOX · brace {side}", (side * .2, .08, POST_H - .32), (.07, .1, .5), M["wood"], root, .015, rotation=(0, side * .65, 0))

    # The box: taller than wide, with a peaked roof overhanging the front.
    BW, BD, BH = .62, .56, .78
    Z0 = POST_H - .05
    YC = .08
    box("OWL BOX · floor", (0, YC, Z0), (BW + .08, BD + .08, .06), M["woodDark"], root, .02)
    box("OWL BOX · body", (0, YC, Z0 + BH / 2), (BW, BD, BH), M["wood"], root, .03)
    for index in range(3):
        box(f"OWL BOX · front plank seam {index}", (-BW / 2 + (index + 1) * BW / 4, YC - BD / 2 - .005, Z0 + BH / 2), (.02, .01, BH - .06), M["woodDark"], root, 0)
    triangle_wall("OWL BOX · front gable", YC - BD / 2 - .001, BW / 2, Z0 + BH, Z0 + BH + .32, M["wall"], False, root)
    triangle_wall("OWL BOX · back gable", YC + BD / 2 + .001, BW / 2, Z0 + BH, Z0 + BH + .32, M["wallDark"], True, root)
    slope = math.atan2(.32, BW / 2)
    slab_len = math.hypot(BW / 2, .32) + .16
    for side in (-1, 1):
        box(f"OWL BOX · roof {side}", (side * (BW / 4 + .03), YC - .04, Z0 + BH + .2), (slab_len, BD + .3, .07), M["roof"], root, .02, rotation=(0, side * slope, 0))
    cylinder("OWL BOX · ridge", (0, YC - .04, Z0 + BH + .35), .045, BD + .34, M["roofDark"], root, "Y", 10)

    # Round entrance hole with a teal ring, a perch peg below, and a little moon plaque.
    HOLE_Z = Z0 + BH * .62
    cylinder("OWL BOX · entrance ring", (0, YC - BD / 2 - .015, HOLE_Z), .16, .04, M["trim"], root, "Y", 24)
    cylinder("OWL BOX · entrance", (0, YC - BD / 2 - .03, HOLE_Z), .115, .04, M["dark"], root, "Y", 24)
    cylinder("OWL BOX · perch peg", (0, YC - BD / 2 - .14, HOLE_Z - .26), .03, .26, M["woodDark"], root, "Y", 10)
    blob("OWL BOX · moon plaque", (0, YC - BD / 2 - .02, Z0 + .14), (.1, .02, .1), M["straw"], root)
    blob("OWL BOX · moon bite", (.05, YC - BD / 2 - .035, Z0 + .17), (.08, .02, .08), M["wood"], root)
    # A twiggy nest poking out of the hole.
    for index in range(4):
        a = -.6 + index * .4
        box(f"OWL BOX · twig {index}", (math.sin(a) * .08, YC - BD / 2 - .04, HOLE_Z - .1 + index * .015), (.2, .02, .02), M["straw"], root, 0, rotation=(0, a, 0))
    return root, {"camera": (5.0, -8.6, 5.2), "target": (0, 0, 1.55), "ortho": 4.0}


HOUSES = {
    "goose-house": build_goose_house,
    "sty": build_sty,
    "frog-house": build_frog_house,
    "owl-box": build_owl_box,
}


# ---------------------------------------------------------------- stage/export --

def stage_and_export(asset_id, root, framing):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x, scene.render.resolution_y = 1000, 900
    scene.render.resolution_percentage = 100
    scene.eevee.taa_render_samples = 64
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = .2
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 8
    scene.world = bpy.data.worlds.new(f"{asset_id} review · mint fairground morning")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = color_rgba("#b7dcd2")
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = .68

    stage_floor = make_material("STAGE · buttercream floor", "#f6e6c6", .88, 0, .02)
    stage_back = make_material("STAGE · mint studio backdrop", "#a6d8cf", .9, 0, .02)
    bpy.ops.mesh.primitive_plane_add(size=300, location=(0, 0, 0))
    floor = bpy.context.object
    floor.name = "STAGE · buttercream floor"
    floor.data.materials.append(stage_floor)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 14, 8))
    backdrop = bpy.context.object
    backdrop.name = "STAGE · mint studio backdrop"
    backdrop.dimensions = (300, .25, 24)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    backdrop.data.materials.append(stage_back)

    camera_data = bpy.data.cameras.new(f"STAGE · {asset_id} camera")
    camera = bpy.data.objects.new(f"STAGE · {asset_id} camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = framing["camera"]
    camera.rotation_euler = (Vector(framing["target"]) - Vector(camera.location)).to_track_quat("-Z", "Y").to_euler()
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = framing["ortho"]
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
        lamp.rotation_euler = (Vector((0, 0, 1.5)) - lamp.location).to_track_quat("-Z", "Y").to_euler()

    blend_path = OUTPUT / f"{asset_id}.blend"
    render_path = OUTPUT / f"{asset_id}-review.png"
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
    glb_path = OUTPUT / f"{asset_id}.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path), export_format="GLB", use_selection=True,
        export_apply=True, export_animations=False, export_materials="EXPORT",
        export_cameras=False, export_lights=False,
    )
    print(f"{asset_id} Blender source:", blend_path)
    print(f"{asset_id} art review:", render_path)
    print(f"{asset_id} GLB:", glb_path)


def requested():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    unknown = [name for name in args if name not in HOUSES]
    if unknown:
        raise SystemExit(f"Unknown house(s): {', '.join(unknown)}. Choose from {', '.join(HOUSES)}.")
    return args or list(HOUSES)


for asset_id in requested():
    fresh_scene()
    house_root, house_framing = HOUSES[asset_id]()
    stage_and_export(asset_id, house_root, house_framing)
