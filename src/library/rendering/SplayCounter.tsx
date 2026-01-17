import React from "react";
import { Text } from "../utilities/CanvasStack/ReactCanvas";
import { ParameterizedCanvas } from "../utilities/ParameterizedCanvas";
import { DEFAULT_FONT_FAMILY } from "../game/GameTheme";

export type SplayCounterOptions = {
  fontSize: number;
  fontFamily?: string;
  stroke?: string;
  fill?: string;
  shadow?: string;
};

export class SplayCounter extends ParameterizedCanvas {
  public value: number = 0;
  constructor(
    public width: number,
    public height: number,
    public textOptions: SplayCounterOptions,
    public dpi: number,
    public label: string,
  ) {
    super();
  }

  protected render() {
    return (
      <Text
        font={`${this.textOptions.fontSize * this.dpi}px ${this.textOptions.fontFamily ?? DEFAULT_FONT_FAMILY}`}
        fill={this.textOptions.fill ?? "#000"}
        shadowColor={this.textOptions.shadow}
        shadowBlur={this.textOptions.fontSize * 0.1 * this.dpi}
      >
        {this.label}
      </Text>
    );
  }
}
