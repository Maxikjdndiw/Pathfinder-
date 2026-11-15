export interface GrainientOptions {
  colors?: string[];
  type?: 'linear' | 'radial';
  angle?: number;
  bands?: number;
  softness?: number;
  flow?: number;
  scale?: number;
  speed?: number;
  silk?: number;
  grainAmount?: number;
  grainSize?: number;
  grainAnimated?: boolean;
  contrast?: number;
  saturation?: number;
  variation?: number;
  interactive?: boolean;
  stir?: number;
  clickSwirl?: boolean;
  intro?: boolean;
  lightMode?: boolean;
  dpr?: number;
}
export function createGrainient(container: HTMLElement, options?: GrainientOptions): { destroy(): void } | null;
