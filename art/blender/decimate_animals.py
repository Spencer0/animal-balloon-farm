"""Decimate the heavy balloon animals so the crowd fits the frame budget.

Run from the repository root:

    blender --background --factory-startup --python art/blender/decimate_animals.py
    blender --background --factory-startup --python art/blender/decimate_animals.py -- pig bee

This does not regenerate any animal. For each named species it opens the saved
`.blend` and:

1. turns the bevelled Bezier curves (balloon seams, ribbons, tails) into meshes,
   because a curve cannot carry a Decimate modifier and the glTF exporter would
   otherwise write them at full density;
2. puts a Decimate (COLLAPSE) modifier FIRST on every mesh with at least
   MIN_TRIS triangles, so eyes, nostrils and other small parts keep their shape;
3. finds one shared ratio so the evaluated animal lands under its triangle budget;
4. saves the `.blend`, re-renders the review portrait with the authoring script's
   camera, frame and yaw, and exports the GLB with the same glTF settings
   `balloon_friends.py` uses (selected rig only, NLA WALK/IDLE clips, +X forward,
   `export_apply=True` so the Decimate bakes in).

The geometry, materials, Empties rig and NLA clips all come from the `.blend`.
Re-running is safe: an existing Decimate modifier is re-tuned, not duplicated.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
ANIMAL_DIR = ROOT / "public" / "assets" / "animals"
CURSOR_DIR = ROOT / "public" / "assets" / "cursors"

MODIFIER_NAME = "Decimate (animal budget)"
# Smaller meshes (eyes, nostrils, catchlights, toe reflections) are left alone.
MIN_TRIS = 200
# The check in scripts/asset-budget.mjs caps animals at 25k; these targets leave
# headroom for the exporter. The bee is a cursor-sized mascot, budgeted at 8k.
ANIMAL_TARGET_TRIS = 18_000
BEE_TARGET_TRIS = 7_000

# Per-species authoring-script settings, copied from balloon_friends.py / balloon_cursor.py.
SPECIES = {
    "pig": {"blend": ANIMAL_DIR / "balloon-pig.blend", "root": "BALLOON PIG", "target": ANIMAL_TARGET_TRIS, "review": (0.0, 7)},
    "sheep": {"blend": ANIMAL_DIR / "balloon-sheep.blend", "root": "BALLOON SHEEP", "target": ANIMAL_TARGET_TRIS, "review": (0.0, 7)},
    "cow": {"blend": ANIMAL_DIR / "balloon-cow.blend", "root": "BALLOON COW", "target": ANIMAL_TARGET_TRIS, "review": (0.0, 7)},
    "chicken": {"blend": ANIMAL_DIR / "balloon-chicken.blend", "root": "BALLOON CHICKEN", "target": ANIMAL_TARGET_TRIS, "review": (0.0, 7)},
    "duck": {"blend": ANIMAL_DIR / "balloon-duck.blend", "root": "BALLOON DUCK", "target": ANIMAL_TARGET_TRIS, "review": (0.0, 7)},
    "goose": {"blend": ANIMAL_DIR / "balloon-goose.blend", "root": "BALLOON GOOSE", "target": ANIMAL_TARGET_TRIS, "review": (0.0, 7)},
    "frog": {"blend": ANIMAL_DIR / "balloon-frog.blend", "root": "BALLOON FROG", "target": ANIMAL_TARGET_TRIS, "review": (0.0, 7)},
    # The owl's portrait is turned toward the camera; the turn is undone before the GLB.
    "owl": {"blend": ANIMAL_DIR / "balloon-owl.blend", "root": "BALLOON OWL", "target": ANIMAL_TARGET_TRIS, "review": (-38.0, 1)},
    "raccoon": {"blend": ANIMAL_DIR / "balloon-raccoon.blend", "root": "BALLOON RACCOON", "target": ANIMAL_TARGET_TRIS, "review": (0.0, 7)},
    # Not in the first heavy-animal brief, but at 68k tris it breaks the same 25k budget.
    "mole": {"blend": ANIMAL_DIR / "balloon-mole.blend", "root": "BALLOON MOLE", "target": ANIMAL_TARGET_TRIS, "review": (0.0, 7)},
    # The bee's cursor frames are not touched: it has no review portrait and no clips.
    "bee": {"blend": CURSOR_DIR / "balloon-bee-cursor.blend", "root": "BALLOON BEE", "target": BEE_TARGET_TRIS, "review": None},
}


def tree(obj):
    """The object and every descendant, depth first."""
    yield obj
    for child in obj.children:
        yield from tree(child)


def find_root(name_fragment: str) -> bpy.types.Object:
    matches = [
        obj for obj in bpy.data.objects
        if obj.parent is None and obj.name.startswith(name_fragment) and "export root" in obj.name
    ]
    if len(matches) != 1:
        raise SystemExit(f"expected one export root starting '{name_fragment}', found {len(matches)}")
    return matches[0]


def base_tris(obj: bpy.types.Object) -> int:
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def curves_to_meshes(root: bpy.types.Object) -> int:
    """Convert every curve in the rig to a mesh. Geometry is unchanged: export_apply already baked it."""
    converted = 0
    for obj in list(tree(root)):
        if obj.type != "CURVE":
            continue
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.convert(target="MESH")
        converted += 1
    return converted


def mesh_objects(root: bpy.types.Object) -> list[bpy.types.Object]:
    return [obj for obj in tree(root) if obj.type == "MESH"]


def set_decimate(obj: bpy.types.Object, ratio: float) -> None:
    modifier = obj.modifiers.get(MODIFIER_NAME)
    if modifier is None:
        modifier = obj.modifiers.new(MODIFIER_NAME, "DECIMATE")
        modifier.decimate_type = "COLLAPSE"
    # Decimate goes FIRST in the stack, so it is always the first thing evaluated.
    index = obj.modifiers.find(MODIFIER_NAME)
    if index != 0:
        obj.modifiers.move(index, 0)
    modifier.ratio = ratio


def evaluated_tris(obj: bpy.types.Object) -> int:
    """Triangles the exporter will see, after modifiers."""
    bpy.context.view_layer.update()
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    try:
        return sum(len(p.vertices) - 2 for p in mesh.polygons)
    finally:
        evaluated.to_mesh_clear()


def fit_ratio(meshes: list[bpy.types.Object], target: int) -> tuple[float, int]:
    """Search for the one ratio that puts the whole animal between 92% and 100% of target."""
    heavy = [obj for obj in meshes if base_tris(obj) >= MIN_TRIS]
    light_total = sum(base_tris(obj) for obj in meshes if obj not in heavy)
    if not heavy:
        raise SystemExit("no mesh is heavy enough to decimate")
    ratio = 1.0
    for _ in range(16):
        for obj in heavy:
            set_decimate(obj, ratio)
        total = sum(evaluated_tris(obj) for obj in meshes)
        if target * 0.92 <= total <= target:
            return ratio, total
        heavy_now = max(total - light_total, 1)
        ratio = min(1.0, max(0.01, ratio * (target - light_total) / heavy_now))
    raise SystemExit(f"could not fit a ratio under {target} triangles (last total {total})")


def select_tree(obj: bpy.types.Object) -> None:
    obj.select_set(True)
    for child in obj.children:
        select_tree(child)


def export_species(name: str, root: bpy.types.Object, review: tuple[float, int] | None) -> None:
    """Same save, review and export sequence as balloon_friends.export_asset (and the bee's exporter)."""
    scene = bpy.context.scene
    if name == "bee":
        blend_path = CURSOR_DIR / "balloon-bee-cursor.blend"
        glb_path = CURSOR_DIR / "balloon-bee.glb"
        scene.frame_set(1)
        bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    else:
        yaw, frame = review
        stem = f"balloon-{name}"
        blend_path = ANIMAL_DIR / f"{stem}.blend"
        render_path = ANIMAL_DIR / f"{stem}-review.png"
        glb_path = ANIMAL_DIR / f"{stem}.glb"
        scene.frame_set(frame)
        scene.render.filepath = str(render_path)
        bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
        root.rotation_euler[2] = math.radians(yaw)
        bpy.ops.render.render(write_still=True)
        root.rotation_euler[2] = 0
        print(f"Review portrait: {render_path}")

    bpy.ops.object.select_all(action="DESELECT")
    select_tree(root)
    bpy.context.view_layer.objects.active = root
    if name == "bee":
        bpy.ops.export_scene.gltf(
            filepath=str(glb_path), export_format="GLB", use_selection=True,
            export_apply=True, export_animations=False, export_materials="EXPORT",
            export_cameras=False, export_lights=False,
        )
    else:
        bpy.ops.export_scene.gltf(
            filepath=str(glb_path), export_format="GLB", use_selection=True,
            export_apply=True, export_animations=True, export_animation_mode="NLA_TRACKS",
            export_nla_strips=True, export_nla_strips_merged_animation_name=f"BALLOON {name.upper()}",
            export_force_sampling=True, export_frame_step=1, export_materials="EXPORT",
            export_cameras=False, export_lights=False, export_texcoords=True,
        )
    print(f"Blender source: {blend_path}")
    print(f"GLB: {glb_path}")


def main() -> None:
    # No `.blend1` backups: git already holds the previous source, and they are churn.
    bpy.context.preferences.filepaths.save_version = 0
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    names = argv or list(SPECIES)
    unknown = [name for name in names if name not in SPECIES]
    if unknown:
        raise SystemExit(f"unknown species: {', '.join(unknown)}")
    for name in names:
        config = SPECIES[name]
        bpy.ops.wm.open_mainfile(filepath=str(config["blend"]))
        root = find_root(config["root"])
        converted = curves_to_meshes(root)
        meshes = mesh_objects(root)
        before = sum(evaluated_tris(obj) for obj in meshes)
        ratio, after = fit_ratio(meshes, config["target"])
        heavy = sum(1 for obj in meshes if base_tris(obj) >= MIN_TRIS)
        print(
            f"DECIMATE {name}: curves converted {converted}, meshes {len(meshes)} ({heavy} decimated), "
            f"tris {before} -> {after} at ratio {ratio:.4f}"
        )
        export_species(name, root, config["review"])


if __name__ == "__main__":
    main()
