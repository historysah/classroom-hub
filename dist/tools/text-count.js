(() => {
// 화면에 표시되는 한글 음절, 결합 문자, 이모지를 각각 한 글자로 셉니다.
const segmenter = typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter('ko', {granularity: 'grapheme'})
  : null;

function countText(text) {
  let all = 0;
  let withoutWhitespace = 0;
  const segments = segmenter
    ? Array.from(segmenter.segment(text), item => item.segment)
    : Array.from(text);
  for (const segment of segments) {
    all += 1;
    if (!/^\s+$/u.test(segment)) withoutWhitespace += 1;
  }
  return {all, withoutWhitespace};
}

function textFromPdfItems(items) {
  return items.map(item => {
    if (typeof item.str !== 'string') return '';
    return item.str + (item.hasEOL ? '\n' : '');
  }).join('');
}

globalThis.ClassroomTextCount = {countText, textFromPdfItems};
})();

