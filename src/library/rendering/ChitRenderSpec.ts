import React from "react";
import {
  Box3,
  BoxGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhongMaterial,
  Object3D,
  PlaneGeometry,
  Vector3,
} from "three";
import { CameraSpec } from "./CameraSpec";
import { Chit } from "../game/Chit";
import { LightSpec } from "./LightSpec";
import { HighlightSpec } from "./HighlightSpec";
import { Splay } from "./Splay";
import { OrderedOutlet } from "../game/OrderedOutlet";
import { ParameterizedCanvas } from "../utilities/ParameterizedCanvas";
import { TextOptions } from "../utilities/CanvasStack/CanvasOperations";
import { Text } from "../utilities/CanvasStack/ReactCanvas";
import { SplayCounter, SplayCounterOptions } from "./SplayCounter";

// prettier-ignore
export enum OwnerOriginPosition {
  Default,
  TopLeft, TopCenter, TopRight,
  MiddleLeft, MiddleCenter, MiddleRight,
  BottomLeft, BottomCenter, BottomRight,
}

export class ChitRenderSpec {
  public offsetSpeed: number = 250; // speed it takes to move "1" unit
  public maxDistanceForSpeed: number = 3; // The max "distance" to measure speed.  AKA a distance of length 4 will take as long as a distance of length 3.
  public offsetX: number = 0;
  public offsetY: number = 0;
  public offsetZ: number = 0;
  public zLiftRatio: number = 0.01;

  public childrenOffsetZ: number = 0.025;

  public rotationSpeed: number = 2000; // time it takes to do a 360 degree spin
  public rotateX: number = 0;
  public rotateY: number = 0;
  public rotateZ: number = 0;
  public zLiftRotationMultiplier = 1;

  public ownerOrigin: string | OwnerOriginPosition = OwnerOriginPosition.Default;
  public outletPositions: { [key: string]: Vector3 } = {};

  public object: Object3D = new Group();
  public ornaments: Object3D[] = [];
  public camera?: CameraSpec = undefined;
  public lightSpec?: LightSpec = undefined;
  public highlight = new HighlightSpec();
  public splay = new Splay();

  constructor(public readonly chit: Chit) {
    this.object.visible = false;

    if ((chit as any).__outletPosition) {
      this.outletPositions = { ...(chit as any).__outletPosition };
    }
  }

  public offset(x: number, y: number, z: number | undefined): ChitRenderSpec {
    this.offsetX = x;
    this.offsetY = y;
    this.offsetZ = z ?? 0;
    return this;
  }

  public rotate(x: number, y: number, z: number | undefined): ChitRenderSpec {
    this.offsetX = x;
    this.offsetY = y;
    this.offsetZ = z ?? 0;
    return this;
  }

  public setOutletPosition(key: string, x: number, y: number, z: number = 0) {
    this.outletPositions[key] = new Vector3(x, y, z);
  }

  public addCounterToOrderedOutlet(
    ordered: OrderedOutlet<any>,
    canvas: SplayCounterOptions | (ParameterizedCanvas & { value: number }),
    minimumToRender = 2,
    dpi: number = 100,
    position: "top" | "left" | "right" | "bottom" = "bottom",
  ) {
    if (ordered.length >= minimumToRender) {
      let offsetY = 0,
        offsetX = 0,
        itemWidth = 0.0001,
        itemHeight = 0.0001,
        rows = 0,
        columns = 0;
      const firstItem = ordered.get(0) as Chit;
      if (firstItem) {
        const fakeRenderSpec = new ChitRenderSpec(firstItem);
        firstItem.render(fakeRenderSpec);

        const itemBox3 = new Box3();
        itemBox3.expandByObject(fakeRenderSpec.object);
        itemWidth = fakeRenderSpec.splay.itemWidth ?? itemBox3.max.x - itemBox3.min.x;
        itemHeight = fakeRenderSpec.splay.itemHeight ?? itemBox3.max.y - itemBox3.min.y;
        rows = fakeRenderSpec.splay.rows * fakeRenderSpec.splay.spacingMultiplier;
        columns = fakeRenderSpec.splay.columns * fakeRenderSpec.splay.spacingMultiplier;
      }

      if (!(canvas instanceof ParameterizedCanvas)) {
        const w = ordered.length.toString().length * canvas.fontSize * dpi;
        const h = canvas.fontSize * dpi;

        canvas = new SplayCounter(Math.round(w), Math.round(h), canvas, dpi, ordered.length);
      }

      canvas.value = ordered.length;
      const w = canvas.width / dpi,
        h = canvas.height / dpi;

      const mesh = new Mesh(
        new PlaneGeometry(w, h),
        new MeshPhongMaterial({
          map: canvas.get().texture,
          transparent: true,
          alphaTest: 0.1,
        }),
      );
      mesh.castShadow = false;
      mesh.receiveShadow = false;

      // this kinda sucks, but maybe isn't so bad?
      const box3 = new Box3();
      box3.expandByObject(this.object);

      switch (position) {
        case "bottom":
          offsetY = -((rows / 2) * itemHeight) - h / 2;
          break;
        case "top":
          offsetY = (rows / 2) * itemHeight + h / 2;
          break;
        case "left":
          offsetX = -((columns / 2) * itemWidth) - w / 2;
          break;
        case "right":
          offsetX = (columns / 2) * itemWidth + w / 2;
          break;
      }

      const p = this.outletPositions[ordered.outletName] ?? new Vector3(0,0,0);
      mesh.position.set(p.x + offsetX, p.y + offsetY, box3.max.z - box3.min.z + p.z + 0.001);
      // mesh.renderOrder = ;
      this.ornaments.push(mesh);
    }
  }
}
