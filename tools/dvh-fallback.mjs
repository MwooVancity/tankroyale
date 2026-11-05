// Android WebView below 108 drops any declaration using dvh/svh, so a panel
// sized `max-height:calc(100dvh - 16px)` grows past the screen and hides its
// bottom buttons. Prefix each such declaration with a plain-vh copy: old
// WebViews keep the vh line, newer ones take the later dvh line.
// ponytail: text rewrite of CSS and CSS-in-template-strings, not a CSS parser;
// it skips values holding quotes or parens-before-property (e.g. @media).
const DECL = /([{;\s])([a-z-]+)\s*:\s*([^;{}"'`<>]*?\d[ds]vh\b[^;{}"'`<>]*)/g;

export function addVhFallback(source) {
  return source.replace(DECL, (_m, lead, prop, value) =>
    `${lead}${prop}:${value.replace(/(\d)[ds]vh\b/g, '$1vh')};${prop}:${value}`);
}

export function dvhFallbackPlugin() {
  return {
    name: 'cot-dvh-fallback',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0];
      if (file.includes('node_modules') || !/\.(css|ts|js)$/.test(file)) return null;
      if (!/\d[ds]vh\b/.test(code)) return null;
      // In .ts/.js only CSS inside template literals is rewritten, never code.
      // The copy goes on the same line, so line numbers (map: null) stay true.
      const out = file.endsWith('.css') ? addVhFallback(code)
        : code.replace(/`[^`]*`/g, (literal) => addVhFallback(literal));
      return { code: out, map: null };
    },
  };
}
