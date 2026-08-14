import { QuizQuestion } from '../types';
import LZString from 'lz-string';

export interface SharedQuizPackage {
  title: string;
  questions: QuizQuestion[];
  subject?: string;
  grade?: string;
  isSharedLink?: boolean;
  isError?: boolean;
  errorMessage?: string;
}

// Compact minified question format (v2 - ultra lightweight)
interface UltraCompactQuestion {
  i?: number;
  q: string;
  o: string[]; // Options text array: ["Opt A", "Opt B", "Opt C", "Opt D"]
  a: string | number; // Correct answer key ('A' or 0)
  l?: string; // Level
  e?: string; // Explanation
}

interface UltraCompactQuizPackage {
  v?: number; // version 2
  t: string;
  s?: string;
  g?: string;
  q: UltraCompactQuestion[];
}

// Legacy v1 compact format for backward compatibility
interface LegacyCompactOption {
  k: string;
  t: string;
}

interface LegacyCompactQuestion {
  i: number;
  q: string;
  o: LegacyCompactOption[];
  a: string;
  l?: string;
  e?: string;
}

interface LegacyCompactQuizPackage {
  t: string;
  s?: string;
  g?: string;
  q: LegacyCompactQuestion[];
}

/**
 * Creates an ultra-compact self-contained URL (works 100% offline & without server persistence)
 */
export function createSelfContainedQuizUrl(
  title: string,
  questions: QuizQuestion[],
  subject?: string,
  grade?: string,
  targetOrigin?: string
): string {
  try {
    const compact: UltraCompactQuizPackage = {
      v: 2,
      t: title,
      s: subject,
      g: grade,
      q: questions.map((q, idx) => ({
        i: idx + 1,
        q: q.question_content,
        o: q.options.map(opt => opt.text),
        a: q.correct_answer,
        l: q.level,
        e: q.explanation || ''
      }))
    };

    const jsonStr = JSON.stringify(compact);
    const compressed = LZString.compressToEncodedURIComponent(jsonStr);
    
    let base = targetOrigin || (typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '');
    // Ensure base ends cleanly before hash
    if (base.endsWith('#') || base.endsWith('/')) {
      base = base.replace(/[#/]+$/, '');
    }
    return `${base}/#quiz=${compressed}`;
  } catch (err) {
    console.error("Failed to encode ultra-compact quiz URL", err);
    return "";
  }
}

/**
 * Calls URL Shortener services (via backend proxy or direct TinyURL/is.gd API)
 */
export async function shortenUrl(longUrl: string): Promise<string> {
  if (!longUrl) return '';

  // 1. Try server proxy first to avoid any client CORS issues
  try {
    const res = await fetch('/api/shorten-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: longUrl })
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.shortUrl) {
        return data.shortUrl;
      }
    }
  } catch (err) {
    console.warn("Server URL shortener proxy failed, trying direct fallback...", err);
  }

  // 2. Direct TinyURL API fallback
  try {
    const tinyRes = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`, {
      method: 'GET',
      mode: 'cors'
    });
    if (tinyRes.ok) {
      const short = await tinyRes.text();
      if (short && short.startsWith('http')) {
        return short.trim();
      }
    }
  } catch (err) {
    console.warn("Direct TinyURL call failed:", err);
  }

  // 3. Direct is.gd API fallback
  try {
    const isgdRes = await fetch(`https://is.gd/create.php?format=json&url=${encodeURIComponent(longUrl)}`);
    if (isgdRes.ok) {
      const data = await isgdRes.json();
      if (data && data.shorturl) {
        return data.shorturl;
      }
    }
  } catch (err) {
    console.warn("Direct is.gd call failed:", err);
  }

  return '';
}

/**
 * Creates short URL via server memory store as alternative
 */
export async function createShortQuizUrl(
  title: string,
  questions: QuizQuestion[],
  subject?: string,
  grade?: string,
  targetOrigin?: string
): Promise<string> {
  // Always default to ultra-compact self-contained URL so it never expires!
  return createSelfContainedQuizUrl(title, questions, subject, grade, targetOrigin);
}

/**
 * Decodes quiz package from current URL (supports ultra-compact v2, legacy v1, short code, and uncompressed)
 */
export async function decodeQuizFromUrl(): Promise<SharedQuizPackage | null> {
  if (typeof window === 'undefined') return null;

  const hash = window.location.hash || '';
  const search = window.location.search || '';

  const hasStudentParam = hash.includes('q=') || hash.includes('quiz=') || search.includes('q=') || search.includes('quiz=');

  if (!hasStudentParam) return null;

  try {
    // 1. Check self-contained payload #quiz=COMPRESSED_DATA
    let rawParam = '';
    if (hash.includes('quiz=')) {
      rawParam = hash.split('quiz=')[1]?.split('&')[0];
    } else if (search.includes('quiz=')) {
      const urlParams = new URLSearchParams(search);
      rawParam = urlParams.get('quiz') || '';
    }

    if (rawParam) {
      let jsonStr = '';
      const decompressed = LZString.decompressFromEncodedURIComponent(rawParam);
      if (decompressed) {
        jsonStr = decompressed;
      } else {
        try {
          const base64 = decodeURIComponent(rawParam);
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          jsonStr = new TextDecoder().decode(bytes);
        } catch (e) {
          console.error("Failed atob fallback decode", e);
        }
      }

      if (jsonStr) {
        const parsed = JSON.parse(jsonStr);

        // Version 2 ultra-compact format: q: [{ q: "...", o: ["A", "B", ...], a: "A" }]
        if (parsed && Array.isArray(parsed.q) && parsed.v === 2) {
          const ultra = parsed as UltraCompactQuizPackage;
          const questionsList: QuizQuestion[] = ultra.q.map((uq, idx) => {
            const options = uq.o.map((optText, oIdx) => ({
              key: String.fromCharCode(65 + oIdx),
              text: optText
            }));
            
            let correctKey = 'A';
            if (typeof uq.a === 'number') {
              correctKey = String.fromCharCode(65 + uq.a);
            } else if (typeof uq.a === 'string') {
              correctKey = uq.a.toUpperCase();
            }

            return {
              id: uq.i || (idx + 1),
              question_content: uq.q,
              options,
              correct_answer: correctKey,
              level: uq.l || 'Nhận biết',
              explanation: uq.e || ''
            };
          });

          return {
            title: ultra.t || 'Bài tập ôn tập',
            subject: ultra.s,
            grade: ultra.g,
            isSharedLink: true,
            questions: questionsList
          };
        }

        // Version 1 legacy format: q: [{ i, q, o: [{k, t}], a, l, e }]
        if (parsed && Array.isArray(parsed.q)) {
          const compact = parsed as LegacyCompactQuizPackage;
          return {
            title: compact.t || 'Bài tập ôn tập',
            subject: compact.s,
            grade: compact.g,
            isSharedLink: true,
            questions: compact.q.map((cq, idx) => ({
              id: cq.i || (idx + 1),
              question_content: cq.q,
              options: Array.isArray(cq.o) 
                ? (typeof cq.o[0] === 'string' 
                    ? (cq.o as any[]).map((t, oi) => ({ key: String.fromCharCode(65 + oi), text: t }))
                    : cq.o.map(co => ({ key: co.k || 'A', text: co.t || '' })))
                : [],
              correct_answer: cq.a || 'A',
              level: cq.l || 'Nhận biết',
              explanation: cq.e || ''
            }))
          };
        }

        // Raw standard format
        if (parsed && Array.isArray(parsed.questions)) {
          return {
            ...parsed,
            isSharedLink: true
          } as SharedQuizPackage;
        }
      }
    }

    // 2. Check short code #q=CODE from server
    let shortCode = '';
    if (hash.includes('q=')) {
      shortCode = hash.split('q=')[1]?.split('&')[0];
    } else if (search.includes('q=')) {
      const urlParams = new URLSearchParams(search);
      shortCode = urlParams.get('q') || '';
    }

    if (shortCode) {
      try {
        const res = await fetch(`/api/share/${shortCode}`);
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.questions)) {
            return {
              title: data.title || 'Bài tập ôn tập',
              questions: data.questions,
              subject: data.subject,
              grade: data.grade,
              isSharedLink: true
            };
          }
        }
      } catch (err) {
        console.error("Failed to fetch shared quiz by code", err);
      }
    }

  } catch (err) {
    console.error('Failed to decode quiz from URL', err);
  }

  // If student query param was present but could not be parsed or found
  return {
    title: 'Bài tập ôn tập',
    questions: [],
    isSharedLink: true,
    isError: true,
    errorMessage: '⚠️ Liên kết bài tập không hợp lệ hoặc đã hết hạn. Vui lòng kiểm tra lại liên kết do giáo viên cung cấp.'
  };
}
