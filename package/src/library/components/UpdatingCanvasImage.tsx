import React, { useEffect, useRef } from 'react';

import { IUpdatingCanvas } from '../utilities/IUpdatingCanvas';

export function UpdatingCanvasImage({ image, style }: { image: IUpdatingCanvas; style?: React.CSSProperties }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (image) {
      const update = () => {
        if (canvasRef.current) {
          canvasRef.current.getContext('2d')?.drawImage(image.canvas, 0, 0);
        }
      };
      update();
      return image.onUpdate(update);
    }
    return () => {};
  }, [image, canvasRef.current]);

  return <canvas style={style} ref={canvasRef} width={image.width} height={image.height} />;
}
