import { Material, Texture } from "three";

export interface IUpdatingCanvas {
  get width(): number;
  get height(): number;
  get canvas(): HTMLCanvasElement | undefined;
  dispose(): void;
  get createdAt(): number;
  get hasBuiltTexture(): boolean;
  onUpdate(cb: () => void): () => void;
  get texture(): Texture;
  get material(): Material;
  get outlets(): { [id: string]: { x: number; y: number } };
}
