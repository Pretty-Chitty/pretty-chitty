import { Box3, PerspectiveCamera, Vector3 } from "three";
import { RootChitRenderInstance } from "./RootChitRenderInstance";
import { Easing, Tween } from "@tweenjs/tween.js";
import { CameraSpec } from "./CameraSpec";

interface Point3d {
  x: number;
  y: number;
  z: number;
}
interface Point2d {
  x: number;
  y: number;
}

export class CameraWrapperPerspective {
  public cameraSpec = new CameraSpec();
  public camera = new PerspectiveCamera(this.cameraSpec.targetFov, window.innerWidth / window.innerHeight, 0.1, 1000);

  private firstPositionedCamera?: number;
  private current = { x: 0, y: 0, z: 1 };
  private last = { x: 0, y: 0, z: 1 };
  private width: number = 1;
  private height: number = 1;
  private wiggleRoomX: number = 0;
  private wiggleRoomY: number = 0;
  public visibleGameWidth: number = 0;
  public visibleGameHeight: number = 0;
  private lastNearFarDistanceSet: number = 0;

  protected offsetTween = new Tween<Point3d>({ x: 0, y: 0, z: 0 });
  protected rotationTween = new Tween<Point3d>({ x: 0, y: 0, z: 0 });

  private bbox = new Box3();

  constructor(private chit: RootChitRenderInstance) {
    this.camera.position.z = 20;
    this.camera.position.y = 0;
    this.camera.position.x = 0;
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
  }

  destroy() {}

  public setCameraSpec(cameraSpec?: CameraSpec): void {
    this.cameraSpec = cameraSpec ?? new CameraSpec();
    this.adjust(this.bbox);
  }

  public setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.camera.aspect = width / height;

    if (this.camera.aspect > 1) {
      this.camera.fov = this.cameraSpec.targetFov / this.camera.aspect;
    } else {
      this.camera.fov = this.cameraSpec.targetFov;
    }

    this.offsetTween.stop();
    this.rotationTween.stop();
    this.camera.updateProjectionMatrix();
    this.adjust(this.bbox);
  }

  public get zoom() {
    return this.current.z;
  }

  public handlePan(dx: number, dy: number): void {
    this.current.x += dx;
    this.current.y += dy;
    this.lockZoom();
    this.adjust(this.bbox, true);
  }

  public handleZoom(x: number, y: number, dz: number, animate: boolean): void {
    const zoom = Math.max(1, Math.min(this.current.z + dz, this.cameraSpec.maxZoom));
    const d = this.scaleFrom({ x, y: -y }, this.current.z, zoom);
    this.current.x += d.x;
    this.current.y += d.y;
    this.current.z += d.z;
    this.lockZoom();
    this.adjust(this.bbox, !animate);
  }

  private lockZoom() {
    const maxZoom = this.cameraSpec.maxZoom;
    if (this.current.z <= 1) {
      this.current.z = 1;
      this.current.x = 0;
      this.current.y = 0;
    } else {
      if (this.current.z > maxZoom) {
        this.current.z = maxZoom;
      }

      const halfWidth = this.width / 2;
      const halfHeight = this.height / 2;
      const maxX = (halfWidth - this.wiggleRoomX / 2) * this.current.z;
      const maxY = (halfHeight - this.wiggleRoomY / 2) * this.current.z;
      if (this.current.x + halfWidth > maxX) this.current.x = maxX - halfWidth;
      if (this.current.x - halfWidth < -maxX) this.current.x = -maxX + halfWidth;
      if (this.current.y + halfHeight > maxY) this.current.y = maxY - halfHeight;
      if (this.current.y - halfHeight < -maxY) this.current.y = -maxY + halfHeight;

      const visibleHeight = (this.height - this.wiggleRoomY) * this.current.z;
      const visibleWidth = (this.width - this.wiggleRoomX) * this.current.z;
      if (visibleHeight < this.height) {
        this.current.y = 0;
      }
      if (visibleWidth < this.width) {
        this.current.x = 0;
      }
    }
  }

  private scaleFrom(zoomOrigin: Point2d, currentScale: number, newScale: number) {
    const currentShift = this.getCoordinateShiftDueToScale(currentScale);
    const newShift = this.getCoordinateShiftDueToScale(newScale);

    const zoomDistance = newScale - currentScale;

    const shift = {
      x: currentShift.x - newShift.x,
      y: currentShift.y - newShift.y,
    };

    const output = {
      x: zoomOrigin.x * shift.x,
      y: zoomOrigin.y * shift.y,
      z: zoomDistance,
    };
    return output;
  }

  private getCoordinateShiftDueToScale(scale: number): Point2d {
    const newWidth = scale * this.width;
    const newHeight = scale * this.height;
    const dx = (newWidth - this.width) / 2;
    const dy = (newHeight - this.height) / 2;
    return {
      x: dx,
      y: dy,
    };
  }

  public adjust(bbox: Box3, immediate = false) {
    if (!Number.isFinite(bbox.max.x)) {
      return;
    }

    this.bbox = bbox;
    this.offsetTween.stop();
    this.rotationTween.stop();

    const fovRadsY = (this.camera.fov * Math.PI) / 180;
    const fovRadsX = fovRadsY * this.camera.aspect;

    // let extraVerticalPadding = 0 + this.cameraTopPadding,
    //     fovYDiff = 0;
    // if (extraVerticalPadding) {
    //   let newFov = fovRadsY * (1 - (extraVerticalPadding / this.height));
    //   fovYDiff = fovRadsY - newFov;
    //   fovRadsY = newFov;
    // }

    const xTan = Math.tan(fovRadsX / 2);
    const yTan = Math.tan(fovRadsY / 2);

    const gameHalfWidth = (this.bbox.max.x - this.bbox.min.x) / 2;
    const gameHalfHeight = (this.bbox.max.y - this.bbox.min.y) / 2;
    const gameAreaX = this.bbox.min.x + gameHalfWidth;
    const gameAreaY = this.bbox.min.y + gameHalfHeight;

    const distanceX = gameHalfWidth / xTan;
    const distanceY = gameHalfHeight / yTan;

    let distance = Math.max(
      this.cameraSpec.minCameraDistance,
      Math.max(distanceX, distanceY),
      // + (this.bbox.max.z - this.bbox.min.z),
    );

    this.wiggleRoomX = (1 - (Math.atan(gameHalfWidth / distance) * 2) / fovRadsX) * this.width;
    this.wiggleRoomY = (1 - (Math.atan(gameHalfHeight / distance) * 2) / fovRadsY) * this.height;

    distance *= 1 + this.cameraSpec.padding;

    this.visibleGameWidth = xTan * distance * 2;
    this.visibleGameHeight = yTan * distance * 2;

    const currentPosition = this.camera.position.clone(),
      currentRotation = this.camera.rotation.clone();

    if (this.current.z) {
      distance /= this.current.z;
    }

    if (!distance || !Number.isFinite(distance)) {
      distance = 500;
    }

    const distanceDifference = this.lastNearFarDistanceSet / distance;
    if (
      !Number.isFinite(distanceDifference) ||
      !distanceDifference ||
      distanceDifference > 1.1 ||
      distanceDifference < 0.9
    ) {
      this.camera.near = distance / 10;
      this.camera.far = distance * 10;
      this.lastNearFarDistanceSet = distance;
      this.camera.updateProjectionMatrix();
    }

    // this.chitsBoundingBox.position.z = 0; // why did this get reset?
    this.camera.position.x = gameAreaX + distance * Math.sin(this.cameraSpec.horizontalRadiansRotation);
    this.camera.position.y = gameAreaY + distance * Math.sin(this.cameraSpec.verticalRadiansRotation);
    this.camera.position.z =
      distance *
      Math.cos(this.cameraSpec.horizontalRadiansRotation) *
      Math.cos(this.cameraSpec.verticalRadiansRotation);
    this.camera.lookAt(gameAreaX, gameAreaY, 0);

    if (this.current.z) {
      this.camera.position.x -= (this.current.x / this.current.z / this.width) * this.visibleGameWidth;
      this.camera.position.y += (this.current.y / this.current.z / this.height) * this.visibleGameHeight;
    }

    // if (fovYDiff) {
    //   this.camera.position.y += distance * Math.tan(fovYDiff / 2);
    // }

    if (!this.firstPositionedCamera || Math.abs(Date.now() - this.firstPositionedCamera) < 100) {
      this.firstPositionedCamera ??= Date.now();
      return;
    }

    const newPosition = this.camera.position.clone(),
      newRotation = this.camera.rotation.clone();

    const positionDistance = currentPosition.distanceTo(newPosition),
      rotationDistance = new Vector3()
        .setFromEuler(currentRotation)
        .distanceTo(new Vector3().setFromEuler(newRotation));

    // stupid, but now it can be reset
    this.camera.position.set(currentPosition.x, currentPosition.y, currentPosition.z);
    this.camera.rotation.set(currentRotation.x, currentRotation.y, currentRotation.z);

    const duration = Math.min(
      Math.sqrt(Math.max(positionDistance, rotationDistance)) * this.cameraSpec.offsetSpeed,
      this.cameraSpec.maximumCameraAnimationDuration,
    );

    if (!immediate) {
      if (positionDistance > 0) {
        this.offsetTween = this.chit.createTween(
          { x: currentPosition.x, y: currentPosition.y, z: currentPosition.z },
          (tween) =>
            tween
              .to(newPosition, duration)
              .easing(Easing.Quadratic.InOut)
              .onUpdate((obj) => this.camera.position.set(obj.x, obj.y, obj.z)),
        );
      }

      if (rotationDistance > 0) {
        this.rotationTween = this.chit.createTween(
          { x: currentRotation.x, y: currentRotation.y, z: currentRotation.z },
          (tween) =>
            tween
              .to({ x: newRotation.x, y: newRotation.y, z: newRotation.z }, duration)
              .easing(Easing.Quadratic.InOut)
              .onUpdate((obj) => this.camera.rotation.set(obj.x, obj.y, obj.z)),
        );
      }
    } else {
      this.camera.rotation.set(newRotation.x, newRotation.y, newRotation.z);
      this.camera.position.set(newPosition.x, newPosition.y, newPosition.z);
    }
  }
}
