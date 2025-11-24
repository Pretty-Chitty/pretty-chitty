import React from "react";

import {
  Color,
  Horizontal,
  Image,
  Layered,
  MultiLineText,
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

          <Vertical>
            <Text size={10} fill="#336" font="17px sans-serif">
              Test that {this.things.length}
            </Text>
            <MultiLineText fontFamily="sans-serif" fontSize={17} lineHeight={0.9} icons={{ city: metropolis }}>
              {`Test that is **a** ABCDEO that


*is* **a** multi :city: :city2: test`}
            </MultiLineText>
          </Vertical>
        </Layered>
        <Image fill image={metropolis} />
      </Horizontal>
    );
  }
}
