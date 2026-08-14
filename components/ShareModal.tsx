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
  Sparkles,
  RefreshCw,
  Download,
  QrCode,
  Link as LinkIcon,
  Maximize2,
  Minimize2,
  Smartphone,
  MessageSquare,
  AlertCircle
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

// Safe QR Code renderer that guards against "Data too long" error
interface SafeQRProps {
  id?: string;
  value: string;
  size: number;
  level?: 'L' | 'M' | 'Q' | 'H';
}

const SafeQRCode: React.FC<SafeQRProps> = ({ id, value, size, level = 'M' }) => {
  // Max safe length for QR code is ~1000-1200 characters to prevent overflow
  if (!value || value.length > 1200) {
    return (
      <div 
        style={{ width: size, height: size }} 
        className="flex flex-col items-center justify-center bg-slate-50 border border-slate-200 rounded-xl text-center p-3"
      >
        <RefreshCw className="w-6 h-6 text-emerald-600 animate-spin mb-2" />
        <span className="text-[11px] font-medium text-slate-500">Đang tạo mã QR...</span>
      </div>
    );
  }

  try {
    return (
      <QRCodeSVG
        id={id}
        value={value}
        size={size}
        level={level}
        includeMargin={true}
      />
    );
  } catch (err) {
    console.error("QR Code generation error:", err);
    return (
      <div 
        style={{ width: size, height: size }} 
        className="flex flex-col items-center justify-center bg-rose-50 border border-rose-200 rounded-xl text-center p-3 text-rose-600"
      >
        <AlertCircle className="w-6 h-6 mb-1" />
        <span className="text-[11px] font-medium">Không thể tạo QR cho liên kết này</span>
      </div>
    );
  }
};

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
  const [fullShareUrl, setFullShareUrl] = useState<string>('');
  const [shortenedUrl, setShortenedUrl] = useState<string>('');
  const [isShortening, setIsShortening] = useState<boolean>(false);
  const [isFullScreenQR, setIsFullScreenQR] = useState<boolean>(false);

  const quizTitle = lessonName?.trim()
    ? `${subject || 'Môn học'} Lớp ${grade || ''}: ${lessonName.trim()}`
    : `Bài tập ôn tập ${subject || ''} Lớp ${grade || ''}`;

  useEffect(() => {
    if (isOpen && questions && questions.length > 0) {
      let baseOrigin = window.location.origin;
      if (baseOrigin.includes('ais-dev-')) {
        baseOrigin = baseOrigin.replace('ais-dev-', 'ais-pre-');
      }

      const generatedFullUrl = createSelfContainedQuizUrl(
        quizTitle,
        questions,
        subject,
        grade,
        baseOrigin
      );
      setFullShareUrl(generatedFullUrl);

      // Start shortening
      setIsShortening(true);
      setShortenedUrl('');

      // 1. Create immediate server short link if possible as instant fallback
      fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: quizTitle,
          questions,
          subject,
          grade
        })
      })
      .then(res => res.json())
      .then(data => {
        if (data && data.url) {
          // Temporarily set server short URL so QR code can render immediately!
          setShortenedUrl(data.url);
        }
      })
      .catch(() => {})
      .finally(() => {
        // 2. Also fetch permanent TinyURL / is.gd
        shortenUrl(generatedFullUrl).then((short) => {
          if (short) {
            setShortenedUrl(short);
          }
          setIsShortening(false);
        }).catch(() => {
          setIsShortening(false);
        });
      });
    }
  }, [isOpen, quizTitle, questions, subject, grade]);

  if (!isOpen || !questions || questions.length === 0) return null;

  // For QR code: ONLY use short URL (never massive 3KB full URL) to prevent "Data too long"
  const qrCodeUrl = (shortenedUrl && shortenedUrl.length < 1200) ? shortenedUrl : '';

  const handleCopyLink = async (text: string) => {
    const targetUrl = text || fullShareUrl;
    if (!targetUrl) return;
    try {
      await navigator.clipboard.writeText(targetUrl);
      setCopiedTiny(true);
      setTimeout(() => setCopiedTiny(false), 2500);
    } catch (err) {
      console.error("Failed to copy", err);
    }
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

  const downloadQrCode = () => {
    const svg = document.getElementById('quiz-qr-code-svg');
    if (!svg) return;
    try {
      const svgData = new XMLSerializer().serializeToString(svg);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.onload = () => {
        canvas.width = 600;
        canvas.height = 680;
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          ctx.fillStyle = '#1e293b';
          ctx.font = 'bold 22px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(quizTitle.substring(0, 45), 300, 45);

          ctx.fillStyle = '#64748b';
          ctx.font = '16px sans-serif';
          ctx.fillText(`Quét mã để làm bài tập (${questions.length} câu hỏi)`, 300, 75);

          ctx.drawImage(img, 60, 100, 480, 480);

          ctx.fillStyle = '#059669';
          ctx.font = 'bold 15px sans-serif';
          ctx.fillText(shortenedUrl || 'Không giới hạn thời gian & lượt truy cập', 300, 625);

          const pngFile = canvas.toDataURL('image/png');
          const downloadLink = document.createElement('a');
          downloadLink.download = `Ma-QR-${subject || 'Bai-Tap'}.png`;
          downloadLink.href = pngFile;
          downloadLink.click();
        }
      };
      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
    } catch (err) {
      console.error("Failed to download QR", err);
    }
  };

  return (
    <>
      {/* Fullscreen QR Presentation Modal for Classrooms */}
      {isFullScreenQR && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-md z-[60] flex flex-col items-center justify-center p-6 text-white animate-in fade-in">
          <button
            onClick={() => setIsFullScreenQR(false)}
            className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all hover:scale-105"
            title="Thoát toàn màn hình"
          >
            <X className="w-8 h-8" />
          </button>

          <div className="max-w-2xl w-full text-center space-y-6 flex flex-col items-center">
            <div className="space-y-2">
              <span className="bg-emerald-500/20 text-emerald-300 font-bold px-4 py-1.5 rounded-full text-sm border border-emerald-500/30 inline-flex items-center gap-2">
                <Smartphone className="w-4 h-4" /> Mở Camera điện thoại quét mã làm bài
              </span>
              <h2 className="text-3xl font-black tracking-tight text-white">{quizTitle}</h2>
              <p className="text-slate-300 text-base font-medium">Bộ đề ôn tập: {questions.length} câu trắc nghiệm</p>
            </div>

            {/* Huge QR Container */}
            <div className="p-8 bg-white rounded-3xl shadow-2xl border-4 border-emerald-400 max-w-[380px] w-full aspect-square flex items-center justify-center">
              <SafeQRCode
                value={qrCodeUrl}
                size={300}
                level="M"
              />
            </div>

            <div className="space-y-3">
              {shortenedUrl && (
                <div className="bg-white/10 px-6 py-2.5 rounded-2xl border border-white/10 font-mono text-lg font-bold text-emerald-300 tracking-wide">
                  {shortenedUrl}
                </div>
              )}
              <div className="flex items-center justify-center gap-4 pt-2">
                {qrCodeUrl && (
                  <button
                    onClick={downloadQrCode}
                    className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-bold text-sm shadow-lg flex items-center gap-2 transition-all active:scale-95"
                  >
                    <Download className="w-4 h-4" /> Tải ảnh QR Code
                  </button>
                )}
                <button
                  onClick={() => setIsFullScreenQR(false)}
                  className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl font-bold text-sm transition-all"
                >
                  <Minimize2 className="w-4 h-4" /> Thu nhỏ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Dual Share Modal (Link + QR Code) */}
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-5 relative animate-in zoom-in-95 border border-slate-100 max-h-[92vh] overflow-y-auto">
          
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-2xl flex items-center justify-center shadow-md shadow-emerald-500/20">
              <Share2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">Gửi Bài Tập Cho Học Sinh</h3>
              <p className="text-xs text-slate-500">Chọn gửi <strong>Link</strong> (Zalo, tin nhắn) hoặc <strong>Mã QR</strong> (cho HS quét bằng điện thoại)</p>
            </div>
          </div>

          {/* Quiz Summary Info */}
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between text-xs">
            <div className="truncate pr-2">
              <p className="font-bold text-slate-800 text-sm truncate">{quizTitle}</p>
              <p className="text-slate-500 mt-0.5">{questions.length} câu hỏi • Không giới hạn lượt làm & thời gian</p>
            </div>
            <span className="bg-emerald-100 text-emerald-800 font-bold px-2.5 py-1 rounded-full text-[11px] flex items-center gap-1 shrink-0">
              <CheckCircle className="w-3.5 h-3.5" /> Sẵn sàng 100%
            </span>
          </div>

          {/* DUAL OPTION SECTION: LINK & QR CODE SIDE BY SIDE */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* OPTION 1: LINK LÀM BÀI (ZALO / MESSENGER / FACEBOOK) */}
            <div className="flex flex-col justify-between p-4 bg-gradient-to-br from-emerald-50/90 via-teal-50/40 to-emerald-50/90 rounded-2xl border-2 border-emerald-300 shadow-sm space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 font-bold text-xs text-emerald-900">
                    <LinkIcon className="w-4 h-4 text-emerald-600" />
                    Cách 1: Gửi Đường Link
                  </span>
                  <span className="text-[10px] bg-emerald-600 text-white font-bold px-2 py-0.5 rounded-full">
                    Gửi Zalo
                  </span>
                </div>
                <p className="text-[11px] text-emerald-800 leading-snug">
                  Gửi link qua tin nhắn Zalo, Facebook hoặc nhóm lớp. Học sinh bấm vào là làm bài ngay.
                </p>
              </div>

              {/* Link Display Box */}
              <div className="space-y-2">
                <div className="bg-white border border-emerald-300 rounded-xl px-3 py-2.5 text-xs text-slate-800 font-mono font-semibold select-all outline-none truncate shadow-inner">
                  {isShortening && !shortenedUrl ? (
                    <span className="text-slate-400 italic flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" /> Đang tạo link siêu ngắn...
                    </span>
                  ) : shortenedUrl ? (
                    shortenedUrl
                  ) : (
                    fullShareUrl
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCopyLink(shortenedUrl || fullShareUrl)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl font-bold text-xs text-white transition-all shadow-md active:scale-95 ${
                      copiedTiny
                        ? 'bg-emerald-700 shadow-emerald-600/20'
                        : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/25'
                    }`}
                  >
                    {copiedTiny ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copiedTiny ? "Đã sao chép link!" : "Sao chép Link"}
                  </button>

                  {!shortenedUrl && !isShortening && (
                    <button
                      onClick={handleManualShorten}
                      title="Rút gọn lại link"
                      className="p-2.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-xl text-xs font-bold transition-colors"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="pt-1 border-t border-emerald-200/60 flex items-center gap-1.5 text-[10px] text-emerald-700 font-medium">
                <MessageSquare className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Thích hợp gửi vào nhóm chat phụ huynh & học sinh</span>
              </div>
            </div>

            {/* OPTION 2: MÃ QR CODE (QUÉT CAMERA / CHIẾU TRÊN LỚP) */}
            <div className="flex flex-col justify-between p-4 bg-gradient-to-br from-purple-50/90 via-indigo-50/40 to-purple-50/90 rounded-2xl border-2 border-purple-300 shadow-sm space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 font-bold text-xs text-purple-900">
                    <QrCode className="w-4 h-4 text-purple-600" />
                    Cách 2: Quét Mã QR Code
                  </span>
                  <span className="text-[10px] bg-purple-600 text-white font-bold px-2 py-0.5 rounded-full">
                    Quét camera
                  </span>
                </div>
                <p className="text-[11px] text-purple-800 leading-snug">
                  Học sinh dùng camera điện thoại quét mã để mở bài tập trên lớp học.
                </p>
              </div>

              {/* QR Code Container with Safe Rendering */}
              <div className="flex items-center justify-center">
                <div className="p-2 bg-white rounded-2xl shadow-sm border border-purple-200 flex flex-col items-center">
                  <SafeQRCode
                    id="quiz-qr-code-svg"
                    value={qrCodeUrl}
                    size={130}
                    level="M"
                  />
                </div>
              </div>

              {/* QR Actions: Download & Fullscreen */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={downloadQrCode}
                  disabled={!qrCodeUrl}
                  className="flex items-center justify-center gap-1 py-2 px-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-md transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download className="w-3.5 h-3.5" /> Tải ảnh QR
                </button>
                <button
                  onClick={() => setIsFullScreenQR(true)}
                  disabled={!qrCodeUrl}
                  className="flex items-center justify-center gap-1 py-2 px-2.5 bg-white hover:bg-purple-50 text-purple-700 border border-purple-300 rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Maximize2 className="w-3.5 h-3.5" /> Chiếu lên bảng
                </button>
              </div>

              <div className="pt-1 border-t border-purple-200/60 flex items-center gap-1.5 text-[10px] text-purple-700 font-medium">
                <Smartphone className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                <span>Bấm "Chiếu lên bảng" để phóng to mã QR cho cả lớp quét</span>
              </div>
            </div>

          </div>

          {/* Footer Actions */}
          <div className="pt-2 flex flex-col sm:flex-row gap-2 border-t border-slate-100">
            <button
              onClick={() => {
                onClose();
                onOpenStudentView();
              }}
              className="flex-1 py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all active:scale-95"
            >
              <ExternalLink className="w-4 h-4" /> Mở thử giao diện làm bài của Học sinh
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
    </>
  );
};

export default ShareModal;
