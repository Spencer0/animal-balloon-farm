import type { Scenario } from '../types'

export const panLimit: Scenario = {
  id: 'camera/pan-limit',
  description: 'The farm with the menu closed, for trying the pan limit: hold WASD, push the mouse to a screen edge or right-drag, and the view stops at the meadow around the farm.',
  run(d) {
    d.closeMenu()
    d.focusPoint(0, 0, 43)
  },
}
