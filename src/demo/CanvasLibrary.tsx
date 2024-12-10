import React from "react";

import {
  Color,
  Horizontal,
  Image,
  Layered,
  Text,
  Vertical,
} from "../library/utilities/CanvasStack/ReactCanvas";
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
    if (this.title.length < 5) {
      throw "wtf";
    }

    return (
      <Horizontal>
        <Layered>
          <Text fill="#336" font="17px sans-serif">
            {this.title}????
          </Text>
          <Color hex="#ff000033" />
        </Layered>
        <Image fill image={metropolis} />
      </Horizontal>
    );
  }
}
