import { type Scenario } from '../types'
import { openFarm } from './farm'

export const readyToSettle: Scenario = {
  id: 'mole/ready-to-settle',
  description: 'A bare farm and the shovel bought. A wild mole is visiting: nine tenths of the farm is dirt, so it settles. Sow a lawn and watch the journal bar fall.',
  async run(d) {
    await openFarm(d)
    d.addAnimal('mole', 2)
  },
}
