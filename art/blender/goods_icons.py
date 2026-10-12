"""Food web icons: goods, foods and hunger bubbles.

Headless Blender authoring script for the food web UI. Renders 128x128
transparent PNG icons of balloon-glossy, soft little props:

  goods  good-milk, good-wool, good-egg, good-duck-egg, good-down,
         good-truffle, good-trinket, good-gem
  foods  food-grass, food-meadow, food-pondweed, food-seeds, food-scraps,
         food-worms, food-blooms, food-feed
  bubbles hunger-bubble, starving-bubble (thought bubbles with an empty bowl)

Run from the project root:

    blender --background --factory-startup --python art/blender/goods_icons.py

It also runs directly under the `bpy` Python module
(`python art/blender/goods_icons.py`). Regeneration command: overwrites
`public/assets/goods/*.png` and writes a contact sheet `goods-review.png`
into the folder named by the GOODS_REVIEW_DIR environment variable (default:
the system temp dir), never into the repo.

Rendering: Cycles on the CPU at low samples (no GPU or EGL needed, identical
on Blender 4.2 and 5.x), a fixed seed, rendered at 2x and averaged down to
128px for clean edges. Name icons after `--` to render only those.
"""

import math
import os
import sys
import tempfile

import bpy
from mathutils import Vector

OUT_DIR = os.path.join("public", "assets", "goods")
SIZE = 128
SUPER = 2
SAMPLES = 48

GOODS = ["milk", "wool", "egg", "duck-egg", "down", "truffle", "trinket", "gem"]
FOODS = ["grass", "meadow", "pondweed", "seeds", "scraps", "worms", "blooms", "feed"]
NAMES = (["good-" + g for g in GOODS] + ["food-" + f for f in FOODS]
         + ["hunger-bubble", "starving-bubble"])


# ---------------------------------------------------------------- helpers

def lin(rgb):
    """Palette is written as sRGB; Blender colour sockets are linear."""
    return tuple(c ** 2.2 for c in rgb[:3]) + (1.0,)


def set_input(node, name, value):
    if name in node.inputs:
        node.inputs[name].default_value = value


def mat(name, rgb, rough=0.35, metal=0.0, coat=0.5, emit=None, emit_strength=0.0, sss=0.0):
    key = "GI_%s_%s" % (name, "%02x%02x%02x" % tuple(int(c * 255) for c in rgb))
    m = bpy.data.materials.get(key)
    if m is not None:
        return m
    m = bpy.data.materials.new(key)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    set_input(bsdf, "Base Color", lin(rgb))
    set_input(bsdf, "Roughness", rough)
    set_input(bsdf, "Metallic", metal)
    # Socket names changed between 4.x and 5.x; set whichever exists.
    set_input(bsdf, "Coat Weight", coat)
    set_input(bsdf, "Clearcoat", coat)
    set_input(bsdf, "Coat Roughness", 0.12)
    set_input(bsdf, "Clearcoat Roughness", 0.12)
    set_input(bsdf, "Subsurface Weight", sss)
    set_input(bsdf, "Subsurface", sss)
    if emit is not None:
        set_input(bsdf, "Emission Color", lin(emit))
        set_input(bsdf, "Emission", lin(emit))
        set_input(bsdf, "Emission Strength", emit_strength)
    return m


def finish(obj, m, smooth=True):
    obj.data.materials.clear()
    obj.data.materials.append(m)
    if smooth:
        for poly in obj.data.polygons:
            poly.use_smooth = True
    return obj


def ball(loc, scale, m, rot=(0, 0, 0), seg=32, rings=16):
    if not isinstance(scale, (tuple, list)):
        scale = (scale, scale, scale)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=1.0)
    o = bpy.context.active_object
    o.location, o.scale, o.rotation_euler = loc, scale, rot
    return finish(o, m)


def cyl(loc, r, depth, m, rot=(0, 0, 0), scale=(1, 1, 1), verts=32, smooth=True):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, vertices=verts)
    o = bpy.context.active_object
    o.location, o.rotation_euler, o.scale = loc, rot, scale
    return finish(o, m, smooth)


def cone(loc, r1, r2, depth, m, rot=(0, 0, 0), scale=(1, 1, 1), verts=32):
    bpy.ops.mesh.primitive_cone_add(radius1=r1, radius2=r2, depth=depth, vertices=verts)
    o = bpy.context.active_object
    o.location, o.rotation_euler, o.scale = loc, rot, scale
    return finish(o, m)


def torus(loc, major, minor, m, rot=(0, 0, 0), scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor,
                                     major_segments=40, minor_segments=14)
    o = bpy.context.active_object
    o.location, o.rotation_euler, o.scale = loc, rot, scale
    return finish(o, m)


def tube(points, radius, m, taper=False):
    """A round-capped smooth tube through the points (a bevelled curve)."""
    data = bpy.data.curves.new("tube", "CURVE")
    data.dimensions = "3D"
    data.bevel_depth = radius
    data.bevel_resolution = 4
    data.use_fill_caps = True
    spline = data.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for p, co in zip(spline.bezier_points, points):
        p.co = Vector(co)
        p.handle_left_type = p.handle_right_type = "AUTO"
        if taper:
            p.radius = 1.0
    if taper:
        spline.bezier_points[-1].radius = 0.25
    o = bpy.data.objects.new("tube", data)
    bpy.context.collection.objects.link(o)
    data.materials.append(m)
    return o


def mesh_obj(name, verts, faces, m, face_mats=None, smooth=False):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    mats = face_mats if face_mats else [m]
    for mm in mats:
        me.materials.append(mm)
    if face_mats:
        for i, poly in enumerate(me.polygons):
            poly.material_index = i % len(face_mats)
    for poly in me.polygons:
        poly.use_smooth = smooth
    return o


def leaf(loc, length, width, m, rot=(0, 0, 0)):
    """A flat balloon leaf: a squashed ball."""
    return ball(loc, (width, width * 0.35, length), m, rot=rot, seg=24, rings=12)


# ---------------------------------------------------------------- palette

CREAM = (0.98, 0.93, 0.80)
WHITE = (0.98, 0.97, 0.94)
GREEN = (0.38, 0.72, 0.32)
GREEN_D = (0.24, 0.55, 0.26)
GREEN_L = (0.58, 0.82, 0.38)
BROWN = (0.50, 0.33, 0.21)
BROWN_D = (0.34, 0.22, 0.15)
GOLD = (0.95, 0.76, 0.30)
RED = (0.88, 0.30, 0.28)
PINK = (0.97, 0.60, 0.68)
BLUE = (0.45, 0.72, 0.92)


# ---------------------------------------------------------------- goods

def build_milk():
    glass = mat("milkglass", (0.62, 0.80, 0.95), rough=0.12, coat=0.8)
    milk = mat("milk", (1.0, 1.0, 1.0), rough=0.35, coat=0.0, emit=(1.0, 1.0, 1.0), emit_strength=0.25)
    cap = mat("milkcap", RED, rough=0.3)
    cyl((0, 0, -0.15), 0.72, 1.3, glass, verts=40)
    ball((0, 0, 0.5), (0.72, 0.72, 0.5), glass)
    cyl((0, 0, 0.95), 0.34, 0.35, glass)
    cyl((0, 0, 1.15), 0.4, 0.22, cap)
    ball((0, 0, 1.25), (0.4, 0.4, 0.1), cap)
    cyl((0, -0.03, -0.2), 0.7, 1.15, milk, verts=40)
    ball((0, 0, 0.35), (0.66, 0.66, 0.3), milk)
    ball((0, -0.72, -0.15), (0.3, 0.04, 0.28), mat("label", PINK, rough=0.4))
    ball((0, -0.76, -0.12), (0.12, 0.03, 0.12), mat("labelw", WHITE, rough=0.4))


def build_wool():
    wool = mat("wool", (0.98, 0.88, 0.72), rough=0.9, coat=0.0, sss=0.1)
    wool2 = mat("wool2", (0.93, 0.55, 0.62), rough=0.8, coat=0.0)
    ball((0, 0, 0), 0.9, wool)
    for k in range(7):
        torus((0, 0, 0), 0.9, 0.06, wool2 if k % 2 == 0 else wool,
              rot=(math.radians(35 + k * 22), math.radians(k * 29), math.radians(k * 50)), scale=(1.0, 1.0, 1.0))
    tube([(0.55, -0.7, -0.4), (0.95, -0.8, -0.75), (1.2, -0.6, -0.5)], 0.07, wool2)


def egg_shape(loc, scale, m, rot=(0, 0, 0)):
    o = ball(loc, (scale * 0.78, scale * 0.78, scale), m, rot=rot, seg=40, rings=24)
    # taper the top for an egg profile
    for v in o.data.vertices:
        t = max(0.0, v.co.z)
        k = 1.0 - 0.18 * t
        v.co.x *= k
        v.co.y *= k
    return o


def build_egg():
    egg_shape((0, 0, 0), 1.05, mat("egg", (0.99, 0.95, 0.85), rough=0.25, coat=0.6))
    ball((-0.3, -0.5, 0.45), (0.12, 0.05, 0.2), mat("shine", (1, 1, 1), rough=0.2, emit=(1, 1, 1), emit_strength=0.6),
         rot=(0, math.radians(-25), 0))


def build_duck_egg():
    shell = mat("duckegg", (0.74, 0.90, 0.84), rough=0.25, coat=0.6)
    egg_shape((0, 0, 0), 1.05, shell)
    speck = mat("speck", (0.35, 0.50, 0.45), rough=0.5, coat=0.0)
    pts = [(-0.35, -0.65, 0.3), (0.3, -0.7, 0.45), (0.45, -0.6, -0.1), (-0.5, -0.55, -0.3),
           (0.0, -0.78, -0.45), (-0.1, -0.78, 0.7), (0.5, -0.5, 0.1), (-0.2, -0.8, 0.05)]
    for p in pts:
        ball(p, 0.06, speck, seg=12, rings=8)
    ball((-0.3, -0.5, 0.5), (0.12, 0.05, 0.2), mat("shine", (1, 1, 1), rough=0.2, emit=(1, 1, 1), emit_strength=0.6),
         rot=(0, math.radians(-25), 0))


def build_down():
    soft = mat("down", (0.70, 0.84, 1.0), rough=0.8, coat=0.0, sss=0.2)
    soft2 = mat("down2", (0.95, 0.86, 0.98), rough=0.8, coat=0.0)
    quill = mat("quill", (0.95, 0.60, 0.65), rough=0.35)
    ang = math.radians(28)
    ca, sa = math.cos(ang), math.sin(ang)

    def at(t, off=0.0):
        return (-0.5 + sa * t, -0.1 + off, -1.0 + ca * t)
    for i, t in enumerate((0.75, 1.1, 1.45, 1.8)):
        w = 0.5 - abs(t - 1.3) * 0.2
        ball(at(t), (w, 0.2, 0.34), soft if i % 2 == 0 else soft2, rot=(0, -ang, 0), seg=24, rings=12)
    tube([at(0.0, -0.22), at(1.0, -0.22), at(2.05, -0.22)], 0.05, quill)
    for x, z, sz in [(0.55, -0.7, 0.3), (0.2, -0.82, 0.26), (0.7, -0.45, 0.22)]:
        ball((x, -0.2, z), sz, soft2, seg=16, rings=10)


def build_truffle():
    dark = mat("truffle", (0.30, 0.22, 0.17), rough=0.55, coat=0.15)
    dark2 = mat("truffle2", (0.42, 0.31, 0.24), rough=0.55, coat=0.15)
    ball((0, 0, 0), (0.95, 0.85, 0.78), dark)
    bumps = [(-0.55, -0.55, 0.3), (0.2, -0.75, 0.35), (0.65, -0.4, 0.05), (-0.15, -0.8, -0.2),
             (-0.7, -0.35, -0.3), (0.45, -0.6, -0.5), (0.0, -0.55, 0.62), (0.7, -0.3, 0.45),
             (-0.4, -0.7, 0.0), (0.2, -0.85, 0.1)]
    for i, p in enumerate(bumps):
        ball(p, 0.2 + (i % 3) * 0.03, dark2 if i % 2 else dark, seg=16, rings=10)
    ball((-0.5, -0.65, 0.5), (0.1, 0.05, 0.14), mat("shine", (1, 1, 1), rough=0.3, emit=(1, 1, 1), emit_strength=0.3))


def build_trinket():
    gold = mat("gold", GOLD, rough=0.22, metal=0.9, coat=0.3)
    silver = mat("silver", (0.82, 0.86, 0.9), rough=0.2, metal=0.9, coat=0.3)
    rose = mat("rosebtn", PINK, rough=0.25)
    blue = mat("bluebtn", BLUE, rough=0.25)
    # bottle cap at back
    cyl((0.25, 0.2, 0.3), 0.55, 0.14, silver, rot=(math.radians(80), 0, math.radians(15)), verts=24)
    torus((0.25, 0.14, 0.3), 0.52, 0.05, silver, rot=(math.radians(80), 0, 0))
    # gold ring front-left
    torus((-0.45, -0.3, -0.35), 0.4, 0.12, gold, rot=(math.radians(60), 0, math.radians(20)))
    ball((-0.45, -0.52, -0.05), 0.15, mat("ringgem", (0.4, 0.9, 0.85), rough=0.1, coat=0.8))
    # buttons
    cyl((0.5, -0.4, -0.45), 0.36, 0.14, rose, rot=(math.radians(70), 0, 0))
    cyl((-0.5, 0.1, 0.55), 0.3, 0.12, blue, rot=(math.radians(75), 0, math.radians(20)))
    dark = mat("holes", BROWN_D, rough=0.5)
    for dx in (-0.1, 0.1):
        for dz in (-0.1, 0.1):
            ball((0.5 + dx, -0.5, -0.45 + dz), 0.05, dark, seg=10, rings=6)


def build_gem():
    violet = mat("gemv", (0.62, 0.35, 0.95), rough=0.05, coat=1.0, emit=(0.5, 0.2, 1.0), emit_strength=0.35)
    aqua = mat("gema", (0.30, 0.90, 0.92), rough=0.05, coat=1.0, emit=(0.1, 0.8, 0.9), emit_strength=0.35)
    pale = mat("gemp", (0.85, 0.40, 0.95), rough=0.05, coat=1.0, emit=(0.7, 0.2, 0.9), emit_strength=0.3)
    pts = 5
    outer, inner = 1.1, 0.55
    verts = []
    for i in range(pts * 2):
        r = outer if i % 2 == 0 else inner
        a = math.pi / 2 + i * math.pi / pts
        verts.append((math.cos(a) * r, 0.0, math.sin(a) * r))
    # bipyramid-ish: front apex bulges toward camera (-Y), back apex behind
    verts.append((0, -0.55, 0))  # front apex index 10
    verts.append((0, 0.5, 0))    # back apex index 11
    # shoulder ring (a slightly raised inner ring for facets)
    ring = []
    for i in range(pts * 2):
        v = verts[i]
        ring.append((v[0] * 0.62, -0.28, v[2] * 0.62))
    base = len(verts)
    verts += ring
    faces = []
    n = pts * 2
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, base + j))
        faces.append((i, base + j, base + i))
        faces.append((base + i, base + j, 10))
        faces.append((j, i, 11))
    o = mesh_obj("gem", verts, faces, violet, face_mats=[violet, aqua, pale, violet, aqua], smooth=False)
    # sparkle
    spark = mat("spark", (1, 1, 1), rough=0.3, emit=(1, 1, 1), emit_strength=3.0)
    ball((-0.55, -0.7, 0.7), (0.07, 0.03, 0.2), spark, rot=(0, 0, 0))
    ball((-0.55, -0.7, 0.7), (0.2, 0.03, 0.07), spark)
    ball((0.75, -0.7, -0.5), (0.05, 0.03, 0.14), spark)
    ball((0.75, -0.7, -0.5), (0.14, 0.03, 0.05), spark)
    return o


# ---------------------------------------------------------------- foods

def blade(x, h, tilt, m, w=0.16):
    s = math.sin(tilt)
    return ball((x + s * h * 0.5, 0, -0.55 + h * 0.5), (w, w * 0.5, h * 0.5), m, rot=(0, -tilt, 0), seg=16, rings=10)


def mound():
    soil = mat("soil", BROWN, rough=0.6, coat=0.1)
    ball((0, 0, -0.7), (1.0, 0.7, 0.28), soil)


def build_grass():
    g = [mat("g1", GREEN), mat("g2", GREEN_L), mat("g3", GREEN_D)]
    spec = [(-0.7, 1.1, -0.3), (-0.4, 1.5, -0.12), (-0.1, 1.9, 0.0), (0.2, 1.6, 0.12), (0.5, 1.3, 0.25),
            (0.75, 0.9, 0.38), (0.0, 1.2, -0.35), (-0.25, 0.9, 0.3)]
    for i, (x, h, t) in enumerate(spec):
        blade(x, h * 0.95, t, g[i % 3])
    mound()


def build_meadow():
    stem = mat("stem", (0.62, 0.70, 0.30))
    seed = mat("seedhead", (0.93, 0.76, 0.36), rough=0.4)
    seed2 = mat("seedhead2", (0.82, 0.60, 0.26), rough=0.4)
    for i, (x, h, t) in enumerate([(-0.55, 1.5, -0.12), (0.0, 1.9, 0.0), (0.55, 1.5, 0.12)]):
        tube([(x - t * 0.3, 0, -0.75), (x + t * 0.3, 0, -0.75 + h * 0.5), (x + t, 0, -0.75 + h)], 0.05, stem)
        top = -0.75 + h
        for k in range(5):
            ball((x + t + (0.07 if k % 2 else -0.07), -0.02, top - 0.32 + k * 0.17 - 0.05),
                 (0.13, 0.12, 0.17), seed if (k + i) % 2 else seed2, seg=14, rings=10)
        ball((x + t, 0, top + 0.28), (0.07, 0.07, 0.12), seed, seg=12, rings=8)
    blade(-0.25, 0.9, -0.5, mat("g1", GREEN))
    blade(0.3, 0.8, 0.5, mat("g3", GREEN_D))
    mound()


def build_pondweed():
    pad = mat("pad", (0.36, 0.68, 0.40), rough=0.3, coat=0.4)
    pad2 = mat("pad2", (0.28, 0.58, 0.34), rough=0.3)
    water = mat("water", (0.55, 0.82, 0.95), rough=0.1, coat=0.8)
    cyl((0, 0, -0.55), 1.15, 0.12, water, scale=(1, 0.8, 1), verts=48)
    cyl((0.05, 0, -0.42), 0.95, 0.14, pad, scale=(1, 0.8, 1), verts=48)
    cyl((0.05, 0, -0.36), 0.78, 0.1, pad2, scale=(1, 0.8, 1), verts=48)
    # notch in the pad
    cyl((0.55, -0.1, -0.3), 0.15, 0.2, water, rot=(0, 0, 0), scale=(1.7, 0.3, 1), verts=12, smooth=False)
    weed = mat("weed", GREEN_D)
    weed2 = mat("weed2", GREEN)
    for i, (x, h, t) in enumerate([(-0.5, 1.2, -0.3), (-0.25, 1.7, 0.1), (0.0, 1.3, 0.45), (-0.75, 0.9, 0.3)]):
        tube([(x, -0.1, -0.35), (x + t * 0.5, -0.1, -0.35 + h * 0.5), (x + t, -0.1, -0.35 + h)], 0.1,
             weed if i % 2 else weed2, taper=True)
        ball((x + t, -0.1, -0.35 + h), 0.16, weed2, seg=12, rings=8)


def build_seeds():
    puff = mat("puff", (0.98, 0.97, 0.92), rough=0.7, coat=0.0)
    stem = mat("dstem", GREEN)
    seed = mat("seedb", (0.60, 0.42, 0.26), rough=0.4)
    tube([(0, 0, -0.95), (0.08, 0, -0.2), (0, 0, 0.3)], 0.06, stem)
    center = Vector((0, 0, 0.5))
    n = 46
    for i in range(n):
        phi = math.acos(1 - 2 * (i + 0.5) / n)
        th = math.pi * (1 + 5 ** 0.5) * i
        d = Vector((math.sin(phi) * math.cos(th), math.sin(phi) * math.sin(th) * 0.6 - 0.2, math.cos(phi)))
        if d.y > 0.45:
            continue
        tip = center + d * 0.8
        tube([center + d * 0.1, tip], 0.012, puff)
        ball(tip, 0.085, puff, seg=10, rings=6)
    ball(center, 0.2, puff, seg=16, rings=10)
    for i, x in enumerate((-0.55, -0.3, -0.05, 0.2)):
        ball((0.5 + x * 0.5, -0.5 - i * 0.05, -0.8), (0.14, 0.07, 0.07), seed, rot=(0, math.radians(20 * i - 30), 0),
             seg=12, rings=8)


def build_scraps():
    bucket = mat("bucket", (0.62, 0.66, 0.72), rough=0.3, metal=0.7, coat=0.3)
    inner = mat("slop", (0.55, 0.45, 0.30), rough=0.5)
    cone((0, 0, -0.2), 0.62, 0.8, 1.2, bucket)
    torus((0, 0, 0.4), 0.8, 0.07, bucket)
    cyl((0, 0, 0.36), 0.78, 0.08, inner)
    # slop heap and apple core peeking out
    ball((0, 0, 0.45), (0.7, 0.6, 0.25), inner)
    core = mat("core", (0.97, 0.90, 0.60), rough=0.4)
    skin = mat("skin", RED, rough=0.25)
    ball((0.1, -0.15, 0.85), (0.3, 0.28, 0.38), core)
    ball((0.1, -0.35, 0.75), (0.28, 0.1, 0.36), skin)
    cyl((0.1, -0.15, 1.28), 0.03, 0.18, mat("astem", BROWN))
    ball((-0.35, -0.2, 0.62), (0.18, 0.14, 0.1), mat("peel", GREEN_L))
    # handle
    torus((0, 0, 0.45), 0.8, 0.04, bucket, rot=(math.radians(90), 0, 0), scale=(1, 1, 1))


def build_worms():
    dirt = mat("dirt", BROWN, rough=0.65, coat=0.05)
    dirt2 = mat("dirt2", BROWN_D, rough=0.65, coat=0.05)
    ball((0, 0, -0.45), (1.1, 0.8, 0.55), dirt)
    for p, s in [((-0.6, -0.4, -0.25), 0.28), ((0.65, -0.35, -0.3), 0.25), ((0.0, -0.6, -0.55), 0.22),
                 ((-0.2, -0.3, -0.05), 0.2)]:
        ball(p, s, dirt2, seg=16, rings=10)
    worm = mat("worm", (0.97, 0.62, 0.68), rough=0.25, coat=0.6)
    tube([(-0.55, -0.45, -0.05), (-0.45, -0.5, 0.55), (0.0, -0.5, 0.95), (0.5, -0.5, 0.65), (0.5, -0.5, 0.2)],
         0.17, worm, taper=True)
    ball((-0.55, -0.45, -0.05), 0.19, worm, seg=16, rings=10)
    # face on the worm head end
    eye = mat("eye", (0.12, 0.08, 0.08), rough=0.2)
    ball((0.54, -0.68, 0.24), 0.04, eye, seg=10, rings=6)
    ball((0.44, -0.68, 0.24), 0.04, eye, seg=10, rings=6)


def build_blooms():
    petal = mat("petal", PINK, rough=0.25, coat=0.6)
    petal2 = mat("petal2", (1.0, 0.75, 0.80), rough=0.25, coat=0.6)
    heart = mat("heart", GOLD, rough=0.3)
    stem = mat("fstem", GREEN)
    tube([(0, 0.1, -1.05), (0.05, 0.1, -0.4), (0, 0.1, 0.0)], 0.07, stem)
    leaf((-0.35, 0.1, -0.65), 0.3, 0.2, mat("fleaf", GREEN_D), rot=(0, math.radians(55), 0))
    for i in range(6):
        a = i * math.pi / 3
        ball((math.cos(a) * 0.5 - 0.1, -0.1, 0.25 + math.sin(a) * 0.5), (0.3, 0.16, 0.3),
             petal if i % 2 else petal2, rot=(0, -a, 0), seg=24, rings=12)
    ball((-0.1, -0.3, 0.25), (0.26, 0.2, 0.26), heart)
    # nectar drop, bottom right
    nectar = mat("nectar", (1.0, 0.82, 0.25), rough=0.05, coat=1.0, emit=(1.0, 0.7, 0.1), emit_strength=0.4)
    ball((0.78, -0.4, -0.45), (0.2, 0.18, 0.2), nectar)
    cone((0.78, -0.4, -0.12), 0.17, 0.0, 0.45, nectar, rot=(0, 0, 0))
    ball((0.72, -0.58, -0.4), (0.04, 0.03, 0.07), mat("shine", (1, 1, 1), rough=0.3, emit=(1, 1, 1), emit_strength=1.0))


def build_feed():
    burlap = mat("burlap", (0.82, 0.64, 0.40), rough=0.9, coat=0.0)
    burlap2 = mat("burlap2", (0.70, 0.52, 0.32), rough=0.9, coat=0.0)
    ball((0, 0, -0.3), (1.0, 0.7, 0.85), burlap, seg=36, rings=20)
    cone((0, 0, 0.5), 0.62, 0.38, 0.55, burlap2)
    twine = mat("twine", BROWN_D, rough=0.7)
    torus((0, 0, 0.55), 0.45, 0.06, twine)
    # floppy tied-off top
    cone((0.05, 0, 0.95), 0.4, 0.75, 0.45, burlap, rot=(0, math.radians(8), 0))
    ball((0.05, 0, 1.12), (0.7, 0.45, 0.14), burlap2)
    label = mat("flabel", CREAM, rough=0.5)
    ball((0, -0.62, -0.25), (0.5, 0.05, 0.38), label)
    ball((0, -0.67, -0.22), (0.17, 0.04, 0.17), mat("sprout", GREEN, rough=0.3))
    for i, x in enumerate((0.5, 0.75)):
        ball((x, -0.55, -0.95), (0.12, 0.08, 0.08), mat("kernel", GOLD), rot=(0, 0.5 * i, 0))


# ---------------------------------------------------------------- bubbles

def build_bubble(starving):
    cloud = mat("cloud", (1.0, 1.0, 1.0), rough=0.2, coat=0.5)
    rim = mat("cloudrim", (0.62, 0.45, 0.32), rough=0.4, coat=0.0)
    # outline puffs (slightly larger, darker, behind) then white puffs
    puffs = [(-0.7, 0.25, 0.45), (-0.2, 0.55, 0.55), (0.45, 0.45, 0.5), (0.8, 0.0, 0.45),
             (0.5, -0.3, 0.45), (-0.2, -0.35, 0.55), (-0.75, -0.2, 0.4)]
    for x, z, r in puffs:
        ball((x, 0.12, z + 0.1), (r + 0.07, 0.2, r + 0.07), rim, seg=24, rings=12)
    ball((0, 0.12, 0.1), (0.9, 0.2, 0.55), rim, seg=24, rings=12)
    for x, z, r in puffs:
        ball((x, 0.0, z + 0.1), (r, 0.25, r), cloud, seg=24, rings=12)
    ball((0, 0.0, 0.1), (0.85, 0.28, 0.5), cloud, seg=24, rings=12)
    # trailing bubbles
    for x, z, r in [(-0.65, -0.85, 0.15), (-0.85, -1.1, 0.09)]:
        ball((x, 0.12, z), r + 0.04, rim, seg=16, rings=10)
        ball((x, 0.0, z), r, cloud, seg=16, rings=10)
    # the empty bowl
    bowl_c = (0.90, 0.42, 0.36) if starving else (0.55, 0.78, 0.92)
    bowl = mat("bowlred" if starving else "bowlblue", bowl_c, rough=0.2, coat=0.7)
    inside = mat("bowlin" + ("r" if starving else "b"), tuple(c * 0.55 for c in bowl_c), rough=0.4)
    cone((0, -0.28, 0.03), 0.34, 0.6, 0.38, bowl, rot=(0, 0, 0), verts=40)
    cyl((0, -0.28, 0.23), 0.6, 0.02, inside, verts=40)
    torus((0, -0.28, 0.24), 0.6, 0.06, bowl)
    cyl((0, -0.28, -0.2), 0.25, 0.08, bowl, verts=24)
    if starving:
        red = mat("excl", RED, rough=0.25, coat=0.6)
        cyl((0.85, -0.3, 0.88), 0.07, 0.4, red, scale=(1, 1, 1), verts=16)
        ball((0.85, -0.3, 0.62), 0.09, red, seg=16, rings=10)
        ball((0.85, -0.3, 1.1), (0.1, 0.1, 0.1), red, seg=16, rings=10)
        drop = mat("sweat", (0.55, 0.82, 0.98), rough=0.05, coat=1.0)
        ball((-0.95, -0.3, 0.7), (0.1, 0.09, 0.11), drop)
        cone((-0.95, -0.3, 0.88), 0.09, 0.0, 0.26, drop)


BUILDERS = {
    "good-milk": build_milk, "good-wool": build_wool, "good-egg": build_egg,
    "good-duck-egg": build_duck_egg, "good-down": build_down, "good-truffle": build_truffle,
    "good-trinket": build_trinket, "good-gem": build_gem,
    "food-grass": build_grass, "food-meadow": build_meadow, "food-pondweed": build_pondweed,
    "food-seeds": build_seeds, "food-scraps": build_scraps, "food-worms": build_worms,
    "food-blooms": build_blooms, "food-feed": build_feed,
    "hunger-bubble": lambda: build_bubble(False),
    "starving-bubble": lambda: build_bubble(True),
}

# Per-icon framing: (orthographic scale, camera-space z centre offset).
FRAMING = {
    "hunger-bubble": (3.0, 0.1), "starving-bubble": (3.2, 0.15),
    "good-gem": (2.6, 0.0), "good-down": (2.5, 0.0), "good-milk": (2.9, 0.0),
    "good-egg": (2.6, 0.0), "food-feed": (2.8, 0.1), "good-duck-egg": (2.6, 0.0), "food-pondweed": (2.4, -0.2),
}
DEFAULT_FRAME = (2.5, 0.0)


# ---------------------------------------------------------------- render

def clear_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for block in list(bpy.data.meshes) + list(bpy.data.curves):
        if block.users == 0:
            (bpy.data.meshes if isinstance(block, bpy.types.Mesh) else bpy.data.curves).remove(block)
    for light in list(bpy.data.lights):
        bpy.data.lights.remove(light)
    for cam in list(bpy.data.cameras):
        bpy.data.cameras.remove(cam)


def pick_engine(scene):
    """Cycles first (CPU, no GL needed), then whichever EEVEE this build has."""
    try:
        import addon_utils
        addon_utils.enable("cycles")
    except Exception:
        pass
    for name in ("CYCLES", "BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "BLENDER_WORKBENCH"):
        try:
            scene.render.engine = name
            return name
        except TypeError:
            continue
    raise RuntimeError("no usable render engine")


def setup_render(scene, path, width, height):
    engine = pick_engine(scene)
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.filepath = path
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    if engine == "CYCLES":
        scene.cycles.device = "CPU"
        scene.cycles.samples = SAMPLES
        scene.cycles.seed = 7
        scene.cycles.use_denoising = False
        scene.cycles.max_bounces = 4
        scene.cycles.use_adaptive_sampling = False
        scene.cycles.filter_width = 1.5
    if scene.world is None:
        scene.world = bpy.data.worlds.new("GI_World")
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get("Background")
    if bg is not None:
        bg.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
        bg.inputs["Strength"].default_value = 0.55
    return engine


def add_light(name, energy, location, size):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.size = size
    lamp = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(lamp)
    lamp.location = location
    lamp.rotation_euler = (Vector((0, 0, 0)) - lamp.location).to_track_quat("-Z", "Y").to_euler()


def add_camera(scale, zoff):
    data = bpy.data.cameras.new("GI_Camera")
    data.type = "ORTHO"
    data.ortho_scale = scale
    cam = bpy.data.objects.new("GI_Camera", data)
    bpy.context.collection.objects.link(cam)
    tilt = math.radians(12)  # look slightly down for a friendlier read
    dist = 8.0
    cam.location = (0, -dist * math.cos(tilt), dist * math.sin(tilt) + zoff)
    cam.rotation_euler = (math.radians(90) - tilt, 0, 0)
    bpy.context.scene.camera = cam


def render_icon(name):
    clear_scene()
    scene = bpy.context.scene
    BUILDERS[name]()
    add_light("GI_Key", 450, (-3.5, -4.5, 5.0), 4.0)
    add_light("GI_Fill", 160, (4.5, -3.5, 1.5), 4.0)
    add_light("GI_Rim", 220, (1.0, 4.5, 3.5), 3.0)
    scale, zoff = FRAMING.get(name, DEFAULT_FRAME)
    add_camera(scale, zoff)
    tmp = os.path.join(tempfile.gettempdir(), "gi_%s_big.png" % name)
    setup_render(scene, tmp, SIZE * SUPER, SIZE * SUPER)
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(tmp)
    img.scale(SIZE, SIZE)
    out = os.path.abspath(os.path.join(OUT_DIR, name + ".png"))
    img.filepath_raw = out
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)
    print("wrote " + out)


def contact_sheet(names, review_dir):
    clear_scene()
    scene = bpy.context.scene
    cols = 6
    rows = (len(names) + cols - 1) // cols
    cell = 170
    sheet = bpy.data.images.new("GI_Sheet", cell * cols, cell * rows, alpha=True)
    pixels = [0.96, 0.93, 0.85, 1.0] * (cell * cols * cell * rows)
    for i, name in enumerate(names):
        src = bpy.data.images.load(os.path.abspath(os.path.join(OUT_DIR, name + ".png")))
        w, h = src.size
        data = list(src.pixels)
        ox = (i % cols) * cell + (cell - w) // 2
        oy = (rows - 1 - i // cols) * cell + (cell - h) // 2
        for y in range(h):
            for x in range(w):
                s = (y * w + x) * 4
                a = data[s + 3]
                d = ((oy + y) * cell * cols + ox + x) * 4
                for c in range(3):
                    pixels[d + c] = data[s + c] * a + pixels[d + c] * (1 - a)
        bpy.data.images.remove(src)
    sheet.pixels = pixels
    # also a 32px strip is useful to judge small-size readability
    path = os.path.join(review_dir, "goods-review.png")
    sheet.filepath_raw = path
    sheet.file_format = "PNG"
    sheet.save()
    print("wrote review sheet " + path)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    only = [n.lower() for n in sys.argv[sys.argv.index("--") + 1:]] if "--" in sys.argv else []
    for name in NAMES:
        if only and name not in only:
            continue
        render_icon(name)
    review_dir = os.environ.get("GOODS_REVIEW_DIR", tempfile.gettempdir())
    contact_sheet(NAMES, review_dir)


main()
