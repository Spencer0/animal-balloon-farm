"""Animal Balloon Farm: the tool-unlock cutscene cast and set.

Run from the repository root:
  blender --background --factory-startup --python art/blender/tool_unlock_cutscene.py
  blender --background --factory-startup --python art/blender/tool_unlock_cutscene.py -- boy

One short film plays whenever a tool is bought at Pip's shop: the boy from the
intro walks up to the counter, Pip hands the tool over, the boy turns it over
in his hands and cheers. The tool itself is not in these files. The game builds
it with `createGardenToolModel` and parents it to the hand empties below, so
the same film serves every tool. See CUTSCENE_PIPELINE.md.

Outputs, all in public/assets/cutscenes/:
  tool-boy.glb    the boy. Clips IDLE, WALK, TAKE, INSPECT, CHEER.
                  Node HAND_GRIP_R sits in his right fist.
  tool-pip.glb    Pip the shopkeeper. Clips IDLE, WAVE, OFFER, CLAP.
                  Node HAND_GRIP_R sits in Pip's right fist.
  tool-shop.glb   the shop interior: counter, shelves, garlands, window.
Each has a matching .blend and -review.png.

Primitives, the palette, the rig and the boy's body come from
intro_cutscene.py, so both films share one cast and one look. Conventions are
the same: Blender Z-up, metres, characters face -Y (Three.js +Z).
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import intro_cutscene as kit  # noqa: E402
from intro_cutscene import box, cone, cylinder, mat, merge, pivot, sphere, torus, tube  # noqa: E402

# The counter runs along X. Pip stands behind it (+Y), the boy in front.
COUNTER_Y = .6
COUNTER_HEIGHT = .74
WALL_Y = 2.4
SIDE_X = 3.2


def shop_palette():
    m = kit.palette()
    m.update({
        "butter": mat("Shop wall butter", "#f3dca0", .8, coat=0),
        "butterStripe": mat("Shop wall stripe mint", "#bfe0c4", .8, coat=0),
        "mint": mat("Balloon mint", "#7fcfb0", .24),
        "mintDeep": mat("Balloon mint deep", "#4fa88a", .28),
        "ginger": mat("Balloon ginger hair", "#d0763a", .3),
        "apron": mat("Apron canvas", "#f4ead6", .55, coat=.1),
        "apronStripe": mat("Apron stripe cherry", "#d33a3a", .5, coat=.1),
        "straw": mat("Boater straw", "#e6c46e", .65, coat=.1),
        "trouser": mat("Balloon trouser cocoa", "#6a4a36", .3),
        "dayGlass": mat("Window day glass", "#bfe4ff", .05, coat=1, emit="#d8f0ff", strength=1.6),
        "jar": mat("Candy jar glass", "#e8f4f6", .05, coat=1),
    })
    return m


def add_grip(rig, scale):
    """An empty in the right fist that the runtime parents the tool to. It is
    not keyed: it rides along with the forearm the clips already animate."""
    grip = pivot("HAND_GRIP_R", (0, -.012, -.215 * scale), rig.pivots["elbow_R"])
    return grip


# ------------------------------------------------------------------- the boy --

def build_tool_boy(m):
    rig, root = kit.build_boy_figure(m, label="TOOL BOY")
    add_grip(rig, 1.0)
    _sit, blink, stand = kit.boy_poses()
    rig.clip("IDLE", [
        (1, stand),
        (24, merge(stand, {"torso": {"rot": (-2, 0, 1)}, "head": {"rot": (-3, 0, 4)}})),
        (30, merge(stand, blink)),
        (33, stand),
        (48, stand),
    ])
    rig.clip("WALK", kit.walk_keys())
    eager = {"brow_L": {"loc": (0, 0, .025)}, "brow_R": {"loc": (0, 0, .025)}, "mouth": {"scale": (.8, 1, 2.0)}}
    reach = merge(stand, eager, {
        "torso": {"rot": (-8, 0, 0)},
        "shoulder_R": {"rot": (-72, 8, 0)}, "elbow_R": {"rot": (-16, 0, 0)},
        "shoulder_L": {"rot": (-62, -10, 0)}, "elbow_L": {"rot": (-22, 0, 0)},
        "head": {"rot": (-4, 0, 0)},
    })
    # Holding it up in front of his face: right fist at chest height, the left
    # hand cupped underneath, head bowed to look.
    hold = merge(stand, {
        "torso": {"rot": (-3, 0, 0)},
        "shoulder_R": {"rot": (-50, -16, 0)}, "elbow_R": {"rot": (-80, 0, 0)},
        "shoulder_L": {"rot": (-40, 14, 0)}, "elbow_L": {"rot": (-70, 0, 0)},
        "head": {"rot": (12, 0, 0)},
        "mouth": {"scale": (.75, 1, 1.9)},
        "brow_L": {"loc": (0, 0, .02)}, "brow_R": {"loc": (0, 0, .02)},
    })
    rig.clip("TAKE", [
        (1, stand),
        (9, reach),
        (18, merge(reach, {"torso": {"rot": (-10, 0, 0)}})),
        (30, hold),
        (36, hold),
    ])
    rig.clip("INSPECT", [
        (1, hold),
        (12, merge(hold, {"head": {"rot": (14, 8, 14)}, "torso": {"rot": (-3, 0, 4)}})),
        (22, merge(hold, blink, {"head": {"rot": (14, 8, 14)}, "torso": {"rot": (-3, 0, 4)}})),
        (25, merge(hold, {"head": {"rot": (14, 8, 14)}, "torso": {"rot": (-3, 0, 4)}})),
        (37, merge(hold, {"head": {"rot": (10, -8, -12)}, "torso": {"rot": (-3, 0, -4)}, "mouth": {"scale": (1.1, 1, 1.4)}})),
        (48, hold),
    ])
    cheer = merge(stand, {
        "shoulder_R": {"rot": (-172, 4, 0)}, "elbow_R": {"rot": (-4, 0, 0)},
        "shoulder_L": {"rot": (-14, -112, 0)}, "elbow_L": {"rot": (-30, 0, 0)},
        "brow_L": {"loc": (0, 0, .03)}, "brow_R": {"loc": (0, 0, .03)},
        "mouth": {"scale": (1.3, 1, 2.5)},
        "head": {"rot": (-12, 0, 0)},
    })
    crouch = {"hips": {"loc": (0, 0, -.03)}, "knee_L": {"rot": (16, 0, 0)}, "knee_R": {"rot": (16, 0, 0)},
              "thigh_L": {"rot": (-12, 0, 0)}, "thigh_R": {"rot": (-12, 0, 0)}}
    rig.clip("CHEER", [
        (1, merge(cheer, crouch)),
        (7, merge(cheer, {"hips": {"loc": (0, 0, .11)}, "head": {"rot": (-15, 0, 6)}, "shoulder_L": {"rot": (-14, -128, 0)}})),
        (13, merge(cheer, crouch)),
        (19, merge(cheer, {"hips": {"loc": (0, 0, .11)}, "head": {"rot": (-15, 0, -6)}, "shoulder_L": {"rot": (-14, -128, 0)}})),
        (25, merge(cheer, crouch)),
    ])
    return root


# ------------------------------------------------------------------- Pip --

PIP_SCALE = 1.22


def build_pip(m):
    rig, root, head_center, head_r = kit.build_person("TOOL PIP", m, scale=PIP_SCALE, shirt=m["mint"], sleeve=m["mint"],
                                                      legs=m["trouser"], shoe=m["black"], hair=m["ginger"], child=False)
    s = PIP_SCALE
    torso_h = .25 * s
    torso = rig.pivots["torso"]
    hips = rig.pivots["hips"]
    add_grip(rig, s)
    # A striped shop apron over the shirt, with a pocket and a pencil.
    sphere("apron bib", (0, -.12 * s, torso_h * .92), (.17 * s, .07 * s, .2 * s), m["apron"], torso, segments=22, rings=14)
    for index in range(3):
        box(f"apron stripe {index}", (.022 * s, .012, .3 * s), ((index - 1) * .08 * s, -.185 * s, torso_h * .9), m["apronStripe"], torso,
            rotation=(-8, 0, 0))
    sphere("apron skirt", (0, -.13 * s, -.06 * s), (.2 * s, .07 * s, .17 * s), m["apron"], hips, segments=22, rings=14)
    box("apron pocket", (.14 * s, .02, .07 * s), (0, -.2 * s, -.06 * s), m["apronStripe"], hips, bevel=.008)
    cylinder("apron pencil", .007 * s, .1 * s, (.04 * s, -.205 * s, .0), m["yellow"], hips, rotation=(0, 12, 0), vertices=8)
    tube("apron strap", [(-.12 * s, -.11 * s, torso_h * 1.25), (0, -.17 * s, torso_h * 1.55), (.12 * s, -.11 * s, torso_h * 1.25)], .012 * s,
         m["apron"], torso, resolution=2)
    # A straw boater with a cherry band, tipped back, and ginger puffs below it.
    hat = pivot("boater", (0, .05 * head_r, head_r * .82), head_center)
    hat.rotation_euler = (math.radians(-10), 0, math.radians(4))
    cylinder("boater brim", head_r * 1.45, .018, (0, 0, 0), m["straw"], hat, vertices=36, bevel=.006)
    cylinder("boater crown", head_r * .82, head_r * .42, (0, 0, head_r * .2), m["straw"], hat, vertices=32, bevel=.01)
    torus("boater band", head_r * .83, .022, (0, 0, head_r * .08), m["red"], hat, scale=(1, 1, 1.4), segments=32)
    for index, (x, z) in enumerate(((.92, -.05), (-.92, -.05), (.8, .3), (-.8, .3), (.5, .55), (-.5, .55))):
        sphere(f"ginger puff {index}", (x * head_r, .22 * head_r, z * head_r), .25 * head_r, m["ginger"], head_center, segments=14, rings=8)
    sphere("ginger back", (0, .3 * head_r, .15 * head_r), (.95 * head_r, .8 * head_r, .85 * head_r), m["ginger"], head_center, segments=24, rings=14)

    blink = {"eye_L": {"scale": (1, 1, .12)}, "eye_R": {"scale": (1, 1, .12)}}
    # Hands resting on the counter top in front of Pip.
    rest = {
        "shoulder_L": {"rot": (-34, -10, 0)}, "shoulder_R": {"rot": (-34, 10, 0)},
        "elbow_L": {"rot": (-44, 0, 0)}, "elbow_R": {"rot": (-44, 0, 0)},
        "mouth": {"scale": (1.1, 1, 1.1)},
    }
    rig.clip("IDLE", [
        (1, rest),
        (20, merge(rest, {"torso": {"rot": (0, 0, 3)}, "head": {"rot": (2, 0, -5)}})),
        (28, merge(rest, blink, {"torso": {"rot": (0, 0, 3)}, "head": {"rot": (2, 0, -5)}})),
        (31, merge(rest, {"torso": {"rot": (0, 0, 3)}, "head": {"rot": (2, 0, -5)}})),
        (48, rest),
    ])
    hello = merge(rest, {"shoulder_R": {"rot": (-10, 138, 0)}, "head": {"rot": (-4, 0, 6)},
                         "brow_L": {"loc": (0, 0, .02)}, "brow_R": {"loc": (0, 0, .02)}, "mouth": {"scale": (1.3, 1, 2.2)}})
    rig.clip("WAVE", [
        (1, merge(hello, {"elbow_R": {"rot": (0, 28, 0)}})),
        (7, merge(hello, {"elbow_R": {"rot": (0, -22, 0)}, "mouth": {"scale": (1.2, 1, 1.4)}})),
        (13, merge(hello, {"elbow_R": {"rot": (0, 28, 0)}})),
        (19, merge(hello, {"elbow_R": {"rot": (0, -22, 0)}, "mouth": {"scale": (1.2, 1, 1.4)}})),
        (25, merge(hello, {"elbow_R": {"rot": (0, 28, 0)}})),
    ])
    # Ducks under the counter, comes up with the tool and holds it out.
    fetch = merge(rest, {"torso": {"rot": (-26, 0, 0)}, "shoulder_R": {"rot": (-14, 10, 0)}, "elbow_R": {"rot": (-6, 0, 0)},
                         "head": {"rot": (14, 0, 0)}})
    offer = merge(rest, {
        "torso": {"rot": (-12, 0, 0)},
        "shoulder_R": {"rot": (-80, 6, 0)}, "elbow_R": {"rot": (-18, 0, 0)},
        "shoulder_L": {"rot": (-48, -10, 0)}, "elbow_L": {"rot": (-50, 0, 0)},
        "head": {"rot": (6, 0, 0)},
        "brow_L": {"loc": (0, 0, .02)}, "brow_R": {"loc": (0, 0, .02)}, "mouth": {"scale": (1.4, 1, 2.0)},
    })
    rig.clip("OFFER", [
        (1, rest),
        (8, fetch),
        (16, merge(offer, {"torso": {"rot": (-6, 0, 0)}, "shoulder_R": {"rot": (-96, 6, 0)}})),
        (24, offer),
        (36, merge(offer, {"torso": {"rot": (-14, 0, 0)}})),
    ])
    clap_open = merge(rest, {"shoulder_L": {"rot": (-62, -26, 0)}, "shoulder_R": {"rot": (-62, 26, 0)},
                             "elbow_L": {"rot": (-58, 0, 0)}, "elbow_R": {"rot": (-58, 0, 0)},
                             "mouth": {"scale": (1.4, 1, 2.4)}, "brow_L": {"loc": (0, 0, .025)}, "brow_R": {"loc": (0, 0, .025)},
                             "head": {"rot": (-6, 0, 0)}})
    clap_shut = merge(clap_open, {"shoulder_L": {"rot": (-62, -4, 0)}, "shoulder_R": {"rot": (-62, 4, 0)}})
    rig.clip("CLAP", [(1, clap_open), (5, clap_shut), (9, clap_open), (13, clap_shut), (17, clap_open)])
    return root


# --------------------------------------------------------------- the shop --

def balloon_garland(name, start, end, sag, count, materials, parent, size=.09):
    for index in range(count):
        u = index / (count - 1)
        x = start[0] + (end[0] - start[0]) * u
        y = start[1] + (end[1] - start[1]) * u
        z = start[2] + (end[2] - start[2]) * u - sag * 4 * u * (1 - u)
        sphere(f"{name} {index}", (x, y, z), (size, size * .9, size * 1.1), materials[index % len(materials)], parent, segments=14, rings=10)


def build_shop(m):
    root = pivot("TOOL SHOP export root", (0, 0, 0))
    W, H = SIDE_X * 2, 2.9
    depth = WALL_Y + 2.2
    mid_y = WALL_Y - depth / 2
    box("shop floor", (W, depth, .1), (0, mid_y, -.05), m["woodPale"], root)
    for index in range(13):
        box(f"shop floor seam {index}", (.012, depth, .004), (-W / 2 + .5 * index, mid_y, .002), m["wood"], root)
    # Butter-yellow walls with mint stripes over a cream wainscot.
    box("back wall", (W, .12, H), (0, WALL_Y, H / 2), m["butter"], root)
    for index in range(16):
        box(f"back stripe {index}", (.14, .01, H - 1.0), (-W / 2 + .2 + index * .4, WALL_Y - .065, H / 2 + .5), m["butterStripe"], root)
    box("back wainscot", (W, .06, .95), (0, WALL_Y - .08, .475), m["wainscot"], root, bevel=.01)
    box("back chair rail", (W, .1, .06), (0, WALL_Y - .1, .98), m["wood"], root, bevel=.015)
    for side, x in (("L", -SIDE_X), ("R", SIDE_X)):
        box(f"side wall {side}", (.12, depth, H), (x, mid_y, H / 2), m["butter"], root)
        for index in range(11):
            box(f"side stripe {side} {index}", (.01, .14, H - 1.0), (x - math.copysign(.065, x), WALL_Y - .3 - index * .4, H / 2 + .5), m["butterStripe"], root)
        box(f"side wainscot {side}", (.06, depth, .95), (x - math.copysign(.08, x), mid_y, .475), m["wainscot"], root)
        box(f"side chair rail {side}", (.1, depth, .06), (x - math.copysign(.1, x), mid_y, .98), m["wood"], root)

    # Shelves along the back wall, stocked with the shop's balloon wares.
    shelves = pivot("back shelves", (0, WALL_Y - .28, 0), root)
    for side, x in (("L", -2.5), ("R", 2.5), ("M", 0)):
        box(f"shelf upright {side}", (.06, .34, 2.1), (x, 0, 1.05), m["woodDark"], shelves, bevel=.01)
    for index, z in enumerate((1.05, 1.5, 1.95)):
        box(f"shelf board {index}", (5.1, .36, .045), (0, 0, z), m["wood"], shelves, bevel=.01)
    colours = ("red", "yellow", "teal", "pink", "lilac", "green", "mint", "shutter")
    for row, z in enumerate((1.07, 1.52)):
        for index in range(18):
            x = -2.35 + index * .25 + (.08 if index >= 9 else 0)
            if abs(x) < .1:
                continue
            kind = (index * 5 + row * 3) % 4
            colour = m[colours[(index + row * 2) % len(colours)]]
            if kind == 0:  # a seed packet box with a flower on the front
                box(f"seed box {row} {index}", (.15, .1, .2), (x, 0, z + .1), m["paper"], shelves, bevel=.008)
                sphere(f"seed box flower {row} {index}", (x, -.052, z + .12), (.04, .008, .04), colour, shelves, segments=10, rings=6)
            elif kind == 1:  # a little balloon watering can
                cylinder(f"mini can {row} {index}", .055, .11, (x, 0, z + .06), colour, shelves, vertices=14)
                tube(f"mini can spout {row} {index}", [(x + .04, 0, z + .05), (x + .1, 0, z + .13)], .009, colour, shelves, resolution=1)
            elif kind == 2:  # a jar of seeds
                cylinder(f"seed jar {row} {index}", .055, .14, (x, 0, z + .07), m["jar"], shelves, vertices=14)
                cylinder(f"seed jar fill {row} {index}", .048, .08, (x, 0, z + .045), colour, shelves, vertices=12)
                cylinder(f"seed jar lid {row} {index}", .058, .025, (x, 0, z + .15), m["gold"], shelves, vertices=14)
            else:  # a balloon animal toy
                sphere(f"toy body {row} {index}", (x, 0, z + .07), (.07, .04, .045), colour, shelves, segments=12, rings=8)
                sphere(f"toy head {row} {index}", (x - .07, 0, z + .13), (.035, .03, .035), colour, shelves, segments=10, rings=6)
    # Top shelf: flower pots with puffed balloon blooms.
    for index in range(9):
        x = -2.2 + index * .55
        cone(f"top pot {index}", .07, .09, .12, (x, 0, 2.03), m["terracotta"], shelves, vertices=14)
        for petal in range(3):
            angle = petal * math.tau / 3 + index
            sphere(f"top bloom {index} {petal}", (x + .05 * math.cos(angle), .05 * math.sin(angle), 2.17), .045, m[colours[(index + petal) % 8]], shelves, segments=10, rings=6)
    # A big balloon plaque with a star, where a shop sign would hang.
    plaque = pivot("shop plaque", (0, WALL_Y - .1, 2.45), root)
    sphere("plaque balloon", (0, 0, 0), (.6, .06, .2), m["red"], plaque, segments=28, rings=14)
    sphere("plaque inset", (0, -.045, 0), (.5, .03, .15), m["white"], plaque, segments=24, rings=12)
    star = []
    for index in range(11):
        angle = math.pi / 2 + index * math.tau / 10
        radius = .1 if index % 2 == 0 else .042
        star.append((radius * math.cos(angle), -.08, radius * math.sin(angle)))
    tube("plaque star", star, .014, m["gold"], plaque, resolution=2)
    for side, x in (("L", -.75), ("R", .75)):
        sphere(f"plaque balloon {side}", (x, 0, .05), (.14, .12, .16), m["yellow"] if side == "L" else m["teal"], plaque, segments=16, rings=10)
    balloon_garland("back garland", (-SIDE_X + .2, WALL_Y - .15, 2.75), (SIDE_X - .2, WALL_Y - .15, 2.75), .35, 25,
                    (m["red"], m["white"], m["yellow"], m["teal"]), root)

    # The counter: a striped balloon front under a walnut top.
    counter = pivot("shop counter", (0, COUNTER_Y, 0), root)
    box("counter body", (2.6, .52, COUNTER_HEIGHT - .06), (0, 0, (COUNTER_HEIGHT - .06) / 2), m["wood"], counter, bevel=.04)
    box("counter top", (2.75, .66, .07), (0, 0, COUNTER_HEIGHT - .035), m["woodDark"], counter, bevel=.025)
    for index in range(10):
        x = -1.17 + index * .26
        sphere(f"counter front balloon {index}", (x, -.27, .34), (.12, .05, .3), m["red"] if index % 2 == 0 else m["white"], counter, segments=14, rings=12)
    box("counter kick", (2.6, .06, .06), (0, -.29, .03), m["woodDark"], counter)
    # On the counter: a brass bell, a till, and a jar of lollipops.
    bell = pivot("counter bell", (-.5, -.12, COUNTER_HEIGHT), counter)
    cylinder("bell base", .07, .02, (0, 0, .01), m["woodDark"], bell, vertices=16)
    sphere("bell dome", (0, 0, .03), (.06, .06, .05), m["gold"], bell, segments=16, rings=8)
    sphere("bell knob", (0, 0, .085), .012, m["gold"], bell, segments=8, rings=6)
    till = pivot("till", (-1.05, .05, COUNTER_HEIGHT), counter, rotation=(0, 0, 14))
    box("till body", (.32, .26, .16), (0, 0, .08), m["teal"], till, bevel=.03)
    box("till display", (.2, .04, .1), (0, .1, .2), m["teal"], till, rotation=(-20, 0, 0), bevel=.015)
    for index in range(6):
        sphere(f"till key {index}", (-.09 + (index % 3) * .09, -.06 + (index // 3) * .07, .165), .02, m["white"], till, segments=8, rings=6)
    jar = pivot("lollipop jar", (-.75, .14, COUNTER_HEIGHT), counter)
    cylinder("lolly jar glass", .09, .2, (0, 0, .1), m["jar"], jar, vertices=18)
    cylinder("lolly jar lid", .095, .03, (0, 0, .215), m["red"], jar, vertices=18)
    for index in range(5):
        angle = index * 1.3
        tube(f"lolly stick {index}", [(.03 * math.cos(angle), .03 * math.sin(angle), .12), (.05 * math.cos(angle), .05 * math.sin(angle), .3)], .004, m["white"], jar, resolution=1)
        sphere(f"lolly {index}", (.05 * math.cos(angle), .05 * math.sin(angle), .32), .028, m[colours[index]], jar, segments=10, rings=6)
    # A rug for the customer to stand on.
    cylinder("shop rug", .7, .02, (0, -.15, .01), m["rug"], root, vertices=40, bevel=.008)
    torus("shop rug ring", .56, .022, (0, -.15, .022), m["rugGold"], root, scale=(1, 1, .3), segments=40)

    # A sunny window on the left wall and potted balloon plants in the corners.
    win = pivot("shop window", (-SIDE_X + .1, .4, 1.6), root)
    box("window glass", (.02, 1.3, 1.0), (.02, 0, 0), m["dayGlass"], win)
    for index, (y, z, sy, sz) in enumerate(((0, .52, 1.42, .08), (0, -.52, 1.42, .08), (.67, 0, .08, 1.12), (-.67, 0, .08, 1.12), (0, 0, .05, 1.0))):
        box(f"window frame {index}", (.08, sy, sz), (.02, y, z), m["white"], win, bevel=.01)
    box("window box", (.25, 1.3, .2), (.12, 0, -.6), m["shutter"], win, bevel=.02)
    for index in range(6):
        sphere(f"window bloom {index}", (.14, -.5 + index * .2, -.46), .06, m[("pink", "yellow", "red")[index % 3]], win, segments=10, rings=6)
    for index, (x, y) in enumerate(((-2.6, 1.7), (2.6, 1.7), (2.7, -.9))):
        plant = pivot(f"corner plant {index}", (x, y, 0), root)
        cone(f"corner pot {index}", .17, .22, .32, (0, 0, .16), m["terracotta"], plant, vertices=18)
        for puff, (px, py, pz, r) in enumerate(((0, 0, .62, .24), (.15, .05, .5, .16), (-.14, -.03, .52, .17), (0, .1, .82, .17))):
            sphere(f"corner plant {index} puff {puff}", (px, py, pz), r, m["green"], plant, segments=16, rings=10)
    # Balloon bunches drifting under the ceiling, their strings tied off above.
    for index, (x, y, z) in enumerate(((-1.9, .1, 2.35), (1.95, -.2, 2.4), (-.9, 1.6, 2.55), (1.2, 1.5, 2.5))):
        bunch = pivot(f"ceiling bunch {index}", (x, y, z), root)
        for b, (bx, by, bz) in enumerate(((0, 0, 0), (.14, .05, .1), (-.12, .06, .08))):
            kit.balloon(f"ceiling balloon {index} {b}", (bx, by, bz), (.12, .12, .14), m[colours[(index * 3 + b) % 8]], bunch, segments=16, rings=12)
            tube(f"ceiling string {index} {b}", [(bx, by, bz + .14), (bx * .5, by * .5, .6)], .003, m["string"], bunch, resolution=1)
    return root


# ------------------------------------------------------------------ makers --

def make_boy():
    m = shop_palette()
    root = build_tool_boy(m)
    kit.bpy.context.scene.frame_set(8)
    kit.review("tool-boy", root, (1.5, -3.4, 1.2), (0, 0, .8), lens=50)
    kit.export("tool-boy", root)


def make_pip():
    m = shop_palette()
    root = build_pip(m)
    kit.bpy.context.scene.frame_set(1)
    kit.review("tool-pip", root, (1.3, -3.4, 1.5), (0, 0, 1.0), lens=45)
    kit.export("tool-pip", root)


def make_shop():
    m = shop_palette()
    root = build_shop(m)
    kit.review("tool-shop", root, (1.6, -3.6, 1.5), (0, 1.2, 1.0), lens=24, world="#f6ead2")
    kit.export("tool-shop", root, animations=False)


MAKERS = {"boy": make_boy, "pip": make_pip, "shop": make_shop}

if __name__ == "__main__":
    kit.run(MAKERS)
