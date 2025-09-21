import {
  OrthographicCamera,
  PlaneGeometry,
  Mesh,
  ShaderMaterial,
  WebGLRenderer,
} from "three";

export class FullScreenQuad {
  private static camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private static geometry = new PlaneGeometry(2, 2);
  private _mesh: Mesh;

  constructor(material: ShaderMaterial | null) {
    this._mesh = new Mesh(FullScreenQuad.geometry, material as any);
  }

  get material(): ShaderMaterial | null {
    return this._mesh.material as ShaderMaterial | null;
  }
  set material(value: ShaderMaterial | null) {
    this._mesh.material = value as any;
  }

  dispose(): void {
    this._mesh.geometry.dispose();
  }

  render(renderer: WebGLRenderer): void {
    renderer.render(this._mesh, FullScreenQuad.camera);
  }
}