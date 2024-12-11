declare module "extrude-polyline" {
  type Point2 = [a: number, b: number];
  type Triangle = [a: number, b: number, c: number];

  class Extrusion {
    build(points: Point2[]): { positions: Point2[]; cells: Triangle[] };
  }

  export default function extrude({ thickness, cap, join, miterLimit }): Extrusion;
}
