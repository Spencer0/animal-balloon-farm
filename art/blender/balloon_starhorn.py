"""Create the Starhorn: a pearly lilac balloon pony with a twisted star-tipped horn and a pastel-rainbow cloud mane.

Run from the repository root (Blender 4.2 LTS or newer; also works from a `bpy` module venv):
  blender --background --factory-startup --python art/blender/balloon_starhorn.py
Outputs `public/assets/animals/balloon-starhorn.{blend,glb}` and `balloon-starhorn-review.png`.

It reuses the helpers in balloon_friends.py (sphere, curve, pivot, animate, portrait, export_asset). The Starhorn is
a quadruped on the cow's skeleton: +X forward, Z up, `WALK` and `IDLE` clips in NLA tracks. It is the one unique
animal (it has no house and does not breed), so there is no `SLEEP` clip: it is a day animal.
Set ABF_RENDER_ENGINE=CYCLES to force the CPU renderer on a machine with no GPU.
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
import bmesh  # noqa: E402  (after bpy: the bpy module registers it)

sys.path.insert(0, str(Path(__file__).resolve().parent))
import balloon_friends as bf  # noqa: E402

sphere, curve, pivot, key = bf.sphere, bf.curve, bf.pivot, bf.key


# ---- Blender-version shims: slotted actions (5.x) hide `action.fcurves` ---------------------------------------------
def _fcurves(action):
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    found = []
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                found.extend(bag.fcurves)
    return found


def finish_action(objects, clip, animal):
    for obj in objects:
        data = obj.animation_data
        action = data.action if data else None
        if action is None:
            continue
        action.name = f"BALLOON {animal.upper()} · {clip}"
        for fcurve in _fcurves(action):
            for point in fcurve.keyframe_points:
                point.interpolation = "BEZIER"
                point.handle_left_type = "AUTO_CLAMPED"
                point.handle_right_type = "AUTO_CLAMPED"
        slot = getattr(data, "action_slot", None)
        track = data.nla_tracks.new()
        track.name = clip
        strip = track.strips.new(clip, 1, action)
        strip.blend_type = "REPLACE"
        strip.extrapolation = "NOTHING"
        if slot is not None and hasattr(strip, "action_slot"):
            strip.action_slot = slot
        data.action = None


bf.finish_action = finish_action  # animate() looks the name up in balloon_friends' globals


# ---- materials ---------------------------------------------------------------------------------------------------
RAINBOW = ("pink", "peach", "butter", "mint", "sky", "lilac")


def starhorn_materials():
    m = bf.materials("STARHORN")
    mat = bf.mat
    m["body"] = mat("STARHORN · pearly lilac balloon latex", "#bf9fe6", .20, .03, .72)
    m["ivory"] = m["body"]
    m["wool"] = mat("STARHORN · soft lilac leg balloons", "#b794df", .22, .02, .62)
    m["face"] = mat("STARHORN · pearl-lilac face balloon", "#cdb2ef", .20, .03, .70)
    m["belly"] = mat("STARHORN · moon-cream belly", "#f6ecf6", .22, .01, .60)
    m["muzzle"] = mat("STARHORN · rose-petal muzzle", "#ffd0e2", .20, .01, .56)
    m["inner"] = mat("STARHORN · blush pink ear lining and cheeks", "#f7a9c8", .22, .01, .50)
    m["hoof"] = mat("STARHORN · polished moon-gold hooves", "#f2cf7a", .18, .35, .55)
    m["hoofglint"] = mat("STARHORN · hoof gleam", "#fff4cf", .18, .01, .50)
    m["collar"] = mat("STARHORN · berry-pink bell ribbon", "#ee86b0", .22, .04, .50)
    m["horn"] = mat("STARHORN · cream twisted balloon horn", "#fff1d8", .18, .02, .70)
    m["horn2"] = mat("STARHORN · honey-gold horn twist", "#fbd77f", .18, .20, .62)
    m["star"] = mat("STARHORN · glowing star gold", "#ffd84f", .16, .30, .70)
    m["rainbow"] = {
        "pink": mat("STARHORN · mane strawberry-milk", "#ff86b0", .22, .01, .60),
        "peach": mat("STARHORN · mane peach cloud", "#ffaa72", .22, .01, .60),
        "butter": mat("STARHORN · mane buttercream", "#ffe76a", .22, .01, .60),
        "mint": mat("STARHORN · mane mint", "#82e0ae", .22, .01, .60),
        "sky": mat("STARHORN · mane sky", "#7cc4f8", .22, .01, .60),
        "lilac": mat("STARHORN · mane lilac", "#b58cf2", .22, .01, .60),
    }
    return m


def star(name, position, outer, inner, thick, material, parent):
    """A rounded five-point star standing in the XZ plane (faces both flanks), tip up."""
    mesh = bpy.data.meshes.new(name + " · mesh")
    bm = bmesh.new()
    ring = []
    for index in range(10):
        radius = outer if index % 2 == 0 else inner
        angle = index * math.pi / 5
        ring.append((radius * math.sin(angle), radius * math.cos(angle)))
    front = [bm.verts.new((x, -thick / 2, z)) for x, z in ring]
    back = [bm.verts.new((x, thick / 2, z)) for x, z in ring]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    for index in range(10):
        nxt = (index + 1) % 10
        bm.faces.new((front[index], back[index], back[nxt], front[nxt]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    mesh.materials.append(material)
    for face in mesh.polygons:
        face.use_smooth = True
    bevel = obj.modifiers.new("soft balloon edge", "BEVEL")
    bevel.width = thick * .45
    bevel.segments = 2
    return bf.local(obj, parent, position)


def extra_clip(animal, clip, objects, pose):
    """Key extra nodes (twinkling stars, mane sway) in the same NLA clip name as animate()'s."""
    for obj in objects:
        bf.begin_action(obj, f"BALLOON {animal.upper()} · {clip}")
    for frame, phase in zip(bf.FRAMES, bf.PHASES):
        bpy.context.scene.frame_set(frame)
        for index, obj in enumerate(objects):
            pose(obj, frame, phase, index)
    finish_action(objects, clip, animal)


def make_starhorn():
    bf.DETAIL = .45
    m = starhorn_materials()
    rainbow = [m["rainbow"][name] for name in RAINBOW]
    root = pivot("BALLOON STARHORN · export root · forward +X", (0, 0, 0))
    root["asset_id"] = "animal_balloon_starhorn"
    root["description"] = "Pearly lilac balloon pony with a twisted star-tipped horn, a pastel-rainbow cloud mane and a star on its flank"
    body = pivot("STARHORN RIG · pearl body", (0, 0, 1.25), root)
    neck = pivot("STARHORN RIG · arched neck", (.50, 0, .20), body)
    head = pivot("STARHORN RIG · star-horn head", (.82, 0, .70), body)

    sphere("STARHORN · pearly lilac balloon body", (0, 0, 0), (.98, .58, .56), m["body"], body, 48, 32)
    sphere("STARHORN · moon-cream belly", (.04, 0, -.30), (.70, .45, .34), m["belly"], body, 36, 24)
    sphere("STARHORN · satin back gleam", (-.08, -.30, .38), (.34, .08, .10), m["highlight"], body, 28, 18).rotation_euler[1] = math.radians(-12)
    # An arched neck: a tall ellipsoid leaning forward toward the head.
    sphere("STARHORN · arched neck balloon", (.04, 0, .06), (.37, .34, .60), m["body"], neck, 36, 24).rotation_euler[1] = math.radians(24)

    sphere("STARHORN · pearl-lilac face balloon", (.02, 0, .04), (.50, .44, .52), m["face"], head, 44, 30)
    # The pony's long soft muzzle.
    sphere("STARHORN · rose-petal muzzle", (.43, 0, -.14), (.31, .29, .23), m["muzzle"], head, 32, 22)
    for side, label in ((-1, "near"), (1, "far")):
        sphere(f"STARHORN · {label} velvet nostril", (.70, side * .105, -.085), (.026, .04, .05), m["seam"], head, 16, 10)
    curve("STARHORN · tiny smile", [(.50, -.22, -.25), (.60, -.20, -.29), (.69, -.15, -.25)], .013, m["seam"], head, 2)
    bf.add_face_details(head, m, "STARHORN")

    ears = []
    for side, label in ((-1, "near"), (1, "far")):
        ear = pivot(f"STARHORN RIG · {label} pointed ear", (-.13, side * .28, .40), head)
        ears.append(ear)
        ear.rotation_euler = (math.radians(side * 14), math.radians(-8), math.radians(side * -8))
        sphere(f"STARHORN · {label} lilac ear balloon", (-.02, side * .09, .08), (.12, .085, .26), m["body"], ear, 24, 16)
        sphere(f"STARHORN · {label} blush ear lining", (.02, side * .13, .08), (.075, .03, .17), m["inner"], ear, 20, 14)

    # The horn: a twisted balloon, cream and honey-gold in turn, tapering to a glowing star.
    horn = pivot("STARHORN RIG · twisted horn", (.20, 0, .46), head)
    horn.rotation_euler[1] = math.radians(30)
    count = 9
    for index in range(count):
        t = index / (count - 1)
        spin = t * math.tau * 1.6
        radius = .17 * (1 - .82 * t)
        offset = .035 * (1 - t)
        sphere(f"STARHORN · horn twist {index + 1}", (offset * math.cos(spin), offset * math.sin(spin), .06 + t * .78),
               (radius, radius, radius * 1.08), m["horn2"] if index % 2 else m["horn"], horn, 24, 16)
    horn_star = pivot("STARHORN RIG · horn star", (0, 0, .93), horn)
    star("STARHORN · horn-tip star", (0, 0, 0), .15, .068, .075, m["star"], horn_star)
    horn_star.rotation_euler[1] = math.radians(-30)  # stand the star upright again, whatever the horn leans to

    # Rainbow cloud mane: puffs down the back of the neck and a forelock around the horn.
    mane = pivot("STARHORN RIG · rainbow mane", (0, 0, 0), neck)
    mane_stops = [(-.22, .02, .60, .20), (-.32, .0, .42, .22), (-.40, -.02, .22, .23), (-.45, .02, .00, .23), (-.46, 0, -.20, .21)]
    for index, (x, y, z, radius) in enumerate(mane_stops):
        sphere(f"STARHORN · mane cloud {index + 1}", (x, y, z), (radius, radius * .9, radius), rainbow[index % 6], mane, 28, 18)
        for side in (-1, 1):
            sphere(f"STARHORN · mane puff {index + 1}{'n' if side < 0 else 'f'}", (x + .06, side * .15, z - .02), (radius * .72, radius * .62, radius * .74),
                   rainbow[(index + 2 + (1 if side > 0 else 0)) % 6], mane, 24, 16)
    forelock = pivot("STARHORN RIG · forelock", (0, 0, 0), head)
    for index, (x, y, z, radius) in enumerate(((.06, -.17, .52, .15), (.06, .17, .52, .15), (.17, -.07, .50, .13), (.17, .08, .50, .13), (-.05, 0, .55, .16))):
        sphere(f"STARHORN · forelock puff {index + 1}", (x, y, z), (radius, radius, radius * .92), rainbow[(index * 2 + 1) % 6], forelock, 24, 16)

    bell = bf.add_collar(body, neck, m, "STARHORN")

    # Cloud tail: a drift of rainbow puffs arcing up and back from a shared tie.
    tail = pivot("STARHORN RIG · rainbow tail", (-.92, 0, .12), body)
    tail_stops = [(-.06, 0, .0, .17), (-.24, 0, -.03, .20), (-.44, 0, .03, .21), (-.60, 0, .15, .21), (-.70, 0, .32, .19), (-.70, 0, .50, .16)]
    for index, (x, y, z, radius) in enumerate(tail_stops):
        sphere(f"STARHORN · tail cloud {index + 1}", (x, y, z), (radius * 1.1, radius, radius), rainbow[index % 6], tail, 28, 18)
        sphere(f"STARHORN · tail puff {index + 1}", (x + .02, .11 if index % 2 else -.11, z - .03), (radius * .7, radius * .62, radius * .7), rainbow[(index + 3) % 6], tail, 22, 14)

    # The star on the flank (both sides), each on a pivot so it can twinkle.
    flank_stars = []
    for side, label in ((-1, "near"), (1, "far")):
        spot = pivot(f"STARHORN RIG · {label} flank star", (-.16, side * .555, .02), body)
        flank_stars.append(spot)
        star(f"STARHORN · {label} flank star", (0, side * .018, 0), .21, .095, .05, m["star"], spot)

    positions, legs, hooves = bf.make_legs(root, body, m, "STARHORN", connected=True)
    bf.animate("starhorn", body, head, neck, ears, tail, legs, hooves, bell, positions, forward_gait=True, leg_anchor=-.45)

    # Secondary motion: the mane and forelock swing a beat behind the head, and the stars twinkle.
    def sway(obj, frame, phase, index):
        scale = 1.0 if obj is mane else .6
        key(obj, frame, rotation=(math.radians(2.5 * scale * math.sin(phase + .8)), math.radians(5 * scale * math.sin(phase + 1.2)), math.radians(2 * scale * math.sin(phase + .3))))

    def sway_idle(obj, frame, phase, index):
        key(obj, frame, rotation=(math.radians(.8 * math.sin(phase + .5)), math.radians(1.6 * math.sin(phase + 1.0)), math.radians(.8 * math.sin(phase))))

    def twinkle(obj, frame, phase, index):
        pulse = 1 + .16 * math.sin(phase + index * 1.3)
        base = math.radians(-30) if obj is horn_star else 0
        key(obj, frame, scale=(pulse, pulse, pulse), rotation=(0, base + math.radians(7 * math.sin(phase + index)), 0))

    def twinkle_idle(obj, frame, phase, index):
        pulse = 1 + .10 * math.sin(phase + index * 1.3)
        base = math.radians(-30) if obj is horn_star else 0
        key(obj, frame, scale=(pulse, pulse, pulse), rotation=(0, base + math.radians(3 * math.sin(phase + index)), 0))

    swayers = [mane, forelock]
    sparklers = [horn_star, *flank_stars]
    extra_clip("starhorn", "WALK", swayers, sway)
    extra_clip("starhorn", "IDLE", swayers, sway_idle)
    extra_clip("starhorn", "WALK", sparklers, twinkle)
    extra_clip("starhorn", "IDLE", sparklers, twinkle_idle)

    bf.portrait("starhorn", m)
    bpy.context.scene.view_settings.exposure = -.85  # pale pastels blow out at the shared portrait exposure
    bf.export_asset(root, "starhorn", review_yaw=-14, texcoords=False)


if __name__ == "__main__":
    bf.reset_scene()
    make_starhorn()
