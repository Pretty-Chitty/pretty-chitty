export default function imageColorOverlayer(image: HTMLImageElement, color: string) {
  if (!image.width && !image.height) {
    return image;
  }

  let offCanvas = (image as any).__offCanvas as HTMLCanvasElement;
  if (!offCanvas) {
    // --- Offscreen canvas ---
    offCanvas = document.createElement("canvas");
    offCanvas.width = image.width;
    offCanvas.height = image.height;
    (image as any).__offCanvas = offCanvas;
  }

  const offCtx = offCanvas.getContext("2d");
  if (!offCtx) {
    throw "could not create context";
  }

  // Clear the context first
  offCtx.clearRect(0, 0, offCanvas.width, offCanvas.height);
  // a) Draw the black icon onto the offscreen
  offCtx.drawImage(image, 0, 0);

  // b) Switch to "source-in"
  //    which means: keep only the existing pixels (the icon),
  //    and color them in the new fill style
  offCtx.globalCompositeOperation = "source-in";
  offCtx.fillStyle = color;
  offCtx.fillRect(0, 0, image.width, image.height);

  // c) Reset the offscreen context if you like
  offCtx.globalCompositeOperation = "source-over";

  return offCanvas;
}
