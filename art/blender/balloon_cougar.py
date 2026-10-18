"""Create the Mountain Lion (id `cougar`): a long, low tawny balloon cat with a cream muzzle and a black-tipped tail.

Run from the repository root (Blender 4.2 LTS or newer; also works from a `bpy` module venv):
  blender --background --factory-startup --python art/blender/balloon_cougar.py
Outputs `public/assets/animals/balloon-cougar.{blend,glb}` and `balloon-cougar-review.png`.

It reuses the helpers in balloon_friends.py (sphere, curve, pivot, make_legs, animate, portrait, export_asset) and the
Blender-version shim from balloon_starhorn.py. The lion is the first apex predator: a quadruped on the raccoon's
skeleton, +X forward, Z up, `WALK` and `IDLE` clips in NLA tracks. It is unique (no house, no cubs) and hunts by day
or night, so there is no `SLEEP` clip. The face is its own, not `add_face_details`: amber eyes with slit pupils under
low, stern brows, dark tear lines down to a whisker-padded muzzle, and two little fangs.
Set ABF_RENDER_ENGINE=CYCLES to force the CPU renderer on a machine with no GPU.
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import balloon_friends as bf  # noqa: E402
import balloon_starhorn  # noqa: E402,F401  (installs its slotted-action finish_action shim on balloon_friends)

sphere, curve, pivot, key = bf.sphere, bf.curve, bf.pivot, bf.key
# The long body wants its legs further apart than make_legs' shared stance.
LEG_SPREAD = 1.28


def cougar_materials():
    m = bf.materials("COUGAR")
    mat = bf.mat
    m["body"] = mat("COUGAR · sun-baked tawny balloon fur", "#b8743a", .24, .02, .58)
    m["ivory"] = m["body"]
    m["wool"] = mat("COUGAR · toasted tawny leg balloons", "#b47236", .25, .02, .54)
    m["saddle"] = mat("COUGAR · deep caramel back saddle", "#985e2c", .26, .02, .50)
    m["face"] = mat("COUGAR · honey-tawny face balloon", "#cc8c4c", .23, .02, .58)
    m["belly"] = mat("COUGAR · cream chest and belly", "#fbecd4", .24, .01, .54)
    m["muzzle"] = mat("COUGAR · cream whisker pads", "#fff4e2", .22, .01, .56)
    m["mark"] = mat("COUGAR · espresso tear lines and ear backs", "#3b2a26", .24, .01, .44)
    m["inner"] = mat("COUGAR · dusky-rose ear lining", "#d79a92", .24, .01, .46)
    m["nose"] = mat("COUGAR · rosy-clay nose", "#c4766f", .22, .01, .52)
    m["iris"] = mat("COUGAR · hunter's amber iris", "#f0a52e", .12, .03, .72)
    m["fang"] = mat("COUGAR · ivory fangs", "#fffaf0", .18, 0, .40)
    m["hoof"] = mat("COUGAR · soft caramel paws", "#d8a874", .26, .01, .44)
    m["hoofglint"] = mat("COUGAR · paw gleam", "#fbe3c4", .2, .01, .4)
    m["collar"] = mat("COUGAR · storm-blue bell ribbon", "#4b6fa3", .24, .05, .46)
    return m


def add_cougar_face(head, m):
    """The lion's own face on the +X head: amber eyes with slit pupils, stern brows, tear lines, muzzle and fangs."""
    for side, label in ((-1, "near"), (1, "far")):
        sphere(f"COUGAR · {label} bright eye", (.20, side * .37, .13), (.135, .08, .12), m["white"], head, 28, 18)
        sphere(f"COUGAR · {label} amber iris", (.245, side * .425, .13), (.085, .036, .092), m["iris"], head, 24, 16)
        # A tall, narrow pupil: a cat's slit, and the node the runtime swaps for a heart.
        sphere(f"COUGAR · {label} dark pupil", (.262, side * .452, .13), (.026, .016, .074), m["eye"], head, 18, 12)
        sphere(f"COUGAR · {label} starry catchlight", (.272, side * .463, .18), (.02, .01, .022), m["white"], head, 14, 10)
        # Brows slanting down toward the nose, just clear of the eye, read as a hunter's glare.
        curve(f"COUGAR · {label} stern brow", [(.07, side * .35, .33), (.19, side * .39, .30), (.31, side * .37, .25)], .026, m["mark"], head, 2)
        # The dark tear line from the inner eye down the side of the muzzle.
        curve(f"COUGAR · {label} tear line", [(.31, side * .25, .10), (.38, side * .24, -.02), (.44, side * .19, -.12)], .018, m["mark"], head, 2)
        sphere(f"COUGAR · {label} whisker pad", (.40, side * .12, -.13), (.17, .15, .13), m["muzzle"], head, 28, 18)
        for row, lift in enumerate((-.10, -.15)):
            curve(f"COUGAR · {label} whisker {row + 1}", [(.50, side * .2, lift), (.58, side * .38, lift + .02), (.64, side * .52, lift - .01)], .007, m["white"], head, 1)
        sphere(f"COUGAR · {label} fang", (.47, side * .07, -.27), (.026, .022, .06), m["fang"], head, 16, 10)
    sphere("COUGAR · cream chin", (.32, 0, -.25), (.17, .19, .09), m["muzzle"], head, 24, 16)
    sphere("COUGAR · rosy-clay nose", (.555, 0, -.03), (.06, .09, .055), m["nose"], head, 20, 14)
    curve("COUGAR · nose to lip seam", [(.56, 0, -.07), (.555, 0, -.13), (.53, 0, -.17)], .011, m["mark"], head, 2)
    curve("COUGAR · near half of the mouth", [(.53, 0, -.17), (.52, -.07, -.20), (.48, -.13, -.19)], .011, m["mark"], head, 2)
    curve("COUGAR · far half of the mouth", [(.53, 0, -.17), (.52, .07, -.20), (.48, .13, -.19)], .011, m["mark"], head, 2)


def make_cougar():
    bf.DETAIL = .45
    m = cougar_materials()
    root = pivot("BALLOON COUGAR · export root · forward +X", (0, 0, 0))
    root["asset_id"] = "animal_balloon_cougar"
    root["description"] = "Tawny balloon mountain lion with a cream muzzle and chest, amber eyes and a long black-tipped tail"
    body = pivot("COUGAR RIG · long tawny body", (0, 0, 1.18), root)
    neck = pivot("COUGAR RIG · powerful neck", (.60, 0, .16), body)
    # Carried low, below the shoulders: the stalking stance.
    head = pivot("COUGAR RIG · hunter head", (1.0, 0, .30), body)

    # A long, low cat: the body is stretched, the shoulders stand a touch higher than the haunches.
    sphere("COUGAR · long tawny balloon body", (0, 0, 0), (1.14, .54, .50), m["body"], body, 48, 32)
    sphere("COUGAR · cream belly", (.10, 0, -.28), (.84, .40, .28), m["belly"], body, 36, 24)
    sphere("COUGAR · caramel back saddle", (-.10, 0, .36), (.80, .30, .17), m["saddle"], body, 32, 20)
    sphere("COUGAR · shoulder balloon", (.66, 0, .04), (.48, .50, .50), m["body"], body, 36, 24)
    sphere("COUGAR · haunch balloon", (-.80, 0, .0), (.46, .52, .48), m["body"], body, 36, 24)
    sphere("COUGAR · cream chest", (.74, 0, -.14), (.30, .34, .34), m["belly"], body, 30, 20)
    sphere("COUGAR · neck balloon", (.06, 0, .06), (.38, .37, .42), m["body"], neck, 32, 22).rotation_euler[1] = math.radians(30)

    sphere("COUGAR · honey-tawny face balloon", (.02, 0, .02), (.50, .44, .42), m["face"], head, 44, 30)
    sphere("COUGAR · broad cheek ruff", (-.06, 0, -.06), (.40, .48, .32), m["face"], head, 32, 22)
    add_cougar_face(head, m)

    ears = []
    for side, label in ((-1, "near"), (1, "far")):
        ear = pivot(f"COUGAR RIG · {label} rounded ear", (-.12, side * .27, .34), head)
        ears.append(ear)
        ear.rotation_euler = (math.radians(side * 12), math.radians(-10), math.radians(side * -6))
        sphere(f"COUGAR · {label} tawny ear balloon", (0, side * .06, .08), (.12, .11, .15), m["body"], ear, 24, 16)
        sphere(f"COUGAR · {label} dusky ear lining", (.05, side * .07, .07), (.05, .07, .10), m["inner"], ear, 20, 14)
        sphere(f"COUGAR · {label} dark ear back", (-.06, side * .07, .10), (.05, .08, .09), m["mark"], ear, 20, 14)

    bell = bf.add_collar(body, neck, m, "COUGAR")

    # The long tail: tawny balloons sweeping low and back, curling up into a black tip.
    tail = pivot("COUGAR RIG · long black-tipped tail", (-1.06, 0, .06), body)
    stops = [(-.06, 0, -.02, .13), (-.28, 0, -.12, .12), (-.50, 0, -.20, .115), (-.72, 0, -.22, .11), (-.92, 0, -.16, .105), (-1.08, 0, -.02, .10)]
    for index, (x, y, z, radius) in enumerate(stops):
        sphere(f"COUGAR · tail balloon {index + 1}", (x, y, z), (radius * 1.7, radius, radius), m["body"], tail, 24, 16)
    sphere("COUGAR · black tail tip", (-1.16, 0, .12), (.13, .11, .14), m["mark"], tail, 24, 16)

    positions, legs, hooves = bf.make_legs(root, body, m, "COUGAR", connected=True)
    # A cat's legs sit further apart than the raccoon's: spread the hips and shoulders (and the
    # soft hip joins make_legs puts on the body) along the long body.
    for leg, (x, y, label) in zip(legs, positions):
        leg.location[0] = x * LEG_SPREAD
        bpy.data.objects[f"COUGAR · {label} integrated hip balloon"].location[0] = x * LEG_SPREAD
    positions = tuple((x * LEG_SPREAD, y, label) for x, y, label in positions)
    bf.animate("cougar", body, head, neck, ears, tail, legs, hooves, bell, positions, forward_gait=True, body_z=1.18, leg_anchor=-.45)

    bf.portrait("cougar", m)
    bpy.context.scene.view_settings.exposure = -.35  # keep the tawny from washing out to peach
    bf.export_asset(root, "cougar", review_yaw=-18, texcoords=False)


if __name__ == "__main__":
    bf.reset_scene()
    make_cougar()
