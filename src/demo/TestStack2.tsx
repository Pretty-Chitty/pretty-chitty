import React from "react";

import { Pad, Spacer, Layered, Color, Vertical, Text, Horizontal } from "../library/utilities/CanvasStack/ReactCanvas";
import { ParameterizedCanvas } from "../library/utilities/ParameterizedCanvas";

function Thingy({ num }: { num: number }) {
  return (
    <Text fill="#fff" fontSize={12}>
      #{num}
    </Text>
  );
}

export class TestStack2 extends ParameterizedCanvas {
  title = "default titl 12312312e";
  subTitle: string | null = null;
  width = 155;
  height = 200;

  render() {
    return (
      <Layered>
        <Color hex="#943" />
        <Vertical>
          <>
            <Color hex="#FFA" />
            <Text fill="#336" fontSize={10}>
              {this.title}: {this.subTitle ?? ""}
            </Text>
          </>
          <Spacer size={5} />
          <Color hex="#F09" size={10} />
          <Text
            align="right"
            fill="#fff"
            fontSize={12}
            before={
              <>
                <Color hex="#999" />
                <Pad amount={5} left={15}>
                  <Color hex="#0FF" />
                  <Horizontal>
                    <Thingy num={11} />
                    <Thingy num={12} />
                    <Thingy num={13} />
                  </Horizontal>
                </Pad>
              </>
            }
            after={<Color hex="#071" />}
          >
            HEY
          </Text>
        </Vertical>
      </Layered>
    );
  }
}
