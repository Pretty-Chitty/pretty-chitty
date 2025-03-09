import React from "react";

import { Pad, Vertical, Spacer, Layered, Color, Text, Image } from "../library/utilities/CanvasStack/ReactCanvas";
import { ParameterizedCanvas } from "../library/utilities/ParameterizedCanvas";
import { metropolis, serverroom } from "./assets/network_overload";

function Thingy({ num }: { num: number }) {
  return (
    <Text fill="#fff" font="12px sans-serif">
      #{num}
    </Text>
  );
}

export class TestStack extends ParameterizedCanvas {
  title = "default title";
  subTitle = "some subtitle";
  subTitle2 = 5;

  width = 300;
  height = 600;

  render() {
    const img = this.subTitle2 >= 5 ? serverroom : metropolis;

    return (
      <Layered>
        <Color val={img.borderColor} />
        <Pad amount={20}>
          <Vertical>
            <>
              <Color hex="#033" />

              <Image fill image={img} />
              <Vertical>
                <></>
                <Text size={50} fill="#fff" font="50px sans-serif">
                  {this.title}
                </Text>
                {this.subTitle && (
                  <Text size={25} fill="#aaa" font="20px sans-serif">
                    {this.subTitle} {this.subTitle2}
                  </Text>
                )}
                <></>
              </Vertical>
            </>

            <Spacer size={35} />
            <Color hex="#F09" size={10} />
            <Pad amount={10}>
              <Text
                align="center"
                fill="#000"
                font="12px sans-serif"
                before={
                  <>
                    <Pad right={10}>
                      <Color hex="#999" />
                      <Pad amount={35}>
                        <Color hex="#00F" />
                        <Thingy num={11} />
                      </Pad>
                    </Pad>
                  </>
                }
                after={
                  <Pad left={10}>
                    <Color hex="#071" />
                  </Pad>
                }
              >
                HEY
              </Text>
            </Pad>
          </Vertical>
        </Pad>
      </Layered>
    );
  }
}
