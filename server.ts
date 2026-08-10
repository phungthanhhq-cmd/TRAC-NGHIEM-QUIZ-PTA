import express from 'express';
import path from 'path';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type, Schema } from "@google/genai";

const DEFAULT_MODEL = "gemini-2.5-flash";

// In-memory quiz store (maps short 6-character code to quiz package)
interface QuizStoreItem {
  id: string;
  title: string;
  subject?: string;
  grade?: string;
  questions: any[];
  createdAt: number;
}

const quizStore = new Map<string, QuizStoreItem>();

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
  app.use(express.json({ limit: '20mb' }));

  // API Route: Generate quiz via Gemini server-side (BYOK strictly)
  app.post('/api/generate-quiz', async (req, res) => {
    try {
      const { promptText, fileParts, optionCount, isTrueFalse, userApiKey } = req.body;

      const trimmedKey = typeof userApiKey === 'string' ? userApiKey.trim() : '';

      if (!trimmedKey) {
        return res.status(400).json({ 
          error: '🔑 Bạn chưa kết nối Gemini API.\n\nVui lòng nhập API Key của bạn trước khi tạo câu hỏi.' 
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

      const ai = new GoogleGenAI({ 
        apiKey: trimmedKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build-byok',
          }
        }
      });

      let responseText: string | undefined;
      let lastError: any = null;

      try {
        const response = await ai.models.generateContent({
          model: DEFAULT_MODEL,
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
      } catch (err: any) {
        const errStr = String(err?.message || err);
        if (errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('500') || errStr.includes('503')) {
          console.warn("[Server Proxy] Rate limit/error encountered. Single retry in 2000ms...");
          await new Promise(resolve => setTimeout(resolve, 2000));
          try {
            const retryRes = await ai.models.generateContent({
              model: DEFAULT_MODEL,
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
          } catch (retryErr) {
            lastError = retryErr;
          }
        } else {
          lastError = err;
        }
      }

      if (!responseText) {
        const rawErrStr = typeof lastError === 'string' ? lastError : (lastError?.message || JSON.stringify(lastError || {}));
        
        if (rawErrStr.includes('429') || rawErrStr.includes('RESOURCE_EXHAUSTED')) {
          return res.status(429).json({ 
            error: '⚠️ API Key của bạn đang đạt giới hạn sử dụng tạm thời.\n\nVui lòng:\n• Chờ một lúc rồi thử lại;\n• Kiểm tra hạn mức Gemini API;\n• Hoặc sử dụng API Key khác.' 
          });
        }

        if (rawErrStr.includes('401') || rawErrStr.includes('403') || rawErrStr.includes('PERMISSION_DENIED') || rawErrStr.includes('denied access')) {
          return res.status(403).json({ 
            error: '🔐 API Key không có quyền sử dụng Gemini API hoặc đã bị vô hiệu hóa.' 
          });
        }

        if (rawErrStr.includes('400') || rawErrStr.includes('API_KEY_INVALID') || rawErrStr.includes('API key not valid')) {
          return res.status(400).json({ 
            error: '⚠️ API Key hoặc yêu cầu gửi đến Gemini chưa hợp lệ. Vui lòng kiểm tra lại API Key và cấu hình model.' 
          });
        }

        if (rawErrStr.includes('404') || rawErrStr.includes('NOT_FOUND')) {
          return res.status(404).json({ 
            error: '⚠️ Model Gemini hiện tại không khả dụng hoặc cấu hình API chưa đúng.' 
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

  // API Route: Save quiz and return a short code
  app.post('/api/share', (req, res) => {
    try {
      const { title, questions, subject, grade } = req.body;
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

      if (!trimmedKey) {
        return res.status(400).json({ 
          success: false, 
          message: '🔑 Bạn chưa kết nối Gemini API. Vui lòng nhập API Key của bạn.' 
        });
      }

      const ai = new GoogleGenAI({ 
        apiKey: trimmedKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build-byok',
          }
        }
      });

      const response = await ai.models.generateContent({
        model: DEFAULT_MODEL,
        contents: "Xin chào, hãy phản hồi ngắn gọn 'OK'.",
        config: { temperature: 0.1 }
      });

      if (response && response.text) {
        return res.json({
          success: true,
          message: "🟢 Gemini API: Đã kết nối thành công!",
          model: "Gemini 2.5 Flash"
        });
      } else {
        throw new Error("Phản hồi không chứa nội dung.");
      }
    } catch (err: any) {
      const errStr = String(err?.message || err);

      if (errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED')) {
        return res.status(429).json({
          success: false,
          message: "⚠️ API Key của bạn đang đạt giới hạn sử dụng tạm thời.\n\nVui lòng:\n• Chờ một lúc rồi thử lại;\n• Kiểm tra hạn mức Gemini API;\n• Hoặc sử dụng API Key khác.\n\nChi tiết lỗi từ Google: " + errStr
        });
      }

      if (errStr.includes('401') || errStr.includes('403') || errStr.includes('PERMISSION_DENIED') || errStr.includes('denied access')) {
        return res.status(403).json({
          success: false,
          message: "🔐 API Key không có quyền sử dụng Gemini API hoặc đã bị vô hiệu hóa.\n\nChi tiết lỗi từ Google: " + errStr + "\n\nNguyên nhân phổ biến:\n1. API Key chưa được tạo đúng tại Google AI Studio (aistudio.google.com).\n2. Tài khoản/Project chưa bật Generative Language API.\n3. API Key bị cài đặt giới hạn (Application/HTTP referrer restrictions) chặn truy cập."
        });
      }

      if (errStr.includes('400') || errStr.includes('API_KEY_INVALID') || errStr.includes('API key not valid')) {
        return res.status(400).json({
          success: false,
          message: "⚠️ API Key hoặc yêu cầu gửi đến Gemini chưa hợp lệ. Vui lòng kiểm tra lại mã API Key.\n\nChi tiết lỗi từ Google: " + errStr
        });
      }

      if (errStr.includes('404') || errStr.includes('NOT_FOUND')) {
        return res.status(404).json({
          success: false,
          message: "⚠️ Model Gemini 2.5 Flash hiện tại không khả dụng trên API Key này.\n\nChi tiết lỗi từ Google: " + errStr
        });
      }

      return res.status(500).json({
        success: false,
        message: `⚠️ Lỗi kết nối Gemini API: ${errStr}`
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
