(() => {
const embeddedPdfData = globalThis.PDFJS_BINARY_DATA;
const embeddedPdfCache = new Map();

globalThis.EmbeddedPdfDataFactory = class EmbeddedPdfDataFactory {
  async fetch({kind, filename}) {
    const key = `${kind}/${filename}`;
    if (embeddedPdfCache.has(key)) return embeddedPdfCache.get(key);
    const encoded = embeddedPdfData[kind]?.[filename];
    if (!encoded) throw new Error(`Embedded PDF resource not found: ${key}`);
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    embeddedPdfCache.set(key, bytes);
    return bytes;
  }
};
})();
