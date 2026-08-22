import { GoogleGenAI, Type, Schema } from "@google/genai";
import { QuizConfig, QuizQuestion } from "../types";
import { extractTextFromDocx } from "../utils/fileProcessor";

export const DEFAULT_MODEL = "gemini-3.7-flash";
export const CANDIDATE_MODELS = [
  "gemini-3.7-flash",
  "gemini-flash-latest",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash"
];

const SYSTEM_INSTRUCTION = `
Bạn là một giáo viên chuyên gia của Việt Nam, am hiểu sâu sắc Chương trình Giáo dục Phổ thông 2018 (GDPT 2018).
Nhiệm vụ của bạn là tạo ra các câu hỏi trắc nghiệm khách quan từ tài liệu được cung cấp.

YÊU CẦU BẮT BUỘC:
1. Nội dung câu hỏi phải chính xác về mặt kiến thức, phù hợp với Lớp và Môn học được yêu cầu.
2. Phân loại mức độ nhận thức (Bloom) đúng theo cấu hình.
3. Sử dụng định dạng LaTeX cho TẤT CẢ các công thức toán học, đặt trong dấu $ đơn (ví dụ: $x^2$). TUYỆT ĐỐI KHÔNG dùng $$ (hai dấu $).
4. Ngôn ngữ: Tiếng Việt chuẩn mực sư phạm.
`;

/**
 * Helper function to normalize LaTeX delimiters.
 * Ensures all math blocks use single $ delimiters for compatibility.
 */
const normalizeMathDelimiters = (text: string): string => {
  if (!text) return "";
  let cleaned = text;
  cleaned = cleaned.replace(/\$\$/g, '$');
  cleaned = cleaned.replace(/\\\[/g, '$').replace(/\\\]/g, '$');
  cleaned = cleaned.replace(/\\\(/g, '$').replace(/\\\)/g, '$');
  return cleaned;
};

/**
 * Utility to get current user API key from browser storage (localStorage or sessionStorage)
 */
export const getActiveUserApiKey = (): string => {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('user_gemini_api_key') || sessionStorage.getItem('user_gemini_api_key') || '';
};

/**
 * Checks server status and whether a system API key is configured.
 */
export const checkServerApiStatus = async (): Promise<{ status: string; hasServerKey: boolean; defaultModel: string }> => {
  try {
    const res = await fetch('/api/status');
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    // ignore
  }
  return { status: 'offline', hasServerKey: false, defaultModel: DEFAULT_MODEL };
};

/**
 * Tests Gemini API Connection with user provided key or server key.
 */
export const testGeminiConnection = async (apiKey?: string): Promise<{ success: boolean; message: string; model?: string }> => {
  const trimmed = apiKey?.trim() || '';

  // Try testing via backend API route
  try {
    const res = await fetch('/api/test-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userApiKey: trimmed })
    });

    const data = await res.json();
    if (data && typeof data.success === 'boolean') {
      return data;
    }
  } catch (apiErr) {
    console.warn("Server API key test unavailable, trying client-side test...", apiErr);
  }

  if (!trimmed) {
    return {
      success: false,
      message: "🔑 Chưa cấu hình API Key. Vui lòng nhập mã API Key của bạn."
    };
  }

  // Direct client test fallback
  let lastErr: any = null;
  for (const targetModel of CANDIDATE_MODELS) {
    try {
      const ai = new GoogleGenAI({ apiKey: trimmed });

      const response = await ai.models.generateContent({
        model: targetModel,
        contents: "Xin chào, hãy phản hồi 'OK'.",
        config: { temperature: 0.1 }
      });

      if (response && response.text) {
        return {
          success: true,
          message: "🟢 Gemini API: Đã kết nối thành công và sẵn sàng tạo câu hỏi!",
          model: targetModel
        };
      }
    } catch (err: any) {
      lastErr = err;
      const errStr = String(err?.message || err);
      if (errStr.includes('404') || errStr.includes('NOT_FOUND')) {
        continue;
      }
      break;
    }
  }

  const errStr = String(lastErr?.message || lastErr || '');

  if (errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED')) {
    return {
      success: false,
      message: "⚠️ API Key của bạn đang đạt giới hạn sử dụng tạm thời. Vui lòng chờ vài giây rồi thử lại."
    };
  }

  if (errStr.includes('401') || errStr.includes('403') || errStr.includes('PERMISSION_DENIED') || errStr.includes('denied access')) {
    return {
      success: false,
      message: "🔐 Lỗi 403 (Permission Denied): Dự án Google Cloud của API Key này bị giới hạn quyền truy cập.\n\n💡 Cách khắc phục nhanh trong 1 phút:\n1. Mở trang aistudio.google.com/app/apikey\n2. Bấm 'Create API key' và chọn 'Create API key in new project'.\n3. Copy mã AIzaSy... mới và dán vào đây."
    };
  }

  return {
    success: false,
    message: `⚠️ Lỗi kết nối Gemini API: ${errStr}`
  };
};

/**
 * Generates Quiz questions using server API proxy with auto-fallback to client SDK.
 */
export const generateQuizFromContent = async (
  files: File[],
  config: QuizConfig,
  customApiKey?: string
): Promise<QuizQuestion[]> => {
  const userApiKey = (customApiKey !== undefined ? customApiKey : getActiveUserApiKey()).trim();

  const optionCount = config.optionCount || 4;
  const optionKeys = Array.from({ length: optionCount }, (_, i) => String.fromCharCode(65 + i));

  // Prepare file payload
  const fileParts = await Promise.all(
    files.map(async (file) => {
      if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const textContent = await extractTextFromDocx(file);
        return {
          text: `--- NỘI DUNG TỪ FILE WORD: ${file.name} ---\n${textContent}\n--- HẾT FILE WORD ---`
        };
      } 
      
      return new Promise<any>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64String = (reader.result as string).split(',')[1];
          resolve({
            inlineData: {
              data: base64String,
              mimeType: file.type
            }
          });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    })
  );

  const levels = config.bloomLevels.length > 0 ? config.bloomLevels.join(", ") : "Tổng hợp";
  const isTrueFalse = config.optionCount === 2 && config.isTrueFalse;
  const optionInstruction = isTrueFalse 
    ? `Số đáp án mỗi câu: 2 đáp án (A và B).
    ĐẶC BIỆT YÊU CẦU DẠNG ĐÚNG/SAI:
    - Nội dung câu hỏi (question_content) phải là một mệnh đề khẳng định.
    - Đáp án A bắt buộc text là "Đúng".
    - Đáp án B bắt buộc text là "Sai".
    - correct_answer là "A" nếu mệnh đề đúng, và "B" nếu mệnh đề sai.`
    : `Số đáp án mỗi câu: ${optionCount} đáp án (từ ${optionKeys[0]} đến ${optionKeys[optionKeys.length - 1]}).`;

  const lessonInfo = config.lessonName?.trim() ? `\nTÊN BÀI HỌC / CHỦ ĐỀ ÔN TẬP: "${config.lessonName.trim()}"` : '';

  const promptText = `
    Hãy tạo ${config.questionCount} câu hỏi trắc nghiệm để học sinh ôn tập.
    Môn học: ${config.subject}.
    Lớp: ${config.grade}${config.level ? ` (${config.level})` : ''}.${lessonInfo}
    Mức độ nhận thức (Bloom): ${levels}.
    ${optionInstruction}
    
    ${config.lessonName?.trim() ? `LƯU Ý: Các câu hỏi phải bám sát chương trình học và nội dung bài học "${config.lessonName.trim()}".` : ''}
    ${fileParts.length > 0 || config.sourceText ? `Hãy phân tích nội dung từ các hình ảnh/tài liệu đính kèm hoặc văn bản dưới đây để tạo câu hỏi bám sát kiến thức:` : ''}
    ${config.sourceText ? `\nĐOẠN VĂN BẢN/NỘI DUNG NGUỒN TỪ NGƯỜI DÙNG:\n${config.sourceText}\n\n` : ''}
    Trả về kết quả dưới dạng JSON thuần túy.
  `;

  // 1. Primary path: Server-side API proxy route (handles user key + server key fallback securely)
  try {
    const res = await fetch('/api/generate-quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        promptText,
        fileParts,
        optionCount,
        isTrueFalse,
        userApiKey
      })
    });

    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.questions)) {
        return data.questions as QuizQuestion[];
      }
    } else {
      const errData = await res.json().catch(() => ({}));
      if (errData.error) {
        throw new Error(errData.error);
      }
    }
  } catch (apiErr: any) {
    if (apiErr?.message && !apiErr.message.includes('Failed to fetch')) {
      throw apiErr;
    }
    console.warn("Server API proxy unreachable, attempting client-side fallback...", apiErr);
  }

  // 2. Client-side SDK fallback if user has entered an API key
  if (!userApiKey) {
    throw new Error("🔑 Bạn chưa kết nối Gemini API.\n\nVui lòng mở mục 'Cấu hình Gemini API' và nhập API Key của bạn để tiếp tục.");
  }

  const ai = new GoogleGenAI({ apiKey: userApiKey });

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

  const processResponse = (responseText: string | undefined): QuizQuestion[] => {
    if (!responseText) throw new Error("Thành phần trả về bị rỗng.");
    
    try {
      const questions = JSON.parse(responseText) as QuizQuestion[];
      
      return questions.map(q => {
        let processedOptions = q.options.map(opt => ({
          ...opt,
          text: normalizeMathDelimiters(opt.text)
        }));

        let correctAnswerKey = q.correct_answer;

        if (!isTrueFalse) {
          const optionsWithFlag = processedOptions.map(opt => ({
            ...opt,
            isCorrect: opt.key === q.correct_answer
          }));

          for (let i = optionsWithFlag.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [optionsWithFlag[i], optionsWithFlag[j]] = [optionsWithFlag[j], optionsWithFlag[i]];
          }

          processedOptions = optionsWithFlag.map((opt, index) => {
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
    } catch (e) {
      console.error("JSON Parse Error:", e);
      throw new Error("AI trả về định dạng không hợp lệ. Vui lòng thử lại.");
    }
  };

  let responseText: string | undefined;
  let lastClientError: any = null;

  for (const targetModel of CANDIDATE_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model: targetModel,
        contents: {
          parts: [...fileParts, { text: promptText }]
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
      lastClientError = err;
      const errStr = String(err?.message || err);
      if (errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('500') || errStr.includes('503')) {
        await new Promise(res => setTimeout(res, 1500));
        try {
          const responseRetry = await ai.models.generateContent({
            model: targetModel,
            contents: {
              parts: [...fileParts, { text: promptText }]
            },
            config: {
              systemInstruction: SYSTEM_INSTRUCTION,
              responseMimeType: "application/json",
              responseSchema: dynamicQuizSchema,
              temperature: 0.4,
            }
          });
          responseText = responseRetry.text;
          if (responseText) break;
        } catch (retryErr) {
          lastClientError = retryErr;
        }
      } else if (errStr.includes('404') || errStr.includes('NOT_FOUND')) {
        continue;
      } else {
        break;
      }
    }
  }

  if (responseText) {
    return processResponse(responseText);
  }

  const rawErrStr = typeof lastClientError === 'string' ? lastClientError : (lastClientError?.message || JSON.stringify(lastClientError || {}));

  if (rawErrStr.includes('401') || rawErrStr.includes('403') || rawErrStr.includes('PERMISSION_DENIED') || rawErrStr.includes('denied access')) {
    throw new Error("🔐 Lỗi 403 (Permission Denied): Dự án Google Cloud của API Key này bị từ chối truy cập.\n\n💡 Cách khắc phục nhanh:\nVui lòng tạo 1 API Key mới tại aistudio.google.com/app/apikey (chọn 'Create API key in new project') và dán vào mục Cấu hình.");
  }

  if (rawErrStr.includes('429') || rawErrStr.includes('RESOURCE_EXHAUSTED')) {
    throw new Error("⚠️ Hạn mức API đang tạm thời bận. Vui lòng chờ 10-20 giây rồi thử lại.");
  }

  if (rawErrStr.includes('400') || rawErrStr.includes('API_KEY_INVALID') || rawErrStr.includes('API key not valid')) {
    throw new Error("⚠️ API Key không hợp lệ. Vui lòng kiểm tra lại chuỗi mã API Key.");
  }

  throw new Error(`Không thể tạo câu hỏi từ Gemini AI: ${rawErrStr}`);
};

