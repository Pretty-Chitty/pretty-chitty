import React from "react";
import { Raw } from "./CanvasStack/ReactCanvas";
import { ParameterizedCanvas } from "./ParameterizedCanvas";

export class OutlineCanvas extends ParameterizedCanvas {
  radius = 6;
  lineWidth = 6;
  innerLineWidth = 2;
  outerColor = "#f00";
  innerColor = "#ff0";
  width = 100;
  height = 100;
  render() {
    return (
      <Raw
        cb={(ctx, x, y, w, h) => {
          ctx.imageSmoothingEnabled = false;
          ctx.strokeStyle = this.outerColor;
          ctx.lineWidth = this.lineWidth;
          ctx.beginPath();
          ctx.roundRect(
            x + this.lineWidth / 2,
            y + this.lineWidth / 2,
            w - this.lineWidth,
            h - this.lineWidth,
            this.radius,
          );
          ctx.stroke();

          ctx.strokeStyle = this.innerColor;
          ctx.lineWidth = this.innerLineWidth;
          ctx.beginPath();
          ctx.roundRect(
            x + this.lineWidth / 2,
            y + this.lineWidth / 2,
            w - this.lineWidth,
            h - this.lineWidth,
            this.radius,
          );
          ctx.stroke();
        }}
      />
    );
  }
}
