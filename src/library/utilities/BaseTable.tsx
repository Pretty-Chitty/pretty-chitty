import React from "react";
import { Mesh, MeshPhongMaterial, PlaneGeometry, RepeatWrapping } from "three";
import { Chit } from "../game/Chit";
import { ChitRenderSpec } from "../rendering/ChitRenderSpec";
import { ParameterizedCanvas } from "./ParameterizedCanvas";
import { Color, Horizontal, Vertical } from "./CanvasStack/ReactCanvas";
import { CameraSpec } from "../rendering/CameraSpec";
import { LightSpec } from "../rendering/LightSpec";

class Checkerboard extends ParameterizedCanvas {
  protected render() {
    return (
      <Vertical>
        <Horizontal>
          <Color hex="#EEE" />
          <Color hex="#666" />
        </Horizontal>
        <Horizontal>
          <Color hex="#666" />
          <Color hex="#EEE" />
        </Horizontal>
      </Vertical>
    );
  }
}

export class BaseTable extends Chit {
  public target?: Chit;
  public parentTarget?: Chit;

  public override render(spec: ChitRenderSpec): void {
    const texture = new Checkerboard().get().texture;
    texture.repeat.x = 100;
    texture.repeat.y = 100;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;

    spec.ornament = new Mesh(
      new PlaneGeometry(100, 100),
      new MeshPhongMaterial({
        map: texture,
      }),
    );
    spec.ornament.position.z = -0.02;

    spec.camera = new CameraSpec();
    spec.camera.padding = 0.1;
    spec.camera.targetFov = 45;

    spec.lightSpec = LightSpec.realistic();
    // spec.lightSpec.ambientIntensity = 0;
    // spec.lightSpec.lights[0].intensity = 0.1;
    // spec.lightSpec.lights[1].intensity = 0.1;
    // spec.camera.verticalRadiansRotation = Math.PI * 1.65;
    // spec.lightSpec.lights[0].color = 0xff7799;
  }
}
