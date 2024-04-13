import React from "react";

import { Horizontal, Image, Text, Vertical } from "../library/utilities/CanvasStack/ReactCanvas";
import { ParameterizedCanvas } from "../library/utilities/ParameterizedCanvas";

import { metropolis } from "./assets/network_overload";

// in other modules
export * from "./TestStack";
export * from "./TestStack2";

// can be defined here?
export class TestStack3 extends ParameterizedCanvas {
  title = "default title";
  width = 200;
  height = 200;

  render() {
    return (
      <Horizontal>
        <Vertical>
          <Text fill="#336" font="17px sans-serif">
            {this.title}????
          </Text>
          <Image fill image={metropolis} />
        </Vertical>
        <Image fill image={metropolis} />
      </Horizontal>
    );
  }
}
