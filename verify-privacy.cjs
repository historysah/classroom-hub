const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawnSync} = require('node:child_process');

async function main() {
  const root = __dirname;
  const html = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8');
  const catalog = fs.readFileSync(path.join(root, 'dist/tools/catalog.js'), 'utf8');
  assert.match(html, /id="privacy-checker-view"[^>]*data-tool-view/);
  assert.match(catalog, /id: 'privacy-checker'/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'dist/tools/privacy-tool.js'), 'utf8'), /\bfetch\s*\(/);
  for (const [, relative] of html.matchAll(/<script\s+src="\.\/([^"]+)"/g)) {
    assert.ok(fs.existsSync(path.join(root, 'dist', relative)), `Missing local script: ${relative}`);
  }

  const core = require('./dist/tools/privacy-core.js');
  const counts = core.newCounts();
  const masked = core.maskText('이름: 김철수 학번 20315 전화 010-0000-0000 주민번호 000000-1000000 email sample@example.com', counts);
  assert.equal(core.total(counts), 5);
  for (const secret of ['김철수','20315','010-0000-0000','000000-1000000','sample@example.com']) assert.ok(!masked.includes(secret));

  const requireDependency = name => require(process.env.CLASSROOM_TEST_NODE_MODULES ? path.join(process.env.CLASSROOM_TEST_NODE_MODULES, name) : name);
  const JSZip = requireDependency('jszip');
  const {xml2js} = requireDependency('xml-js');
  const zip = new JSZip();
  zip.file('xl/workbook.xml', '<workbook><sheets><sheet name="학생" sheetId="1" r:id="rId1"/></sheets></workbook>');
  zip.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>');
  zip.file('xl/sharedStrings.xml', '<sst><si><t>이름</t></si><si><t>전화번호</t></si><si><t>김철수</t></si><si><t>010-0000-0000</t></si></sst>');
  zip.file('xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c></row></sheetData></worksheet>');
  zip.file('docProps/core.xml', '<secret>unmasked metadata</secret>');
  const xlsx = require('./dist/tools/privacy-xlsx.js');
  const clean = await xlsx.sanitizeXlsx(await zip.generateAsync({type:'uint8array'}), {JSZip, xml2js});
  assert.equal(clean.report.counts.name, 1);
  assert.equal(clean.report.counts.phone, 1);
  const opened = await JSZip.loadAsync(clean.bytes);
  const outputXml = await opened.file('xl/worksheets/sheet1.xml').async('string');
  assert.match(outputXml, /\[이름\]/);
  assert.match(outputXml, /\[전화번호\]/);
  assert.ok(!opened.file('docProps/core.xml'));
  assert.ok(!outputXml.includes('김철수'));
  assert.ok(!outputXml.includes('010-0000-0000'));
  const python = process.env.CLASSROOM_TEST_PYTHON;
  if (python && fs.existsSync(python)) {
    const tempFile = path.join(os.tmpdir(), `classroom-privacy-${process.pid}.xlsx`);
    try {
      fs.writeFileSync(tempFile, clean.bytes);
      const check = spawnSync(python, ['-c', 'import openpyxl,sys; w=openpyxl.load_workbook(sys.argv[1],read_only=True); s=w.active; assert s["A2"].value=="[이름]"; assert s["B2"].value=="[전화번호]"', tempFile], {encoding:'utf8'});
      assert.equal(check.status, 0, check.stderr);
    } finally {fs.rmSync(tempFile, {force:true});}
  }

  globalThis.DOMMatrix = class DOMMatrix {};
  for (const file of ['dist/vendor/pdfjs/pdf.worker.classic.js','dist/vendor/pdfjs/pdf.classic.js','dist/vendor/pdfjs/binary-data.js','dist/tools/embedded-pdf-data.js','dist/tools/text-count.js']) require(path.join(root, file));
  const PDFLib = requireDependency('pdf-lib');
  const {createCanvas} = requireDependency('@napi-rs/canvas');
  const stream = 'BT /F1 12 Tf 20 100 Td (Call 010-0000-0000) Tj ET';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let source = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((body, index) => { offsets.push(Buffer.byteLength(source)); source += `${index + 1} 0 obj\n${body}\nendobj\n`; });
  const xrefOffset = Buffer.byteLength(source);
  source += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(offset => { source += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  source += `trailer\n<< /Root 1 0 R /Size ${offsets.length} >>\nstartxref\n${xrefOffset}\n%%EOF`;
  const privacyPdf = require('./dist/tools/privacy-pdf.js');
  const pdf = await privacyPdf.sanitizePdf(new Uint8Array(Buffer.from(source, 'ascii')), {PDFLib, makeCanvas:() => createCanvas(1, 1)});
  assert.equal(pdf.report.counts.phone, 1);
  assert.equal(pdf.report.outputPages, 1);
  assert.ok(!Buffer.from(pdf.bytes).includes(Buffer.from('010-0000-0000')));
  const sanitizedTask = globalThis.pdfjsLib.getDocument({data:pdf.bytes, cMapUrl:'embedded:/', cMapPacked:true, standardFontDataUrl:'embedded:/', BinaryDataFactory:globalThis.EmbeddedPdfDataFactory, useWorkerFetch:false, useWasm:false});
  const sanitizedDocument = await sanitizedTask.promise;
  assert.equal(sanitizedDocument.numPages, 1);
  await sanitizedTask.destroy();
  process.stdout.write('개인정보 패턴, 엑셀 새 파일, PDF 새 파일 확인 완료\n');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
