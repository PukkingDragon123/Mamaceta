// Stage factory for the 2D pixel renderer.
import { RustPitStage } from './rustpit.js';
import { CantinaStage } from './cantina.js';
import { TrainingStage } from './training.js';
import { STAGES } from '../../sim/stages.js';

export const STAGE_VIEWS = { rustpit: RustPitStage, cantina: CantinaStage, training: TrainingStage };

export function makeStage(id, stageDef = STAGES[id]) {
  const Cls = STAGE_VIEWS[id] || RustPitStage;
  return new Cls(stageDef || STAGES[id] || STAGES.rustpit);
}
export { RustPitStage, CantinaStage, TrainingStage };
export { BarScene } from './bar.js';
