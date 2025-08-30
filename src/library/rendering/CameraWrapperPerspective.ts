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

    const halfWidth = this.width / 2;
    const halfHeight = this.height / 2;
    x -= halfWidth;
    y -= halfHeight;

    const targetX = (this.current.x - x) * (zoom / this.current.z) + x;
    const targetY = (this.current.y - y) * (zoom / this.current.z) + y;

    this.current.x = targetX;
    this.current.y = targetY;
    this.current.z = zoom;
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

  public adjust(bbox: Box3, immediate = false) {
    if (!Number.isFinite(bbox.max.x)) {
      return;
    }

    this.bbox = bbox;
    this.offsetTween.stop();
    this.rotationTween.stop();

    const fovRadsY = (this.camera.fov * Math.PI) / 180;
    const fovRadsX = fovRadsY * this.camera.aspect;

    const xTan = Math.tan(fovRadsX / 2);
    const yTan = Math.tan(fovRadsY / 2);

    // content sizes (world units)
    const contentWidth = this.bbox.max.x - this.bbox.min.x;
    const contentHeight = this.bbox.max.y - this.bbox.min.y;
    const gameHalfWidth = contentWidth / 2;
    const gameHalfHeight = contentHeight / 2;
    const gameAreaX = this.bbox.min.x + gameHalfWidth;
    const gameAreaY = this.bbox.min.y + gameHalfHeight;

    // We only support per-side pixel paddings now.
    const padLeftPx = this.cameraSpec.paddingLeft;
    const padRightPx = this.cameraSpec.paddingRight;
    const padTopPx = this.cameraSpec.paddingTop + this.cameraSpec.extraPaddingTop;
    const padBottomPx = this.cameraSpec.paddingBottom;

    const useHorizontalPx = padLeftPx > 0 || padRightPx > 0;
    const useVerticalPx = padTopPx > 0 || padBottomPx > 0;

    // Compute required distances by projecting bbox corners into screen pixels and iterating
    // until the per-side pixel paddings are satisfied. This directly ensures "N px from the
    // closest point" behavior regardless of camera tilt.
    let centerShiftX = 0;
    let centerShiftY = 0;
    let distance: number;

    // initial, conservative estimates (no angle) as a starting point for the solver
    {
      let distanceX: number;
      if (useHorizontalPx && this.width > 0) {
        const padPxTotal = Math.max(0, padLeftPx + padRightPx);
        const fractionPx = Math.min(0.999, padPxTotal / this.width); // clamp
        distanceX = gameHalfWidth / xTan / (1 - fractionPx);
      } else {
        distanceX = gameHalfWidth / xTan;
      }

      let distanceY: number;
      if (useVerticalPx && this.height > 0) {
        const padPxTotal = Math.max(0, padTopPx + padBottomPx);
        const fractionPx = Math.min(0.999, padPxTotal / this.height);
        distanceY = gameHalfHeight / yTan / (1 - fractionPx);
      } else {
        distanceY = gameHalfHeight / yTan;
      }

      distance = Math.max(this.cameraSpec.minCameraDistance, Math.max(distanceX, distanceY));
    }

    // If padding occupies an excessive fraction of the viewport, fall back to ignoring per-side padding.
    const padHorizontalFraction = this.width > 0 ? Math.max(0, padLeftPx + padRightPx) / this.width : 0;
    const padVerticalFraction = this.height > 0 ? Math.max(0, padTopPx + padBottomPx) / this.height : 0;
    const ignorePaddingBecauseTooLarge = padHorizontalFraction > 0.8 || padVerticalFraction > 0.8;

    if (ignorePaddingBecauseTooLarge) {
      // Fallback: ignore per-side pixel padding entirely and compute distance from content size only.
      centerShiftX = 0;
      centerShiftY = 0;
      distance = Math.max(this.cameraSpec.minCameraDistance, gameHalfWidth / xTan, gameHalfHeight / yTan);

      const fallbackPaddedHalfWidth = gameHalfWidth;
      const fallbackPaddedHalfHeight = gameHalfHeight;

      // wiggleRoom should consider padded sizes (fallback)
      this.wiggleRoomX = (1 - (Math.atan(fallbackPaddedHalfWidth / distance) * 2) / fovRadsX) * this.width;
      this.wiggleRoomY = (1 - (Math.atan(fallbackPaddedHalfHeight / distance) * 2) / fovRadsY) * this.height;

      // visible sizes in world units (fallback)
      this.visibleGameWidth = xTan * distance * 2;
      this.visibleGameHeight = yTan * distance * 2;
    } else {
      // helper: project a world point into pixel coords for a camera defined by (adjustedCenter, distance)
      const projectPointToPixels = (
        p: Vector3,
        adjustedCenterX: number,
        adjustedCenterY: number,
        distanceVal: number,
      ) => {
        const sinH = Math.sin(this.cameraSpec.horizontalRadiansRotation);
        const sinV = Math.sin(this.cameraSpec.verticalRadiansRotation);
        const cosH = Math.cos(this.cameraSpec.horizontalRadiansRotation);
        const cosV = Math.cos(this.cameraSpec.verticalRadiansRotation);

        const camX = adjustedCenterX + distanceVal * sinH;
        const camY = adjustedCenterY + distanceVal * sinV;
        const camZ = distanceVal * cosH * cosV;
        const camPos = new Vector3(camX, camY, camZ);

        const lookAt = new Vector3(adjustedCenterX, adjustedCenterY, 0);
        const forward = new Vector3().subVectors(lookAt, camPos).normalize();

        // world up is +Z (scene plane is at z=0)
        const worldUp = new Vector3(0, 0, 1);
        const right = new Vector3().crossVectors(forward, worldUp).normalize();
        const up = new Vector3().crossVectors(right, forward).normalize();

        const v = new Vector3().subVectors(p, camPos);
        const x_cam = v.dot(right);
        const y_cam = v.dot(up);
        const z_cam = Math.max(0.0001, v.dot(forward));

        // NDC coords
        const ndcX = x_cam / (z_cam * xTan);
        const ndcY = y_cam / (z_cam * yTan);

        const px = (ndcX + 1) * 0.5 * this.width;
        const py = (1 - ndcY) * 0.5 * this.height; // y screen: 0 top

        return { px, py, z_cam, camPos, forward };
      };

      // iterative solver: adjust distance and centerShift until projected bbox fits inside padded viewport
      for (let iter = 0; iter < 10; iter++) {
        const adjustedCenterX = gameAreaX + centerShiftX;
        const adjustedCenterY = gameAreaY + centerShiftY;

        // project corners
        const pA = projectPointToPixels(
          new Vector3(this.bbox.min.x, this.bbox.min.y, 0),
          adjustedCenterX,
          adjustedCenterY,
          distance,
        );
        const pB = projectPointToPixels(
          new Vector3(this.bbox.min.x, this.bbox.max.y, 0),
          adjustedCenterX,
          adjustedCenterY,
          distance,
        );
        const pC = projectPointToPixels(
          new Vector3(this.bbox.max.x, this.bbox.min.y, 0),
          adjustedCenterX,
          adjustedCenterY,
          distance,
        );
        const pD = projectPointToPixels(
          new Vector3(this.bbox.max.x, this.bbox.max.y, 0),
          adjustedCenterX,
          adjustedCenterY,
          distance,
        );

        const leftPx = Math.min(pA.px, pB.px, pC.px, pD.px);
        const rightPx = Math.max(pA.px, pB.px, pC.px, pD.px);
        const topPx = Math.min(pA.py, pB.py, pC.py, pD.py);
        const bottomPx = Math.max(pA.py, pB.py, pC.py, pD.py);

        const contentPxWidth = Math.max(1, rightPx - leftPx);
        const contentPxHeight = Math.max(1, bottomPx - topPx);

        const allowedPxWidth = Math.max(1, this.width - Math.max(0, padLeftPx + padRightPx));
        const allowedPxHeight = Math.max(1, this.height - Math.max(0, padTopPx + padBottomPx));

        // scale factor required to fit content into allowed pixel area
        const factorX = allowedPxWidth / contentPxWidth;
        const factorY = allowedPxHeight / contentPxHeight;
        const scale = Math.min(factorX, factorY, 1);

        // pixel center shift to bring content into the padded center region
        const desiredCenterPxX = Math.max(0, padLeftPx) + allowedPxWidth / 2;
        const desiredCenterPxY = Math.max(0, padTopPx) + allowedPxHeight / 2;
        const currentCenterPxX = (leftPx + rightPx) / 2;
        const currentCenterPxY = (topPx + bottomPx) / 2;
        const pixelShiftX = desiredCenterPxX - currentCenterPxX;
        const pixelShiftY = desiredCenterPxY - currentCenterPxY;

        // Debug: per-iteration projected corner pixels and padding/fit diagnostics (safe: vars defined above)
        try {
          // eslint-disable-next-line no-console
          console.debug("[CameraDebug] iter", iter, {
            corners: {
              A: { px: pA.px, py: pA.py, z: pA.z_cam },
              B: { px: pB.px, py: pB.py, z: pB.z_cam },
              C: { px: pC.px, py: pC.py, z: pC.z_cam },
              D: { px: pD.px, py: pD.py, z: pD.z_cam },
            },
            bounds: { leftPx, rightPx, topPx, bottomPx },
            contentPx: { width: contentPxWidth, height: contentPxHeight },
            allowedPx: { width: allowedPxWidth, height: allowedPxHeight, padLeftPx, padRightPx, padTopPx, padBottomPx },
            scale,
            pixelShift: { x: pixelShiftX, y: pixelShiftY },
            centerPx: { currentCenterPxX, currentCenterPxY, desiredCenterPxX, desiredCenterPxY },
          });
        } catch (e) {
          /* swallow debug errors */
        }

        // convert pixel shifts to world units using depth at the center (approx)
        const centerProj = projectPointToPixels(
          new Vector3(gameAreaX + centerShiftX, gameAreaY + centerShiftY, 0),
          adjustedCenterX,
          adjustedCenterY,
          distance,
        );
        const depthCenter = Math.max(0.0001, centerProj.z_cam);
        const worldPerPixelCenterX = (2 * xTan * depthCenter) / this.width;
        const worldPerPixelCenterY = (2 * yTan * depthCenter) / this.height;

        // update center shifts (move content in world units according to pixelShift)
        centerShiftX += pixelShiftX * worldPerPixelCenterX;
        // pixel Y increases downwards; positive pixelShiftY means move content down => increase centerShiftY
        centerShiftY += pixelShiftY * worldPerPixelCenterY;

        // update distance based on scale (projection scales roughly proportional to 1/distance)
        const newDistance = Math.max(this.cameraSpec.minCameraDistance, distance / Math.max(1e-6, scale));

        const centerDelta = Math.abs(pixelShiftX) + Math.abs(pixelShiftY);

        distance = newDistance;

        // convergence heuristics
        if (scale >= 1 - 1e-3 && centerDelta < 0.5) {
          break;
        }
      }

      // After convergence compute final padded half-sizes (approx using center depth)
      // Debug: report final solver state
      try {
        // eslint-disable-next-line no-console
        console.debug("[CameraDebug] final", {
          distance,
          centerShift: { x: centerShiftX, y: centerShiftY },
          viewport: { width: this.width, height: this.height },
          paddingPx: { left: padLeftPx, right: padRightPx, top: padTopPx, bottom: padBottomPx },
        });
      } catch (e) {
        /* swallow debug errors */
      }

      const visibleWorldPerPixelX = (2 * xTan * Math.max(0.0001, distance)) / this.width;
      const visibleWorldPerPixelY = (2 * yTan * Math.max(0.0001, distance)) / this.height;

      const paddedHalfWidthUsed = gameHalfWidth + (Math.max(0, padLeftPx + padRightPx) * visibleWorldPerPixelX) / 2;
      const paddedHalfHeightUsed = gameHalfHeight + (Math.max(0, padTopPx + padBottomPx) * visibleWorldPerPixelY) / 2;

      // wiggleRoom should consider padded sizes
      this.wiggleRoomX = (1 - (Math.atan(paddedHalfWidthUsed / distance) * 2) / fovRadsX) * this.width;
      this.wiggleRoomY = (1 - (Math.atan(paddedHalfHeightUsed / distance) * 2) / fovRadsY) * this.height;

      // visible sizes in world units
      this.visibleGameWidth = xTan * distance * 2;
      this.visibleGameHeight = yTan * distance * 2;
    }

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

    // centerShiftX/centerShiftY are computed by the angle-aware solver above.
    // If padding is not used they will be zero; no further adjustment needed here.

    const adjustedCenterX = gameAreaX + centerShiftX;
    const adjustedCenterY = gameAreaY + centerShiftY;

    // Safety guard: ensure camera's Z (depth) is positive so camera looks toward scene plane.
    // If rotation causes camZ <= 0 (camera pointing below horizon / behind plane) increase distance slightly until valid.
    {
      const sinH = Math.sin(this.cameraSpec.horizontalRadiansRotation);
      const sinV = Math.sin(this.cameraSpec.verticalRadiansRotation);
      const cosH = Math.cos(this.cameraSpec.horizontalRadiansRotation);
      const cosV = Math.cos(this.cameraSpec.verticalRadiansRotation);

      // iterative bump to ensure camZ > 0 (prevent black/empty renders)
      let camZ = distance * cosH * cosV;
      if (camZ <= 0) {
        let attempts = 0;
        while (camZ <= 0 && attempts < 20) {
          distance = Math.max(this.cameraSpec.minCameraDistance, distance * 1.15);
          camZ = distance * cosH * cosV;
          attempts++;
        }
      }

      // position camera and look at adjusted center
      this.camera.position.x = adjustedCenterX + distance * sinH;
      this.camera.position.y = adjustedCenterY + distance * sinV;
      this.camera.position.z = distance * cosH * cosV;
      this.camera.lookAt(adjustedCenterX, adjustedCenterY, 0);

      // Debug: camera state to help diagnose black frames / clipping
      try {
        // eslint-disable-next-line no-console
        console.debug("[CameraDebug] cameraState", {
          pos: this.camera.position.toArray(),
          lookAt: [adjustedCenterX, adjustedCenterY, 0],
          near: this.camera.near,
          far: this.camera.far,
          distance,
          camZ,
          rotation: {
            horizontalRadians: this.cameraSpec.horizontalRadiansRotation,
            verticalRadians: this.cameraSpec.verticalRadiansRotation,
          },
        });
      } catch (e) {
        /* swallow debug errors */
      }
    }

    if (this.current.z) {
      this.camera.position.x -= (this.current.x / this.current.z / this.width) * this.visibleGameWidth;
      this.camera.position.y += (this.current.y / this.current.z / this.height) * this.visibleGameHeight;
    }

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

    // restore previous camera position/rotation now that we've computed new ones; we'll tween from current -> new
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
