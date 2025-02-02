import React from "react";
import { ParameterizedCanvas } from "./ParameterizedCanvas";
import { Color, Image, Layered } from "./CanvasStack/ReactCanvas";
import { RepeatWrapping } from "three";
import { ImageSpec } from "./CanvasStack/CanvasOperations";

export type StaticImageOptions = {
  rx?: number;
  ry?: number;
  overlayColor?: string;
  backgroundColor?: string;
};

export class StaticImage extends ParameterizedCanvas {
  protected imageInfo: string;

  constructor(
    private image: ImageSpec,
    private overlayColor?: string,
    private backgroundColor?: string,
  ) {
    super();
    this.width = this.image.primary.bounds.width;
    this.height = this.image.primary.bounds.height;
    this.imageInfo = JSON.stringify(this.image);
  }

  protected render() {
    const imageNode = <Image image={this.image} fill overlayColor={this.overlayColor} />;

    if (this.backgroundColor) {
      return (
        <Layered>
          <Color hex={this.backgroundColor} />
          {imageNode}
        </Layered>
      );
    }
    return imageNode;
  }

  static material(image: ImageSpec, options?: StaticImageOptions) {
    const result = new StaticImage(image, options?.overlayColor, options?.backgroundColor);
    return result.get().material;
  }

  static texture(image: ImageSpec, options?: StaticImageOptions) {
    const result = new StaticImage(image, options?.overlayColor, options?.backgroundColor);
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
