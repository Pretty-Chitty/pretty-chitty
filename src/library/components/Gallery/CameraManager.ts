import { DirectionalLight, Fog, PerspectiveCamera, Vector3, AmbientLight, Scene } from "three";
import { SCALE_FACTOR } from "./constants";

export class CameraManager {
  public camera: PerspectiveCamera;
  private light: DirectionalLight;
  private baseCameraZ = 500 / SCALE_FACTOR;

  constructor(
    private scene: Scene,
    public offsetAngle: number,
    fov: number,
  ) {
    this.camera = new PerspectiveCamera(fov, 1, 0.1, 10000 / SCALE_FACTOR);
    this.camera.position.z = 500 / SCALE_FACTOR;

    this.light = new DirectionalLight(0xffffff, 1);
    this.light.position.copy(this.camera.position);
    scene.add(this.light);

    const ambient = new AmbientLight(0xffffff, 1);
    scene.add(ambient);
  }

  updateCameraPosition(maxSummaryHeight: number) {
    const verticalOffset = -maxSummaryHeight / 2;

    this.camera.position.z = Math.cos(this.offsetAngle) * this.baseCameraZ;
    this.camera.position.y = Math.sin(this.offsetAngle) * this.baseCameraZ + verticalOffset;
    this.camera.lookAt(new Vector3(this.camera.position.x, verticalOffset, 0));

    this.light.position.copy(this.camera.position);
    this.light.lookAt(0, verticalOffset, 0);
  }

  updateCameraZDistance(w: number) {
    const aspect = this.camera.aspect;
    const vFov = (this.camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(aspect * Math.tan(vFov / 2));
    this.baseCameraZ = w / SCALE_FACTOR / (2 * Math.tan(hFov / 2));
    this.camera.position.x = 0;
  }

  setupFogAndClipping(w: number) {
    this.scene.fog = new Fog(0x000000, this.baseCameraZ, this.baseCameraZ + (w / SCALE_FACTOR) * 2);
    this.camera.near = this.baseCameraZ * 0.5;
    this.camera.far = this.baseCameraZ + (w / SCALE_FACTOR) * 3;
    this.camera.updateProjectionMatrix();
  }

  setAspect(w: number, h: number) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
