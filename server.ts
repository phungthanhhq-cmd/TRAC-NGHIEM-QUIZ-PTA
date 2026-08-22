import express from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type, Schema } from "@google/genai";

export const DEFAULT_MODEL = "gemini-3.7-flash";
export const CANDIDATE_MODELS = [
  "gemini-3.7-flash",
  "gemini-flash-latest",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash"
];

// In-memory quiz store (maps short 6-character code to quiz package)
interface QuizStoreItem {
  id: string;
  title: string;
  subject?: string;
  grade?: string;
  teacherId?: string;
  questions: any[];
  createdAt: number;
}

const quizStore = new Map<string, QuizStoreItem>();

// Submissions store structure
interface QuestionAnswerDetail {
  questionId: number;
  question: string;
  selectedAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  explanation?: string;
}

interface SubmissionStoreItem {
  id: string;
  teacherId: string;
  teacherEmail?: string;
  quizTitle: string;
  subject?: string;
  grade?: string;
  studentName: string;
  studentClass: string;
  score: number;
  correctCount: number;
  totalCount: number;
  timeSpentSeconds: number;
  submittedAt: number;
  attemptNumber: number;
  answersDetails?: QuestionAnswerDetail[];
}

interface ClassRosterItem {
  id: string;
  teacherId: string;
  teacherEmail?: string;
  className: string;
  studentNames: string[];
  createdAt: number;
  updatedAt: number;
}

const SUBMISSIONS_FILE = path.join(process.cwd(), 'submissions.json');
const CLASS_ROSTERS_FILE = path.join(process.cwd(), 'class_rosters.json');

let submissions: SubmissionStoreItem[] = [];
let classRosters: ClassRosterItem[] = [];

// Load submissions and class rosters from disk on startup
try {
  if (fs.existsSync(SUBMISSIONS_FILE)) {
    const rawData = fs.readFileSync(SUBMISSIONS_FILE, 'utf-8');
    submissions = JSON.parse(rawData);
    if (!Array.isArray(submissions)) {
      submissions = [];
    }
  }
} catch (e) {
  console.warn("Failed to load submissions.json, starting fresh", e);
  submissions = [];
}

try {
  if (fs.existsSync(CLASS_ROSTERS_FILE)) {
    const rawData = fs.readFileSync(CLASS_ROSTERS_FILE, 'utf-8');
    classRosters = JSON.parse(rawData);
    if (!Array.isArray(classRosters)) {
      classRosters = [];
    }
  }
} catch (e) {
  console.warn("Failed to load class_rosters.json, starting fresh", e);
  classRosters = [];
}

function saveSubmissionsToFile() {
  try {
    fs.writeFileSync(SUBMISSIONS_FILE, JSON.stringify(submissions, null, 2), 'utf-8');
  } catch (e) {
    console.error("Failed to write submissions.json", e);
  }
}

function saveClassRostersToFile() {
  try {
    fs.writeFileSync(CLASS_ROSTERS_FILE, JSON.stringify(classRosters, null, 2), 'utf-8');
  } catch (e) {
    console.error("Failed to write class_rosters.json", e);
  }
}

function generateShortCode(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

const SYSTEM_INSTRUCTION = `
Bạn là một giáo viên chuyên gia của Việt Nam, am hiểu sâu sắc Chương trình Giáo dục Phổ thông 2018 (GDPT 2018).
Nhiệm vụ của bạn là tạo ra các câu hỏi trắc nghiệm khách quan từ tài liệu được cung cấp.

YÊU CẦU BẮT BUỘC:
1. Nội dung câu hỏi phải chính xác về mặt kiến thức, phù hợp với Lớp và Môn học được yêu cầu.
2. Phân loại mức độ nhận thức (Bloom) đúng theo cấu hình.
3. Sử dụng định dạng LaTeX cho TẤT CẢ các công thức toán học, đặt trong dấu $ đơn (ví dụ: $x^2$). TUYỆT ĐỐI KHÔNG dùng $$ (hai dấu $).
4. Ngôn ngữ: Tiếng Việt chuẩn mực sư phạm.
`;

const normalizeMathDelimiters = (text: string): string => {
  if (!text) return "";
  let cleaned = text;
  cleaned = cleaned.replace(/\$\$/g, '$');
  cleaned = cleaned.replace(/\\\[/g, '$').replace(/\\\]/g, '$');
  cleaned = cleaned.replace(/\\\(/g, '$').replace(/\\\)/g, '$');
  return cleaned;
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '25mb' }));

  // API Route: Check API readiness & server capabilities
  app.get('/api/status', (req, res) => {
    const hasServerKey = !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0;
    return res.json({
      status: 'ok',
      hasServerKey,
      defaultModel: DEFAULT_MODEL,
      supportedModels: CANDIDATE_MODELS
    });
  });

  // API Route: Student submits quiz result
  app.post('/api/submit-quiz', (req, res) => {
    try {
      const {
        teacherId,
        teacherEmail,
        quizTitle,
        subject,
        grade,
        studentName,
        studentClass,
        score,
        correctCount,
        totalCount,
        timeSpentSeconds,
        answersDetails
      } = req.body;

      const tId = (teacherId && typeof teacherId === 'string') ? teacherId.trim() : 'tea_default';
      const tEmail = (teacherEmail && typeof teacherEmail === 'string') ? teacherEmail.trim().toLowerCase() : '';
      const sName = (studentName && typeof studentName === 'string' && studentName.trim()) 
        ? studentName.trim() 
        : 'Học sinh';
      const sClass = (studentClass && typeof studentClass === 'string') ? studentClass.trim() : '';

      // Count previous attempts for this student on this quiz & teacher
      const previousAttempts = submissions.filter(s => 
        (s.teacherId === tId || (tEmail && s.teacherEmail && s.teacherEmail.toLowerCase() === tEmail)) &&
        s.quizTitle === quizTitle &&
        s.studentName.toLowerCase() === sName.toLowerCase() &&
        (sClass ? s.studentClass.toLowerCase() === sClass.toLowerCase() : true)
      );

      const attemptNumber = previousAttempts.length + 1;

      const newSubmission: SubmissionStoreItem = {
        id: 'sub_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        teacherId: tId,
        teacherEmail: tEmail || undefined,
        quizTitle: quizTitle || 'Bài tập ôn tập',
        subject: subject || '',
        grade: grade || '',
        studentName: sName,
        studentClass: sClass,
        score: typeof score === 'number' ? score : 0,
        correctCount: typeof correctCount === 'number' ? correctCount : 0,
        totalCount: typeof totalCount === 'number' ? totalCount : 0,
        timeSpentSeconds: typeof timeSpentSeconds === 'number' ? timeSpentSeconds : 0,
        submittedAt: Date.now(),
        attemptNumber,
        answersDetails: Array.isArray(answersDetails) ? answersDetails : undefined
      };

      submissions.unshift(newSubmission);
      saveSubmissionsToFile();

      return res.json({ 
        success: true, 
        submissionId: newSubmission.id,
        attemptNumber,
        message: 'Đã nộp bài thành công!'
      });
    } catch (err: any) {
      console.error('Error in /api/submit-quiz:', err);
      return res.status(500).json({ error: 'Lỗi khi lưu kết quả bài làm' });
    }
  });

  // API Route: Teacher retrieves submission records filtered strictly by their teacherId or teacherEmail
  app.get('/api/teacher-submissions', (req, res) => {
    try {
      const { teacherId, teacherEmail } = req.query;
      const tId = typeof teacherId === 'string' ? teacherId.trim() : '';
      const tEmail = typeof teacherEmail === 'string' ? teacherEmail.trim().toLowerCase() : '';

      if (!tId && !tEmail) {
        return res.status(400).json({ error: 'Thiếu mã định danh giáo viên hoặc email' });
      }

      // Filter submissions belonging to this teacher by ID or by Gmail
      const teacherSubs = submissions.filter(s => {
        if (tId && s.teacherId === tId) return true;
        if (tEmail && s.teacherEmail && s.teacherEmail.toLowerCase() === tEmail) return true;
        if (s.teacherId === 'tea_default' || !s.teacherId) return true;
        return false;
      });

      return res.json({ submissions: teacherSubs });
    } catch (err) {
      console.error('Error fetching teacher submissions:', err);
      return res.status(500).json({ error: 'Lỗi khi lấy danh sách kết quả học sinh' });
    }
  });

  // API Route: Delete single or clear all submissions for a teacher
  app.delete('/api/teacher-submissions/:id', (req, res) => {
    try {
      const { id } = req.params;
      const { teacherId, teacherEmail } = req.query;
      const tId = typeof teacherId === 'string' ? teacherId.trim() : '';
      const tEmail = typeof teacherEmail === 'string' ? teacherEmail.trim().toLowerCase() : '';

      if (!tId && !tEmail) {
        return res.status(400).json({ error: 'Thiếu mã định danh giáo viên' });
      }

      const isTeacherMatch = (s: SubmissionStoreItem) => {
        if (tId && s.teacherId === tId) return true;
        if (tEmail && s.teacherEmail && s.teacherEmail.toLowerCase() === tEmail) return true;
        return false;
      };

      if (id === 'clear-all') {
        submissions = submissions.filter(s => !isTeacherMatch(s));
      } else {
        submissions = submissions.filter(s => !(s.id === id && isTeacherMatch(s)));
      }
      saveSubmissionsToFile();

      return res.json({ success: true });
    } catch (err) {
      console.error('Error deleting submission:', err);
      return res.status(500).json({ error: 'Lỗi khi xóa kết quả' });
    }
  });

  // API Route: Get class rosters for a teacher
  app.get('/api/class-rosters', (req, res) => {
    try {
      const { teacherId, teacherEmail } = req.query;
      const tId = typeof teacherId === 'string' ? teacherId.trim() : '';
      const tEmail = typeof teacherEmail === 'string' ? teacherEmail.trim().toLowerCase() : '';

      const matched = classRosters.filter(r => {
        if (tId && r.teacherId === tId) return true;
        if (tEmail && r.teacherEmail && r.teacherEmail.toLowerCase() === tEmail) return true;
        return false;
      });

      return res.json({ rosters: matched });
    } catch (err) {
      console.error('Error fetching class rosters:', err);
      return res.status(500).json({ error: 'Lỗi khi lấy danh sách lớp' });
    }
  });

  // API Route: Save or update a class roster
  app.post('/api/class-rosters', (req, res) => {
    try {
      const { id, teacherId, teacherEmail, className, studentNames } = req.body;
      const tId = (teacherId && typeof teacherId === 'string') ? teacherId.trim() : 'tea_default';
      const tEmail = (teacherEmail && typeof teacherEmail === 'string') ? teacherEmail.trim().toLowerCase() : '';
      const cName = (className && typeof className === 'string') ? className.trim() : '';
      const names = Array.isArray(studentNames) 
        ? studentNames.map((n: string) => String(n).trim()).filter((n: string) => n.length > 0)
        : [];

      if (!cName) {
        return res.status(400).json({ error: 'Tên lớp không được để trống' });
      }

      const existingIdx = classRosters.findIndex(r => 
        (id && r.id === id) || 
        (r.className.toLowerCase() === cName.toLowerCase() && (r.teacherId === tId || (tEmail && r.teacherEmail === tEmail)))
      );

      const rosterItem: ClassRosterItem = {
        id: id || ('ros_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6)),
        teacherId: tId,
        teacherEmail: tEmail || undefined,
        className: cName,
        studentNames: names,
        createdAt: existingIdx >= 0 ? classRosters[existingIdx].createdAt : Date.now(),
        updatedAt: Date.now()
      };

      if (existingIdx >= 0) {
        classRosters[existingIdx] = rosterItem;
      } else {
        classRosters.push(rosterItem);
      }

      saveClassRostersToFile();
      return res.json({ success: true, roster: rosterItem });
    } catch (err) {
      console.error('Error saving class roster:', err);
      return res.status(500).json({ error: 'Lỗi khi lưu danh sách lớp' });
    }
  });

  // API Route: Delete a class roster
  app.delete('/api/class-rosters/:id', (req, res) => {
    try {
      const { id } = req.params;
      classRosters = classRosters.filter(r => r.id !== id);
      saveClassRostersToFile();
      return res.json({ success: true });
    } catch (err) {
      console.error('Error deleting class roster:', err);
      return res.status(500).json({ error: 'Lỗi khi xóa danh sách lớp' });
    }
  });

  // API Route: Generate quiz via Gemini server-side
  app.post('/api/generate-quiz', async (req, res) => {
    try {
      const { promptText, fileParts, optionCount, isTrueFalse, userApiKey } = req.body;

      const trimmedUserKey = typeof userApiKey === 'string' ? userApiKey.trim() : '';
      const serverEnvKey = (process.env.GEMINI_API_KEY || '').trim();

      // Determine keys to attempt (User key first, then Server environment key as fallback)
      const keysToTry: string[] = [];
      if (trimmedUserKey) keysToTry.push(trimmedUserKey);
      if (serverEnvKey && !keysToTry.includes(serverEnvKey)) keysToTry.push(serverEnvKey);

      if (keysToTry.length === 0) {
        return res.status(400).json({ 
          error: '🔑 Bạn chưa kết nối Gemini API.\n\nVui lòng mở mục "Cấu hình Gemini API" và nhập API Key của bạn để bắt đầu tạo câu hỏi.' 
        });
      }

      const optCount = optionCount || 4;
      const optionKeys = Array.from({ length: optCount }, (_, i) => String.fromCharCode(65 + i));

      const dynamicQuizSchema: Schema = {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.INTEGER },
            question_content: { type: Type.STRING },
            options: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  key: { type: Type.STRING, enum: optionKeys },
                  text: { type: Type.STRING }
                },
                required: ["key", "text"]
              }
            },
            correct_answer: { type: Type.STRING, enum: optionKeys },
            level: { type: Type.STRING },
          },
          required: ["id", "question_content", "options", "correct_answer", "level"]
        }
      };

      let responseText: string | undefined;
      let lastError: any = null;

      // Outer loop: Try available API keys
      for (const currentKey of keysToTry) {
        const ai = new GoogleGenAI({ apiKey: currentKey });

        // Inner loop: Try candidate models
        for (const targetModel of CANDIDATE_MODELS) {
          try {
            const response = await ai.models.generateContent({
              model: targetModel,
              contents: {
                parts: [...(fileParts || []), { text: promptText }]
              },
              config: {
                systemInstruction: SYSTEM_INSTRUCTION,
                responseMimeType: "application/json",
                responseSchema: dynamicQuizSchema,
                temperature: 0.4,
              }
            });
            responseText = response.text;
            if (responseText) break;
          } catch (err: any) {
            lastError = err;
            const errStr = String(err?.message || err);
            
            // Retry on transient rate limit/server error
            if (errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('500') || errStr.includes('503')) {
              console.warn(`[Server] Rate limit/error with ${targetModel}. Retrying in 1.5s...`);
              await new Promise(resolve => setTimeout(resolve, 1500));
              try {
                const retryRes = await ai.models.generateContent({
                  model: targetModel,
                  contents: {
                    parts: [...(fileParts || []), { text: promptText }]
                  },
                  config: {
                    systemInstruction: SYSTEM_INSTRUCTION,
                    responseMimeType: "application/json",
                    responseSchema: dynamicQuizSchema,
                    temperature: 0.4,
                  }
                });
                responseText = retryRes.text;
                if (responseText) break;
              } catch (retryErr) {
                lastError = retryErr;
              }
            } else if (errStr.includes('404') || errStr.includes('NOT_FOUND')) {
              continue; // try next candidate model
            } else {
              break; // break candidate models for this key if 403 / permission issue, try next key
            }
          }
        }

        if (responseText) break;
      }

      if (!responseText) {
        const rawErrStr = typeof lastError === 'string' ? lastError : (lastError?.message || JSON.stringify(lastError || {}));
        
        if (rawErrStr.includes('429') || rawErrStr.includes('RESOURCE_EXHAUSTED')) {
          return res.status(429).json({ 
            error: '⚠️ Hạn mức API Gemini đang quá tải tạm thời.\n\nVui lòng:\n• Chờ 10-20 giây rồi bấm "Thử lại ngay";\n• Hoặc vào mục "Cấu hình Gemini API" để đổi API Key khác.' 
          });
        }

        if (rawErrStr.includes('401') || rawErrStr.includes('403') || rawErrStr.includes('PERMISSION_DENIED') || rawErrStr.includes('denied access')) {
          return res.status(403).json({ 
            error: '🔐 Quyền truy cập API Key bị từ chối (403 Permission Denied).\n\nNguyên nhân & Khắc phục:\n1. Dự án Google Cloud của bạn chưa kích hoạt Generative Language API hoặc bị khóa quyền.\n2. Khắc phục: Hãy truy cập aistudio.google.com/app/apikey -> Bấm "Create API key in new project" để lấy mã API Key mới hoàn toàn miễn phí và dán lại vào mục "Cấu hình Gemini API".' 
          });
        }

        if (rawErrStr.includes('400') || rawErrStr.includes('API_KEY_INVALID') || rawErrStr.includes('API key not valid')) {
          return res.status(400).json({ 
            error: '⚠️ Mã API Key Gemini không hợp lệ.\n\nVui lòng kiểm tra lại mã đã sao chép từ Google AI Studio.' 
          });
        }

        return res.status(500).json({ error: `Không thể tạo câu hỏi từ Gemini AI: ${rawErrStr}` });
      }

      const rawQuestions = JSON.parse(responseText);

      const questions = rawQuestions.map((q: any) => {
        let processedOptions = q.options.map((opt: any) => ({
          ...opt,
          text: normalizeMathDelimiters(opt.text)
        }));

        let correctAnswerKey = q.correct_answer;

        if (!isTrueFalse) {
          const optionsWithFlag = processedOptions.map((opt: any) => ({
            ...opt,
            isCorrect: opt.key === q.correct_answer
          }));

          for (let i = optionsWithFlag.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [optionsWithFlag[i], optionsWithFlag[j]] = [optionsWithFlag[j], optionsWithFlag[i]];
          }

          processedOptions = optionsWithFlag.map((opt: any, index: number) => {
            const newKey = String.fromCharCode(65 + index);
            if (opt.isCorrect) {
              correctAnswerKey = newKey;
            }
            return {
              key: newKey,
              text: opt.text
            };
          });
        }

        return {
          ...q,
          question_content: normalizeMathDelimiters(q.question_content),
          options: processedOptions,
          correct_answer: correctAnswerKey
        };
      });

      return res.json({ questions });
    } catch (err: any) {
      console.error('Error generating quiz on server:', err);
      return res.status(500).json({ error: err.message || 'Lỗi khi tạo câu hỏi từ AI.' });
    }
  });

  // API Route: Shorten URL using TinyURL / is.gd
  app.post('/api/shorten-url', async (req, res) => {
    try {
      const { url } = req.body;
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'URL không hợp lệ' });
      }

      // Try TinyURL first
      try {
        const tinyRes = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`);
        if (tinyRes.ok) {
          const shortUrl = await tinyRes.text();
          if (shortUrl && shortUrl.startsWith('http')) {
            return res.json({ shortUrl: shortUrl.trim() });
          }
        }
      } catch (e) {
        console.warn("TinyURL failed, trying is.gd...", e);
      }

      // Try is.gd fallback
      try {
        const isgdRes = await fetch(`https://is.gd/create.php?format=json&url=${encodeURIComponent(url)}`);
        if (isgdRes.ok) {
          const data = (await isgdRes.json()) as any;
          if (data && data.shorturl) {
            return res.json({ shortUrl: data.shorturl });
          }
        }
      } catch (e) {
        console.warn("is.gd failed...", e);
      }

      return res.status(500).json({ error: 'Không thể rút gọn link lúc này' });
    } catch (err: any) {
      console.error('Error in /api/shorten-url:', err);
      return res.status(500).json({ error: err?.message || 'Lỗi rút gọn link' });
    }
  });

  // API Route: Save quiz and return a short code
  app.post('/api/share', (req, res) => {
    try {
      const { title, questions, subject, grade, teacherId } = req.body;
      if (!questions || !Array.isArray(questions) || questions.length === 0) {
        return res.status(400).json({ error: 'Nội dung bộ câu hỏi không hợp lệ' });
      }

      let code = generateShortCode();
      while (quizStore.has(code)) {
        code = generateShortCode();
      }

      const item: QuizStoreItem = {
        id: code,
        title: title || 'Bài tập trắc nghiệm',
        subject,
        grade,
        teacherId,
        questions,
        createdAt: Date.now()
      };

      quizStore.set(code, item);

      return res.json({ code, id: code });
    } catch (err) {
      console.error('Error saving shared quiz:', err);
      return res.status(500).json({ error: 'Không thể lưu bộ câu hỏi' });
    }
  });

  // API Route: Get quiz by short code
  app.get('/api/share/:code', (req, res) => {
    const { code } = req.params;
    const quiz = quizStore.get(code);

    if (!quiz) {
      return res.status(404).json({ error: 'Không tìm thấy bộ câu hỏi hoặc liên kết đã hết hạn' });
    }

    return res.json(quiz);
  });

  // API Route: Test user provided Gemini API key
  app.post('/api/test-key', async (req, res) => {
    try {
      const { userApiKey } = req.body;
      const trimmedKey = typeof userApiKey === 'string' ? userApiKey.trim() : '';

      const keyToTest = trimmedKey || (process.env.GEMINI_API_KEY || '').trim();

      if (!keyToTest) {
        return res.status(400).json({ 
          success: false, 
          message: '🔑 Bạn chưa kết nối Gemini API. Vui lòng nhập API Key của bạn.' 
        });
      }

      const ai = new GoogleGenAI({ apiKey: keyToTest });

      let lastError: any = null;
      for (const targetModel of CANDIDATE_MODELS) {
        try {
          const response = await ai.models.generateContent({
            model: targetModel,
            contents: "Xin chào, hãy phản hồi 'OK'.",
            config: { temperature: 0.1 }
          });

          if (response && response.text) {
            return res.json({
              success: true,
              message: "🟢 Gemini API: Đã kết nối thành công và sẵn sàng tạo câu hỏi!",
              model: targetModel
            });
          }
        } catch (err: any) {
          lastError = err;
          const errStr = String(err?.message || err);
          if (errStr.includes('404') || errStr.includes('NOT_FOUND')) {
            continue;
          }
          break;
        }
      }

      const errStr = String(lastError?.message || lastError || '');

      if (errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED')) {
        return res.status(429).json({
          success: false,
          message: "⚠️ API Key của bạn đang đạt giới hạn sử dụng tạm thời.\n\nVui lòng chờ 10-30 giây hoặc sử dụng một API Key mới từ Google AI Studio."
        });
      }

      if (errStr.includes('401') || errStr.includes('403') || errStr.includes('PERMISSION_DENIED') || errStr.includes('denied access')) {
        return res.status(403).json({
          success: false,
          message: "🔐 Lỗi 403: Google Cloud Project của API Key này bị từ chối truy cập (Permission Denied).\n\n💡 Cách khắc phục nhanh trong 1 phút:\n1. Mở trang: aistudio.google.com/app/apikey\n2. Bấm 'Create API key' và chọn 'Create API key in new project' (Tạo trong dự án mới).\n3. Sao chép mã AIzaSy... mới và dán vào đây để sử dụng miễn phí không giới hạn."
        });
      }

      if (errStr.includes('400') || errStr.includes('API_KEY_INVALID') || errStr.includes('API key not valid')) {
        return res.status(400).json({
          success: false,
          message: "⚠️ Mã API Key chưa đúng định dạng. Vui lòng kiểm tra lại chuỗi mã đã copy."
        });
      }

      return res.status(500).json({
        success: false,
        message: `⚠️ Lỗi kết nối: ${errStr}`
      });
    } catch (outerErr: any) {
      return res.status(500).json({
        success: false,
        message: `⚠️ Lỗi hệ thống khi kiểm tra API Key: ${outerErr?.message || outerErr}`
      });
    }
  });

  // Serve Vite in development mode or Static files in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

