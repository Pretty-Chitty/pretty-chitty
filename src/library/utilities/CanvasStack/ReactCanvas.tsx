import * as Colors from "color";
import React, { ReactNode, ReactElement } from "react";
import {
  CallbackCanvasOperation,
  CanvasOperation,
  ColorCanvasOperation,
  HorizontalStackCanvasOperation,
  ImageCanvasOperation,
  ImageSpec,
  LayeredCanvasOperation,
  OutletCanvasOperation,
  PadCanvasOperation,
  PlayerCanvasOperation,
  RenderCallback,
  RoundedRectCanvasOperation,
  StackItem,
  TextCanvasOperation,
  VerticalStackCanvasOperation,
} from "./CanvasOperations";
import { PlayerChit } from "../../game/PlayerChit";

export interface DefaultProps {
  size?: number;
}

/** @internal */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function WrappedCanvasOperation({ operation }: { operation: CanvasOperation }): ReactNode {
  return <></>;
}

/** @internal */
export function unwrapCanvasNode(node: ReactNode): CanvasOperation {
  if (Array.isArray(node)) {
    return new LayeredCanvasOperation(node.map(unwrapCanvasNode));
  }

  const reactElement = node as ReactElement;
  if (reactElement) {
    if (reactElement.type === WrappedCanvasOperation) {
      return reactElement.props.operation;
    }

    if (typeof reactElement.type === "function") {
      // eslint-disable-next-line no-empty-pattern
      const Element = reactElement.type as ({}) => ReactNode;
      if (Element) {
        const results = Element(reactElement.props);
        return unwrapCanvasNode(results);
      }
    } else if (typeof reactElement.type === "symbol") {
      return new LayeredCanvasOperation([].concat(reactElement.props.children ?? []).map(unwrapCanvasNode));
    }
  }
  return new LayeredCanvasOperation([]);
}
function unwrapStackItem(node: ReactNode): StackItem {
  const reactElement = node as ReactElement;
  if (reactElement) {
    const size = reactElement.props?.size;
    return { size, layer: unwrapCanvasNode(reactElement) };
  }
  return { size: 0 };
}

/**
 * Renders all children literally on top of each other.
 * @param args
 * @returns
 */
export function Layered({ children }: { children: ReactNode | ReactNode[] } & DefaultProps): ReactNode {
  const layers = Array.isArray(children) ? children : [children];
  return <WrappedCanvasOperation operation={new LayeredCanvasOperation(layers.map(unwrapCanvasNode))} />;
}

/**
 * A spacer is useful for Horizontal or Vertical stacks and when you want gaps in rendering
 * @param args
 * @returns
 */
// eslint-disable-next-line no-empty-pattern
export function Spacer({}: DefaultProps): ReactNode {
  return <></>;
}

/**
 * Creates a named outlet for a region on the canvas
 * @param args
 * @returns
 */
export function Outlet({ name, children }: { name: string; children: ReactNode } & DefaultProps): ReactNode {
  return <WrappedCanvasOperation operation={new OutletCanvasOperation(name, unwrapCanvasNode(children))} />;
}

/**
 * Pads the render context, either by "amount" or by whatever top/left/right/bottom amount you set
 * @param args
 * @returns
 */
export function Pad({
  amount,
  left,
  top,
  bottom,
  right,
  children,
}: {
  amount?: number;
  left?: number;
  top?: number;
  bottom?: number;
  right?: number;
  children: ReactNode;
} & DefaultProps): ReactNode {
  return (
    <WrappedCanvasOperation
      operation={
        new PadCanvasOperation(
          {
            top: top ?? amount,
            left: left ?? amount,
            right: right ?? amount,
            bottom: bottom ?? amount,
          },
          unwrapCanvasNode(children),
        )
      }
    />
  );
}

/**
 * Fills the render context with a solid color
 * @param args
 * @returns
 */
export function Color({ hex, val }: { hex?: string; val?: number } & DefaultProps): ReactNode {
  return <WrappedCanvasOperation operation={new ColorCanvasOperation(hex ? hex : Colors.default(val).hex())} />;
}

/**
 * Creates a vertical stack of elements.  Any elements with defined sizes will be that tall.
 * The remaining elements will fill the remaining space equally
 * @param args
 * @returns
 */
export function Vertical({ children }: { children: ReactNode[] | ReactNode } & DefaultProps): ReactNode {
  return (
    <WrappedCanvasOperation
      operation={
        new VerticalStackCanvasOperation((Array.isArray(children) ? children : [children]).flat().map(unwrapStackItem))
      }
    />
  );
}

/**
 * Creates a horizontal stack of elements.  Any elements with defined sizes will be that wide.
 * The remaining elements will fill the remaining space equally
 * @param args
 * @returns
 */
export function Horizontal({ children }: { children: ReactNode[] | ReactNode } & DefaultProps): ReactNode {
  return (
    <WrappedCanvasOperation
      operation={
        new HorizontalStackCanvasOperation(
          (Array.isArray(children) ? children : [children]).flat().map(unwrapStackItem),
        )
      }
    />
  );
}

/**
 * Renders an image from a spritemap.  Can either fill the allocated area or fit within it.
 * @param args
 * @returns
 */
export function Image({
  image,
  fill,
  overlayColor,
}: { image: ImageSpec; fill?: boolean; overlayColor?: string } & DefaultProps): ReactNode {
  return <WrappedCanvasOperation operation={new ImageCanvasOperation(image, { fill, overlayColor })} />;
}

/**
 * Renders a player's image and color
 * @param args
 * @returns
 */
export function Player({ player }: { player: PlayerChit }) {
  return <WrappedCanvasOperation operation={new PlayerCanvasOperation(player)} />;
}

/**
 * Renders text in an area.  The body of this tag should be the text you want rendered.
 * @param args
 * @returns
 */
export function Text({
  children = "",
  align = "center",
  fill,
  stroke,
  font,
  offsetX,
  offsetY,
  shadowBlur,
  shadowColor,
  before,
  after,
}: {
  children?: string | any[] | any;
  align?: "center" | "left" | "right";
  fill?: string;
  stroke?: string;
  font?: string;
  shadowBlur?: number;
  shadowColor?: string;
  offsetX?: number;
  offsetY?: number;
  before?: ReactNode;
  after?: ReactNode;
} & DefaultProps): ReactNode {
  return (
    <WrappedCanvasOperation
      operation={
        new TextCanvasOperation(Array.isArray(children) ? children.join("") : String(children), {
          align,
          before: before ? unwrapCanvasNode(before) : undefined,
          after: after ? unwrapCanvasNode(after) : undefined,
          offsetX,
          offsetY,
          contextOptions: { fillStyle: fill, strokeStyle: stroke, font, shadowBlur, shadowColor },
        })
      }
    />
  );
}

/**
 * Perform your own canvas rendering operations
 * @param args
 * @returns
 */
export function Raw({ cb }: { cb: RenderCallback } & DefaultProps): ReactNode {
  return <WrappedCanvasOperation operation={new CallbackCanvasOperation(cb)} />;
}

/**
 * Renders children into a rounded rectangle mask.
 * @param args
 * @returns
 */
export function RoundedRect({
  radius,
  children,
}: {
  radius: number;
  children: ReactNode | ReactNode[];
} & DefaultProps): ReactNode {
  const childOps = Array.isArray(children) ? children.map(unwrapCanvasNode) : [unwrapCanvasNode(children)];
  return <WrappedCanvasOperation operation={new RoundedRectCanvasOperation(childOps, radius)} />;
}
