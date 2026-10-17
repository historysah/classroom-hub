const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

(async () => {
  const root = __dirname;
  const html = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8');
  const catalogSource = fs.readFileSync(path.join(root, 'dist/tools/catalog.js'), 'utf8');
  assert.match(html, /id="pdf-counter-view"[^>]*data-tool-view/);
  assert.match(catalogSource, /id: 'pdf-counter'/);
  assert.match(html, /id="qr-maker-view"[^>]*data-tool-view/);
  assert.match(catalogSource, /id: 'qr-maker'/);
  assert.match(html, /id="diary-view"[^>]*data-tool-view/);
  assert.match(catalogSource, /id: 'diary'/);
  assert.match(html, /id="pdf-privacy"/);
  assert.doesNotMatch(html, /id="tool-url"/);
  assert.doesNotMatch(html, /type="module"/);
  assert.match(html, /connect-src 'self'/);
  for (const [, relative] of html.matchAll(/<script\s+src="\.\/([^"]+)"/g)) {
    assert.ok(fs.existsSync(path.join(root, 'dist', relative)), `Missing local script: ${relative}`);
  }

  const qrcode = require(path.join(root, 'dist/vendor/qrcode/qrcode.js'));
  qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
  const qr = qrcode(0, 'M');
  qr.addData('https://example.com/class?topic=한글');
  qr.make();
  assert.ok(qr.getModuleCount() >= 21);
  assert.equal(qr.isDark(0, 0), true);

  const elements = new Map();
  for (const id of ['qr-form', 'qr-url', 'qr-error', 'qr-empty', 'qr-ready', 'qr-canvas', 'qr-result-url', 'qr-download']) {
    elements.set(`#${id}`, {hidden: id === 'qr-ready', textContent: '', value: '', listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; }, focus() {}});
  }
  let painted = 0;
  const canvas = elements.get('#qr-canvas');
  canvas.width = 768;
  canvas.getContext = () => ({set fillStyle(value) {}, fillRect() { painted += 1; }});
  canvas.toDataURL = () => 'data:image/png;base64,test';
  let downloadClicked = false;
  const anchor = {click() { downloadClicked = true; }, remove() {}};
  const documentMock = {querySelector: id => elements.get(id), createElement: () => anchor, body: {append() {}}};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'dist/tools/qr-maker.js'), 'utf8'), {document: documentMock, window: {qrcode}, URL});
  const input = elements.get('#qr-url');
  const submit = elements.get('#qr-form').listeners.submit;
  input.value = 'javascript:alert(1)';
  submit({preventDefault() {}});
  assert.match(elements.get('#qr-error').textContent, /올바른 웹주소/);
  input.value = 'https://example.com/class?topic=한글';
  submit({preventDefault() {}});
  assert.equal(elements.get('#qr-ready').hidden, false);
  assert.ok(painted > 100);
  elements.get('#qr-download').listeners.click();
  assert.equal(downloadClicked, true);

  require(path.join(root, 'dist/tools/text-count.js'));
  const {countText, textFromPdfItems} = globalThis.ClassroomTextCount;
  assert.deepEqual(countText('가 나\n👩‍🏫'), {all: 5, withoutWhitespace: 3});
  assert.equal(textFromPdfItems([{str:'Hello ',hasEOL:false},{str:'PDF',hasEOL:true}]), 'Hello PDF\n');

  const stream = 'BT /F1 12 Tf 20 100 Td (Hello PDF 123) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  ];
  let source = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(source));
    source += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(source);
  source += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(offset => { source += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  source += `trailer\n<< /Root 1 0 R /Size ${offsets.length} >>\nstartxref\n${xrefOffset}\n%%EOF`;
  const bytes = Buffer.from(source, 'ascii');
  // Node의 테스트 환경에는 브라우저 그래픽 객체가 없지만 텍스트 추출에는 사용하지 않습니다.
  globalThis.DOMMatrix = class DOMMatrix {};
  for (const file of [
    'dist/vendor/pdfjs/pdf.worker.classic.js',
    'dist/vendor/pdfjs/pdf.classic.js',
    'dist/vendor/pdfjs/binary-data.js',
    'dist/tools/embedded-pdf-data.js'
  ]) require(path.join(root, file));
  const pdfjs = globalThis.pdfjsLib;
  const task = pdfjs.getDocument({
    data:new Uint8Array(bytes),
    cMapUrl:'embedded:/',
    cMapPacked:true,
    standardFontDataUrl:'embedded:/',
    BinaryDataFactory:globalThis.EmbeddedPdfDataFactory,
    useWorkerFetch:false,
    useWasm:false
  });
  const document = await task.promise;
  const text = textFromPdfItems((await (await document.getPage(1)).getTextContent()).items);
  assert.equal(countText(text).withoutWhitespace, 11);
  await task.destroy();
  process.stdout.write('허브 연결, QR 생성, 글자 수 계산, PDF 텍스트 추출 확인 완료\n');
})().catch(error => { console.error(error); process.exitCode = 1; });
