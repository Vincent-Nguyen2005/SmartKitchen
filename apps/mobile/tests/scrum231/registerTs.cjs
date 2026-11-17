// SCRUM-231: Run TypeScript service modules in Node's built-in test runner.
// No Jest/Vitest, Docker, or live API is required. This file is test-only.
const fs = require('node:fs');
const ts = require('typescript');

require.extensions['.ts'] = (mod, filename) => {
  const content = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(content, {
    fileName: filename,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
  }).outputText;
  mod._compile(output, filename);
};

function fakeResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => data === undefined ? '' : JSON.stringify(data),
  };
}

async function withFetch(responseOrCallback, work) {
  const previous = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return typeof responseOrCallback === 'function'
      ? responseOrCallback(url, options, calls.length)
      : responseOrCallback;
  };
  try {
    const result = await work(calls);
    return { result, calls };
  } finally {
    globalThis.fetch = previous;
  }
}

module.exports = { fakeResponse, withFetch };
