// TODO: Add light that is attached to camera?

export class CameraSpec {
  public maxZoom: number = 5;
  public targetFov: number = 45;
  public horizontalRadiansRotation: number = 0;
  public verticalRadiansRotation: number = -0.5;

  /**
   * Pixel-based per-side paddings only (preferred).
   * These specify absolute pixel margins to leave around the content when framing.
   * Example: paddingLeftPx = 20 means leave 20px on the left side.
   *
   * If all are zero, no padding is applied.
   */
  public paddingTop: number = 20;
  public extraPaddingTop: number = 0;
  public paddingBottom: number = 20;
  public paddingLeft: number = 20;
  public paddingRight: number = 20;

  public offsetSpeed: number = 250;
  public minCameraDistance: number = 5;
  public maximumCameraAnimationDuration: number = 750;
}
