"""Create the Mountain Lion (id `cougar`): a long, low tawny balloon cat with a cream muzzle and a black-tipped tail.

Run from the repository root (Blender 4.2 LTS or newer; also works from a `bpy` module venv):
  blender --background --factory-startup --python art/blender/balloon_cougar.py
Outputs `public/assets/animals/balloon-cougar.{blend,glb}` and `balloon-cougar-review.png`.

It reuses the helpers in balloon_friends.py (sphere, curve, pivot, make_legs, animate, portrait, export_asset) and the
Blender-version shim from balloon_starhorn.py. The lion is the first apex predator: a quadruped on the raccoon's
skeleton, +X forward, Z up, `WALK` and `IDLE` clips in NLA tracks, and a one-shot `STRIKE` (crouch, leap, swipe) the
raid plays on every kill. It is unique (no house, no cubs) and hunts by day or night, so there is no `SLEEP` clip.
The face is its own, not `add_face_details`: amber eyes with slit pupils under low, stern brows, dark tear lines
down to a whisker-padded muzzle, and two little fangs.
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


BODY_Z = 1.18
LEG_ANCHOR = -.45
# The head hangs off the body, carried low: below the shoulders, the stalking stance.
HEAD_AT = (1.0, 0, .30)
# From a leg pivot down to the bottom of its paw (make_legs' connected leg: hoof hinge, hoof balloon).
LEG_LENGTH = .72
PAW_CLEARANCE = .025
# STRIKE beats, in frames at 24 fps (glTF puts frame f at f/24 s). The raid sim in src/game/apex-raid.ts
# is keyed to the same beats (LION_TUNING): a 0.2 s crouch on the spot, a 0.3 s leap that the sim
# carries across the ground, and the swipe landing at 0.71 s (frame 17), which is when the prey pops.
CROUCH, TAKEOFF, APEX, LAND, WIND_UP, HIT, END = 5, 7, 10, 13, 15, 17, 25


def planted_z(x, y, lift, pitch, roll, paw_lift=0.0, stretch=(1.0, 1.0, 1.0)):
    """Body-local height for a leg pivot at body-local (`x`, `y`) whose paw stays `paw_lift` above its standing spot.

    `lift` raises the body from its standing height, `pitch` tips it nose-down and `roll` lifts its
    near (-Y) side (radians). The leg is keyed upright against the pitch, so its paw hangs below the
    pivot. `stretch` is the body's scale, which the legs inherit: a squashed body has shorter legs.
    """
    sx, sy, sz = stretch
    reach = LEG_ANCHOR + paw_lift - lift - LEG_LENGTH * (1 - sz) + sx * x * math.sin(pitch) - sy * y * math.sin(roll) * math.cos(pitch)
    return reach / (sz * math.cos(roll) * math.cos(pitch))


def animate_strike(body, head, neck, ears, tail, legs, hooves, bell, leg_positions):
    """A one-shot clip, STRIKE: crouch, leap, rear up and swipe a forepaw down across the prey, settle.

    The runtime picks it up by name and plays it once when the lion pounces (`playOnce`); the sim
    moves the lion across the ground during the leap, so the clip only lifts and stretches it.
    The near forepaw (-Y) swipes. No paw ever dips below the lawn: the runtime grounds the model on
    the lowest point any clip reaches. The leap is a cat's: long and low, the hind paws trailing
    within half a unit of the lawn (tests/animal-grounding.test.mjs caps every clip's bob there). Every channel moves, because the glTF exporter drops one
    that does not and the node would snap to its rest pose. Call this BEFORE `animate()` so its NLA
    track sits underneath WALK and IDLE and never wins the review portrait.
    """
    everything = [body, head, neck, *ears, tail, *legs, *hooves, bell]
    for obj in everything:
        bf.begin_action(obj, "BALLOON COUGAR · STRIKE")
    rad = math.radians
    # Per key frame: body (lift, pitch°, roll°, yaw°, forward shift, stretch), head (pitch°, yaw°; it stays up
    # over the shoulders through the blow, or a high camera loses it behind them), ears pinned back°, tail (lift°, lash°), bell swing°, front (swing°, paw lift), hind (swing°, paw lift),
    # and the swiping near forepaw (swing°, across°, paw lift, paw curl°). Swing is about the side axis:
    # negative reaches forward. Across is about the long axis: negative is out to the near side. A paw
    # lift is how far above the lawn the paw would be if the leg hung straight (in the leap, the body's
    # own lift, so the legs fly with it); a swung leg carries its paw higher still.
    poses = {
        1:       dict(lift=0, pitch=0, roll=0, yaw=0, shift=0, stretch=0, head=(0, 0), ears=-4, tail=(-4, 0), bell=0, front=(0, 0), hind=(0, 0), swipe=None),
        3:       dict(lift=-.12, pitch=4, roll=0, yaw=1, shift=-.03, stretch=-.02, head=(8, 0), ears=-20, tail=(-6, 12), bell=4, front=(0, 0), hind=(-4, 0), swipe=None),
        CROUCH:  dict(lift=-.25, pitch=7, roll=0, yaw=-1, shift=-.07, stretch=-.04, head=(14, 0), ears=-36, tail=(-8, -14), bell=8, front=(0, 0), hind=(-10, 0), swipe=None),
        TAKEOFF: dict(lift=-.02, pitch=-10, roll=0, yaw=0, shift=.02, stretch=.06, head=(2, 0), ears=-40, tail=(4, 4), bell=-18, front=(-45, .10), hind=(30, 0), swipe=None),
        APEX:    dict(lift=.40, pitch=-3, roll=0, yaw=0, shift=.04, stretch=.12, head=(-4, 0), ears=-42, tail=(12, 2), bell=-28, front=(-75, .40), hind=(40, .30), swipe=None),
        LAND:    dict(lift=-.06, pitch=7, roll=0, yaw=0, shift=.04, stretch=.02, head=(6, 0), ears=-36, tail=(-2, 8), bell=22, front=(-10, 0), hind=(-20, .12), swipe=None),
        14:      dict(lift=.06, pitch=-11, roll=-5, yaw=-6, shift=0, stretch=0, head=(-6, -8), ears=-38, tail=(4, -10), bell=12, front=(0, 0), hind=(-10, 0), swipe=(-135, -26, .20, -40)),
        WIND_UP: dict(lift=.08, pitch=-13, roll=-8, yaw=-10, shift=-.02, stretch=.01, head=(-8, -12), ears=-40, tail=(6, -14), bell=4, front=(0, 0), hind=(-8, 0), swipe=(-155, -36, .24, -50)),
        HIT:     dict(lift=-.04, pitch=5, roll=5, yaw=7, shift=.18, stretch=.05, head=(2, 4), ears=-44, tail=(-2, 12), bell=-14, front=(0, 0), hind=(-6, 0), swipe=(-86, 16, .16, 34)),
        19:      dict(lift=-.05, pitch=4, roll=3, yaw=9, shift=.15, stretch=.03, head=(0, 2), ears=-30, tail=(-4, 8), bell=-6, front=(0, 0), hind=(-4, 0), swipe=(-42, 28, .06, 20)),
        22:      dict(lift=-.02, pitch=2, roll=1, yaw=2, shift=.06, stretch=.01, head=(-2, 0), ears=-16, tail=(-5, -4), bell=5, front=(0, 0), hind=(-2, 0), swipe=(-6, 4, 0, 4)),
        END:     dict(lift=0, pitch=0, roll=0, yaw=0, shift=.01, stretch=0, head=(-1, 0), ears=-8, tail=(-4, 3), bell=-1, front=(0, 0), hind=(-1, 0), swipe=None),
    }
    for frame, pose in poses.items():
        bpy.context.scene.frame_set(frame)
        pitch = rad(pose["pitch"])
        scale = (1 + pose["stretch"], 1 - pose["stretch"] * .2, 1 - pose["stretch"] * .6)
        key(body, frame, location=(pose["shift"], 0, BODY_Z + pose["lift"]), rotation=(rad(pose["roll"]), pitch, rad(pose["yaw"])), scale=scale)
        head_pitch, head_yaw = pose["head"]
        # Rotation only: a channel WALK and IDLE do not key (the head's location) makes the exporter drop
        # the node's rest offset, and the head then sits in the middle of the body in every other clip.
        key(head, frame, rotation=(0, rad(head_pitch), rad(head_yaw)))
        key(neck, frame, rotation=(0, rad(head_pitch * .6), rad(head_yaw * .5)))
        for index, ear in enumerate(ears):
            side = -1 if index == 0 else 1
            key(ear, frame, rotation=(rad(side * 6), rad(pose["ears"]), side * .12 + rad(side * pose["ears"] * .15)))
        tail_lift, lash = pose["tail"]
        key(tail, frame, rotation=(0, rad(tail_lift), rad(lash)))
        key(bell, frame, rotation=(rad(pose["bell"] * .3), rad(pose["bell"]), 0))
        for index, (leg, hoof, (x, y, _)) in enumerate(zip(legs, hooves, leg_positions)):
            front = index < 2
            swing, paw_lift = pose["front"] if front else pose["hind"]
            across = curl = 0.0
            if index == 0 and pose["swipe"]:
                swing, across, paw_lift, curl = pose["swipe"]
            # Keep the planted paws where they stand while the body shifts and tips over them.
            # A hair of clearance: between keys the channels ease on their own and must not dip a paw into the lawn.
            z = planted_z(x, y, pose["lift"], pitch, rad(pose["roll"]), paw_lift + PAW_CLEARANCE, scale)
            # The swiping shoulder reaches forward out of its hip balloon.
            key(leg, frame, location=(x - pose["shift"] + (.16 if index == 0 and pose["swipe"] else 0), y, z),
                rotation=(rad(across), -pitch + rad(swing), 0))
            flex = (-.25 if front else .3) * swing
            key(hoof, frame, rotation=(0, rad(curl if curl else flex), 0))
    bf.finish_action(everything, "STRIKE", "cougar")


def make_cougar():
    bf.DETAIL = .45
    m = cougar_materials()
    root = pivot("BALLOON COUGAR · export root · forward +X", (0, 0, 0))
    root["asset_id"] = "animal_balloon_cougar"
    root["description"] = "Tawny balloon mountain lion with a cream muzzle and chest, amber eyes and a long black-tipped tail"
    body = pivot("COUGAR RIG · long tawny body", (0, 0, BODY_Z), root)
    neck = pivot("COUGAR RIG · powerful neck", (.60, 0, .16), body)
    head = pivot("COUGAR RIG · hunter head", HEAD_AT, body)

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
    animate_strike(body, head, neck, ears, tail, legs, hooves, bell, positions)
    bf.animate("cougar", body, head, neck, ears, tail, legs, hooves, bell, positions, forward_gait=True, body_z=BODY_Z, leg_anchor=LEG_ANCHOR)

    bf.portrait("cougar", m)
    bpy.context.scene.view_settings.exposure = -.35  # keep the tawny from washing out to peach
    bf.export_asset(root, "cougar", review_yaw=-18, texcoords=False)


if __name__ == "__main__":
    bf.reset_scene()
    make_cougar()
