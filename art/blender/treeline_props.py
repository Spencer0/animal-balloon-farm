"""Animal Balloon Farm: the biome props that make up the tree line around the farm.

Run from repository root:
  blender --background --factory-startup --python art/blender/treeline_props.py

Regenerates public/assets/props/treeline.glb (and treeline-review.png when the
machine can render one). Normals are not exported: the runtime flat-shades. One file,
one mesh per prop, all sharing a single vertex-coloured material, so the game
can draw every copy of a prop with one InstancedMesh and tint each copy a little.

The runtime reads the mesh NAMES (src/scene/treeline.ts, TREELINE_PROPS):

  mountain meadow  pine, spruce, birch, bush, flowers
  rocky mountain   peak_tall, peak_broad, boulder, boulder_mossy, snag
  lake             willow, reeds, lily_pads
  swamp            cypress, cattails, stump, toadstool
  ocean            palm, palm_lean, dune_grass, sea_stack, sailboat

Authoring frame: Z-up, each prop rests on z = 0 and is centred on the origin in
X/Y, so the glTF exporter lands it in Three.js with the base on the origin and
the crown up +Y. Everything is flat shaded and low poly on purpose: a few
hundred of these are on screen at once at the horizon.
"""
from __future__ import annotations

import math
import random
from pathlib import Path

import bpy
import bmesh
from mathutils import Euler, Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "public" / "assets" / "props"
OUTPUT.mkdir(parents=True, exist_ok=True)


def srgb_to_linear(value: str):
    """Hex to the colour layer's value. The layer is byte (sRGB-encoded) data, so the hex goes in as written."""
    raw = value.lstrip("#")
    return (*[int(raw[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], 1.0)


class Builder:
    """Collects primitives into one bmesh with a colour per face."""

    def __init__(self, name: str, seed: int):
        self.name = name
        self.rng = random.Random(seed)
        self.bm = bmesh.new()
        self.color_layer = self.bm.loops.layers.color.new("Col")

    def _paint(self, faces, color):
        rgba = srgb_to_linear(color)
        for face in faces:
            for loop in face.loops:
                loop[self.color_layer] = rgba

    @staticmethod
    def _faces_of(verts):
        """Faces made by one bmesh.ops call. bm.faces indices are not in creation order, so go via the verts."""
        faces = {}
        for v in verts:
            for face in v.link_faces:
                faces[face.index if face.index >= 0 else id(face)] = face
        return list(faces.values())

    def jitter(self, verts, amount: float):
        for v in verts:
            v.co += Vector([self.rng.uniform(-amount, amount) for _ in range(3)])

    def cone(self, base, r1, r2, height, color, segments=7, tilt=(0, 0, 0), jitter=0.0, caps=True, color_top=None):
        """Frustum standing on `base`, optionally tilted (Euler XYZ radians) about its base."""
        matrix = Matrix.Translation(Vector(base)) @ Euler(tilt, "XYZ").to_matrix().to_4x4() @ Matrix.Translation((0, 0, height / 2))
        result = bmesh.ops.create_cone(self.bm, cap_ends=caps, cap_tris=False, segments=segments,
                                       radius1=r1, radius2=r2, depth=height, matrix=matrix)
        if jitter:
            self.jitter(result["verts"], jitter)
        faces = self._faces_of(result["verts"])
        self._paint(faces, color)
        if color_top:
            top = [f for f in faces if f.calc_center_median().z > Vector(base).z + height * .6 + (math.sin(tilt[0]) * height)]
            self._paint(top, color_top)
        return faces

    def blob(self, center, radii, color, subdivisions=1, jitter=0.0, color_top=None, top_threshold=.45, rotation=0.0):
        matrix = Matrix.Translation(Vector(center)) @ Matrix.Rotation(rotation, 4, "Z") @ Matrix.Diagonal(Vector((*radii, 1.0)))
        result = bmesh.ops.create_icosphere(self.bm, subdivisions=subdivisions, radius=1.0, matrix=matrix)
        if jitter:
            self.jitter(result["verts"], jitter)
        faces = self._faces_of(result["verts"])
        self._paint(faces, color)
        if color_top:
            cz = center[2]
            top = [f for f in faces if (f.calc_center_median().z - cz) > top_threshold * radii[2]]
            self._paint(top, color_top)
        return faces

    def lathe(self, rings, segments, color_for, jitter=0.0, offset=(0.0, 0.0)):
        """Rings: [(z, radius)], bottom to top. Colour comes from color_for(height_fraction, face_index)."""
        verts = []
        for z, radius in rings:
            row = []
            for i in range(segments):
                angle = i / segments * math.tau
                scale = 1.0 + self.rng.uniform(-jitter, jitter) if radius > 0.001 else 1.0
                row.append(self.bm.verts.new((offset[0] + math.cos(angle) * radius * scale, offset[1] + math.sin(angle) * radius * scale, z + (self.rng.uniform(-jitter, jitter) * .6 if radius > .001 else 0))))
            verts.append(row)
        top_z = rings[-1][0]
        count = 0
        for r in range(len(rings) - 1):
            for i in range(segments):
                a, b = verts[r][i], verts[r][(i + 1) % segments]
                c, d = verts[r + 1][(i + 1) % segments], verts[r + 1][i]
                quad = [a, b, c, d] if rings[r + 1][1] > .001 else [a, b, d]
                if len(set(quad)) < 3:
                    continue
                try:
                    face = self.bm.faces.new(quad)
                except ValueError:
                    continue
                self._paint([face], color_for(face.calc_center_median().z / top_z, count))
                count += 1
        return count

    def blade(self, base, length, width, color, tilt, yaw, bend=0.0):
        """A tapered grass blade or frond: a thin cone, optionally bent by a second shorter segment."""
        mat = Matrix.Rotation(yaw, 4, "Z")
        first_tilt = tilt
        tip = Vector(base) + mat @ Vector((0, -math.sin(first_tilt) * length * .6, math.cos(first_tilt) * length * .6))
        self._tilted(base, length * .6, width, width * .7, color, first_tilt, yaw)
        self._tilted(tip, length * .4, width * .7, 0.01, color, first_tilt + bend, yaw)
        return tip

    def _tilted(self, base, length, r1, r2, color, tilt, yaw):
        matrix = (Matrix.Translation(Vector(base)) @ Matrix.Rotation(yaw, 4, "Z") @ Matrix.Rotation(tilt, 4, "X")
                  @ Matrix.Translation((0, 0, length / 2)))
        result = bmesh.ops.create_cone(self.bm, cap_ends=False, segments=3, radius1=r1, radius2=max(r2, .005), depth=length, matrix=matrix)
        self._paint(self._faces_of(result["verts"]), color)

    def finish(self, material):
        self.bm.normal_update()
        mesh = bpy.data.meshes.new(self.name + " · mesh")
        for face in self.bm.faces:
            face.smooth = False
        self.bm.to_mesh(mesh)
        self.bm.free()
        mesh.materials.append(material)
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        return obj


def make_material():
    mat = bpy.data.materials.new("Treeline · vertex colour")
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    shader = nodes.get("Principled BSDF")
    attribute = nodes.new("ShaderNodeVertexColor")
    attribute.layer_name = "Col"
    links.new(attribute.outputs["Color"], shader.inputs["Base Color"])
    shader.inputs["Roughness"].default_value = .9
    return mat


# ---------------------------------------------------------------- mountain meadow

def make_pine(mat):
    b = Builder("pine", 11)
    b.cone((0, 0, 0), .34, .22, 2.6, "#7d5d40", segments=5, caps=False)
    tiers = [(2.35, 2.5, 2.6, "#5a8a62"), (1.95, 2.4, 3.8, "#639569"), (1.5, 2.3, 5.0, "#6da070"), (1.05, 2.1, 6.2, "#78ab76"), (.6, 1.9, 7.3, "#85b87f")]
    for radius, height, z, color in tiers:
        b.cone((0, 0, z - .2), radius, .06, height, color, segments=7, jitter=.07, caps=False)
    return b.finish(mat)


def make_spruce(mat):
    b = Builder("spruce", 12)
    b.cone((0, 0, 0), .24, .16, 1.4, "#76593d", segments=5)
    for radius, height, z, color in [(1.45, 2.6, 1.0, "#4f7f5f"), (1.1, 2.4, 2.4, "#5b8c68"), (.7, 2.1, 3.8, "#689a72")]:
        b.cone((0, 0, z), radius, .04, height, color, segments=6, jitter=.05, caps=False)
    return b.finish(mat)


def make_birch(mat):
    b = Builder("birch", 13)
    b.cone((0, 0, 0), .2, .12, 3.9, "#efe9da", segments=5, tilt=(.04, 0, 0))
    for z, side in [(.8, .1), (1.7, -.1), (2.6, .12), (3.2, -.12)]:
        b.cone((side, .12, z), .045, .045, .22, "#4a4038", segments=4)
    for center, radii, color in [((0, 0, 4.1), (1.15, 1.1, 1.2), "#b7d17a"), ((.7, .2, 3.4), (.8, .8, .8), "#a8c96f"), ((-.6, -.3, 3.55), (.85, .8, .85), "#c2d98a"), ((.1, -.6, 4.7), (.7, .7, .7), "#cde29a")]:
        b.blob(center, radii, color, jitter=.07)
    return b.finish(mat)


def make_bush(mat):
    b = Builder("bush", 14)
    for center, radii, color in [((0, 0, .45), (.8, .75, .55), "#7aa974"), ((.65, .25, .35), (.55, .5, .4), "#86b47c"), ((-.55, -.2, .35), (.55, .55, .4), "#6f9e6b")]:
        b.blob(center, radii, color, jitter=.04)
    return b.finish(mat)


def make_flowers(mat):
    """One patch with pink, gold and white blooms mixed, so a single draw covers every flower."""
    b = Builder("flowers", 15)
    b.blob((0, 0, .1), (1.0, .9, .16), "#86b46c", subdivisions=0, jitter=.04)
    petals = ["#f2a0b8", "#f4cf5b", "#fdf8ea", "#ec86a4", "#f8e08c"]
    for _ in range(7):
        angle = b.rng.uniform(0, math.tau)
        dist = b.rng.uniform(.1, .8)
        x, y = math.cos(angle) * dist, math.sin(angle) * dist
        height = b.rng.uniform(.28, .55)
        b.cone((x, y, 0), .025, .015, height, "#5f9460", segments=3, caps=False)
        b.cone((x, y, height), .02, .13, .14, b.rng.choice(petals), segments=5)
    return b.finish(mat)


# ---------------------------------------------------------------- rocky mountain

def peak_colors(snow):
    def color_for(fraction, _):
        if fraction > snow:
            return "#f1f4f6" if fraction > snow + .06 else "#dfe5e8"
        if fraction > .38:
            return "#a39c92"
        return "#8d8479"
    return color_for


def make_peak(name, mat, seed, height, base, snow, lean):
    b = Builder(name, seed)
    rings = [(0, base), (height * .22, base * .8), (height * .45, base * .55), (height * .68, base * .34), (height * .86, base * .17), (height, 0)]
    b.lathe(rings, 8, peak_colors(snow), jitter=.14)
    # A smaller shoulder so the skyline is not a lone cone.
    b.lathe([(0, base * .55), (height * .3, base * .4), (height * .55, base * .2), (height * .72, 0)], 7,
            peak_colors(snow + .1), jitter=.14, offset=(base * lean, base * .15))
    return b.finish(mat)


def make_boulder(name, mat, seed, mossy):
    b = Builder(name, seed)
    stone, moss = ("#a29c92", "#8bab72") if mossy else ("#aaa59b", "#b5afa4")
    b.blob((0, 0, .7), (1.35, 1.15, 1.0), stone, jitter=.16, color_top=moss, top_threshold=.35 if mossy else .75)
    b.blob((1.35, .5, .4), (.75, .65, .55), "#98928a", jitter=.1, color_top=moss, top_threshold=.45)
    b.blob((-.95, -.7, .3), (.55, .5, .4), "#b0aaa0", jitter=.08)
    return b.finish(mat)


def make_snag(mat):
    b = Builder("snag", 31)
    b.cone((0, 0, 0), .34, .13, 5.2, "#8a7a68", segments=5, tilt=(.05, 0, 0), jitter=.03)
    for z, yaw, length in [(2.2, 0.4, 1.8), (3.1, 2.4, 1.6), (3.9, 4.3, 1.2), (4.5, 1.2, .9)]:
        b._tilted((0, 0, z), length, .09, .03, "#7c6d5c", 1.0, yaw)
    return b.finish(mat)


# ---------------------------------------------------------------- lake

def make_willow(mat):
    b = Builder("willow", 41)
    b.cone((0, 0, 0), .5, .26, 2.8, "#7d6a52", segments=6, tilt=(.05, .04, 0), jitter=.03)
    b.blob((0, 0, 3.7), (2.2, 2.1, 1.5), "#8fba7a", jitter=.12, color_top="#a2cb88", top_threshold=.3)
    b.blob((.5, .3, 4.9), (1.4, 1.3, 1.0), "#9cc783", jitter=.1, color_top="#aed48f", top_threshold=.3)
    for i in range(10):
        angle = i / 10 * math.tau
        r = 2.05 + b.rng.uniform(-.2, .2)
        length = b.rng.uniform(2.0, 3.0)
        # Strands hang from the crown rim: an inverted thin cone.
        b.cone((math.cos(angle) * r, math.sin(angle) * r, 3.4 - length + .4), .03, .16, length, "#a9d08c" if i % 2 else "#9bc47f", segments=3, caps=False)
    return b.finish(mat)


def make_reeds(mat):
    b = Builder("reeds", 42)
    for i in range(8):
        angle = b.rng.uniform(0, math.tau)
        dist = b.rng.uniform(0, .55)
        base = (math.cos(angle) * dist, math.sin(angle) * dist, 0)
        b.blade(base, b.rng.uniform(1.7, 2.7), .055, b.rng.choice(["#8fae5a", "#9bba66", "#7fa04f"]), b.rng.uniform(.05, .3), angle, bend=.28)
    return b.finish(mat)


def make_lily_pads(mat):
    b = Builder("lily_pads", 43)
    for x, y, r in [(0, 0, .85), (1.3, .5, .6), (-1.0, .9, .65), (.5, -1.2, .7), (-.9, -.8, .5)]:
        b.cone((x, y, 0), r, r, .04, "#79b46c", segments=6, caps=False)
    b.blob((.1, .1, .14), (.2, .2, .13), "#f4b6c8", subdivisions=0)
    return b.finish(mat)


# ---------------------------------------------------------------- swamp

def make_cypress(mat):
    b = Builder("cypress", 51)
    b.cone((0, 0, 0), 1.25, .42, 1.6, "#7a6a55", segments=7, jitter=.05)
    b.cone((0, 0, 1.5), .42, .3, 3.0, "#86755f", segments=6, jitter=.04)
    for i in range(4):
        angle = i / 4 * math.tau
        b.cone((math.cos(angle) * 1.5, math.sin(angle) * 1.5, 0), .2, .06, .55 + (i % 2) * .25, "#7a6a55", segments=4, caps=False)
    b.blob((0, 0, 4.8), (2.0, 1.9, 1.4), "#68855a", jitter=.12, color_top="#7fa066", top_threshold=.3)
    b.blob((-.6, .5, 6.0), (1.3, 1.2, .9), "#6f8f5d", jitter=.1, color_top="#86a86d", top_threshold=.3)
    b.blob((.9, .5, 4.0), (1.3, 1.2, .7), "#657f52", jitter=.1)
    for i in range(7):
        angle = i / 7 * math.tau
        length = b.rng.uniform(1.4, 2.4)
        b.cone((math.cos(angle) * 1.9, math.sin(angle) * 1.9, 4.5 - length), .02, .14, length, "#a8b58f", segments=3, caps=False)
    return b.finish(mat)


def make_cattails(mat):
    b = Builder("cattails", 52)
    for i in range(6):
        angle = b.rng.uniform(0, math.tau)
        dist = b.rng.uniform(0, .5)
        x, y = math.cos(angle) * dist, math.sin(angle) * dist
        height = b.rng.uniform(1.6, 2.5)
        tilt = b.rng.uniform(.03, .18)
        b._tilted((x, y, 0), height, .035, .02, "#7da250", tilt, angle)
        tip = Vector((x, y, 0)) + Matrix.Rotation(angle, 3, "Z") @ Vector((0, -math.sin(tilt) * height, math.cos(tilt) * height))
        b._tilted(tip - Vector((0, 0, .3)), .5, .075, .075, "#7a4e32", tilt, angle)
    for i in range(4):
        angle = i / 4 * math.tau
        b.blade((math.cos(angle) * .25, math.sin(angle) * .25, 0), 1.6, .06, "#8caf58", .35, angle, bend=.4)
    return b.finish(mat)


def make_stump(mat):
    b = Builder("stump", 53)
    b.cone((0, 0, 0), .85, .6, 1.0, "#7b6048", segments=8, jitter=.05, color_top="#c9ab80")
    for i in range(6):
        angle = i / 6 * math.tau
        b.cone((math.cos(angle) * .75, math.sin(angle) * .75, 0), .22, .05, .5, "#6f5640", segments=4)
    b.blob((0, 0, 1.0), (.72, .7, .25), "#7fa468", jitter=.03)
    return b.finish(mat)


def make_toadstool(mat):
    b = Builder("toadstool", 54)
    for x, y, scale in [(0, 0, 1.0), (1.3, .5, .6), (-.9, .8, .45)]:
        stem = 1.1 * scale
        b.cone((x, y, 0), .22 * scale, .16 * scale, stem, "#efe4cc", segments=6)
        b.blob((x, y, stem + .15 * scale), (.9 * scale, .9 * scale, .55 * scale), "#d8604f", jitter=.02, color_top="#e2705c", top_threshold=.2)
        for ang in ((0.4, 3.6) if scale > .9 else ()):
            b.blob((x + math.cos(ang) * .5 * scale, y + math.sin(ang) * .5 * scale, stem + .55 * scale), (.12 * scale, .12 * scale, .06 * scale), "#fff6e1", subdivisions=0)
    return b.finish(mat)


# ---------------------------------------------------------------- ocean

def palm_builder(name, mat, seed, lean):
    """A curved trunk of tapering segments, each pointed along the curve, under a crown of arched fronds."""
    b = Builder(name, seed)
    segments = 5
    height = 7.6
    sway = lean * 2.3

    def trunk_point(t):
        return (sway * t * t, 0.0, height * t)

    for i in range(segments):
        p0, p1 = trunk_point(i / segments), trunk_point((i + 1) / segments)
        run, rise = p1[0] - p0[0], p1[2] - p0[2]
        b.cone(p0, .37 - i * .027, .36 - (i + 1) * .027, math.hypot(run, rise) * 1.05, "#c9a577" if i % 2 else "#bd9a6b",
               segments=5, tilt=(0, math.atan2(run, rise), 0), caps=False)
    top = trunk_point(1.0)
    for i in range(7):
        yaw = i / 7 * math.tau + .2
        b.blade(top, 4.4, .42, "#5fae6c" if i % 2 else "#4f9d61", 1.05 + (i % 3) * .1, yaw, bend=.55)
    for ang in (.5, 2.4, 4.3):
        b.blob((top[0] + math.cos(ang) * .3, top[1] + math.sin(ang) * .3, top[2] - .25), (.22, .22, .24), "#6f4a2d", subdivisions=0)
    return b.finish(mat)


def make_dune_grass(mat):
    b = Builder("dune_grass", 61)
    for i in range(9):
        angle = i / 9 * math.tau + b.rng.uniform(-.2, .2)
        dist = b.rng.uniform(0, .25)
        b.blade((math.cos(angle) * dist, math.sin(angle) * dist, 0), b.rng.uniform(1.0, 1.7), .05, b.rng.choice(["#b9c870", "#c9cf7b", "#a9bf66"]), b.rng.uniform(.15, .5), angle, bend=.35)
    return b.finish(mat)


def make_sea_stack(mat):
    b = Builder("sea_stack", 62)

    def color_for(fraction, index):
        if fraction > .92:
            return "#86ad6e"
        return "#7d8189" if fraction > .3 else "#6c7078"

    b.lathe([(0, 2.6), (1.6, 2.2), (4.2, 1.7), (7.0, 1.55), (8.6, 1.35), (9.2, 1.1), (9.5, 0)], 8, color_for, jitter=.12)
    return b.finish(mat)


def make_sailboat(mat):
    b = Builder("sailboat", 63)
    b.cone((0, 0, 0), 1.25, .75, .5, "#d98a5e", segments=3, tilt=(0, math.pi / 2, 0))
    b.blob((0, 0, .32), (1.9, .62, .35), "#d98a5e", jitter=.02, color_top="#f1e2c4", top_threshold=.1)
    b.cone((0, 0, .5), .05, .04, 4.2, "#8a6d4d", segments=4)
    for points, color in [([(.1, 0, 1.0), (1.55, 0, 1.0), (.1, 0, 4.4)], "#f7f1e1"), ([(-.1, 0, 1.0), (-1.4, 0, 1.0), (-.1, 0, 3.4)], "#e46f61")]:
        # Two separate triangles back to back, so the sail shows from either side.
        front = b.bm.faces.new([b.bm.verts.new(v) for v in points])
        back = b.bm.faces.new([b.bm.verts.new(v) for v in reversed(points)])
        b._paint([front, back], color)
    return b.finish(mat)


def build_all():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mat = make_material()
    objects = [
        make_pine(mat), make_spruce(mat), make_birch(mat), make_bush(mat),
        make_flowers(mat),
        make_peak("peak_tall", mat, 21, 26, 9.5, .68, .5),
        make_peak("peak_broad", mat, 23, 17, 12.5, .76, -.45),
        make_boulder("boulder", mat, 24, False), make_boulder("boulder_mossy", mat, 25, True), make_snag(mat),
        make_willow(mat), make_reeds(mat), make_lily_pads(mat),
        make_cypress(mat), make_cattails(mat), make_stump(mat), make_toadstool(mat),
        palm_builder("palm", mat, 71, 0.0), palm_builder("palm_lean", mat, 72, 1.0), make_dune_grass(mat), make_sea_stack(mat), make_sailboat(mat),
    ]
    return objects


def layout_for_review(objects):
    x = 0.0
    for obj in objects:
        dims = obj.dimensions
        obj.location.x = x + dims.x / 2
        x += max(dims.x, 2.0) + 1.6
    return x


def render_review(objects, width):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "VERTEX"
    scene.display.shading.show_shadows = False
    scene.render.resolution_x, scene.render.resolution_y = 2400, 700
    scene.render.film_transparent = False
    scene.world = bpy.data.worlds.new("review")
    scene.world.color = (.8, .88, .92)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = width * .78
    cam.location = (width / 2, -60, 10)
    cam.rotation_euler = Euler((math.radians(86), 0, 0), "XYZ")
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.filepath = str(OUTPUT / "treeline-review.png")
    bpy.ops.render.render(write_still=True)


def export(objects):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str(OUTPUT / "treeline.glb"), export_format="GLB", use_selection=True,
        export_apply=True, export_yup=True, export_normals=False, export_materials="EXPORT", export_cameras=False, export_lights=False,
    )


if __name__ == "__main__":
    props = build_all()
    export(props)
    total = layout_for_review(props)
    # Workbench needs a GL driver and aborts the whole process without one, so ask first.
    import ctypes.util
    if ctypes.util.find_library("EGL") or ctypes.util.find_library("GL"):
        render_review(props, total)
    else:
        print("review render skipped: no GL driver on this machine")
    print("treeline props:", ", ".join(p.name for p in props))
