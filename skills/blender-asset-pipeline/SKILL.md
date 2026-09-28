# Skill: Blender CLI → game-ready Three.js asset

## Use when

Create or iterate a stylized runtime model, animation, or rendered asset from Blender without spending time manually clicking repetitive setup/export operations. This repository uses original animated Balloon Pig, Sheep, Cow, Chicken, Duck and Goose assets in the Three.js garden preview. Wild animals share a runtime, uniform-red balloon material mask that can be switched back to each model's authored standard materials on capture.

## Local setup

- Blender **4.2.3 LTS** was confirmed available as `blender` in the workspace shell. Verify with `blender --version` on another machine/session.
- Blender scripts run under Blender's embedded Python with `bpy` / `mathutils`; don't expect system Python to import those modules.
- Authoring scripts: `art/blender/balloon_pig.py` for the pig; `art/blender/balloon_friends.py` for sheep, cow, chicken, duck and goose (only duck and goose regenerate by default).
- Each animal's `.blend`, `-review.png` and `.glb` are paired in `public/assets/animals/`.

## Mandatory safe iteration

1. Check the shared working tree and whether the model source or outputs already have edits. Never overwrite someone else's art without inspecting first.
2. Inspect the Blender script for its output paths and whether it clears/removes data. Most scripts are batch jobs; don't assume `--factory-startup` protects the output files.
3. Run a deterministic preview/render before committing to the expensive final resolution/sample count.
4. Keep the editable `.blend`, the authoring script, render/contact sheet, and runtime `.glb` paired. Do not check in a duplicate copy of the same mesh.

## Command pattern

From project root (PowerShell):

```powershell
blender --background --factory-startup --python art/blender/balloon_pig.py
blender --background --factory-startup --python art/blender/balloon_friends.py
```

The script should print every absolute/relative output path and any scale/axis/clip metadata. It is permissible to run a local background Blender process for asset generation only after inspecting that script's side effects and confirming outputs are in this repo.

For a generic, already authored scene, Blender can render headlessly using `--background scene.blend --render-output //renders/frame_ --render-frame 1`; adapt output format/camera/sample settings explicitly. Prefer generating dedicated still/contact-sheet renders from the art source, not screenshots of a compressed GLB viewer, for appearance checks.

## Modeling quality bar

- Agree on one camera framing and recognizable silhouette first; judge the model at target in-game distance before detailing.
- Give balloon forms smooth designed profiles, tapered/knotted joins, clean highlights, layered color/seam accents, and readable facial anatomy; don't just stack uniform UV spheres.
- Use material roughness/clearcoat intentionally. Verify under the runtime's actual lighting/tone mapping.
- Rig at least a small set of named pivots: root, torso/body, head, ears, four legs/hooves, and signature accessories (e.g. bell or tail tie).
- Name objects and actions consistently. Choose a coordinate convention and state it in metadata (the pig's local forward axis is +X; Blender up is Z; glTF/Three.js uses Y up after exporter conversion).
- Create a real full gait cycle, not just a mesh bob: alternating diagonal footfalls, clear foot lift/stance, body bounce/weight shift, head counter-motion, subtle ear lag, accessory follow-through. Check looping first/last poses and root-motion policy.
- Export named clips (e.g. `WALK`, `IDLE`) in GLB; confirm action tracks are preserved by the Blender glTF exporter. Avoid export flags that silently omit selected meshes or animation.
- Stage render: floor/shadow catcher, soft key/fill/rim, orthographic or mild-perspective camera, readable background, uncluttered silhouette. Render front/three-quarter and profile if shape needs review.

## Runtime and preview loop

1. Export GLB with PBR-compatible materials and no scene-only camera/lights.
2. Load it in the Three.js browser through `GLTFLoader`; explicitly inspect console and network logs, model bounds, orientation, face visibility, rig/clip names and duration.
3. Play the actual clip via `AnimationMixer` at normal speed and scrubbing speed. Do not infer a successful rig merely because one still pose looks right.
4. Add the same GLB to the garden walk and asset viewer. Use the target garden camera, not only the art-review camera, as the final judge.
5. Check WebGL performance, material differences, ground contact/shadow, scale, axis, loop seam, and output freshness.
6. When revising geometry, regenerate the editable source and both exports together; browser caches may need a fresh URL/reload.

## Web preview

From a shell with dependencies installed:

```sh
npm run dev
```

Then open `http://127.0.0.1:8000/` in the browser preview. The preview shares the user's browser; inspect current tabs before navigation and open a dedicated tab when appropriate. Use screenshots and console/network logs to validate all six characters at garden scale while walking. The runtime API `animal.setAppearance('standard')` restores a captured animal's authored materials; `'wild'` reapplies the shared red mask. Capture color animation is a separate follow-up.

## Helpful official references

- [Blender command-line arguments](https://docs.blender.org/manual/en/4.2/advanced/command_line/arguments.html)
- [Blender glTF 2.0 export](https://docs.blender.org/manual/en/4.2/addons/import_export/scene_gltf2.html)
- [Three.js GLTFLoader](https://threejs.org/docs/#examples/en/loaders/GLTFLoader)
- [Three.js AnimationMixer](https://threejs.org/docs/#api/en/animation/AnimationMixer)

## Pitfalls

- Blender scene orientation, parenting, unapplied transforms, active actions, NLA strips, and selected-only export can all produce a GLB different from the `.blend` view. Inspect the exported file, not just the authored scene.
- A shell command such as `blender --background` is a file-writing process. Check targets and preserve existing edits first.
- Blender and Three.js can render the same roughness, transparency, backface winding, lights, and color space differently. The Three.js result is authoritative for the game.
- Never use a generic mesh deformation/position workaround as a substitute for actual leg animation. Preserve clean root/pivot transforms and real clip channels.
- If a tool errors on NLA/action exporters, consult the Blender version's installed glTF exporter options rather than silently dropping animation.
