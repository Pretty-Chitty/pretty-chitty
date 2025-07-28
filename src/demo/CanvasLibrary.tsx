import React from "react";

import { Color, Horizontal, Image, Layered, Text, Vertical } from "../library/utilities/CanvasStack/ReactCanvas";
import { ParameterizedCanvas } from "../library/utilities/ParameterizedCanvas";

import { metropolis } from "./assets/network_overload";
import { walk } from "./assets/icons";

// in other modules
export * from "./TestStack";
export * from "./TestStack2";

// can be defined here?
export class TestStack3 extends ParameterizedCanvas {
  title = "default title";
  width = 200;
  height = 200;

  things: string[] = ["one", "two", "three"];

  render() {
    if (this.title.length < 5) {
      throw "wtf";
    }

    return (
      <Horizontal>
        <Layered>
          <Color hex="#ff000033" />
          {/* <Image image={walk} /> */}
          <Text fill="#336" font="17px sans-serif">
            {this.things.length} {this.things.map((t) => t.toUpperCase()).join(" --- ")}
          </Text>
        </Layered>
        <Image fill image={metropolis} />
      </Horizontal>
    );
  }
}
