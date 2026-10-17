(() => {
  'use strict';

  const form = document.querySelector('#qr-form');
  const input = document.querySelector('#qr-url');
  const error = document.querySelector('#qr-error');
  const empty = document.querySelector('#qr-empty');
  const ready = document.querySelector('#qr-ready');
  const canvas = document.querySelector('#qr-canvas');
  const resultUrl = document.querySelector('#qr-result-url');
  const download = document.querySelector('#qr-download');

  function validUrl(value) {
    try {
      const parsed = new URL(value);
      return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && Boolean(parsed.hostname);
    } catch {
      return false;
    }
  }

  function clearResult() {
    ready.hidden = true;
    empty.hidden = false;
    resultUrl.textContent = '';
  }

  function drawQr(qr) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas unavailable');
    const moduleCount = qr.getModuleCount();
    const total = moduleCount + 8; // QR 표준의 4칸 여백
    const scale = canvas.width / total;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#000';
    for (let row = 0; row < moduleCount; row += 1) {
      for (let col = 0; col < moduleCount; col += 1) {
        if (!qr.isDark(row, col)) continue;
        const x1 = Math.round((col + 4) * scale);
        const y1 = Math.round((row + 4) * scale);
        const x2 = Math.round((col + 5) * scale);
        const y2 = Math.round((row + 5) * scale);
        context.fillRect(x1, y1, x2 - x1, y2 - y1);
      }
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const address = input.value.trim();
    error.textContent = '';
    clearResult();
    if (!address) {
      error.textContent = '웹주소를 입력해 주세요.';
      input.focus();
      return;
    }
    if (!validUrl(address)) {
      error.textContent = 'http:// 또는 https://로 시작하는 올바른 웹주소를 입력해 주세요.';
      input.focus();
      return;
    }
    try {
      if (typeof window.qrcode !== 'function') throw new Error('QR library unavailable');
      window.qrcode.stringToBytes = window.qrcode.stringToBytesFuncs['UTF-8'];
      const qr = window.qrcode(0, 'M');
      qr.addData(address);
      qr.make();
      drawQr(qr);
      resultUrl.textContent = address;
      empty.hidden = true;
      ready.hidden = false;
    } catch {
      error.textContent = '이 주소는 QR로 만들 수 없어요. 주소를 짧게 줄여 다시 시도해 주세요.';
    }
  });

  input.addEventListener('input', () => {
    error.textContent = '';
    clearResult();
  });

  download.addEventListener('click', () => {
    if (ready.hidden) return;
    const link = document.createElement('a');
    link.download = 'classroom-qr.png';
    link.href = canvas.toDataURL('image/png');
    document.body.append(link);
    link.click();
    link.remove();
  });
})();
