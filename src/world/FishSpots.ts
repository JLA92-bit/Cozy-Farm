import * as THREE from 'three';
import { HALF } from './Grid';
import { SEA_CLIFF } from './models/square';
import { DOCK } from './Terrain';

/** The two places to fish on the farm: the dock on the north beach, and (1.8.5) Old Tom's Pier on the west beach. */
export type FishSpotId = 'dock' | 'pier';

export interface FishSpot {
  id: FishSpotId;
  name: string;
  /** where the farmer sits, the way the line is cast (a unit vector in x, z) and the way the farmer faces (yaw) */
  seat: THREE.Vector3;
  dx: number;
  dz: number;
  yaw: number;
  waterY: number;
}

/** Old Tom's Pier: planks run west from the west beach, the same size as the dock. */
export const PIER = { x0: -HALF - 1.2, z: -6, planks: 8, step: 0.9, deckTop: -SEA_CLIFF + 0.8, waterY: DOCK.waterY } as const;

export const SPOTS: Record<FishSpotId, FishSpot> = {
  dock: {
    id: 'dock', name: 'the dock',
    seat: new THREE.Vector3(DOCK.x - 0.25, DOCK.deckY + 0.04, DOCK.z0 - (DOCK.planks - 1) * DOCK.step + 0.05),
    dx: 0, dz: -1, yaw: Math.PI, waterY: DOCK.waterY,
  },
  pier: {
    id: 'pier', name: "Old Tom's Pier",
    seat: new THREE.Vector3(PIER.x0 - (PIER.planks - 1) * PIER.step + 0.05, PIER.deckTop - 0.04, PIER.z - 0.25),
    dx: -1, dz: 0, yaw: -Math.PI / 2, waterY: PIER.waterY,
  },
};
