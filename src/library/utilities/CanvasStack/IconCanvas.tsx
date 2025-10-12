import React from "react";
import { ParameterizedCanvas } from "../ParameterizedCanvas";
import { ImageSpec } from "./CanvasOperations";
import { Image } from "./ReactCanvas";

export class IconCanvas extends ParameterizedCanvas {
  width = 50;
  height = 50;

  constructor(private image: ImageSpec) {
    super();
  }

  protected render() {
    return <Image fill image={this.image} />;
  }
}
