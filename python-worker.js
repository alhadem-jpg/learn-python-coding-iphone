// Learn Python Coding v4: Python 3 runtime and precise syntax diagnostics.
// Runs in a same-origin module worker, not on the UI thread.
const CDN = 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/';
let runtimePromise = null;
async function getPython() {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const { loadPyodide } = await import(CDN + 'pyodide.mjs');
      return await loadPyodide({ indexURL: CDN });
    })().catch(err => { runtimePromise = null; throw err; });
  }
  return await runtimePromise;
}
function syntaxCheck(py, code) {
  py.globals.set('__lpc_code_for_check', code);
  try {
    const result = py.runPython(`
import ast, json
try:
    ast.parse(__lpc_code_for_check, filename='main.py')
    __lpc_result = {'ok': True}
except SyntaxError as exc:
    __lpc_result = {
        'ok': False,
        'type': type(exc).__name__,
        'message': exc.msg,
        'line': exc.lineno or 1,
        'column': exc.offset or 1,
        'endLine': exc.end_lineno or exc.lineno or 1,
        'endColumn': exc.end_offset or (exc.offset or 1) + 1
    }
json.dumps(__lpc_result)
`);
    const parsed = JSON.parse(result);
    return parsed.ok ? null : parsed;
  } finally {
    py.globals.delete('__lpc_code_for_check');
  }
}
self.onmessage = async ({ data }) => {
  const { code, stdin, action = 'run' } = data;
  try {
    if (!runtimePromise) self.postMessage({kind:'loading'});
    const py = await getPython();
    const diagnostic = syntaxCheck(py, String(code || ''));
    if (action === 'check') {
      self.postMessage({kind:'checked', diagnostic,
        output:diagnostic ? `${diagnostic.type}: ${diagnostic.message} (line ${diagnostic.line})` : ''});
      return;
    }
    if (diagnostic) {
      self.postMessage({kind:'result',error:true,diagnostic,
        output:`${diagnostic.type}: ${diagnostic.message} (line ${diagnostic.line})`});
      return;
    }
    self.postMessage({kind:'executing'});
    const output = [];
    py.setStdout({batched: text => output.push(text)});
    py.setStderr({batched: text => output.push(text)});
    const inputs = String(stdin || '').split(/\r?\n/);
    py.setStdin({stdin: () => inputs.length ? inputs.shift() : null});
    try {
      const value = await py.runPythonAsync(code);
      if (value !== undefined && value !== null && String(value) !== 'None') output.push(String(value));
      if (value && typeof value.destroy === 'function') value.destroy();
      self.postMessage({kind:'result',output:output.join('\n') || '(no output)',error:false});
    } catch(error) {
      self.postMessage({kind:'result',output:output.concat(String(error)).join('\n'),error:true});
    }
  } catch(error) {
    self.postMessage({kind:'failed',message:String(error)});
  }
};
