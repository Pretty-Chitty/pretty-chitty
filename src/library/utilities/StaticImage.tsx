import React from "react";
import { ParameterizedCanvas } from "./ParameterizedCanvas";
import { Image } from "./CanvasStack/ReactCanvas";
import { MeshPhongMaterial, RepeatWrapping } from "three";
import { ImageSpec } from "./CanvasStack/CanvasOperations";

export type StaticImageOptions = {
  rx?: number;
  ry?: number;
};

export class StaticImage extends ParameterizedCanvas {
  protected imageInfo: string;

  constructor(private image: ImageSpec) {
    super();
    this.width = this.image.primary.bounds.width;
    this.height = this.image.primary.bounds.height;
    this.imageInfo = JSON.stringify(this.image);
  }

  protected render() {
    return <Image image={this.image} fill />;
  }

  static material(image: ImageSpec) {
    const result = new StaticImage(image);
    return result.get().material;
  }

  static texture(image: ImageSpec, options?: StaticImageOptions) {
    const result = new StaticImage(image);
    const texture = result.get().texture;
    if (options) {
      texture.repeat.x = options.rx ?? 1;
      texture.repeat.y = options.ry ?? 1;
      texture.wrapS = RepeatWrapping;
      texture.wrapT = RepeatWrapping;
    }
    return texture;
  }
}
