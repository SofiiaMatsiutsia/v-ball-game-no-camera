export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

export interface GestureResult {
  landmarks: HandLandmark[][];
  gestures: { categories: { categoryName: string; score: number }[] }[];
}

export enum AppState {
  LOADING = 'LOADING',
  READY_TO_START = 'READY_TO_START',
  RUNNING = 'RUNNING',
  ERROR = 'ERROR'
}

export enum ParticleState {
  SPHERE = 'SPHERE',
  EXPLODED = 'EXPLODED'
}
