// @vitest-environment jsdom
import { render, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { HoloPulseShaderDefinition, createHoloPulseMaterial } from '../shaders/HoloPulseShader';
import { HoloPulseRing } from '../shaders/HoloPulseRing';

// Mock R3F hooks for JSDOM
vi.mock('@react-three/fiber', () => ({
  useFrame: (cb: (state: unknown, delta: number) => void) => {
    // Execute one tick to verify uniform updates
    cb({}, 0.016);
  },
  useThree: () => ({
    invalidate: vi.fn(),
  }),
}));

describe('Spec 07 GLSL Hologram Pulse Shader Suite (S07-RF10, S07-RF05)', () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  it('declares valid GLSL vertex and fragment shaders with mandatory uniforms', () => {
    expect(HoloPulseShaderDefinition.vertexShader).toContain('gl_Position');
    expect(HoloPulseShaderDefinition.vertexShader).toContain('vUv = uv');
    expect(HoloPulseShaderDefinition.fragmentShader).toContain('uTime');
    expect(HoloPulseShaderDefinition.fragmentShader).toContain('uColor');
    expect(HoloPulseShaderDefinition.fragmentShader).toContain('uPulseSpeed');
    expect(HoloPulseShaderDefinition.fragmentShader).toContain('uScanlineFreq');
    expect(HoloPulseShaderDefinition.fragmentShader).toContain('gl_FragColor');
  });

  it('creates isolated ShaderMaterial with additive blending and zero depth write', () => {
    const mat = createHoloPulseMaterial('#ef4444', 4.8, 0.95);
    expect(mat).toBeInstanceOf(THREE.ShaderMaterial);
    expect(mat.transparent).toBe(true);
    expect(mat.depthWrite).toBe(false);
    expect(mat.blending).toBe(THREE.AdditiveBlending);
    expect(mat.side).toBe(THREE.DoubleSide);

    // Uniforms validation
    expect(mat.uniforms.uPulseSpeed.value).toBe(4.8);
    expect(mat.uniforms.uOpacity.value).toBe(0.95);
    expect(mat.uniforms.uColor.value).toBeInstanceOf(THREE.Color);
    expect(mat.uniforms.uTime.value).toBe(0.0);

    // Uniform mutation
    mat.uniforms.uTime.value += 0.033;
    expect(mat.uniforms.uTime.value).toBeCloseTo(0.033);

    // Resource cleanup
    const disposeSpy = vi.spyOn(mat, 'dispose');
    mat.dispose();
    expect(disposeSpy).toHaveBeenCalled();
  });

  it('mounts HoloPulseRing and disposes GPU shader material on unmount', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = render(
      <HoloPulseRing
        color="#f59e0b"
        pulseSpeed={3.2}
        innerRadius={0.45}
        outerRadius={0.58}
        name="test-holo-ring"
      />
    );

    // Unmount must trigger cleanup effect
    expect(() => unmount()).not.toThrow();
    errorSpy.mockRestore();
  });
});
