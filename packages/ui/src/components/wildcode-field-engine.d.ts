import type {
  CritterStyle,
  SpriteSet,
  WildcodeFieldHandle,
} from "./wildcode-field";

export type {
  CritterStyle,
  SpriteSet,
  WildcodeFieldHandle,
  LayerKey,
} from "./wildcode-field";

export declare const PALETTE: readonly { f: string; p: string; c: string }[];
export declare const defaultConfig: Record<string, unknown>;

export declare function buildSprites(setName?: SpriteSet): void;

export declare function createField(
  stage: HTMLElement,
  canvas: HTMLCanvasElement,
  opts?: {
    phrase?: string;
    seed?: number;
    letterColor?: string;
    spriteSet?: SpriteSet;
    critterStyle?: CritterStyle;
    clipFlowers?: boolean;
    hoverRecolor?: boolean;
    beamDur?: number;
    holdDur?: number;
    flowerDensity?: number;
    vineCount?: number;
    droneCount?: number;
    sway?: number;
    [key: string]: unknown;
  },
): WildcodeFieldHandle;
