import * as THREE from 'three';

/**
 * Spec 07 § 6: Math Cache Contract (Zero-Allocation Render Loop).
 * Reusable mutable singletons for Vector3, Matrix4, Quaternion and Color.
 * Prohibits new allocations in useFrame loops to prevent Garbage Collection stutter (RNF-04).
 */
export const Caches = {
  vec3A: new THREE.Vector3(),
  vec3B: new THREE.Vector3(),
  mat4A: new THREE.Matrix4(),
  mat4B: new THREE.Matrix4(),
  quaternionA: new THREE.Quaternion(),
  colorA: new THREE.Color(),
  colorB: new THREE.Color(),
};

