(() => {
  'use strict';

  const labels = {
    resident:'[주민등록번호]',
    phone:'[전화번호]',
    student:'[학번]',
    name:'[이름]',
    email:'[이메일]'
  };

  function newCounts() {
    return {resident:0, phone:0, student:0, name:0, email:0};
  }

  function normalizeText(value) {
    return String(value ?? '').normalize('NFKC')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  }

  function maskText(input, counts = newCounts()) {
    let text = normalizeText(input);
    const replace = (pattern, kind) => {
      text = text.replace(pattern, () => {
        counts[kind] += 1;
        return labels[kind];
      });
    };
    replace(/(?<!\d)\d{6}[-\s]?[1-8]\d{6}(?!\d)/gu, 'resident');
    replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, 'email');
    replace(/(?<!\d)(?:(?:\+82|82)[-\s]?)?0?1[016789][-\s]?\d{3,4}[-\s]?\d{4}(?!\d)/gu, 'phone');
    replace(/(?<!\d)0(?:2|[3-6]\d|70)[-\s]?\d{3,4}[-\s]?\d{4}(?!\d)/gu, 'phone');
    text = text.replace(/(학번[ \t]*[:：=]?[ \t]*)(\d{4,12}(?:-\d{1,4})?)(?!\d)/gu, (_, prefix) => {
      counts.student += 1;
      return prefix + labels.student;
    });
    text = text.replace(/(^|[^\p{L}])((?:학생명|성명|이름|작성자)[ \t]*[:：=]?[ \t]*)([가-힣]{2,5})(?=$|[^\p{L}])/gmu, (_, before, prefix) => {
      counts.name += 1;
      return before + prefix + labels.name;
    });
    return text;
  }

  function roleFromHeader(input) {
    const text = normalizeText(input).replace(/[\s:：()\[\]_.-]/g, '');
    if (/^(?:학생)?(?:이름|성명|학생명)$/.test(text)) return 'name';
    if (/^(?:학생)?학번$/.test(text)) return 'student';
    if (/^(?:학생|보호자)?(?:전화번호|연락처|휴대전화|휴대폰|핸드폰|휴대전화번호)$/.test(text)) return 'phone';
    if (/^(?:주민등록번호|주민번호)$/.test(text)) return 'resident';
    if (/^(?:이메일|전자우편|메일주소)$/.test(text)) return 'email';
    return null;
  }

  function maskCell(input, role, counts = newCounts()) {
    const text = normalizeText(input);
    if (role && text.trim()) {
      counts[role] += 1;
      return labels[role];
    }
    return maskText(text, counts);
  }

  function total(counts) {
    return Object.values(counts).reduce((sum, value) => sum + value, 0);
  }

  const core = {labels, newCounts, normalizeText, maskText, roleFromHeader, maskCell, total};
  globalThis.ClassroomPrivacyCore = core;
  if (typeof module === 'object' && module.exports) module.exports = core;
})();
