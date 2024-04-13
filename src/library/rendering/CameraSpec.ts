// TODO: Add light that is attached to camera?

export class CameraSpec {
  public maxZoom: number = 5;
  public targetFov: number = 45;
  public horizontalRadiansRotation: number = 0;
  public verticalRadiansRotation: number = -0.5;
  public padding: number = 0.1; // a 0-10 percent
  public offsetSpeed: number = 250;
  public minCameraDistance: number = 1;
  public maximumCameraAnimationDuration: number = 750;
}
