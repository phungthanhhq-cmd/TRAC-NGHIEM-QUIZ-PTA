import React, { useState, useEffect } from 'react';
import { 
  Key, ExternalLink, Check, Eye, EyeOff, ShieldCheck, Sparkles, X, 
  RefreshCw, BookOpen, AlertCircle, Trash2, CheckCircle2, HelpCircle
} from 'lucide-react';
import { testGeminiConnection, DEFAULT_MODEL } from '../services/geminiService';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeySaved?: (key: string) => void;
}

export const STORAGE_KEY_USER_API = 'user_gemini_api_key';

export const getUserApiKey = (): string => {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(STORAGE_KEY_USER_API) || sessionStorage.getItem(STORAGE_KEY_USER_API) || '';
};

export const isKeyRemembered = (): boolean => {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem(STORAGE_KEY_USER_API);
};

export const setUserApiKey = (key: string, remember: boolean): void => {
  if (typeof window === 'undefined') return;
  const trimmed = key.trim();
  if (trimmed) {
    if (remember) {
      localStorage.setItem(STORAGE_KEY_USER_API, trimmed);
      sessionStorage.removeItem(STORAGE_KEY_USER_API);
    } else {
      sessionStorage.setItem(STORAGE_KEY_USER_API, trimmed);
      localStorage.removeItem(STORAGE_KEY_USER_API);
    }
  } else {
    clearUserApiKey();
  }
};

export const clearUserApiKey = (): void => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY_USER_API);
  sessionStorage.removeItem(STORAGE_KEY_USER_API);
};

export const maskApiKey = (key: string): string => {
  if (!key) return '';
  if (key.length <= 4) return '****';
  const lastFour = key.slice(-4);
  return `********************${lastFour}`;
};

const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onClose, onKeySaved }) => {
  const [inputKey, setInputKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [rememberOnDevice, setRememberOnDevice] = useState(true);
  const [showGuide, setShowGuide] = useState(false);
  
  // Status & testing state
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; model?: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      const existing = getUserApiKey();
      setInputKey(existing);
      setRememberOnDevice(isKeyRemembered() || !existing); // default true for convenience
      setTestResult(null);
      setIsTesting(false);
      setShowGuide(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentKey = getUserApiKey();
  const isConnected = !!currentKey && testResult?.success !== false;

  const handleTestConnection = async (overrideKey?: string) => {
    const keyToTest = (overrideKey !== undefined ? overrideKey : inputKey).trim();
    if (!keyToTest) {
      setTestResult({
        success: false,
        message: '🔑 Bạn chưa kết nối Gemini API. Vui lòng nhập API Key của bạn trước khi thử nghiệm.'
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    const res = await testGeminiConnection(keyToTest);
    setIsTesting(false);
    setTestResult(res);
  };

  const handleConnectAndSave = async () => {
    const trimmed = inputKey.trim();
    if (!trimmed) {
      setTestResult({
        success: false,
        message: '⚠️ Vui lòng nhập mã API Key Gemini của bạn trước khi kết nối.'
      });
      return;
    }

    if (trimmed.length < 10) {
      setTestResult({
        success: false,
        message: '⚠️ API Key hoặc yêu cầu gửi đến Gemini chưa hợp lệ. Vui lòng kiểm tra lại API Key và cấu hình model.'
      });
      return;
    }

    // Run connection test
    setIsTesting(true);
    setTestResult(null);
    const res = await testGeminiConnection(trimmed);
    setIsTesting(false);
    setTestResult(res);

    if (res.success) {
      setUserApiKey(trimmed, rememberOnDevice);
      if (onKeySaved) onKeySaved(trimmed);
      setTimeout(() => {
        onClose();
      }, 1000);
    }
  };

  const handleClearKey = () => {
    clearUserApiKey();
    setInputKey('');
    setTestResult(null);
    if (onKeySaved) onKeySaved('');
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-5 relative border border-slate-100 max-h-[92vh] overflow-y-auto">
        
        {/* Header Bar */}
        <div className="flex justify-between items-start border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition-all ${
              isConnected && currentKey 
                ? 'bg-emerald-600 text-white shadow-emerald-500/20' 
                : 'bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-amber-500/30'
            }`}>
              <Key className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold text-slate-900">
                  {currentKey ? 'Quản lý Gemini API Key' : '🔐 Kết nối Gemini API'}
                </h3>
                {currentKey ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300/80">
                    🟢 Đã kết nối
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300/80">
                    🔴 Chưa kết nối
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Mô hình BYOK - Mỗi giáo viên tự sử dụng API Key Gemini cá nhân
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Connected Status Card */}
        {currentKey && (
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-700">Trạng thái API Key:</span>
                  <span className="text-xs font-bold text-emerald-700 flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    🟢 Gemini API: Đã kết nối
                  </span>
                </div>
                <div className="text-xs text-slate-600 font-mono">
                  <span className="font-sans font-medium text-slate-500">API Key: </span>
                  <strong className="text-slate-800">{maskApiKey(currentKey)}</strong>
                </div>
                <div className="text-xs text-slate-600">
                  <span className="font-medium text-slate-500">Model mặc định: </span>
                  <strong className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 font-mono">Gemini 3.6 Flash</strong>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleTestConnection(currentKey)}
                  disabled={isTesting}
                  className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl font-bold text-xs transition-all flex items-center gap-1 active:scale-95 disabled:opacity-50"
                  title="Kiểm tra xem API Key này có hoạt động bình thường không"
                >
                  {isTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Kiểm tra kết nối
                </button>
                <button
                  onClick={handleClearKey}
                  className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl font-bold text-xs transition-all flex items-center gap-1 active:scale-95"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Xóa API Key
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Informational BYOK Banner */}
        <div className="p-3.5 bg-blue-50/80 border border-blue-200/80 rounded-2xl text-xs text-blue-900 space-y-1">
          <div className="flex items-center gap-2 font-bold text-blue-800">
            <ShieldCheck className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <span>Cam kết Bảo mật BYOK (Bring Your Own Key):</span>
          </div>
          <p className="leading-relaxed text-blue-800/90 text-[11px]">
            API Key này thuộc tài khoản của bạn và quota sử dụng do Google quản lý. Ứng dụng không sử dụng API Key của người tạo app, không gửi key về server database, không lưu vào source code hay môi trường dùng chung.
          </p>
        </div>

        {/* Input Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-bold text-slate-800">
              {currentKey ? 'Đổi API Key Gemini mới:' : 'Dán API Key Gemini của bạn:'}
            </label>
            <button
              onClick={() => setShowGuide(!showGuide)}
              className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
            >
              <BookOpen className="w-3.5 h-3.5" />
              {showGuide ? 'Ẩn hướng dẫn' : '📖 Hướng dẫn lấy API Key'}
            </button>
          </div>

          <div className="relative flex items-center">
            <input
              type={showKey ? 'text' : 'password'}
              value={inputKey}
              onChange={(e) => {
                setInputKey(e.target.value);
                setTestResult(null);
              }}
              placeholder="Dán mã API Key Gemini của bạn tại đây (ví dụ: AIzaSy...)"
              className="w-full bg-slate-50 border border-slate-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-200 rounded-xl pl-3.5 pr-10 py-2.5 text-xs text-slate-800 font-mono outline-none transition-all"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2 text-slate-400 hover:text-slate-600 p-1.5 rounded-lg text-xs"
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* Device Remember Checkbox */}
          <label className="flex items-center gap-2 cursor-pointer select-none pt-1">
            <input
              type="checkbox"
              checked={rememberOnDevice}
              onChange={(e) => setRememberOnDevice(e.target.checked)}
              className="w-4 h-4 text-amber-600 border-slate-300 rounded focus:ring-amber-500"
            />
            <span className="text-xs font-medium text-slate-700">
              Lưu API Key trên thiết bị này (LocalStorage)
            </span>
          </label>
          <p className="text-[11px] text-slate-500 pl-6">
            {rememberOnDevice 
              ? 'Lưu trữ cục bộ trên trình duyệt của bạn, tự động ghi nhớ cho các lần truy cập sau.' 
              : 'Chỉ giữ API Key trong phiên làm việc hiện tại, sẽ tự động xóa khi tắt trình duyệt.'}
          </p>
        </div>

        {/* Step-by-step Guide Window / Accordion */}
        {showGuide && (
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-500" />
                Hướng dẫn lấy Gemini API Key miễn phí (6 Bước):
              </span>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline bg-white px-2.5 py-1 rounded-lg border border-blue-200 shadow-xs"
              >
                Mở Google AI Studio <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            
            <ol className="list-decimal list-inside text-xs text-slate-700 space-y-1.5 pt-1 font-medium">
              <li><strong>Bước 1:</strong> Đăng nhập tài khoản Google của bạn tại Google AI Studio.</li>
              <li><strong>Bước 2:</strong> Mở mục <strong>API Keys</strong> ở menu bên trái.</li>
              <li><strong>Bước 3:</strong> Bấm <strong>"Create API key"</strong> để tạo mới API Key cho Project của bạn.</li>
              <li><strong>Bước 4:</strong> Sao chép chuỗi mã API Key được tạo (bắt đầu bằng <code>AIzaSy...</code>).</li>
              <li><strong>Bước 5:</strong> Quay lại ứng dụng AI QUIZ-PTA và dán mã API Key vào ô ở trên.</li>
              <li><strong>Bước 6:</strong> Bấm <strong>"Kết nối API"</strong> để hoàn tất thiết lập.</li>
            </ol>

            <div className="p-2.5 bg-amber-50 border border-amber-200/80 rounded-xl text-[11px] text-amber-900 font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span><strong>Cảnh báo bảo mật:</strong> Không chia sẻ API Key của bạn với người khác.</span>
            </div>
          </div>
        )}

        {/* Test Result Message Box */}
        {isTesting && (
          <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs font-medium flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-amber-600 animate-spin" />
            <span>🟡 Đang kiểm tra kết nối với Gemini API (Model: Gemini 3.6 Flash)...</span>
          </div>
        )}

        {testResult && (
          <div className={`p-3.5 rounded-xl border text-xs leading-relaxed whitespace-pre-line font-medium ${
            testResult.success
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}>
            <div className="flex items-start gap-2">
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <p>{testResult.message}</p>
                {testResult.model && (
                  <p className="mt-1 text-[11px] font-bold text-emerald-700">Model hoạt động: {testResult.model}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Bottom Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100 flex-wrap gap-2">
          <button
            onClick={() => handleTestConnection()}
            disabled={isTesting || !inputKey.trim()}
            className="px-3.5 py-2 rounded-xl font-bold text-xs text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all disabled:opacity-50 flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
            Kiểm tra kết nối
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl font-bold text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all"
            >
              Đóng
            </button>
            <button
              onClick={handleConnectAndSave}
              disabled={isTesting || !inputKey.trim()}
              className="px-5 py-2 rounded-xl font-bold text-xs text-white bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 transition-all shadow-md shadow-amber-500/20 active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              Kết nối API
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ApiKeyModal;
