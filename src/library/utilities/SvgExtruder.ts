// Install: npm i three
import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export interface ExtrudeFromSVGOptions {
  depth?: number;
  curveSegments?: number;
  bevelEnabled?: boolean;
  bevelThickness?: number;
  bevelSize?: number;
  bevelOffset?: number;
  bevelSegments?: number;
  scale?: number;
  center?: boolean;
  zUp?: boolean;
  filledPathsOnly?: boolean;
}

export function extrudeSVGToGeometry(
  svgString: string,
  {
    depth = 2,
    curveSegments = 24,
    bevelEnabled = false,
    bevelThickness = 0.2,
    bevelSize = 0.1,
    bevelOffset = 0,
    bevelSegments = 2,
    scale = 0.01,
    center = true,
    zUp = false,
    filledPathsOnly = true,
  }: ExtrudeFromSVGOptions = {},
): THREE.BufferGeometry {
  // --- helpers ---
  const decodeSvgDataUrl = (input: string): string => {
    if (!input.startsWith("data:")) return input;
    const firstComma = input.indexOf(",");
    if (firstComma === -1) throw new Error("Invalid data URL");
    const meta = input.slice(5, firstComma);
    const data = input.slice(firstComma + 1);
    const isBase64 = /;base64/i.test(meta);
    if (isBase64) {
      try {
        return new TextDecoder().decode(Uint8Array.from(atob(data), (c) => c.charCodeAt(0)));
      } catch {
        return Buffer.from(data, "base64").toString("utf-8");
      }
    }
    return decodeURIComponent(data);
  };

  const applyPlanarUV_XY = (geometry: THREE.BufferGeometry): void => {
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox!;
    const sx = bb.max.x - bb.min.x;
    const sy = bb.max.y - bb.min.y;
    const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        y = pos.getY(i);
      uv[2 * i + 0] = sx > 1e-9 ? (x - bb.min.x) / sx : 0;
      uv[2 * i + 1] = sy > 1e-9 ? (y - bb.min.y) / sy : 0;
    }
    geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geometry.attributes.uv.needsUpdate = true;
  };

  // Tag groups using the KNOWN extrude axis: local Z
  // Do this BEFORE any "zUp" rotation so Z really is the thickness axis.
  const tagGroupsFrontBackSides_Z = (geometry: THREE.BufferGeometry, eps = 1e-9): void => {
    const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
    const index = geometry.getIndex(); // may be null
    geometry.clearGroups();

    const readZ = (vi: number) => pos.getZ(vi);

    if (index) {
      for (let i = 0; i < index.count; i += 3) {
        const a = index.getX(i),
          b = index.getX(i + 1),
          c = index.getX(i + 2);
        const za = readZ(a),
          zb = readZ(b),
          zc = readZ(c);
        const zMin = Math.min(za, zb, zc);
        const zMax = Math.max(za, zb, zc);

        let matIndex: number;
        if (Math.abs(zMax - zMin) <= eps) {
          // cap triangle → decide front/back by sign of Z (front at larger Z)
          const zAvg = (za + zb + zc) / 3;
          matIndex = zAvg >= 0 ? 0 : 1; // 0 = front cap (z ≈ +depth), 1 = back cap (z ≈ 0)
        } else {
          matIndex = 2; // side wall
        }
        geometry.addGroup(i, 3, matIndex);
      }
    } else {
      for (let i = 0; i < pos.count; i += 3) {
        const za = readZ(i),
          zb = readZ(i + 1),
          zc = readZ(i + 2);
        const zMin = Math.min(za, zb, zc);
        const zMax = Math.max(za, zb, zc);

        let matIndex: number;
        if (Math.abs(zMax - zMin) <= eps) {
          const zAvg = (za + zb + zc) / 3;
          matIndex = zAvg >= 0 ? 0 : 1;
        } else {
          matIndex = 2;
        }
        geometry.addGroup(i, 3, matIndex);
      }
    }
    (geometry as any).groupsNeedUpdate = true;
  };

  // --- build ---
  const loader = new SVGLoader();
  const data = loader.parse(decodeSvgDataUrl(svgString));

  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth,
    bevelEnabled,
    bevelThickness,
    bevelSize,
    bevelOffset,
    bevelSegments,
    curveSegments,
  };

  const parts: THREE.BufferGeometry[] = [];

  for (const path of data.paths) {
    const style = path.userData?.style ?? {};
    const hasFill = style.fill !== undefined && style.fill !== null && style.fill !== "none";
    if (!filledPathsOnly || hasFill) {
      const shapes = SVGLoader.createShapes(path);
      for (const shape of shapes) {
        const g = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        // Keep scales positive; fix SVG Y-down by rotating π around X.
        // In this local space, Z is the thickness axis (0..depth).
        g.scale(scale, scale, scale);
        g.rotateX(Math.PI);
        parts.push(g);
      }
    }
  }

  if (parts.length === 0) {
    throw new Error("No shapes to extrude. Ensure your SVG has filled paths (or set filledPathsOnly=false).");
  }

  const geometry = mergeGeometries(parts, true);

  // Centering doesn't affect group classification
  if (center) {
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox!;
    geometry.translate(-(bb.min.x + bb.max.x) / 2, -(bb.min.y + bb.max.y) / 2, -(bb.min.z + bb.max.z) / 2);
  }

  // Compute normals BEFORE tagging (not required, but nice to have)
  geometry.computeVertexNormals();

  // Tag groups while Z is still the thickness axis
  tagGroupsFrontBackSides_Z(geometry);

  // UVs for caps (planar XY). Do after centering/tagging—order doesn’t matter here.
  applyPlanarUV_XY(geometry);

  // If desired, rotate to Z-up for your scene *after* grouping; groups remain valid.
  if (zUp) {
    geometry.rotateX(Math.PI / 2);
  }

  return geometry;
}
