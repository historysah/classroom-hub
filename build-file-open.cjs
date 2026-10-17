const fs = require('node:fs');
const path = require('node:path');

const vendor = path.join(__dirname, 'dist/vendor/pdfjs');

function toClassic(source, globalName) {
  const exportMatch = source.match(/export\{([^}]+)\};?\s*$/);
  if (!exportMatch) throw new Error('PDF.js export list not found');
  const assignments = exportMatch[1].split(',').map(part => {
    const [local, exported] = part.trim().split(/\s+as\s+/);
    return `${JSON.stringify(exported || local)}:${local}`;
  });
  return '(() => {\n' + source
    .slice(0, exportMatch.index)
    .replaceAll('import.meta.url', '(globalThis.location?.href || "")')
    + `\nglobalThis.${globalName}={${assignments.join(',')}};\n})();\n`;
}

const main = fs.readFileSync(path.join(vendor, 'pdf.min.mjs'), 'utf8');
const worker = fs.readFileSync(path.join(vendor, 'pdf.worker.min.mjs'), 'utf8');
fs.writeFileSync(path.join(vendor, 'pdf.classic.js'), toClassic(main, 'pdfjsLib'));
fs.writeFileSync(path.join(vendor, 'pdf.worker.classic.js'), toClassic(worker, 'pdfjsWorker'));

const encoded = {};
for (const [kind, folder] of [['cMapUrl', 'cmaps'], ['standardFontDataUrl', 'standard_fonts']]) {
  encoded[kind] = {};
  for (const name of fs.readdirSync(path.join(vendor, folder))) {
    if (name.startsWith('LICENSE')) continue;
    const filename = path.join(vendor, folder, name);
    if (fs.statSync(filename).isFile()) encoded[kind][name] = fs.readFileSync(filename).toString('base64');
  }
}
fs.writeFileSync(path.join(vendor, 'binary-data.js'), `globalThis.PDFJS_BINARY_DATA=${JSON.stringify(encoded)};\n`);
console.log('PDF.js file-open assets built');
