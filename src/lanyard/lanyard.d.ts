export interface LanyardOptions {
  frontImage?: string;
  backImage?: string;
  imageFit?: 'cover' | 'contain';
  cardColor?: string;
  orientation?: 'portrait' | 'landscape';
  finish?: 'glossy' | 'matte' | 'holographic' | 'metallic';
  cornerRadius?: number;
  size?: number;
  anchor?: 'left' | 'center' | 'right';
  strapLength?: number;
  strapImage?: string;
  strapColor?: string;
  strapWidth?: number;
  metal?: 'graphite' | 'silver' | 'gold';
  gravity?: number;
  damping?: number;
  elasticity?: number;
  breeze?: number;
  interactive?: boolean;
  intro?: boolean;
}

export interface LanyardHandle {
  update(next: Partial<LanyardOptions>): void;
  destroy(): void;
}

export function createLanyard(container: HTMLElement, options?: LanyardOptions): LanyardHandle | null;
