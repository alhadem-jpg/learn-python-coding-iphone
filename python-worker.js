// Learn Python Coding - Python runtime in a module Web Worker.
// Pyodide 314 requires an ES module worker, not importScripts().
const CDN = 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/';
let runtimePromise = null;

async function getPython() {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const { loadPyodide } = await import(CDN + 'pyodide.mjs');
      return await loadPyodide({ indexURL: CDN });
    })().catch(error => { runtimePromise = null; throw error; });
  }
  return await runtimePromise;
}

self.onmessage = async ({ data }) => {
  const { code, stdin } = data;
  try {
    if (!runtimePromise) self.postMessage({ kind: 'loading' });
    const py = await getPython();
    self.postMessage({ kind: 'executing' });

    const output = [];
    py.setStdout({ batched: text => output.push(text) });
    py.setStderr({ batched: text => output.push(text) });
    const inputs = String(stdin || '').split(/\r?\n/);
    py.setStdin({ stdin: () => inputs.length ? inputs.shift() : null });

    try {
      const value = await py.runPythonAsync(code);
      if (value !== undefined && value !== null && String(value) !== 'None') {
        output.push(String(value));
      }
      if (value && typeof value.destroy === 'function') value.destroy();
      self.postMessage({ kind: 'result', output: output.join('\n') || '(no output)', error: false });
    } catch (error) {
      self.postMessage({ kind: 'result', output: output.concat(String(error)).join('\n'), error: true });
    }
  } catch (error) {
    self.postMessage({ kind: 'failed', message: String(error) });
  }
};
