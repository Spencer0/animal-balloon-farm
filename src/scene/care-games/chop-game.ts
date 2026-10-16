import * as THREE from 'three'
import {
  CHOP_MAX_POINTS, CHOP_PLAY_BOTTOM, CHOP_PLAY_CENTRE_X, CHOP_ROUND_PAUSE, CHOP_ROUNDS, CHOP_SCORE_REACH,
  CHOP_STALK_PAUSE, CHOP_STALKS_PER_ROUND,
  chopBandHeight, chopFallSeconds, chopGravity, chopPassScore, chopPassed, chopPoints,
  chopViewHeight, chopViewTop, fellThrough, gradeChop, type ChopGrade,
} from '../../game/care-chop'
import type { CareFrame } from './care-stage'
import { cloneCastCritter } from '../plant-models'
import { createBurst } from '../garden-bursts'
import type { CareGameContext, CareGameScene } from './care-game-types'

/**
 * CUT! A spent, overgrown stalk is released from rest above the screen and
 * drops under gravity past a pair of garden shears fixed mid-screen, so it is
 * moving fast when it reaches them. Each stalk has a bright band painted across
 * it at a random height. Tap to snap the shears: the stalk is cut where the
 * blades are, and the points depend on how close the band is to the blade line
 * (full marks on it, fewer the further off, nothing for a tap that comes too
 * early). A stalk that drops past uncut scores nothing too.
 *
 * Four stalks make a round and there are three rounds, each dropping faster
 * than the last. The round is won when the total clears the pass mark
 * (`chopPassScore`); the rules module only sees one hit per round played, and
 * a failing total on the last round.
 */

const SHEAR_X = -0.14
const SHEAR_Y = 0.5
const SHEAR_SCALE = 1.25
/** Tilts the open shears toward the camera so the V of the blades reads on screen. */
const SHEAR_TILT = -0.42
/** The stalk falls down this column; it is cut where the blades cross it (mid-blade). */
const CUT_X = 0
/** The player's plant stands to the right, out of the falling stalk's way. */
const PLANT_X = 0.42
/** The plant's top, for the win's confetti. */
const PLANT_TOP = 0.9
/** A new stalk's band starts this far above the top of the view, so the stalk drops in from off screen. */
const SPAWN_ABOVE_VIEW = 0.45
/** The least a stalk drops before it reaches the blades, in metres. */
const MIN_DROP = 1.9
/** The camera stands this far from the playfield. */
const PLAY_DISTANCE = 2
/** The stalk's own shape, from art/blender/flower_care_cast.py (metres, along its height). */
const STALK_BOTTOM = -0.45
const STALK_TOP = 0.3
const STALK_SWAY = 0.035
/** The shears snap shut for this long, then open again. */
const SNAP_CLOSE_SECONDS = 0.08
const SNAP_OPEN_SECONDS = 0.35
const SNAP_COOLDOWN = 0.12
const BLADE_OPEN_ANGLE = THREE.MathUtils.degToRad(26)
const GRAVITY = 4.6
const PIECE_SECONDS = 1.6
const DASHES = 8

declare const __GARDEN_DEBUG__: boolean

type Disposable = { dispose(): void }

interface Stalk {
  /** The stalk, held in a group at its own origin; the group falls. */
  readonly root: THREE.Group
  /** The band's height on the stalk, in the stalk's own metres. */
  readonly band: number
  /** Metres per second, downward; gravity adds to it every frame. */
  velocity: number
  readonly gravity: number
  readonly seed: number
  /** Scored (cut, tapped too early, or dropped past): the stalk still falls but no longer counts. */
  resolved: boolean
  state: 'falling' | 'cut' | 'gone'
}

interface Piece {
  readonly object: THREE.Group
  readonly velocity: THREE.Vector3
  readonly spin: THREE.Vector3
  readonly owned: Disposable[]
  age: number
}

/** The camera frames the playfield for a window's aspect: the shears, the stalks and the plant fill the view. */
function chopFrame(aspect: number): CareFrame {
  const view = chopViewHeight(aspect)
  const look = new THREE.Vector3(CHOP_PLAY_CENTRE_X, CHOP_PLAY_BOTTOM + view / 2, 0)
  const fov = THREE.MathUtils.radToDeg(2 * Math.atan(view / 2 / PLAY_DISTANCE))
  return { position: new THREE.Vector3(look.x, look.y + 0.12, PLAY_DISTANCE), look, fov: Math.min(75, fov) }
}

/** The stalk's stem centreline sway at a height, as the Blender model draws it. */
function stalkCentreX(height: number): number {
  const t = THREE.MathUtils.clamp((height - STALK_BOTTOM) / (STALK_TOP - STALK_BOTTOM), 0, 1)
  return STALK_SWAY * Math.sin(2 * Math.PI * t)
}

/** The stem's radius at a height (it tapers toward the seed head). */
function stalkRadius(height: number): number {
  const t = THREE.MathUtils.clamp((height - STALK_BOTTOM) / (STALK_TOP - STALK_BOTTOM), 0, 1)
  return 0.019 - 0.011 * t
}

/**
 * Split a stalk's meshes at a height into the part above it (`keepAbove`) or the
 * part below it, by whole triangles: a triangle that straddles the cut is kept
 * by the piece it touches, so the cut end is closed with a cap instead of a hole.
 * Coordinates stay in the stalk's own space, so the piece sits where it was.
 */
function slicePiece(source: THREE.Object3D, cutY: number, keepAbove: boolean, name: string): { piece: THREE.Group; geometries: THREE.BufferGeometry[] } {
  const piece = new THREE.Group()
  piece.name = name
  const geometries: THREE.BufferGeometry[] = []
  source.updateMatrixWorld(true)
  const toStalk = new THREE.Matrix4().copy(source.matrixWorld).invert()
  const matrix = new THREE.Matrix4()
  const normalMatrix = new THREE.Matrix3()
  const vertex = new THREE.Vector3()
  const normal = new THREE.Vector3()
  source.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    const geometry = object.geometry as THREE.BufferGeometry
    const position = geometry.getAttribute('position')
    const index = geometry.index
    if (!position) return
    matrix.multiplyMatrices(toStalk, object.matrixWorld)
    normalMatrix.getNormalMatrix(matrix)
    const at = (corner: number): number => (index ? index.getX(corner) : corner)
    const triangles = (index ? index.count : position.count) / 3
    const picked: number[] = []
    for (let triangle = 0; triangle < triangles; triangle += 1) {
      const a = at(triangle * 3)
      const b = at(triangle * 3 + 1)
      const c = at(triangle * 3 + 2)
      let high = -Infinity
      let low = Infinity
      for (const corner of [a, b, c]) {
        const y = vertex.fromBufferAttribute(position, corner).applyMatrix4(matrix).y
        high = Math.max(high, y)
        low = Math.min(low, y)
      }
      if (keepAbove ? high >= cutY : low <= cutY) picked.push(a, b, c)
    }
    if (!picked.length) return
    const positions = new Float32Array(picked.length * 3)
    const normals = geometry.getAttribute('normal') ? new Float32Array(picked.length * 3) : null
    const uvs = geometry.getAttribute('uv') ? new Float32Array(picked.length * 2) : null
    const uv = geometry.getAttribute('uv')
    picked.forEach((corner, slot) => {
      vertex.fromBufferAttribute(position, corner).applyMatrix4(matrix)
      positions.set([vertex.x, vertex.y, vertex.z], slot * 3)
      if (normals) {
        normal.fromBufferAttribute(geometry.getAttribute('normal'), corner).applyMatrix3(normalMatrix).normalize()
        normals.set([normal.x, normal.y, normal.z], slot * 3)
      }
      if (uvs && uv) uvs.set([uv.getX(corner), uv.getY(corner)], slot * 2)
    })
    const built = new THREE.BufferGeometry()
    built.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    if (normals) built.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
    if (uvs) built.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
    geometries.push(built)
    const part = new THREE.Mesh(built, object.material)
    part.castShadow = object.castShadow
    piece.add(part)
  })
  return { piece, geometries }
}

export function createChopGame(context: CareGameContext): CareGameScene {
  const { stage, round, sfx, bursts, popAt, hitStop } = context
  const root = new THREE.Group()
  root.name = 'Chop game'
  stage.scene.add(root)
  const owned: Disposable[] = []
  // The scripted-play hook (`window.__chopGame`, including `tap()`) is debug-only: a production build folds it away.
  const debugHook = __GARDEN_DEBUG__ && new URLSearchParams(location.search).has('gardenDebug')
  // Space cuts too, for the keyboard; the pointer tap is the main input.
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== 'Space' || event.repeat) return
    event.preventDefault()
    tap()
  }
  window.addEventListener('keydown', onKeyDown)

  // The plant sits to one side while its stalks are cut, and the camera frames the playfield.
  if (stage.plant) stage.plant.position.x = PLANT_X
  stage.setFraming(chopFrame)

  // ---- the shears: fixed mid-screen, jaws pointing right, tilted toward the camera.
  const holder = new THREE.Group()
  holder.name = 'Chop shears'
  holder.position.set(SHEAR_X, SHEAR_Y, 0)
  holder.rotation.x = SHEAR_TILT
  root.add(holder)
  const shears = cloneCastCritter('flower', 'shears')
  let bladeA: THREE.Object3D | null = null
  let bladeB: THREE.Object3D | null = null
  if (shears) {
    // The cast's shears stand in the picture plane, jaws up (+Y), blades opening
    // in X and turning about Z. Turn them flat: jaws along +X, the opening in
    // depth (X to Z), the pivot axis up (Z to Y). A cyclic rotation, so no mirror.
    shears.quaternion.setFromRotationMatrix(new THREE.Matrix4().set(
      0, 1, 0, 0,
      0, 0, 1, 0,
      1, 0, 0, 0,
      0, 0, 0, 1,
    ))
    shears.scale.setScalar(SHEAR_SCALE)
    holder.add(shears)
    bladeA = shears.getObjectByName('blade_A') ?? null
    bladeB = shears.getObjectByName('blade_B') ?? null
  }

  // The blade line: a glowing line from the rivet to the blade tips, with a faint shadow under it.
  const bladeLength = 0.21 * SHEAR_SCALE
  const lineWidth = bladeLength
  const lineCentreX = SHEAR_X + bladeLength / 2
  const planeGeometry = new THREE.PlaneGeometry(1, 1)
  owned.push(planeGeometry)
  const glowMaterial = new THREE.MeshBasicMaterial({ color: '#fff6c8', transparent: true, opacity: 0.6, depthTest: false, depthWrite: false })
  const haloMaterial = new THREE.MeshBasicMaterial({ color: '#ffe27a', transparent: true, opacity: 0.25, depthTest: false, depthWrite: false })
  const shadowMaterial = new THREE.MeshBasicMaterial({ color: '#2f4a22', transparent: true, opacity: 0.3, depthTest: false, depthWrite: false })
  owned.push(glowMaterial, haloMaterial, shadowMaterial)
  const halo = new THREE.Mesh(planeGeometry, haloMaterial)
  halo.name = 'Chop blade halo'
  halo.position.set(lineCentreX, SHEAR_Y, 0.02)
  halo.scale.set(lineWidth + 0.06, 0.05, 1)
  halo.renderOrder = 5
  const glow = new THREE.Mesh(planeGeometry, glowMaterial)
  glow.name = 'Chop blade line'
  glow.position.set(lineCentreX, SHEAR_Y, 0.025)
  glow.scale.set(lineWidth, 0.011, 1)
  glow.renderOrder = 6
  const shadow = new THREE.Mesh(planeGeometry, shadowMaterial)
  shadow.name = 'Chop blade shadow line'
  shadow.position.set(lineCentreX, SHEAR_Y - 0.035, 0.02)
  shadow.scale.set(lineWidth, 0.007, 1)
  shadow.renderOrder = 4
  root.add(halo, shadow, glow)

  // ---- the falling stalks and their pieces.
  const castStalk = cloneCastCritter('flower', 'stalk')
  const stalkTemplate = castStalk ?? fallbackStalk(owned)
  // Chunky bright dashes, so the cut band reads from a phone's distance.
  const dashGeometry = new THREE.BoxGeometry(0.05, 0.075, 0.09)
  const dashMaterial = new THREE.MeshBasicMaterial({ color: '#ff6a1f' })
  const capMaterial = new THREE.MeshLambertMaterial({ color: '#e6d08e', side: THREE.DoubleSide })
  owned.push(dashGeometry, dashMaterial, capMaterial)

  const stalks: Stalk[] = []
  const pieces: Piece[] = []
  let time = 0
  // Where the match stands: which round, which stalk of it, the points so far.
  let roundIndex = 0
  let stalkInRound = 0
  let roundScore = 0
  let total = 0
  /** Seconds until the next stalk is released; null while one is still in play. */
  let waitSeconds: number | null = 0.7
  let bannerPending = true
  let snapAge = 1
  let cooldown = 0
  let flash = 0
  let finished = false
  let won = false
  let lastGrade: ChopGrade | 'whiff' | null = null
  let lean = 0
  let lastPoints = 0

  // A white flash on the lens, for a PERFECT: a plane held just in front of the camera.
  const flashMaterial = new THREE.MeshBasicMaterial({ color: '#fffbe8', transparent: true, opacity: 0, depthTest: false, depthWrite: false })
  const flashPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), flashMaterial)
  flashPlane.name = 'Chop flash'
  flashPlane.position.set(0, 0, -0.5)
  flashPlane.renderOrder = 10
  stage.camera.add(flashPlane)
  owned.push(flashPlane.geometry, flashMaterial)

  // The running score, in a small pill under the round bar: it is the thing the player is playing for.
  const scoreEl = document.createElement('div')
  scoreEl.className = 'cg-score-pill'
  document.body.appendChild(scoreEl)
  function renderScore(): void {
    const shown = Math.min(roundIndex + 1, CHOP_ROUNDS)
    scoreEl.textContent = `Round ${shown}/${CHOP_ROUNDS} · Score ${total} · Pass ${chopPassScore()}`
  }
  renderScore()

  if (__GARDEN_DEBUG__ && debugHook) {
    ;(window as unknown as { __chopGame?: unknown }).__chopGame = {
      /** Each unscored falling stalk's band distance from the blade line, in metres (positive above). */
      distances: () => stalks.filter((stalk) => stalk.state === 'falling' && !stalk.resolved).map(distanceOf),
      bladeY: SHEAR_Y,
      hits: () => round.snapshot.hits,
      state: () => round.snapshot.state,
      /** The grade of the last tap: 'perfect', 'good', 'ok', 'early', 'whiff', or null before any tap. */
      last: () => lastGrade,
      points: () => lastPoints,
      total: () => total,
      round: () => roundIndex,
      /** Tap now, as the pointer would. */
      tap: () => tap(),
    }
  }

  function distanceOf(stalk: Stalk): number {
    return stalk.root.position.y + stalk.band - SHEAR_Y
  }

  function bladePoint(): THREE.Vector3 {
    return new THREE.Vector3(CUT_X, SHEAR_Y, 0.05)
  }

  function spawnStalk(): void {
    const band = chopBandHeight(Math.random())
    const group = new THREE.Group()
    group.name = 'Chop stalk'
    const body = stalkTemplate.clone(true)
    group.add(body)
    // The band: a ring of dashes around the stem at its height.
    const bandGroup = new THREE.Group()
    bandGroup.name = 'Chop cut band'
    const centreX = stalkCentreX(band)
    // Each dash sits on the stem's surface, its inner face touching the stem.
    const radius = stalkRadius(band) + 0.018
    for (let dash = 0; dash < DASHES; dash += 1) {
      const angle = (dash / DASHES) * Math.PI * 2
      const mesh = new THREE.Mesh(dashGeometry, dashMaterial)
      mesh.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
      mesh.rotation.y = -angle
      bandGroup.add(mesh)
    }
    bandGroup.position.set(centreX, band, 0)
    group.add(bandGroup)
    // Start at rest above the top of the view, whatever the window's shape. Gravity is set so the
    // band reaches the blade line exactly `chopFallSeconds` later: the later the round, the faster.
    const drop = Math.max(MIN_DROP, chopViewTop(stage.camera.aspect) + SPAWN_ABOVE_VIEW - SHEAR_Y)
    const stalk: Stalk = {
      root: group,
      band,
      velocity: 0,
      gravity: chopGravity(drop, chopFallSeconds(roundIndex)),
      seed: Math.random() * 10,
      resolved: false,
      state: 'falling',
    }
    group.position.set(CUT_X, SHEAR_Y + drop - band, 0)
    root.add(group)
    stalks.push(stalk)
  }

  function closeShears(): void {
    snapAge = 0
    cooldown = SNAP_COOLDOWN
  }

  /** One stalk is done with: bank its points, and either start the next stalk's wait or close the round. */
  function settle(points: number): void {
    lastPoints = points
    total += points
    roundScore += points
    stalkInRound += 1
    if (stalkInRound < CHOP_STALKS_PER_ROUND) {
      waitSeconds = CHOP_STALK_PAUSE
    } else {
      endRound()
    }
    renderScore()
  }

  function endRound(): void {
    const lastRound = roundIndex === CHOP_ROUNDS - 1
    const at = new THREE.Vector3(CUT_X, SHEAR_Y + 0.55, 0.05)
    if (lastRound) {
      if (chopPassed(total)) round.hit()
      else round.fail('score')
      return
    }
    round.hit()
    popAt(at, `ROUND ${roundIndex + 1}: ${roundScore} / ${CHOP_STALKS_PER_ROUND * CHOP_MAX_POINTS}`, 'plain', true)
    roundIndex += 1
    stalkInRound = 0
    roundScore = 0
    waitSeconds = CHOP_ROUND_PAUSE
    bannerPending = true
  }

  function cut(stalk: Stalk, points: number, grade: ChopGrade): void {
    stalk.state = 'cut'
    stalk.resolved = true
    const at = bladePoint()
    // Cut where the blades are, which is not always where the band is.
    const cutY = THREE.MathUtils.clamp(SHEAR_Y - stalk.root.position.y, STALK_BOTTOM + 0.06, STALK_TOP - 0.06)
    lastGrade = grade
    const body = stalk.root.children[0]
    // The top piece (with the seed head) flies off; the bottom drops. Each gets a flat cut face.
    for (const [name, keepAbove] of [['Stalk top', true], ['Stalk bottom', false]] as const) {
      const { piece, geometries } = slicePiece(body, cutY, keepAbove, name)
      const cap = new THREE.Mesh(new THREE.CircleGeometry(stalkRadius(cutY), 12).rotateX(-Math.PI / 2), capMaterial)
      cap.position.set(stalkCentreX(cutY), cutY, 0)
      piece.add(cap)
      piece.position.copy(stalk.root.position)
      piece.rotation.copy(stalk.root.rotation)
      root.add(piece)
      const top = keepAbove
      pieces.push({
        object: piece,
        velocity: top
          ? new THREE.Vector3(0.5 + Math.random() * 0.3, 1.2, 0.3)
          : new THREE.Vector3((Math.random() - 0.5) * 0.12, -0.25, 0),
        spin: top
          ? new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 5 + Math.random() * 3)
          : new THREE.Vector3((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 2),
        owned: [...geometries, cap.geometry],
        age: 0,
      })
    }
    stalk.root.removeFromParent()

    bursts.add(createBurst(at, { count: 12, colors: ['#b9db7a', '#7fb64f', '#e9f7c4'], shape: 'leaf', size: 0.03, speed: [1, 2.2], lift: 0.3, gravity: 5, seconds: 0.55, onTop: true }), root)

    if (grade === 'perfect') {
      sfx.play('chopPerfect')
      popAt(at, `PERFECT! +${points}`, 'good', true)
      hitStop(0.08)
      flash = 0.45
      stage.bounce(0.6)
      bursts.add(createBurst(at, { count: 14, colors: ['#fff3b0', '#ffd23f', '#ffffff'], shape: 'star', size: 0.035, speed: [1.2, 2.4], lift: 0.5, gravity: 3, seconds: 0.7, onTop: true }), root)
    } else if (grade === 'good') {
      sfx.play('chopGood')
      popAt(at, `GOOD +${points}`, 'good', true)
      hitStop(0.03)
      stage.bounce(0.3)
    } else {
      sfx.play('chopGood')
      popAt(at, `+${points}`, 'plain', true)
      stage.bounce(0.1)
    }
    settle(points)
  }

  /** The stalk in play: the one that has not been scored yet. */
  function activeStalk(): Stalk | null {
    return stalks.find((stalk) => stalk.state === 'falling' && !stalk.resolved) ?? null
  }

  /** One cut attempt on the stalk in play. Pointer and Space both come here. */
  function tap(): void {
    if (finished || cooldown > 0) return
    closeShears()
    const stalk = activeStalk()
    if (!stalk) {
      snapOnAir()
      round.whiff()
      lastGrade = 'whiff'
      return
    }
    const distance = distanceOf(stalk)
    const points = chopPoints(distance)
    if (points === 0) {
      // Too early: the shears snap on air, the stalk drops on untouched, and it counts for nothing.
      snapOnAir()
      round.whiff()
      lastGrade = 'early'
      stalk.resolved = true
      sfx.play('chopMiss')
      popAt(new THREE.Vector3(CUT_X, SHEAR_Y + 0.25, 0.05), 'TOO EARLY! +0', 'bad', true)
      settle(0)
      return
    }
    cut(stalk, points, gradeChop(distance))
  }

  function snapOnAir(): void {
    sfx.play('chopSnap')
  }

  return {
    // The cut band and the cut faces are only built as stalks spawn and split; warm their shaders first.
    warm: [new THREE.Mesh(dashGeometry, dashMaterial), new THREE.Mesh(dashGeometry, capMaterial)],
    update(dt): void {
      time += dt
      snapAge += dt
      cooldown = Math.max(0, cooldown - dt)
      const open = snapAge < SNAP_CLOSE_SECONDS ? 0 : Math.min(1, (snapAge - SNAP_CLOSE_SECONDS) / SNAP_OPEN_SECONDS)
      // The blades rest open at +/-26 degrees about the pivot axis; closing swings each back to the middle.
      if (bladeA) bladeA.rotation.z = -BLADE_OPEN_ANGLE * (1 - open)
      if (bladeB) bladeB.rotation.z = BLADE_OPEN_ANGLE * (1 - open)

      if (!finished && waitSeconds !== null) {
        waitSeconds -= dt
        if (bannerPending && waitSeconds < CHOP_ROUND_PAUSE * 0.6 && roundIndex > 0) {
          bannerPending = false
          popAt(new THREE.Vector3(CUT_X, SHEAR_Y + 0.55, 0.05), `ROUND ${roundIndex + 1}`, 'good', true)
        }
        if (waitSeconds <= 0) {
          waitSeconds = null
          bannerPending = false
          spawnStalk()
        }
      }

      for (const stalk of stalks) {
        if (stalk.state !== 'falling') continue
        // Gravity: the stalk gains speed every frame, so it is fastest at the blades.
        stalk.velocity += stalk.gravity * dt
        stalk.root.position.y -= stalk.velocity * dt
        stalk.root.rotation.z = Math.sin(time * 2.4 + stalk.seed) * 0.02
        if (!stalk.resolved && fellThrough(distanceOf(stalk))) {
          stalk.resolved = true
          if (!finished) {
            sfx.play('chopThud')
            popAt(new THREE.Vector3(CUT_X, SHEAR_Y - 0.2, 0.05), 'MISSED +0', 'bad')
            settle(0)
          }
        }
        // Gone once it is well below the view.
        if (stalk.root.position.y + STALK_TOP < CHOP_PLAY_BOTTOM - 0.4) {
          stalk.state = 'gone'
          stalk.root.removeFromParent()
        }
      }
      for (let index = stalks.length - 1; index >= 0; index -= 1) {
        if (stalks[index].state !== 'falling') stalks.splice(index, 1)
      }

      for (let index = pieces.length - 1; index >= 0; index -= 1) {
        const piece = pieces[index]
        piece.age += dt
        piece.velocity.y -= GRAVITY * dt
        piece.object.position.addScaledVector(piece.velocity, dt)
        piece.object.rotation.x += piece.spin.x * dt
        piece.object.rotation.y += piece.spin.y * dt
        piece.object.rotation.z += piece.spin.z * dt
        if (piece.age > PIECE_SECONDS) {
          piece.object.removeFromParent()
          for (const part of piece.owned) part.dispose()
          pieces.splice(index, 1)
        }
      }

      // The blade line glows brighter as a band comes into reach.
      const active = activeStalk()
      const near = active !== null && Math.abs(distanceOf(active)) < CHOP_SCORE_REACH
      const pulse = 0.55 + 0.25 * Math.sin(time * 7)
      glowMaterial.opacity = near ? Math.min(1, pulse + 0.3) : pulse * 0.7
      haloMaterial.opacity = near ? 0.4 : 0.18
      flash = Math.max(0, flash - dt * 2.6)
      flashMaterial.opacity = flash * 0.6
      // A lost round: the plant droops away from the lost stalks, and eases back when it is over.
      if (stage.plant) {
        const target = finished && !won ? 0.26 : 0
        lean += (target - lean) * Math.min(1, dt * 3)
        stage.plant.rotation.z = lean
      }
    },
    pointerDown(): void {
      tap()
    },
    pointerMove(): void {},
    pointerUp(): void {},
    finish(didWin): void {
      finished = true
      won = didWin
      if (didWin) {
        stage.bounce(1)
        flash = 0.5
        const crown = new THREE.Vector3(PLANT_X, PLANT_TOP, 0.1)
        bursts.add(createBurst(crown, {
          count: 28, colors: ['#79ad58', '#b6dc7a', '#e9c545', '#fff3b0'], shape: 'leaf', size: 0.042,
          speed: [1.3, 2.7], lift: 1.1, gravity: 3.2, seconds: 1.6, onTop: true,
        }), root)
      }
    },
    dispose(): void {
      window.removeEventListener('keydown', onKeyDown)
      scoreEl.remove()
      if (stage.plant) stage.plant.rotation.z = 0
      if (__GARDEN_DEBUG__ && debugHook) delete (window as unknown as { __chopGame?: unknown }).__chopGame
      for (const stalk of stalks) stalk.root.removeFromParent()
      stalks.length = 0
      for (const piece of pieces) {
        piece.object.removeFromParent()
        for (const part of piece.owned) part.dispose()
      }
      pieces.length = 0
      flashPlane.removeFromParent()
      root.removeFromParent()
      for (const part of owned) part.dispose()
    },
  }
}

/** A stand-in stalk if the cast has not loaded: a plain green stem, so the game still plays. */
function fallbackStalk(owned: Disposable[]): THREE.Object3D {
  const group = new THREE.Group()
  group.name = 'Stalk stand-in'
  const geometry = new THREE.CylinderGeometry(0.02, 0.012, STALK_TOP - STALK_BOTTOM, 8)
  geometry.translate(0, (STALK_TOP + STALK_BOTTOM) / 2, 0)
  const material = new THREE.MeshLambertMaterial({ color: '#8c9a4f' })
  owned.push(geometry, material)
  group.add(new THREE.Mesh(geometry, material))
  return group
}
