(() => {
  'use strict';

  const core = globalThis.ClassroomPrivacyCore;

  function splitLines(context, value, maxWidth) {
    const lines = [];
    for (const paragraph of value.split(/\r?\n/)) {
      let line = '';
      for (const character of Array.from(paragraph)) {
        if (line && context.measureText(line + character).width > maxWidth) {
          lines.push(line);
          line = character;
        } else line += character;
      }
      lines.push(line);
    }
    return lines;
  }

  function dataUrlBytes(dataUrl) {
    const binary = atob(dataUrl.split(',')[1]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  async function sanitizePdf(bytes, options = {}) {
    const pdfjsLib = options.pdfjsLib || globalThis.pdfjsLib;
    const PDFLib = options.PDFLib || globalThis.PDFLib;
    const textFromPdfItems = options.textFromPdfItems || globalThis.ClassroomTextCount?.textFromPdfItems;
    const EmbeddedBinaryDataFactory = options.EmbeddedBinaryDataFactory || globalThis.EmbeddedPdfDataFactory;
    const makeCanvas = options.makeCanvas || (() => document.createElement('canvas'));
    if (!pdfjsLib || !PDFLib || !textFromPdfItems || !EmbeddedBinaryDataFactory || !core) throw new Error('PDF 처리 코드를 불러오지 못했습니다.');
    let loadingTask;
    let source;
    try {
      loadingTask = pdfjsLib.getDocument({
        data: bytes,
        cMapUrl:'embedded:/', cMapPacked:true,
        standardFontDataUrl:'embedded:/',
        BinaryDataFactory:EmbeddedBinaryDataFactory,
        useWorkerFetch:false, useWasm:false, enableScripting:false, isEvalSupported:false
      });
      source = await loadingTask.promise;
      if (source.numPages > 80) throw new Error('PDF는 80쪽 이하만 처리할 수 있습니다.');
      const report = {counts:core.newCounts(), samples:[], pages:source.numPages, imageOnlyPages:0};
      const entries = [];
      for (let number = 1; number <= source.numPages; number += 1) {
        const page = await source.getPage(number);
        const content = await page.getTextContent();
        const raw = core.normalizeText(textFromPdfItems(content.items));
        const masked = core.maskText(raw, report.counts);
        if (!raw.trim()) report.imageOnlyPages += 1;
        if (masked !== raw && report.samples.length < 24) {
          const excerpt = masked.split('\n').find(line => /\[(?:주민등록번호|전화번호|학번|이름|이메일)\]/u.test(line));
          if (excerpt) report.samples.push({location:`${number}쪽`, after:excerpt.slice(0, 100)});
        }
        entries.push({number, text:masked});
        page.cleanup();
        options.onProgress?.(number, source.numPages);
      }
      if (report.imageOnlyPages === source.numPages) throw new Error('선택 가능한 글자가 없는 PDF입니다. 이미지 PDF는 OCR 없이 점검할 수 없습니다.');

      const output = await PDFLib.PDFDocument.create();
      const width = 1000, height = 1414, margin = 66, lineHeight = 27;
      const canvas = makeCanvas();
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('새 PDF를 그릴 수 없습니다.');
      let y = 0;
      let outputPages = 0;
      function startPage() {
        context.fillStyle = '#fff';
        context.fillRect(0, 0, width, height);
        context.fillStyle = '#111';
        context.font = '20px Arial, "Malgun Gothic", sans-serif';
        context.fillText('개인정보 점검 결과 · 원본 서식과 이미지 제외', margin, 52);
        context.fillStyle = '#333';
        context.font = '19px Arial, "Malgun Gothic", sans-serif';
        y = 98;
      }
      async function finishPage() {
        const jpeg = dataUrlBytes(canvas.toDataURL('image/jpeg', .86));
        const image = await output.embedJpg(jpeg);
        const page = output.addPage([595.28, 841.89]);
        page.drawImage(image, {x:0, y:0, width:595.28, height:841.89});
        outputPages += 1;
      }
      startPage();
      for (const entry of entries) {
        const text = entry.text.trim() || '[선택 가능한 글자 없음 · 원본 이미지 제외]';
        const lines = [`원본 ${entry.number}쪽`, ...splitLines(context, text, width - margin * 2), ''];
        for (const line of lines) {
          if (y + lineHeight > height - margin) {
            await finishPage();
            startPage();
          }
          context.fillText(line, margin, y);
          y += lineHeight;
        }
      }
      await finishPage();
      report.outputPages = outputPages;
      return {bytes:await output.save(), report};
    } finally {
      if (loadingTask) await loadingTask.destroy().catch(() => {});
    }
  }

  const api = {sanitizePdf};
  globalThis.ClassroomPrivacyPdf = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})();
