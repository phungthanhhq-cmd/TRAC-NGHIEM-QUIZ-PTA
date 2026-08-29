/**
 * Utility functions for math text processing, LaTeX normalization, and exponent/superscript formatting.
 */

/**
 * Preprocesses text containing math expressions, powers/exponents, fractions, degrees,
 * and auto-wraps unwrapped math expressions into standard $...$ LaTeX delimiters.
 */
export const preprocessMathText = (text: string): string => {
  if (!text || typeof text !== 'string') return '';
  let cleaned = text;

  // 1. Standardize block & inline delimiters: $$...$$, \[...\], \(...\) to single $...$
  const mathPlaceholders: { key: string; content: string }[] = [];
  let placeholderIndex = 0;

  // Replace $$...$$ or \[...\] or \(...\) or $...$ with placeholders to preserve valid LaTeX
  cleaned = cleaned.replace(/(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|(?:\$[^$\n]+\$))/g, (match) => {
    let latexContent = match.trim();
    if (latexContent.startsWith('$$') && latexContent.endsWith('$$')) {
      latexContent = '$' + latexContent.slice(2, -2).trim() + '$';
    } else if (latexContent.startsWith('\\[') && latexContent.endsWith('\\]')) {
      latexContent = '$' + latexContent.slice(2, -2).trim() + '$';
    } else if (latexContent.startsWith('\\(') && latexContent.endsWith('\\)')) {
      latexContent = '$' + latexContent.slice(2, -2).trim() + '$';
    }
    const key = `___MATH_PH_${placeholderIndex++}___`;
    mathPlaceholders.push({ key, content: latexContent });
    return key;
  });

  // 2. Wrap unwrapped LaTeX commands like \frac{...}{...}, \sqrt{...}, \Delta, \alpha, \degree, \pi, \pm, \times, etc.
  cleaned = cleaned.replace(/(\\\w+(?:\{[^{}]*\}|\[[^\[\]]*\])*)/g, (match) => {
    return `$${match}$`;
  });

  // 3. Normalize degrees: 90^o, 45^o, 30^o, 180^o -> $90^\circ$
  cleaned = cleaned.replace(/(\d+)\s*\^[oO]\b/g, '$$$1^\\circ$$');

  // 4. Auto-wrap math tokens/polynomial expressions containing exponents (^) or subscripts (_)
  // E.g.: -4x^3y^2, (x+y)^2, 2x^2, 10^-3, cm^3, x_1, a^n, 2^10, x^2y^3z, 5x^3 - 2x^2
  cleaned = cleaned.replace(/(?:^|(?<=[\s,;:!?((\[]))([+-]?\s*(?:\([a-zA-Z0-9\s+\-*/^._]+\)|[a-zA-Z0-9._\\]+)*(?:\^[\w+\-{}\(\)]+|_[\w+\-{}\(\)]+)(?:[a-zA-Z0-9._^+\-*/={}\(\)\\]*))(?=$|[\s,;:!?)\]])/g, (match) => {
    const trimmed = match.trim();
    if (!trimmed || trimmed.includes('___MATH_PH_')) return match;
    return `$${trimmed}$`;
  });

  // 5. Restore placeholders
  mathPlaceholders.forEach(({ key, content }) => {
    cleaned = cleaned.replace(key, content);
  });

  return cleaned;
};

/**
 * Normalizes LaTeX expressions before feeding into KaTeX.
 * Ensures multi-digit or signed exponents are properly enclosed in braces (e.g. 10^-3 -> 10^{-3}, x^12 -> x^{12}).
 */
export const cleanLatexForKatex = (latex: string): string => {
  if (!latex) return '';
  let clean = latex
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\\$/g, '')
    .trim();

  // Enclose multi-digit or signed exponents without curly braces: x^12 -> x^{12}, 10^-3 -> 10^{-3}
  clean = clean.replace(/\^([-+][0-9]+|[0-9]{2,})(?![0-9}])/g, '^{$1}');

  return clean;
};

/**
 * Fallback converter for plain text: Converts remaining carets (e.g. ^2, ^3, ^n) and underscores to superscripts/subscripts.
 */
export const formatPlainTextSupSub = (text: string): (string | { type: 'sup' | 'sub'; content: string })[] => {
  if (!text) return [];
  const parts: (string | { type: 'sup' | 'sub'; content: string })[] = [];
  
  // Regex to match ^... and _...
  const regex = /(\^([0-9nkmx+\-]+|\{[^}]+\})|_([0-9nkmx+\-]+|\{[^}]+\}))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    
    if (match[1].startsWith('^')) {
      const content = (match[2] || '').replace(/^\{|\}$/g, '');
      parts.push({ type: 'sup', content });
    } else if (match[1].startsWith('_')) {
      const content = (match[3] || '').replace(/^\{|\}$/g, '');
      parts.push({ type: 'sub', content });
    }
    
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
};
