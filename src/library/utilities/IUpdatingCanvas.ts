import { Texture } from "three";

export interface IUpdatingCanvas {
  get width(): number;
  get height(): number;
  get canvas(): HTMLCanvasElement;
  onUpdate(cb: () => void): () => void;
  get texture(): Texture;
}
