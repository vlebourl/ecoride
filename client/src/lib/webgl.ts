let _result: boolean | undefined;

/**
 * Returns true when the browser can initialise a WebGL rendering context.
 * Result is computed once and cached — capability is stable for the page lifetime.
 */
export function isWebGLSupported(): boolean {
  if (_result !== undefined) return _result;
  try {
    const canvas = document.createElement("canvas");
    _result = !!(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    _result = false;
  }
  return _result;
}
