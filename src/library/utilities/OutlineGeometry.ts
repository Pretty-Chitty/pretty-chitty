import { BufferGeometry, ExtrudeGeometry, Mesh, Shape } from "three";
import { CSG } from "three-csg-ts";

export function outlineGeometry(shape: Shape, height: number): BufferGeometry | ExtrudeGeometry {
  // const extrudeSettings = {
  //   depth: height, // Extrude by 2 units
  //   bevelEnabled: false, // Disable bevel for simplicity
  // };

  const g = new ExtrudeGeometry(shape, { depth: height * 20, bevelEnabled: false });
  g.scale(0.95, 0.95, 0.95);
  const g2 = new ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  g2.scale(1.05, 1.05, 1.45);
  const original = new Mesh(g);
  const scaled = new Mesh(g2);

  original.updateMatrix();
  scaled.updateMatrix();
  // scaled.scale(1.05, 1.05, 1.05);

  const subRes = CSG.subtract(scaled, original);

  subRes.geometry.translate(0, 0, -(subRes.geometry.boundingBox?.max.z ?? 0) / 2);
  // return scaled.geometry;
  return subRes.geometry;

  // const stroke = extrude({ thickness: 0.05, cap: "square", join: "none", miterLimit: 10 });

  // const m = stroke.build(vectors.map((v) => [v.x, v.y]));

  // const vertexCount = m.positions.length;
  // const topVertices = m.positions.map((p) => [p[0], p[1], height / 2]).flat();
  // const bottomVertices = m.positions.map((p) => [p[0], p[1], -height / 2]).flat();

  // const vertices = new Float32Array(topVertices.concat(bottomVertices));
  // const top: number[][] = [];
  // const bottom: number[][] = [];
  // const sides: number[][] = [];
  // const hasAddedTriangles = new Set<string>();

  // const addSide = (a: number, b: number) => {
  //   const key = `${a}_${b}`;
  //   if (!hasAddedTriangles.has(key)) {
  //     hasAddedTriangles.add(key);
  //     sides.push([a + vertexCount, b, a]);
  //     sides.push([a + vertexCount, b + vertexCount, b]);
  //   }
  // };

  // m.cells.forEach((triangle) => {
  //   const [a, b, c] = triangle;
  //   top.push([c, b, a]);
  //   bottom.push([a + vertexCount, b + vertexCount, c + vertexCount]); // add bottom triangle
  //   addSide(a, b);
  //   addSide(c, a);
  //   addSide(c, b);
  // });

  // // const cells = new Uint16Array(triangles.flat());
  // const geometry = new BufferGeometry();
  // geometry.setAttribute("position", new BufferAttribute(vertices, 3));
  // geometry.setIndex(new BufferAttribute(new Uint16Array([...top.flat(), ...bottom.flat(), ...sides.flat()]), 1));

  // geometry.addGroup(0, top.length * 3, 0);
  // geometry.addGroup(top.length * 3, bottom.length * 3, 1);
  // geometry.addGroup(top.length * 6, 3 * sides.length, 2);
  // geometry.computeVertexNormals();
  // // geometry.computeTangents();
}
