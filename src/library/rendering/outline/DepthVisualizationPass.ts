import { ShaderMaterial, UniformsUtils, WebGLRenderer, WebGLRenderTarget, IUniform } from "three";
import { Pass } from "./types";
import { FullScreenQuad } from "./FullScreenQuad";

const DepthVisualizationShader = {
  uniforms: {
    tDepth: { value: null as any },
    cameraNear: { value: 0.1 },
    cameraFar: { value: 1000 },
  } as Record<string, IUniform>,

  vertexShader: [
    "varying vec2 vUv;",
    "void main() {",
    "  vUv = uv;",
    "  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",
    "}",
  ].join("\n"),

  fragmentShader: [
    "uniform sampler2D tDepth;",
    "uniform float cameraNear;",
    "uniform float cameraFar;",
    "varying vec2 vUv;",
    "",
    "void main() {",
    "  // Read raw depth value",
    "  float rawDepth = texture2D( tDepth, vUv ).r;",
    "  ",
    "  // If no depth data (far plane)",
    "  if ( rawDepth >= 0.9999 ) {",
    "    gl_FragColor = vec4( 0.1, 0.1, 0.1, 1.0 ); // Dark gray for background",
    "    return;",
    "  }",
    "  ",
    "  // Convert from non-linear depth buffer to linear depth",
    "  float z = rawDepth * 2.0 - 1.0; // Convert to NDC",
    "  float linearDepth = ( 2.0 * cameraNear * cameraFar ) / ( cameraFar + cameraNear - z * ( cameraFar - cameraNear ) );",
    "  ",
    "  // Normalize linear depth to [0,1] range",
    "  float normalizedDepth = ( linearDepth - cameraNear ) / ( cameraFar - cameraNear );",
    "  normalizedDepth = clamp( normalizedDepth, 0.0, 1.0 );",
    "  ",
    "  // Create a nice grayscale visualization",
    "  // Apply gamma curve to enhance contrast in mid-range",
    "  float visualDepth = pow( normalizedDepth, 0.5 );",
    "  ",
    "  // Invert so near = bright, far = dark",
    "  visualDepth = 1.0 - visualDepth;",
    "  ",
    "  gl_FragColor = vec4( vec3( visualDepth ), 1.0 );",
    "}",
  ].join("\n"),
} as const;

export class DepthVisualizationPass extends Pass {
  material: ShaderMaterial;
  fsQuad: FullScreenQuad;
  uniforms: Record<string, IUniform>;

  constructor() {
    super();

    this.uniforms = UniformsUtils.clone(DepthVisualizationShader.uniforms);
    this.material = new ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: DepthVisualizationShader.vertexShader,
      fragmentShader: DepthVisualizationShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });

    this.fsQuad = new FullScreenQuad(this.material);
    this.needsSwap = true;
  }

  render(
    renderer: WebGLRenderer,
    writeBuffer: WebGLRenderTarget,
    readBuffer: WebGLRenderTarget,
    _maskActive: boolean,
  ): void {
    // Set the depth texture from the read buffer
    this.uniforms["tDepth"].value = readBuffer.depthTexture;

    // Debug: Check if depth texture exists
    if (!readBuffer.depthTexture) {
      console.warn("DepthVisualizationPass: No depth texture found in readBuffer");
    } else {
      console.log(
        "DepthVisualizationPass: Depth texture format:",
        readBuffer.depthTexture.format,
        "type:",
        readBuffer.depthTexture.type,
      );
    }

    // Set camera near/far from the camera used in rendering
    this.uniforms["cameraNear"].value = this.camera.near;
    this.uniforms["cameraFar"].value = this.camera.far;

    console.log("DepthVisualizationPass: Camera near/far:", this.camera.near, this.camera.far);

    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
    } else {
      renderer.setRenderTarget(writeBuffer);
    }

    this.fsQuad.render(renderer);
  }

  dispose(): void {
    this.material.dispose();
    this.fsQuad.dispose();
  }
}
