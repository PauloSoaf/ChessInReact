/**
 * Spec 07: WebGL Feature Detection and Hardware Capabilities (Spec 07 § 10.2).
 */

/**
 * Checks if WebGL is available in the current environment (Spec 07 § 10.2).
 */
export function isWebGLAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') {
    if ((window as unknown as { __FORCE_NO_WEBGL__?: boolean }).__FORCE_NO_WEBGL__) {
      return false;
    }
    return true;
  }
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

