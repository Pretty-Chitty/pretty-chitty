import React from "react";
import { Box3, Group, Mesh, MeshPhongMaterial, Object3D, PlaneGeometry, Vector3 } from "three";
import { CameraSpec } from "./CameraSpec";
import { Chit } from "../game/Chit";
import { LightSpec } from "./LightSpec";
import { HighlightSpec } from "./HighlightSpec";
import { Splay } from "./Splay";
import { OrderedOutlet } from "../game/OrderedOutlet";
import { ParameterizedCanvas } from "../utilities/ParameterizedCanvas";
import { IconMap } from "../utilities/CanvasStack/CanvasOperations";
import { SplayCounter, SplayCounterOptions } from "./SplayCounter";
import { fixBbox } from "../utilities/BboxUtils";
import { GalleryItemChitChildrenSource } from "../game/GalleryItemChitChildrenSource";
import { IUpdatingCanvas } from "../utilities/IUpdatingCanvas";

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

  public galleryRotateX: number = 0;
  public galleryRotateY: number = 0;
  public galleryRotateZ: number = 0;

  public galleryMaximumWidth: number | undefined;
  public galleryMaximumHeight: number | undefined;

  public ownerOrigin: string | OwnerOriginPosition = OwnerOriginPosition.Default;
  public outletPositions: { [key: string]: Vector3 } = {};

  public object: Object3D = new Group();
  public ornaments: Object3D[] = [];
  public camera?: CameraSpec = undefined;
  public lightSpec?: LightSpec = undefined;
  public highlight = new HighlightSpec();
  public splay = new Splay();

  public summary: string | undefined;
  public summaryIconMap: IconMap | undefined;

  public showDetailsOnLongPress = false;

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

  /** @internal */
  public isShowingChildrenAsGallery = false;

  public showChildrenAsGallery() {
    this.chit.onClick = () => {
      this.chit.renderInstance?.rootRenderInstance.showGallery(new GalleryItemChitChildrenSource(this.chit));
    };
    this.highlight.visible = false;
    this.isShowingChildrenAsGallery = true;
  }

  public setOutletPosition(key: string, x: number, y: number, z: number = 0) {
    this.outletPositions[key] = new Vector3(x, y, z);
  }

  public setOutletPositionFromCanvas(renderStack: IUpdatingCanvas | ParameterizedCanvas) {
    if (renderStack instanceof ParameterizedCanvas) {
      renderStack = renderStack.get();
    }

    const bb = new Box3();
    bb.expandByObject(this.object);

    const w = bb.max.x - bb.min.x,
      h = bb.max.y - bb.min.y,
      scaleX = w / renderStack.width,
      scaleY = h / renderStack.height;

    Object.entries(renderStack.outlets).forEach(([key, coords]) => {
      this.setOutletPosition(key, coords.x * scaleX + bb.min.x, (renderStack.height - coords.y) * scaleY + bb.min.y, 0);
    });
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
        itemHeight = 0.0001;
      const firstItem = ordered.get(0) as Chit;
      if (firstItem) {
        const fakeRenderSpec = new ChitRenderSpec(firstItem);
        firstItem.render(fakeRenderSpec);

        const itemBox3 = new Box3();
        itemBox3.expandByObject(fakeRenderSpec.object);
        fixBbox(itemBox3);
        itemWidth = fakeRenderSpec.splay.itemWidth ?? itemBox3.max.x - itemBox3.min.x;
        itemHeight = fakeRenderSpec.splay.itemHeight ?? itemBox3.max.y - itemBox3.min.y;

        const positionResult = fakeRenderSpec.splay.splayEndPosition(itemWidth, itemHeight, position);
        offsetX += positionResult.x;
        offsetY += positionResult.y;
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
      fixBbox(box3);

      switch (position) {
        case "bottom":
          offsetY -= h / 2;
          break;
        case "top":
          offsetY += h / 2;
          break;
        case "left":
          offsetX -= w / 2;
          break;
        case "right":
          offsetX += w / 2;
          break;
      }

      const p = this.outletPositions[ordered.outletName] ?? new Vector3(0, 0, 0);
      mesh.position.set(p.x + offsetX, p.y + offsetY, box3.max.z - box3.min.z + p.z + 0.001);
      this.ornaments.push(mesh);
    }
  }
}
