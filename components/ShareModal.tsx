import React, { useState, useEffect } from 'react';
import { QuizQuestion } from '../types';
import { createSelfContainedQuizUrl, shortenUrl } from '../utils/shareUtils';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Share2, 
  Copy, 
  Check, 
  ExternalLink, 
  X, 
  CheckCircle, 
  Globe, 
  Zap, 
  QrCode, 
  Smartphone, 
  HelpCircle,
  Sparkles,
  RefreshCw,
  Download
} from 'lucide-react';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  questions: QuizQuestion[];
  subject?: string;
  grade?: string;
  lessonName?: string;
  onOpenStudentView: () => void;
}

const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  questions,
  subject,
  grade,
  lessonName,
  onOpenStudentView
}) => {
  const [copiedTiny, setCopiedTiny] = useState(false);
  const [copiedFull, setCopiedFull] = useState(false);
  const [fullShareUrl, setFullShareUrl] = useState<string>('');
  const [shortenedUrl, setShortenedUrl] = useState<string>('');
  const [isShortening, setIsShortening] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'link' | 'qr'>('link');
  const [targetDomain, setTargetDomain] = useState<string>('');

  const quizTitle = lessonName?.trim()
    ? `${subject || 'Môn học'} Lớp ${grade || ''}: ${lessonName.trim()}`
    : `Bài tập ôn tập ${subject || ''} Lớp ${grade || ''}`;

  useEffect(() => {
    if (isOpen && questions && questions.length > 0) {
      // Determine default best target domain (replace ais-dev- with ais-pre- for public safety)
      let baseOrigin = window.location.origin;
      if (baseOrigin.includes('ais-dev-')) {
        baseOrigin = baseOrigin.replace('ais-dev-', 'ais-pre-');
      }

      setTargetDomain(baseOrigin);

      const generatedFullUrl = createSelfContainedQuizUrl(
        quizTitle,
        questions,
        subject,
        grade,
        baseOrigin
      );
      setFullShareUrl(generatedFullUrl);

      // Automatically generate short URL
      setIsShortening(true);
      setShortenedUrl('');
      shortenUrl(generatedFullUrl).then((short) => {
        if (short) {
          setShortenedUrl(short);
        }
        setIsShortening(false);
      }).catch(() => {
        setIsShortening(false);
      });
    }
  }, [isOpen, quizTitle, questions, subject, grade]);

  // If user changes target domain (e.g. typing their Vercel URL)
  const handleDomainChange = (newDomain: string) => {
    setTargetDomain(newDomain);
    const updatedUrl = createSelfContainedQuizUrl(
      quizTitle,
      questions,
      subject,
      grade,
      newDomain.trim()
    );
    setFullShareUrl(updatedUrl);
    setShortenedUrl('');
  };

  const handleManualShorten = async () => {
    if (!fullShareUrl) return;
    setIsShortening(true);
    try {
      const short = await shortenUrl(fullShareUrl);
      if (short) {
        setShortenedUrl(short);
      }
    } catch (e) {
      console.error("Manual shorten error:", e);
    } finally {
      setIsShortening(false);
    }
  };

  if (!isOpen || !questions || questions.length === 0) return null;

  const handleCopy = async (text: string, type: 'tiny' | 'full') => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'tiny') {
        setCopiedTiny(true);
        setTimeout(() => setCopiedTiny(false), 2500);
      } else {
        setCopiedFull(true);
        setTimeout(() => setCopiedFull(false), 2500);
      }
    } catch (err) {
      console.error("Failed to copy", err);
    }
  };

  const downloadQrCode = () => {
    const svg = document.getElementById('quiz-qr-code');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width + 40;
      canvas.height = img.height + 40;
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 20, 20);
        const pngFile = canvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        downloadLink.download = `QR-BaiTap-${subject || 'Quiz'}.png`;
        downloadLink.href = pngFile;
        downloadLink.click();
      }
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  const effectiveStudentUrl = shortenedUrl || fullShareUrl;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-4 relative animate-in zoom-in-95 border border-slate-100 max-h-[90vh] overflow-y-auto">
        
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-2xl flex items-center justify-center shadow-inner">
            <Share2 className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900">Xuất Link Làm Bài Cho Học Sinh</h3>
            <p className="text-xs text-slate-500">Link siêu ngắn, mở được trên mọi thiết bị và không bao giờ hết hạn</p>
          </div>
        </div>

        {/* Quiz Quick Info */}
        <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between text-xs">
          <div className="truncate pr-2">
            <p className="font-bold text-slate-800 text-sm truncate">{quizTitle}</p>
            <p className="text-slate-500 mt-0.5">{questions.length} câu hỏi trắc nghiệm</p>
          </div>
          <span className="bg-emerald-100 text-emerald-800 font-bold px-2.5 py-1 rounded-full text-[11px] flex items-center gap-1 shrink-0">
            <CheckCircle className="w-3.5 h-3.5" /> Sẵn sàng
          </span>
        </div>

        {/* Tabs: Link vs QR */}
        <div className="flex border-b border-slate-100 pb-1 gap-2">
          <button
            onClick={() => setActiveTab('link')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-colors ${
              activeTab === 'link'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-500" /> Link Siêu Ngắn & Đầy Đủ
          </button>
          <button
            onClick={() => setActiveTab('qr')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-colors ${
              activeTab === 'qr'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <QrCode className="w-3.5 h-3.5 text-purple-600" /> Mã QR Cho Lớp Học
          </button>
        </div>

        {activeTab === 'link' ? (
          <div className="space-y-3.5">
            {/* Box 1: Short Link (Recommended) */}
            <div className="p-4 bg-gradient-to-br from-emerald-50 via-teal-50/50 to-emerald-50 rounded-2xl border-2 border-emerald-300 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-900">
                  <Sparkles className="w-4 h-4 text-emerald-600 fill-emerald-500" />
                  <span>Link Siêu Ngắn (Gửi Zalo / Facebook / Tin nhắn):</span>
                </div>
                <span className="text-[10px] bg-emerald-600 text-white font-bold px-2 py-0.5 rounded-full shadow-xs">
                  Khuyên dùng
                </span>
              </div>

              <p className="text-[11px] text-emerald-800 leading-relaxed">
                Đã được rút gọn siêu ngắn, học sinh chỉ cần 1 chạm là vào làm bài ngay lập tức trên điện thoại, máy tính.
              </p>

              <div className="flex items-center gap-2 pt-1">
                <div className="flex-1 bg-white border border-emerald-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 font-mono font-medium select-all outline-none truncate shadow-inner">
                  {isShortening ? (
                    <span className="text-slate-400 italic flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" /> Đang tạo link siêu ngắn...
                    </span>
                  ) : shortenedUrl ? (
                    shortenedUrl
                  ) : (
                    <span className="text-slate-400">Chưa tạo link ngắn, bấm Tạo lại</span>
                  )}
                </div>

                {shortenedUrl ? (
                  <button
                    onClick={() => handleCopy(shortenedUrl, 'tiny')}
                    className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-xs text-white transition-all shadow-md active:scale-95 flex-shrink-0 ${
                      copiedTiny
                        ? 'bg-emerald-700 shadow-emerald-600/20'
                        : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/25'
                    }`}
                  >
                    {copiedTiny ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copiedTiny ? "Đã chép" : "Sao chép"}
                  </button>
                ) : (
                  <button
                    onClick={handleManualShorten}
                    disabled={isShortening}
                    className="flex items-center gap-1 px-3 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md active:scale-95 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isShortening ? 'animate-spin' : ''}`} />
                    Tạo lại
                  </button>
                )}
              </div>
            </div>

            {/* Box 2: Full Self-contained Link (Permanent Fallback) */}
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-blue-600" />
                  Link Gốc Đầy Đủ (Không bao giờ hết hạn):
                </label>
                <span className="text-[10px] text-slate-500 bg-slate-200/80 px-2 py-0.5 rounded-md font-mono">
                  Tự chứa đề thi
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-normal">
                Toàn bộ câu hỏi đã được nén trực tiếp vào đường link. Hoạt động 100% vĩnh viễn không cần lưu máy chủ.
              </p>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-[11px] text-slate-600 font-mono select-all outline-none truncate">
                  {fullShareUrl}
                </div>
                <button
                  onClick={() => handleCopy(fullShareUrl, 'full')}
                  className={`flex items-center gap-1 px-3 py-2 rounded-xl font-bold text-xs transition-all flex-shrink-0 border ${
                    copiedFull
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {copiedFull ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedFull ? "Đã chép" : "Sao chép"}
                </button>
              </div>
            </div>

            {/* Explanatory Box for Why it previously gave 404/Expired error */}
            <div className="p-3 bg-amber-50/80 rounded-2xl border border-amber-200 text-xs text-amber-900 space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-amber-800">
                <HelpCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span>Tại sao trước đây học sinh bấm vào link lại bị báo "Hết hạn"?</span>
              </div>
              <div className="text-[11px] text-amber-800/90 leading-relaxed pl-5 space-y-1">
                <p>
                  • <strong>Nguyên nhân:</strong> Trước đây đường link sử dụng mã lưu tạm thời trong bộ nhớ máy chủ. Khi bạn triển khai sang Vercel hoặc khi máy chủ khởi động lại, bộ nhớ tạm bị xóa nên học sinh mở link sẽ báo không tìm thấy.
                </p>
                <p>
                  • <strong>Đã khắc phục:</strong> Hiện tại hệ thống đã tự động nén toàn bộ câu hỏi trực tiếp vào link và tạo <strong>Link Siêu Ngắn TinyURL</strong>. Học sinh mở bất cứ lúc nào, trên bất kỳ thiết bị nào cũng sẽ làm bài 100% thành công!
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* QR Code Tab */
          <div className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
            <div className="p-4 bg-white rounded-2xl shadow-sm border border-slate-200">
              <QRCodeSVG
                id="quiz-qr-code"
                value={effectiveStudentUrl || 'https://giaoviendoimoi.com'}
                size={180}
                level="M"
                includeMargin={true}
              />
            </div>
            <div className="text-center space-y-1">
              <p className="text-xs font-bold text-slate-800">Quét mã QR để vào làm bài</p>
              <p className="text-[11px] text-slate-500">Chiếu lên máy chiếu trong lớp hoặc gửi ảnh QR cho học sinh</p>
            </div>
            <button
              onClick={downloadQrCode}
              className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-md transition-all active:scale-95"
            >
              <Download className="w-3.5 h-3.5" /> Tải ảnh QR Code (.png)
            </button>
          </div>
        )}

        {/* Footer Actions */}
        <div className="pt-2 flex flex-col sm:flex-row gap-2 border-t border-slate-100">
          <button
            onClick={() => {
              onClose();
              onOpenStudentView();
            }}
            className="flex-1 py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all active:scale-95"
          >
            <ExternalLink className="w-4 h-4" /> Thử giao diện làm bài của Học sinh
          </button>
          <button
            onClick={onClose}
            className="py-2.5 px-4 border border-slate-200 text-slate-700 rounded-xl font-semibold text-xs hover:bg-slate-50 transition-colors"
          >
            Đóng
          </button>
        </div>

      </div>
    </div>
  );
};

export default ShareModal;
