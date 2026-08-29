import React, { useEffect, useRef } from 'react';
import katex from 'katex';
import { preprocessMathText, cleanLatexForKatex, formatPlainTextSupSub } from '../utils/mathUtils';

interface MathRendererProps {
  text: string;
  className?: string;
}

const MathRenderer: React.FC<MathRendererProps> = ({ text, className = '' }) => {
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // 1. Preprocess math text to normalize delimiters, exponents, degrees, etc.
    const normalizedText = preprocessMathText(text || '');

    // 2. Regex for matching math blocks
    // 1. $$...$$ (Block)
    // 2. \[...\] (Block)
    // 3. \(...\) (Inline)
    // 4. $...$ (Inline)
    const regex = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|(?:\$[^$\n]+\$))/g;
    
    // Split text into parts
    const parts = normalizedText.split(regex);
    
    containerRef.current.innerHTML = '';
    
    parts.forEach(part => {
      if (!part) return; // Skip empty parts

      let latex = '';
      let isDisplayMode = false;
      let isMath = false;
      const trimmedPart = part.trim();

      // Check delimiters
      if (trimmedPart.startsWith('$$') && trimmedPart.endsWith('$$')) {
        latex = trimmedPart.slice(2, -2);
        isDisplayMode = true;
        isMath = true;
      } else if (trimmedPart.startsWith('\\[') && trimmedPart.endsWith('\\]')) {
        latex = trimmedPart.slice(2, -2);
        isDisplayMode = true;
        isMath = true;
      } else if (trimmedPart.startsWith('\\(') && trimmedPart.endsWith('\\)')) {
        latex = trimmedPart.slice(2, -2);
        isDisplayMode = false;
        isMath = true;
      } else if (trimmedPart.startsWith('$') && trimmedPart.endsWith('$')) {
        if (trimmedPart.length > 2) {
          latex = trimmedPart.slice(1, -1);
          isDisplayMode = false;
          isMath = true;
        }
      }

      if (isMath) {
        const span = document.createElement('span');
        span.className = 'inline-math-item';
        
        // Clean and prepare the latex string
        const cleanLatex = cleanLatexForKatex(latex);

        try {
          katex.render(cleanLatex, span, { 
            throwOnError: false, 
            displayMode: isDisplayMode,
            output: 'html', // Generate HTML output for maximum performance and clean styling
            trust: true,
            strict: false,
            globalGroup: true 
          });
          containerRef.current?.appendChild(span);
        } catch (e) {
          console.warn("KaTeX render error:", e);
          // Fallback: render formatted text with superscript support
          const fallbackSpan = document.createElement('span');
          const subSupParts = formatPlainTextSupSub(latex);
          subSupParts.forEach(p => {
            if (typeof p === 'string') {
              fallbackSpan.appendChild(document.createTextNode(p));
            } else if (p.type === 'sup') {
              const sup = document.createElement('sup');
              sup.textContent = p.content;
              fallbackSpan.appendChild(sup);
            } else if (p.type === 'sub') {
              const sub = document.createElement('sub');
              sub.textContent = p.content;
              fallbackSpan.appendChild(sub);
            }
          });
          containerRef.current?.appendChild(fallbackSpan);
        }
      } else {
        // Render plain text with line breaks & superscript/subscript tag formatting
        const textSpan = document.createElement('span');
        const lines = part.split('\n');
        
        lines.forEach((line, i) => {
          if (i > 0) textSpan.appendChild(document.createElement('br'));
          
          const subSupParts = formatPlainTextSupSub(line);
          subSupParts.forEach(p => {
            if (typeof p === 'string') {
              textSpan.appendChild(document.createTextNode(p));
            } else if (p.type === 'sup') {
              const sup = document.createElement('sup');
              sup.className = 'text-xs font-semibold';
              sup.textContent = p.content;
              textSpan.appendChild(sup);
            } else if (p.type === 'sub') {
              const sub = document.createElement('sub');
              sub.className = 'text-xs font-semibold';
              sub.textContent = p.content;
              textSpan.appendChild(sub);
            }
          });
        });
        
        containerRef.current?.appendChild(textSpan);
      }
    });

  }, [text]);

  return <span ref={containerRef} className={`${className} leading-relaxed break-words block-math-adjustment`} />;
};

export default MathRenderer;