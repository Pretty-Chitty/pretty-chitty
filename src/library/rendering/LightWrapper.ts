import {
  AmbientLight,
  Box2,
  Box3,
  DirectionalLight,
  Group,
  Mesh,
  PlaneGeometry,
  ShadowMaterial,
  Vector2,
  Vector3,
} from "three";
import { LightSpec } from "./LightSpec";

export class LightWrapper {
  private bbox = new Box3();
  private lightSpec = new LightSpec();
  public group = new Group();
  private width: number = 1;
  private height: number = 1;

  private ambient = new AmbientLight();
  private directionalLights: DirectionalLight[] = [];
  private shadowMesh = new Mesh(
    new PlaneGeometry(1000, 1000),
    new ShadowMaterial({
      depthWrite: false,
    }),
  );

  constructor() {
    this.group.add(this.ambient);

    this.shadowMesh.position.z = 0.001;
    this.shadowMesh.renderOrder = Number.MAX_SAFE_INTEGER;
    this.shadowMesh.receiveShadow = true;
    this.shadowMesh.visible = false;

    this.group.add(this.shadowMesh);
  }

  setLightSpec(lightSpec?: LightSpec): void {
    this.lightSpec = lightSpec ?? new LightSpec();
    this.shadowMesh.position.z = this.lightSpec.shadowZDepth;
    this.adjust(this.bbox);
  }

  setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.adjust(this.bbox);
  }

  destroy() {
    this.ambient.dispose();
    this.directionalLights.forEach((light) => light.dispose());
  }

  adjust(bbox: Box3) {
    this.bbox = bbox;

    this.ambient.color.set(this.lightSpec.ambientColor);
    this.ambient.intensity = this.lightSpec.ambientIntensity;

    // deleting lights is bad... but we can just make them invisible
    this.directionalLights.forEach((light) => (light.visible = false));

    let makeShadow = false;
    this.lightSpec.lights.forEach((light, index) => {
      let l = this.directionalLights[index];
      if (!l) {
        l = this.directionalLights[index] = new DirectionalLight();
        l.shadow.camera.left = -0.1;
        l.shadow.camera.right = 0.1;
        l.shadow.camera.top = 0.1;
        l.shadow.camera.bottom = -0.1;
        // the camera is fitted to the whole panel, so a board-sized panel needs more than the default 512 texels for
        // a piece's shadow to read
        l.shadow.mapSize.set(1024, 1024);
        this.group.add(l);
      }

      l.visible = true;
      l.color.set(light.color);
      l.intensity = light.intensity;

      l.position.z = 100 * Math.sin(light.angleElevationRadians);
      l.position.y = 100 * Math.cos(light.angleRadians) * Math.cos(light.angleElevationRadians);
      l.position.x = 100 * -Math.sin(light.angleRadians) * Math.cos(light.angleElevationRadians);

      if (light.shadow) {
        makeShadow = true;
        l.castShadow = true;
        this.adjustCameraForBbox(l);
      } else {
        l.castShadow = false;
      }
    });

    if (this.lightSpec.shadowOpacity > 0 && makeShadow) {
      (this.shadowMesh.material as ShadowMaterial).opacity = this.lightSpec.shadowOpacity;
      (this.shadowMesh.material as ShadowMaterial).color.set(this.lightSpec.shadowColor);
      this.shadowMesh.visible = true;
    } else {
      this.shadowMesh.visible = false;
    }
  }

  adjustCameraForBbox(light: DirectionalLight) {
    if (!Number.isFinite(this.bbox.max.x)) {
      return;
    }

    //
    // the more precise the range of this camera is, the better the shadows look
    // since it renders to a 512x512 map.
    //
    // However, this should really just grow and not ever shrink - otherwise
    // we will have to recompute this camera in a tween.
    //
    // This should be fine almost everywhere.
    //

    const camera = light.shadow.camera;
    const { left, right, bottom, top } = camera;

    camera.left = -1;
    camera.right = 1;
    camera.bottom = -1;
    camera.top = 1;
    camera.updateProjectionMatrix();
    // point the shadow camera along the light now (the renderer would only do it at the next shadow pass), so the
    // projection below is in the light's view
    light.updateMatrixWorld(true);
    light.shadow.updateMatrices(light);

    const b = new Box2();
    const adjust = (x: number, y: number, z: number) => {
      const v = new Vector3(x, y, z);
      const cameraPoint = v.project(camera);
      b.expandByPoint(new Vector2(cameraPoint.x, cameraPoint.y));
    };

    [this.bbox.min.x, this.bbox.max.x].forEach((x) =>
      [this.bbox.min.y, this.bbox.max.y].forEach((y) =>
        [this.bbox.min.z, this.bbox.max.z].forEach((z) => {
          adjust(x, y, z);
        }),
      ),
    );

    // with -1..1 bounds the projection is the light's own view coordinates: fit them, with a small margin
    b.expandByScalar(0.5);
    camera.left = Math.min(left, b.min.x);
    camera.right = Math.max(right, b.max.x);
    camera.bottom = Math.min(bottom, b.min.y);
    camera.top = Math.max(top, b.max.y);

    const lDist = light.position.length();
    if (lDist > 0) {
      const lightDir = light.position.clone().normalize();
      let minDepth = Infinity;
      let maxDepth = -Infinity;
      [this.bbox.min.x, this.bbox.max.x].forEach((x) =>
        [this.bbox.min.y, this.bbox.max.y].forEach((y) =>
          [this.bbox.min.z, this.bbox.max.z].forEach((z) => {
            const depth = lDist - (x * lightDir.x + y * lightDir.y + z * lightDir.z);
            minDepth = Math.min(minDepth, depth);
            maxDepth = Math.max(maxDepth, depth);
          }),
        ),
      );
      const margin = Math.max(1, (maxDepth - minDepth) * 0.1);
      camera.near = Math.max(0.1, minDepth - margin);
      camera.far = maxDepth + margin;
    }

    camera.updateProjectionMatrix();
  }
}
