import { Group, Object3D, Vector3 } from "three";
import { CameraSpec } from "./CameraSpec";
import { Chit } from "../game/Chit";
import { LightSpec } from "./LightSpec";
import { HighlightSpec } from "./HighlightSpec";

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
  public zLiftRatio: number = 0.1;

  public rotationSpeed: number = 2000; // time it takes to do a 360 degree spin
  public rotateX: number = 0;
  public rotateY: number = 0;
  public rotateZ: number = 0;
  public zLiftRotationMultiplier = 1;

  public ownerOrigin: OwnerOriginPosition = OwnerOriginPosition.MiddleCenter;
  public outletPositions: { [key: string]: Vector3 } = {};

  public object: Object3D = new Group();
  public ornament: Object3D = new Group();
  public camera?: CameraSpec = undefined;
  public lightSpec?: LightSpec = undefined;
  public highlight = new HighlightSpec();

  constructor(public readonly chit: Chit) {
    this.object.visible = false;
    this.ornament.visible = false;
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
}
