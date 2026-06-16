// Minimal type for mammoth's self-contained browser bundle (no shipped types).
declare module 'mammoth/mammoth.browser.js' {
  export function extractRawText(options: {
    arrayBuffer: ArrayBuffer;
  }): Promise<{ value: string }>;
  const _default: { extractRawText: typeof extractRawText };
  export default _default;
}
