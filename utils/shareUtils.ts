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

// Ultra-compressed tuple format (v3 - maximum compression for Zalo & QR scan speed)
// Format: [version: 3, title, subject, grade, [ [question, [opt1, opt2, ...], correctIndex, level, explanation] ]]
type UltraTupleQuiz = [
  number, // 0: version (3)
  string, // 1: title
  string, // 2: subject
  string, // 3: grade
  [string, string[], number, string, string][] // 4: questions array
];

// Compact v2 format for backward compatibility
interface UltraCompactQuestionV2 {
  i?: number;
  q: string;
  o: string[];
  a: string | number;
  l?: string;
  e?: string;
}

interface UltraCompactQuizPackageV2 {
  v?: number;
  t: string;
  s?: string;
  g?: string;
  q: UltraCompactQuestionV2[];
}

// Legacy v1 compact format
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
 * Creates a 100% Native, self-contained URL using your web domain.
 * - Does NOT use 3rd party shorteners (TinyURL) -> 100% accepted by Zalo, Facebook, SMS, Safari, Chrome, iOS & Android.
 * - Works offline and on static hosts (Vercel, Netlify, GitHub Pages).
 * - Never expires, unlimited students.
 */
export function createSelfContainedQuizUrl(
  title: string,
  questions: QuizQuestion[],
  subject?: string,
  grade?: string,
  targetOrigin?: string
): string {
  try {
    // Pack into ultra-dense tuple (Version 3)
    const tuple: UltraTupleQuiz = [
      3,
      title || '',
      subject || '',
      grade || '',
      questions.map(q => {
        let correctIdx = 0;
        if (typeof q.correct_answer === 'string') {
          const charCode = q.correct_answer.toUpperCase().charCodeAt(0);
          if (charCode >= 65 && charCode <= 90) {
            correctIdx = charCode - 65;
          }
        }
        return [
          q.question_content || '',
          q.options ? q.options.map(o => o.text || '') : [],
          correctIdx,
          q.level || '',
          q.explanation || ''
        ];
      })
    ];

    const jsonStr = JSON.stringify(tuple);
    const compressed = LZString.compressToEncodedURIComponent(jsonStr);
    
    let base = targetOrigin || (typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '');
    // Clean trailing slashes or hashes
    base = base.replace(/[#/]+$/, '');
    
    return `${base}/#quiz=${compressed}`;
  } catch (err) {
    console.error("Failed to encode ultra-compact quiz URL", err);
    return "";
  }
}

/**
 * Decodes quiz package from current URL (supports Tuple v3, Object v2, Legacy v1, and Server codes)
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

        // Version 3 Tuple Format: [3, title, subject, grade, [ [q, opts, ansIdx, level, exp] ]]
        if (Array.isArray(parsed) && parsed[0] === 3) {
          const tuple = parsed as UltraTupleQuiz;
          const questionsList: QuizQuestion[] = tuple[4].map((item, idx) => {
            const [qText, opts, correctIdx, level, exp] = item;
            const options = (opts || []).map((optText, oIdx) => ({
              key: String.fromCharCode(65 + oIdx),
              text: optText
            }));
            
            const correctKey = String.fromCharCode(65 + (typeof correctIdx === 'number' ? correctIdx : 0));

            return {
              id: idx + 1,
              question_content: qText,
              options,
              correct_answer: correctKey,
              level: level || 'Nhận biết',
              explanation: exp || ''
            };
          });

          return {
            title: tuple[1] || 'Bài tập ôn tập',
            subject: tuple[2],
            grade: tuple[3],
            isSharedLink: true,
            questions: questionsList
          };
        }

        // Version 2 ultra-compact format: { v: 2, t, s, g, q: [{ q, o, a, l, e }] }
        if (parsed && Array.isArray(parsed.q) && parsed.v === 2) {
          const ultra = parsed as UltraCompactQuizPackageV2;
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

        // Version 1 legacy format: { t, s, g, q: [{ i, q, o: [{k, t}], a, l, e }] }
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
