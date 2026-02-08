import {
  BufferGeometry,
  BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  Matrix4,
  Color,
} from "three";
import QuickLRU from "quick-lru";

// ── glTF JSON types (subset we care about) ──────────────────────────────

interface GltfJson {
  scene?: number;
  scenes?: Array<{ nodes?: number[] }>;
  nodes?: Array<{
    mesh?: number;
    children?: number[];
    name?: string;
    translation?: [number, number, number];
    rotation?: [number, number, number, number];
    scale?: [number, number, number];
    matrix?: number[];
  }>;
  meshes?: Array<{
    name?: string;
    primitives: Array<{
      attributes: Record<string, number>;
      indices?: number;
      material?: number;
    }>;
  }>;
  accessors?: Array<{
    bufferView?: number;
    byteOffset?: number;
    componentType: number;
    count: number;
    type: string;
  }>;
  bufferViews?: Array<{
    buffer: number;
    byteOffset?: number;
    byteLength: number;
    byteStride?: number;
  }>;
  materials?: Array<{
    name?: string;
    doubleSided?: boolean;
    pbrMetallicRoughness?: {
      baseColorFactor?: [number, number, number, number];
      metallicFactor?: number;
      roughnessFactor?: number;
    };
  }>;
}

// ── Constants ───────────────────────────────────────────────────────────

const COMPONENT_TYPES: Record<number, { ctor: new (buffer: ArrayBuffer, byteOffset: number, length: number) => ArrayLike<number>; bytes: number }> = {
  5120: { ctor: Int8Array, bytes: 1 },
  5121: { ctor: Uint8Array, bytes: 1 },
  5122: { ctor: Int16Array, bytes: 2 },
  5123: { ctor: Uint16Array, bytes: 2 },
  5125: { ctor: Uint32Array, bytes: 4 },
  5126: { ctor: Float32Array, bytes: 4 },
};

const TYPE_SIZES: Record<string, number> = {
  SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16,
};

// ── Module-level caches ─────────────────────────────────────────────────

const groupCache = new QuickLRU<string, Group>({ maxSize: 50 });

// ── Helpers ─────────────────────────────────────────────────────────────

function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

function decodeToArrayBuffer(dataUrl: string): ArrayBuffer {
  const commaIndex = dataUrl.indexOf(",");
  const base64 = commaIndex !== -1 ? dataUrl.slice(commaIndex + 1) : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// ── GLB container parser ────────────────────────────────────────────────

function parseGLBContainer(buffer: ArrayBuffer): { json: GltfJson; bin: ArrayBuffer } {
  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  if (magic !== 0x46546C67) throw new Error("Not a valid GLB file");
  const version = view.getUint32(4, true);
  if (version !== 2) throw new Error(`Unsupported glTF version: ${version}`);

  let offset = 12;
  let json: GltfJson | undefined;
  let bin: ArrayBuffer | undefined;

  while (offset < buffer.byteLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const chunkData = buffer.slice(offset + 8, offset + 8 + chunkLength);
    if (chunkType === 0x4E4F534A) {
      json = JSON.parse(new TextDecoder().decode(chunkData));
    } else if (chunkType === 0x004E4942) {
      bin = chunkData;
    }
    offset += 8 + chunkLength;
  }

  if (!json) throw new Error("GLB missing JSON chunk");
  return { json, bin: bin ?? new ArrayBuffer(0) };
}

// ── Accessor → TypedArray ───────────────────────────────────────────────

function readAccessor(json: GltfJson, bin: ArrayBuffer, idx: number): { array: ArrayLike<number>; itemSize: number } {
  const acc = json.accessors![idx];
  const bv = json.bufferViews![acc.bufferView ?? 0];
  const info = COMPONENT_TYPES[acc.componentType];
  if (!info) throw new Error(`Unsupported accessor componentType ${acc.componentType}`);

  const itemSize = TYPE_SIZES[acc.type];
  const byteOffset = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const totalElements = acc.count * itemSize;

  // Non-interleaved (or tightly packed): direct view
  if (!bv.byteStride || bv.byteStride === itemSize * info.bytes) {
    return { array: new info.ctor(bin, byteOffset, totalElements), itemSize };
  }

  // Interleaved: de-stride into a contiguous array
  const out = new Float32Array(totalElements);
  const stride = bv.byteStride;
  const srcView = new DataView(bin);
  for (let i = 0; i < acc.count; i++) {
    const base = byteOffset + i * stride;
    for (let c = 0; c < itemSize; c++) {
      out[i * itemSize + c] = srcView.getFloat32(base + c * info.bytes, true);
    }
  }
  return { array: out, itemSize };
}

// ── Build Three.js objects ──────────────────────────────────────────────

type GltfPrimitive = NonNullable<GltfJson["meshes"]>[0]["primitives"][0];

function buildGeometry(json: GltfJson, bin: ArrayBuffer, prim: GltfPrimitive): BufferGeometry {
  const geom = new BufferGeometry();

  const ATTR_MAP: Record<string, string> = {
    POSITION: "position",
    NORMAL: "normal",
    TEXCOORD_0: "uv",
    TEXCOORD_1: "uv2",
    COLOR_0: "color",
    TANGENT: "tangent",
  };

  for (const [gltfName, accIdx] of Object.entries(prim.attributes)) {
    const threeAttr = ATTR_MAP[gltfName];
    if (!threeAttr) continue;
    const { array, itemSize } = readAccessor(json, bin, accIdx as number);
    geom.setAttribute(threeAttr, new BufferAttribute(new Float32Array(array as ArrayLike<number>), itemSize));
  }

  if (prim.indices !== undefined) {
    const { array } = readAccessor(json, bin, prim.indices);
    geom.setIndex(new BufferAttribute(
      array instanceof Uint32Array ? array : new Uint32Array(array as ArrayLike<number>),
      1,
    ));
  }

  if (!geom.getAttribute("normal")) {
    geom.computeVertexNormals();
  }

  return geom;
}

function buildMaterial(json: GltfJson, matIdx: number | undefined): MeshStandardMaterial {
  const mat = new MeshStandardMaterial();
  if (matIdx === undefined || !json.materials?.[matIdx]) return mat;

  const def = json.materials[matIdx];
  const pbr = def.pbrMetallicRoughness;
  if (pbr) {
    if (pbr.baseColorFactor) {
      mat.color = new Color(pbr.baseColorFactor[0], pbr.baseColorFactor[1], pbr.baseColorFactor[2]);
      mat.opacity = pbr.baseColorFactor[3];
      if (mat.opacity < 1) mat.transparent = true;
    }
    if (pbr.metallicFactor !== undefined) mat.metalness = pbr.metallicFactor;
    if (pbr.roughnessFactor !== undefined) mat.roughness = pbr.roughnessFactor;
  }
  if (def.doubleSided) mat.side = 2; // DoubleSide

  return mat;
}

function buildNode(json: GltfJson, bin: ArrayBuffer, nodeIdx: number): Group | Mesh {
  const nodeDef = json.nodes![nodeIdx];
  const group = new Group();
  if (nodeDef.name) group.name = nodeDef.name;

  // Apply transform
  if (nodeDef.matrix) {
    const m = new Matrix4();
    m.fromArray(nodeDef.matrix);
    m.decompose(group.position, group.quaternion, group.scale);
  } else {
    if (nodeDef.translation) group.position.fromArray(nodeDef.translation);
    if (nodeDef.rotation) group.quaternion.set(nodeDef.rotation[0], nodeDef.rotation[1], nodeDef.rotation[2], nodeDef.rotation[3]);
    if (nodeDef.scale) group.scale.fromArray(nodeDef.scale);
  }

  // Attach mesh primitives
  if (nodeDef.mesh !== undefined && json.meshes) {
    const meshDef = json.meshes[nodeDef.mesh];
    for (const prim of meshDef.primitives) {
      const geom = buildGeometry(json, bin, prim);
      const mat = buildMaterial(json, prim.material);
      const mesh = new Mesh(geom, mat);
      if (meshDef.name) mesh.name = meshDef.name;
      group.add(mesh);
    }
  }

  // Recurse children
  if (nodeDef.children) {
    for (const childIdx of nodeDef.children) {
      group.add(buildNode(json, bin, childIdx));
    }
  }

  return group;
}

function buildScene(json: GltfJson, bin: ArrayBuffer): Group {
  const root = new Group();
  const sceneDef = json.scenes?.[json.scene ?? 0];
  if (sceneDef?.nodes) {
    for (const nodeIdx of sceneDef.nodes) {
      root.add(buildNode(json, bin, nodeIdx));
    }
  }
  return root;
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Synchronously load a GLB file (provided as a base64 data-URL from webpack
 * asset/inline) and return a cloned scene Group.
 *
 * Parses the GLB binary directly (no async GLTFLoader). The parsed scene is
 * memoized — subsequent calls return `.clone()`, giving each caller an
 * independent object hierarchy while sharing BufferGeometry and Material data.
 */
export function loadGLB(
  glbData: string,
  { scale = 1, castShadow = false, receiveShadow = false }: { scale?: number; castShadow?: boolean; receiveShadow?: boolean } = {},
): Group {
  const key = `${hashString(glbData)}|s:${scale}|cs:${castShadow ? 1 : 0}|rs:${receiveShadow ? 1 : 0}`;

  let cached = groupCache.get(key);
  if (!cached) {
    const buffer = decodeToArrayBuffer(glbData);
    const { json, bin } = parseGLBContainer(buffer);
    cached = buildScene(json, bin);
    cached.traverse((obj) => {
      if ((obj as Mesh).isMesh) {
        if (scale !== 1) (obj as Mesh).geometry.scale(scale, scale, scale);
        obj.castShadow = castShadow;
        obj.receiveShadow = receiveShadow;
      }
    });
    groupCache.set(key, cached);
  }

  return cached.clone();
}
