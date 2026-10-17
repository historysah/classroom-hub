(() => {
const pdfjsLib = globalThis.pdfjsLib;
const {countText, textFromPdfItems} = globalThis.ClassroomTextCount;
const EmbeddedBinaryDataFactory = globalThis.EmbeddedPdfDataFactory;

const $ = selector => document.querySelector(selector);
const fileInput = $('#pdf-file');
const chooseButton = $('#pdf-choose');
const dropzone = $('#pdf-dropzone');
const working = $('#pdf-working');
const result = $('#pdf-result');
const errorBox = $('#pdf-error');
const progress = $('#pdf-progress');
const progressFill = $('#pdf-progress-fill');
const maxBytes = 100 * 1024 * 1024;
let currentJob = 0;
let loadingTask = null;

function showError(message) {
  working.hidden = true;
  result.hidden = true;
  dropzone.hidden = false;
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function reset() {
  currentJob += 1;
  if (loadingTask) loadingTask.destroy().catch(() => {});
  loadingTask = null;
  fileInput.value = '';
  dropzone.hidden = false;
  working.hidden = true;
  result.hidden = true;
  errorBox.hidden = true;
  errorBox.textContent = '';
  progressFill.style.width = '0%';
  chooseButton.focus();
}

async function countFile(file) {
  currentJob += 1;
  const job = currentJob;
  if (loadingTask) await loadingTask.destroy().catch(() => {});
  loadingTask = null;
  result.hidden = true;
  errorBox.hidden = true;
  if (!file) return;
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
    showError('PDF 파일을 선택해 주세요.');
    return;
  }
  if (file.size > maxBytes) {
    showError('파일이 100MB를 넘습니다. 더 작은 PDF를 선택해 주세요.');
    return;
  }
  if (file.size === 0) {
    showError('빈 파일은 읽을 수 없습니다.');
    return;
  }

  working.hidden = false;
  dropzone.hidden = true;
  progress.textContent = 'PDF를 읽고 있어요…';
  progressFill.style.width = '0%';
  let documentProxy = null;
  let taskForJob = null;
  try {
    // PDF 바이트를 서버 URL이 아닌 브라우저 메모리에서 PDF.js로 전달합니다.
    const data = new Uint8Array(await file.arrayBuffer());
    if (job !== currentJob) return;
    loadingTask = pdfjsLib.getDocument({
      data,
      cMapUrl: 'embedded:/',
      cMapPacked: true,
      standardFontDataUrl: 'embedded:/',
      BinaryDataFactory: EmbeddedBinaryDataFactory,
      useWorkerFetch: false,
      enableScripting: false,
      isEvalSupported: false,
      useWasm: false
    });
    taskForJob = loadingTask;
    documentProxy = await loadingTask.promise;
    if (job !== currentJob) return;
    let all = 0;
    let withoutWhitespace = 0;
    let textPages = 0;
    for (let pageNumber = 1; pageNumber <= documentProxy.numPages; pageNumber += 1) {
      if (job !== currentJob) return;
      progress.textContent = `${documentProxy.numPages}쪽 중 ${pageNumber}쪽 계산 중…`;
      const page = await documentProxy.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = textFromPdfItems(content.items);
      const counts = countText(pageText);
      all += counts.all;
      withoutWhitespace += counts.withoutWhitespace;
      if (counts.withoutWhitespace > 0) textPages += 1;
      page.cleanup();
      progressFill.style.width = `${Math.round(pageNumber / documentProxy.numPages * 100)}%`;
    }
    if (job !== currentJob) return;
    $('#pdf-filename').textContent = file.name;
    $('#pdf-count-all').textContent = all.toLocaleString('ko-KR');
    $('#pdf-count-no-space').textContent = withoutWhitespace.toLocaleString('ko-KR');
    $('#pdf-page-summary').textContent = `총 ${documentProxy.numPages.toLocaleString('ko-KR')}쪽 · 텍스트가 있는 쪽 ${textPages.toLocaleString('ko-KR')}쪽`;
    const warning = $('#pdf-text-warning');
    warning.hidden = textPages === documentProxy.numPages;
    warning.textContent = textPages === 0
      ? '이 PDF에서 선택 가능한 텍스트를 찾지 못했어요. 스캔 이미지 PDF는 OCR 없이 글자를 셀 수 없습니다.'
      : `${documentProxy.numPages - textPages}쪽에서 텍스트를 찾지 못했어요. 이미지로 된 부분은 글자 수에 포함되지 않습니다.`;
    working.hidden = true;
    result.hidden = false;
    result.scrollIntoView({behavior: 'smooth', block: 'nearest'});
  } catch (error) {
    if (job !== currentJob) return;
    if (error?.name === 'PasswordException') showError('암호가 걸린 PDF는 현재 읽을 수 없습니다. 암호를 해제한 파일로 다시 시도해 주세요.');
    else showError('PDF 텍스트를 읽지 못했어요. 파일이 손상되었거나 지원되지 않는 형식일 수 있습니다.');
  } finally {
    if (taskForJob) await taskForJob.destroy().catch(() => {});
    if (job === currentJob) loadingTask = null;
  }
}

chooseButton.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (file) countFile(file);
});
$('#pdf-clear').addEventListener('click', reset);
dropzone.addEventListener('dragover', event => {
  event.preventDefault();
  dropzone.classList.add('dragover');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', event => {
  event.preventDefault();
  dropzone.classList.remove('dragover');
  const file = event.dataTransfer?.files?.[0];
  if (file) countFile(file);
});
})();
