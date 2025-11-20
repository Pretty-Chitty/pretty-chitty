import React, { ReactNode } from "react";
import { Color, Horizontal, Layered, Pad, RoundedRect, Vertical } from "../library/utilities/CanvasStack/ReactCanvas";
import { ParameterizedCanvas } from "../library";

function Shadow({ start, total }: { start: number; total: number }) {
  if (start === total) {
    return null;
  }
  const hex = `#${Math.ceil((1 - start / total) * 200)
    .toString(16)
    .padStart(2, "0")
    .repeat(3)}`;
  return (
    <Layered>
      <Color hex={hex} />
      <Pad amount={1}>
        <Shadow start={start + 1} total={total} />
      </Pad>
    </Layered>
  );
}

export class DiceFace extends ParameterizedCanvas {
  value: number = 1;
  backgroundColor: string = "#ffffff";
  foregroundColor: string = "#000000";
  shadow = false;
  width = 100;
  height = 100;
  pipPadding = 3;

  pips() {
    const pips: boolean[][] = [
      [false, false, false],
      [false, false, false],
      [false, false, false],
    ];
    switch (this.value) {
      case 1: {
        pips[1][1] = true;
        break;
      }
      case 2: {
        pips[0][2] = true;
        pips[2][0] = true;
        break;
      }
      case 3: {
        pips[0][0] = true;
        pips[1][1] = true;
        pips[2][2] = true;
        break;
      }
      case 4: {
        pips[0][0] = true;
        pips[2][0] = true;
        pips[0][2] = true;
        pips[2][2] = true;
        break;
      }
      case 5: {
        pips[1][1] = true;
        pips[0][0] = true;
        pips[2][0] = true;
        pips[0][2] = true;
        pips[2][2] = true;
        break;
      }
      case 6: {
        pips[0][0] = true;
        pips[0][2] = true;
        pips[1][0] = true;
        pips[1][2] = true;
        pips[2][0] = true;
        pips[2][2] = true;
        break;
      }
    }
    return pips;
  }

  render() {
    const pips = this.pips();
    return (
      <Layered>
        {this.shadow ? <Shadow start={1} total={this.shadow ? 6 : 1} /> : <Color hex={this.backgroundColor} />}

        <Pad amount={this.pipPadding}>
          <Vertical>
            {pips.map((row, i) => (
              <Horizontal key={i}>
                {row.map((isPip, i) => (
                  <Pad amount={this.pipPadding} key={i}>
                    {isPip && (
                      <RoundedRect radius={this.width}>
                        <Color hex={this.shadow ? "#ffffff" : this.foregroundColor} />
                      </RoundedRect>
                    )}
                  </Pad>
                ))}
              </Horizontal>
            ))}
          </Vertical>
        </Pad>
      </Layered>
    );
  }
}
