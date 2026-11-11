import * as THREE from 'three';

/**
 * Spec 07 § 10 & RF-10: Custom GLSL Hologram Shader Material.
 * Provides GPU-accelerated pulsing aura with procedural scanlines and smooth radial falloff.
 */
export const HoloPulseShaderDefinition = {
  uniforms: {
    uTime: { value: 0.0 },
    uColor: { value: new THREE.Color('#f59e0b') },
    uPulseSpeed: { value: 3.5 },
    uScanlineFreq: { value: 24.0 },
    uOpacity: { value: 0.85 },
  },
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vNormal;

    void main() {
      vUv = uv;
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform vec3 uColor;
    uniform float uPulseSpeed;
    uniform float uScanlineFreq;
    uniform float uOpacity;

    varying vec2 vUv;
    varying vec3 vNormal;

    void main() {
      // Radial distance from ring center (UV 0.5, 0.5)
      float dist = length(vUv - vec2(0.5));
      float ring = smoothstep(0.50, 0.44, dist) * smoothstep(0.28, 0.36, dist);

      // Sinusoidal pulsing brightness
      float pulse = 0.70 + 0.30 * sin(uTime * uPulseSpeed);

      // Cybernetic scanline bands
      float scanline = 0.85 + 0.15 * sin(vUv.y * uScanlineFreq + uTime * 4.0);

      vec3 emission = uColor * pulse * scanline * 1.35;
      float alpha = ring * uOpacity * pulse;

      gl_FragColor = vec4(emission, alpha);
    }
  `,
};

/**
 * Creates a configured ShaderMaterial instance with isolated uniforms to prevent GPU state leak.
 */
export function createHoloPulseMaterial(color: string, pulseSpeed = 3.5, opacity = 0.85): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0.0 },
      uColor: { value: new THREE.Color(color) },
      uPulseSpeed: { value: pulseSpeed },
      uScanlineFreq: { value: 24.0 },
      uOpacity: { value: opacity },
    },
    vertexShader: HoloPulseShaderDefinition.vertexShader,
    fragmentShader: HoloPulseShaderDefinition.fragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

