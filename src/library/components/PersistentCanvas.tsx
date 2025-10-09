import React, { useLayoutEffect, useRef, useState } from "react";

interface PersistentCanvasProps {
  width: number;
  height: number;
  displayWidth: number;
  displayHeight: number;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  onSnapshotCleared?: () => void;
}

export default function PersistentCanvas({
  width,
  height,
  displayWidth,
  displayHeight,
  canvasRef,
  onSnapshotCleared,
}: PersistentCanvasProps) {
  const [snapshotDataUrl, setSnapshotDataUrl] = useState<string | null>(null);
  const prevSizeRef = useRef({ width: 0, height: 0 });

  // Capture snapshot BEFORE DOM updates using useLayoutEffect
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && (prevSizeRef.current.width !== width || prevSizeRef.current.height !== height)) {
      // Only capture if we had a previous size (not first render)
      if (prevSizeRef.current.width > 0 && prevSizeRef.current.height > 0) {
        try {
          setSnapshotDataUrl(canvas.toDataURL());
        } catch (e) {
          // Ignore errors from tainted canvas
          setSnapshotDataUrl(null);
        }
      }
      prevSizeRef.current = { width, height };
    }
  }, [width, height, canvasRef]);

  // Expose method to clear snapshot
  React.useImperativeHandle(
    canvasRef,
    () => {
      const canvas = canvasRef.current;
      if (canvas) {
        (canvas as any).clearSnapshot = () => {
          setSnapshotDataUrl(null);
          onSnapshotCleared?.();
        };
      }
      return canvas as HTMLCanvasElement;
    },
    [canvasRef, onSnapshotCleared]
  );

  return (
    <div style={{ position: "absolute", top: 0, right: 0, left: 0, bottom: 0 }}>
      {snapshotDataUrl && (
        <img
          src={snapshotDataUrl}
          alt=""
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            imageRendering: "auto",
          }}
        />
      )}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ width: displayWidth, height: displayHeight }}
      />
    </div>
  );
}
