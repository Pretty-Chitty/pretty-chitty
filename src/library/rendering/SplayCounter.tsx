import React from "react";
import { Text } from "../utilities/CanvasStack/ReactCanvas";
import { ParameterizedCanvas } from "../utilities/ParameterizedCanvas";

export type SplayCounterOptions = {
  fontSize: number;
  fontFamily?: string;
  stroke?: string;
  fill?: string;
  shadow?: string;
};

export class SplayCounter extends ParameterizedCanvas {
  constructor(
    public width: number,
    public height: number,
    public textOptions: SplayCounterOptions,
    public dpi: number,
    public value: number,
  ) {
    super();
  }

  protected render() {
    const s = this.value.toString();
    return (
      <Text
        font={`${this.textOptions.fontSize * this.dpi}px ${this.textOptions.fontFamily ?? "sans-serif"}`}
        fill={this.textOptions.fill ?? "#000"}
        shadowColor={this.textOptions.shadow}
        shadowBlur={this.textOptions.fontSize * 0.1 * this.dpi}
      >
        {s}
      </Text>
    );
  }
}
