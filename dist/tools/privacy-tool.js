(() => {
  'use strict';

  const core = globalThis.ClassroomPrivacyCore;
  const $ = selector => document.querySelector(selector);
  const input = $('#privacy-file');
  const choose = $('#privacy-choose');
  const zone = $('#privacy-dropzone');
  const working = $('#privacy-working');
  const progress = $('#privacy-progress');
  const errorBox = $('#privacy-error');
  const result = $('#privacy-result');
  const download = $('#privacy-download');
  const count = $('#privacy-total');
  const breakdown = $('#privacy-breakdown');
  const samples = $('#privacy-samples');
  const note = $('#privacy-result-note');
  let output = null;
  let runId = 0;

  function reset() {
    runId += 1;
    output = null;
    input.value = '';
    working.hidden = true;
    errorBox.hidden = true;
    result.hidden = true;
    zone.hidden = false;
  }

  function fail(message) {
    working.hidden = true;
    zone.hidden = false;
    result.hidden = true;
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  function showReport(report, kind) {
    count.textContent = core.total(report.counts).toLocaleString('ko-KR');
    breakdown.replaceChildren();
    for (const [key, label] of Object.entries({resident:'주민번호', phone:'전화번호', student:'학번', name:'이름', email:'이메일'})) {
      const item = document.createElement('div');
      const title = document.createElement('span');
      const number = document.createElement('strong');
      title.textContent = label;
      number.textContent = String(report.counts[key]);
      item.append(title, number);
      breakdown.append(item);
    }
    samples.replaceChildren();
    if (report.samples.length) {
      for (const sample of report.samples) {
        const item = document.createElement('li');
        item.textContent = `${sample.location}: ${sample.after}`;
        samples.append(item);
      }
    } else {
      const item = document.createElement('li');
      item.textContent = '자동으로 찾은 항목이 없습니다. 원본과 결과를 직접 확인해 주세요.';
      samples.append(item);
    }
    note.textContent = kind === 'pdf'
      ? `원본 ${report.pages}쪽 · 결과 ${report.outputPages}쪽 · 글자를 읽지 못한 원본 ${report.imageOnlyPages}쪽. 결과 PDF는 이미지 형태여서 검색과 복사가 어렵습니다.`
      : `${report.sheets}개 시트 · ${report.cells.toLocaleString('ko-KR')}개 셀 처리. 결과 파일은 셀 값만 담고, 원본 시트명·서식·이미지·수식은 제외했습니다.${report.formulasWithoutResults ? ` 계산 결과가 없는 수식 ${report.formulasWithoutResults}개는 빈칸으로 처리했습니다.` : ''}`;
    result.hidden = false;
    result.scrollIntoView({behavior:'smooth', block:'nearest'});
  }

  async function process(file) {
    reset();
    if (!file) return;
    const kind = /\.pdf$/i.test(file.name) ? 'pdf' : /\.xlsx$/i.test(file.name) ? 'xlsx' : '';
    if (!kind) return fail(/\.xls$/i.test(file.name) ? '오래된 .xls 파일은 엑셀에서 .xlsx로 다시 저장한 뒤 선택해 주세요.' : 'PDF 또는 .xlsx 파일을 선택해 주세요.');
    if (!file.size) return fail('빈 파일은 읽을 수 없습니다.');
    if (file.size > 30 * 1024 * 1024) return fail('30MB 이하 파일을 선택해 주세요.');
    const current = runId;
    zone.hidden = true;
    working.hidden = false;
    progress.textContent = '이 컴퓨터의 브라우저에서 파일을 읽고 있어요…';
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (current !== runId) return;
      const onProgress = (done, total) => {
        progress.textContent = `${total}개 중 ${done}개 처리 중…`;
      };
      const sanitized = kind === 'pdf'
        ? await globalThis.ClassroomPrivacyPdf.sanitizePdf(bytes, {onProgress})
        : await globalThis.ClassroomPrivacyXlsx.sanitizeXlsx(bytes, {onProgress});
      if (current !== runId) return;
      output = {bytes:sanitized.bytes, kind};
      working.hidden = true;
      showReport(sanitized.report, kind);
    } catch (error) {
      if (current !== runId) return;
      fail(error?.name === 'PasswordException' ? '암호가 걸린 PDF는 읽을 수 없습니다.' : (error?.message || '파일을 처리하지 못했습니다.'));
    }
  }

  choose.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.value = '';
    if (file) process(file);
  });
  $('#privacy-reset').addEventListener('click', () => {reset(); choose.focus();});
  zone.addEventListener('dragover', event => {event.preventDefault(); zone.classList.add('dragover');});
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', event => {
    event.preventDefault();
    zone.classList.remove('dragover');
    if (event.dataTransfer?.files?.[0]) process(event.dataTransfer.files[0]);
  });
  download.addEventListener('click', () => {
    if (!output) return;
    const blob = new Blob([output.bytes], {type:output.kind === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `privacy-cleaned.${output.kind}`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  });
})();
