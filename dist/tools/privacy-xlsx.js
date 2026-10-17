(() => {
  'use strict';

  const core = globalThis.ClassroomPrivacyCore;
  const namespace = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const relNamespace = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

  function named(node, name) {
    return (node?.elements || []).filter(item => item.type === 'element' && item.name.split(':').pop() === name);
  }

  function first(node, name) {
    return named(node, name)[0];
  }

  function textOf(node) {
    if (!node) return '';
    if (node.type === 'text' || node.type === 'cdata') return node.text || node.cdata || '';
    return (node.elements || []).map(textOf).join('');
  }

  function descendants(node, name) {
    const result = [];
    for (const child of node?.elements || []) {
      if (child.type !== 'element') continue;
      if (child.name.split(':').pop() === name) result.push(child);
      result.push(...descendants(child, name));
    }
    return result;
  }

  function parseXml(source, xml2js) {
    if (/<!\s*(?:DOCTYPE|ENTITY)/i.test(source)) throw new Error('지원하지 않는 XML 구조입니다.');
    return xml2js(source, {compact:false, ignoreDeclaration:true, ignoreComment:true});
  }

  function xmlEscape(value) {
    return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'})[char]);
  }

  function resolvePart(target) {
    const raw = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    const parts = [];
    for (const part of raw.replaceAll('\\', '/').split('/')) {
      if (part === '..') parts.pop();
      else if (part && part !== '.') parts.push(part);
    }
    const resolved = parts.join('/');
    if (!resolved.startsWith('xl/worksheets/') || !resolved.endsWith('.xml')) throw new Error('워크시트 경로를 확인할 수 없습니다.');
    return resolved;
  }

  function readCell(cell, sharedStrings, report) {
    const type = cell.attributes?.t || '';
    const raw = textOf(first(cell, 'v'));
    if (first(cell, 'f') && !first(cell, 'v')) {
      report.formulasWithoutResults += 1;
      return '';
    }
    if (type === 's') return sharedStrings[Number(raw)] ?? '';
    if (type === 'inlineStr') return descendants(first(cell, 'is'), 't').map(textOf).join('');
    if (type === 'b') return raw === '1' ? 'TRUE' : 'FALSE';
    return raw;
  }

  function makeWorkbook(sheets, JSZip) {
    const zip = new JSZip();
    const overrides = sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides}</Types>`);
    zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    const sheetDefinitions = sheets.map((_, index) => `<sheet name="Sheet ${index + 1}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('');
    zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="${namespace}" xmlns:r="${relNamespace}"><sheets>${sheetDefinitions}</sheets></workbook>`);
    const relationships = sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="${relNamespace}/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('');
    zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}</Relationships>`);
    sheets.forEach((sheet, index) => zip.file(`xl/worksheets/sheet${index + 1}.xml`, `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${namespace}"><sheetData>${sheet}</sheetData></worksheet>`));
    return zip.generateAsync({type:'uint8array', compression:'DEFLATE', compressionOptions:{level:6}});
  }

  async function sanitizeXlsx(bytes, options = {}) {
    const JSZip = options.JSZip || globalThis.JSZip;
    const xml2js = options.xml2js || globalThis.xml2js;
    if (!JSZip || !xml2js || !core) throw new Error('엑셀 처리 코드를 불러오지 못했습니다.');
    // Do not inflate every entry for CRC checking before enforcing archive size limits.
    const zip = await JSZip.loadAsync(bytes);
    let expanded = 0;
    zip.forEach((_, entry) => {
      expanded += Number(entry._data?.uncompressedSize || 0);
      if (expanded > 80 * 1024 * 1024) throw new Error('압축을 푼 파일 크기가 너무 큽니다.');
    });
    async function part(name) {
      const file = zip.file(name);
      if (!file) throw new Error('엑셀 파일의 필수 정보가 없습니다.');
      const content = await file.async('string');
      if (content.length > 25 * 1024 * 1024) throw new Error('엑셀 데이터가 너무 큽니다.');
      return parseXml(content, xml2js);
    }

    const workbook = first(await part('xl/workbook.xml'), 'workbook');
    const sheetNodes = named(first(workbook, 'sheets'), 'sheet');
    if (!sheetNodes.length || sheetNodes.length > 50) throw new Error('엑셀 시트 수를 처리할 수 없습니다.');
    const rels = first(await part('xl/_rels/workbook.xml.rels'), 'Relationships');
    const targets = new Map(named(rels, 'Relationship').map(item => [item.attributes?.Id, item.attributes?.Target]));
    const sharedStrings = [];
    if (zip.file('xl/sharedStrings.xml')) {
      const root = first(await part('xl/sharedStrings.xml'), 'sst');
      for (const item of named(root, 'si')) sharedStrings.push(descendants(item, 't').map(textOf).join(''));
    }

    const report = {counts:core.newCounts(), samples:[], sheets:sheetNodes.length, cells:0, formulasWithoutResults:0};
    const outputSheets = [];
    for (let sheetIndex = 0; sheetIndex < sheetNodes.length; sheetIndex += 1) {
      const relationId = sheetNodes[sheetIndex].attributes?.['r:id'];
      const target = targets.get(relationId);
      if (!target) throw new Error('엑셀 시트 연결 정보를 읽지 못했습니다.');
      const worksheet = first(await part(resolvePart(target)), 'worksheet');
      const rows = named(first(worksheet, 'sheetData'), 'row');
      const cells = [];
      const headers = new Map();
      for (const row of rows) {
        for (const cell of named(row, 'c')) {
          const ref = String(cell.attributes?.r || '').toUpperCase();
          const match = ref.match(/^([A-Z]{1,3})([1-9]\d{0,6})$/);
          if (!match) continue;
          report.cells += 1;
          if (report.cells > 100000) throw new Error('셀 수가 너무 많습니다. 10만 개 이하 파일을 사용해 주세요.');
          const value = core.normalizeText(readCell(cell, sharedStrings, report));
          const rowNumber = Number(match[2]);
          const column = match[1];
          cells.push({ref, rowNumber, column, value});
          const role = core.roleFromHeader(value);
          if (role) {
            if (!headers.has(column)) headers.set(column, []);
            headers.get(column).push({rowNumber, role});
          }
        }
      }
      const rowsOut = new Map();
      for (const cell of cells) {
        const headerRole = core.roleFromHeader(cell.value);
        const role = !headerRole && [...(headers.get(cell.column) || [])].reverse().find(item => item.rowNumber < cell.rowNumber)?.role;
        const before = cell.value;
        const after = headerRole ? before : core.maskCell(before, role, report.counts);
        if (before !== after && report.samples.length < 24) {
          report.samples.push({location:`Sheet ${sheetIndex + 1}!${cell.ref}`, after});
        }
        if (!after) continue;
        if (!rowsOut.has(cell.rowNumber)) rowsOut.set(cell.rowNumber, []);
        rowsOut.get(cell.rowNumber).push(`<c r="${cell.ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(after)}</t></is></c>`);
      }
      const body = [...rowsOut.entries()].sort((a, b) => a[0] - b[0]).map(([number, rowCells]) => `<row r="${number}">${rowCells.join('')}</row>`).join('');
      outputSheets.push(body);
      options.onProgress?.(sheetIndex + 1, sheetNodes.length);
    }
    return {bytes:await makeWorkbook(outputSheets, JSZip), report};
  }

  const api = {sanitizeXlsx};
  globalThis.ClassroomPrivacyXlsx = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})();
