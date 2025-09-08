import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import QuickLRU from "quick-lru";

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

  /** Pre-extrude SVG simplification tolerance (in SVG units). 0 disables. */
  svgSimplifyTolerance?: number;
  /** Subdivision per curve before simplifying (baseline polyline density). */
  svgCurveDivisionsPreSimplify?: number;
}

/** --- NEW: module-level LRU cache (stores BufferGeometry) --- */
const geomCache = new QuickLRU<string, THREE.BufferGeometry>({ maxSize: 100 });

/** Stable stringify limited to our known option keys (order-insensitive). */
function stableOptionsKey(
  opts: Required<
    Pick<
      ExtrudeFromSVGOptions,
      | "depth"
      | "curveSegments"
      | "bevelEnabled"
      | "bevelThickness"
      | "bevelSize"
      | "bevelOffset"
      | "bevelSegments"
      | "scale"
      | "center"
      | "zUp"
      | "filledPathsOnly"
      | "svgSimplifyTolerance"
      | "svgCurveDivisionsPreSimplify"
    >
  >,
): string {
  const entries = Object.entries(opts).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return entries.map(([k, v]) => `${k}:${typeof v === "number" ? v : v ? 1 : 0}`).join("|");
}

/** Tiny non-crypto hash for cache keys (djb2). */
function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  // force uint32 and base36 to keep key short
  return (h >>> 0).toString(36);
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
    svgSimplifyTolerance = 0,
    svgCurveDivisionsPreSimplify = 24,
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

  const tagGroupsFrontBackSides_Z = (geometry: THREE.BufferGeometry, eps = 1e-9): void => {
    const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
    const index = geometry.getIndex();
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
          const zAvg = (za + zb + zc) / 3;
          matIndex = zAvg >= 0 ? 0 : 1; // 0 front, 1 back
        } else {
          matIndex = 2; // sides
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

  // --- SVG pre-simplification utilities (RDP) ---
  const rdp = (pts: THREE.Vector2[], eps: number): THREE.Vector2[] => {
    if (pts.length <= 2) return pts.slice();
    const dist = (p: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2) => {
      const abx = b.x - a.x,
        aby = b.y - a.y;
      const apx = p.x - a.x,
        apy = p.y - a.y;
      const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / (abx * abx + aby * aby || 1)));
      const qx = a.x + t * abx,
        qy = a.y + t * aby;
      return Math.hypot(p.x - qx, p.y - qy);
    };
    let maxD = -1,
      idx = -1;
    const a = pts[0],
      b = pts[pts.length - 1];
    for (let i = 1; i < pts.length - 1; i++) {
      const d = dist(pts[i], a, b);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > eps) {
      const left = rdp(pts.slice(0, idx + 1), eps);
      const right = rdp(pts.slice(idx), eps);
      return left.slice(0, -1).concat(right);
    } else {
      return [a, b];
    }
  };

  const pathIsClosed = (p: THREE.Path, tol = 1e-6): boolean => {
    const pts = p.getPoints(1);
    if (pts.length < 2) return false;
    const first = pts[0],
      last = pts[pts.length - 1];
    return Math.hypot(first.x - last.x, first.y - last.y) <= tol;
  };

  const simplifyShapePath = (sp: THREE.ShapePath, eps: number, divisionsPerCurve: number): THREE.ShapePath => {
    const out = new THREE.ShapePath();
    (out as any).color = (sp as any).color;
    (out as any).userData = (sp as any).userData;

    for (const sub of sp.subPaths) {
      const divisions = Math.max(1, divisionsPerCurve);
      const dense = sub.getPoints(divisions * Math.max(1, sub.curves.length));
      if (dense.length < 2) continue;

      const closed = pathIsClosed(sub);
      let pts = dense;

      if (closed) {
        const first = dense[0],
          last = dense[dense.length - 1];
        if (first.distanceToSquared(last) > 1e-12) pts = dense.concat([dense[0].clone()]);
      }
      let simp = rdp(pts, eps);

      if (closed) {
        if (simp.length > 1 && simp[0].distanceToSquared(simp[simp.length - 1]) < 1e-12) {
          simp = simp.slice(0, -1);
        }
        if (simp.length < 3) continue;
      } else if (simp.length < 2) {
        continue;
      }

      const np = new THREE.Path();
      np.moveTo(simp[0].x, simp[0].y);
      for (let i = 1; i < simp.length; i++) np.lineTo(simp[i].x, simp[i].y);
      np.autoClose = closed;
      out.subPaths.push(np);
    }
    return out;
  };

  // --- decode (so equivalent data-URLs normalize to same cache key) ---
  const decodedSvg = decodeSvgDataUrl(svgString);

  // --- NEW: build a cache key from decoded SVG + normalized options ---
  const keyOptions = stableOptionsKey({
    depth,
    curveSegments,
    bevelEnabled,
    bevelThickness,
    bevelSize,
    bevelOffset,
    bevelSegments,
    scale,
    center,
    zUp,
    filledPathsOnly,
    svgSimplifyTolerance,
    svgCurveDivisionsPreSimplify,
  });
  const cacheKey = `v1|${hashString(decodedSvg)}|${keyOptions}`;

  // --- NEW: fast path from cache (return a clone to keep callers isolated) ---
  const cached = geomCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // --- parse + (optional) pre-simplify SVG paths ---
  const loader = new SVGLoader();
  const data = loader.parse(decodedSvg);

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
      const pathForShapes =
        svgSimplifyTolerance > 0 ? simplifyShapePath(path, svgSimplifyTolerance, svgCurveDivisionsPreSimplify) : path;

      const shapes = SVGLoader.createShapes(pathForShapes);

      for (const shape of shapes) {
        const g = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        g.scale(scale, scale, scale);
        g.rotateX(Math.PI); // fix SVG Y-down; local Z is thickness axis
        parts.push(g);
      }
    }
  }

  if (parts.length === 0) {
    throw new Error("No shapes to extrude. Ensure your SVG has filled paths (or set filledPathsOnly=false).");
  }

  const geometry = mergeGeometries(parts, true);

  if (center) {
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox!;
    geometry.translate(-(bb.min.x + bb.max.x) / 2, -(bb.min.y + bb.max.y) / 2, -(bb.min.z + bb.max.z) / 2);
  }

  geometry.computeVertexNormals();
  tagGroupsFrontBackSides_Z(geometry);
  applyPlanarUV_XY(geometry);
  if (zUp) geometry.rotateX(Math.PI / 2);

  console.log("Triangle count:", geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3);

  // --- NEW: store in cache (store a clone to protect cache entry) ---
  geomCache.set(cacheKey, geometry);

  return geometry;
}
