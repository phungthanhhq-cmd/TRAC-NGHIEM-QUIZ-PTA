import React, { useState, useEffect } from 'react';
import { QuizQuestion } from '../types';
import { createSelfContainedQuizUrl } from '../utils/shareUtils';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Share2, 
  Copy, 
  Check, 
  ExternalLink, 
  X, 
  CheckCircle, 
  Sparkles,
  Download,
  QrCode,
  Link as LinkIcon,
  Maximize2,
  Minimize2,
  Smartphone,
  MessageSquare,
  ShieldCheck,
  Globe,
  Settings2,
  Info
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
  const [copiedLink, setCopiedLink] = useState(false);
  const [shareUrl, setShareUrl] = useState<string>('');
  const [isFullScreenQR, setIsFullScreenQR] = useState<boolean>(false);
  const [customDomain, setCustomDomain] = useState<string>('');
  const [showDomainEdit, setShowDomainEdit] = useState<boolean>(false);

  const quizTitle = lessonName?.trim()
    ? `${subject || 'Môn học'} Lớp ${grade || ''}: ${lessonName.trim()}`
    : `Bài tập ôn tập ${subject || ''} Lớp ${grade || ''}`;

  useEffect(() => {
    if (isOpen && questions && questions.length > 0) {
      let baseOrigin = window.location.origin;
      // Convert internal dev url to public shared preview if applicable
      if (baseOrigin.includes('ais-dev-')) {
        baseOrigin = baseOrigin.replace('ais-dev-', 'ais-pre-');
      }

      setCustomDomain(baseOrigin);

      const generatedUrl = createSelfContainedQuizUrl(
        quizTitle,
        questions,
        subject,
        grade,
        baseOrigin
      );
      setShareUrl(generatedUrl);
    }
  }, [isOpen, quizTitle, questions, subject, grade]);

  // If teacher changes their domain (e.g. typing their Vercel domain: https://trac-nghiem-pta.vercel.app)
  const handleDomainUpdate = (newDomain: string) => {
    let clean = newDomain.trim();
    if (clean && !clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = 'https://' + clean;
    }
    setCustomDomain(clean);
    const updatedUrl = createSelfContainedQuizUrl(
      quizTitle,
      questions,
      subject,
      grade,
      clean
    );
    setShareUrl(updatedUrl);
  };

  if (!isOpen || !questions || questions.length === 0) return null;

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch (err) {
      console.error("Failed to copy", err);
    }
  };

  const downloadQrCode = () => {
    const svg = document.getElementById('native-quiz-qr-svg');
    if (!svg) return;
    try {
      const svgData = new XMLSerializer().serializeToString(svg);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.onload = () => {
        canvas.width = 600;
        canvas.height = 700;
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // Header
          ctx.fillStyle = '#0f172a';
          ctx.font = 'bold 22px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(quizTitle.substring(0, 42), 300, 45);

          // Subtitle
          ctx.fillStyle = '#64748b';
          ctx.font = '16px sans-serif';
          ctx.fillText(`Quét camera để vào làm bài (${questions.length} câu hỏi trắc nghiệm)`, 300, 75);

          // QR in center
          ctx.drawImage(img, 50, 100, 500, 500);

          // Footer info
          ctx.fillStyle = '#059669';
          ctx.font = 'bold 15px sans-serif';
          ctx.fillText('✓ Tương thích 100% Zalo • Messenger • Safari • Chrome • iOS • Android', 300, 640);
          ctx.fillStyle = '#94a3b8';
          ctx.font = '13px sans-serif';
          ctx.fillText('Không giới hạn thời gian & lượt truy cập', 300, 665);

          const pngFile = canvas.toDataURL('image/png');
          const downloadLink = document.createElement('a');
          downloadLink.download = `Ma-QR-Bai-Tap-${subject || 'PTA'}.png`;
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
      {/* Fullscreen Classroom Projection View */}
      {isFullScreenQR && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-md z-[60] flex flex-col items-center justify-center p-6 text-white animate-in fade-in">
          <button
            onClick={() => setIsFullScreenQR(false)}
            className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all hover:scale-105"
            title="Thoát"
          >
            <X className="w-8 h-8" />
          </button>

          <div className="max-w-2xl w-full text-center space-y-6 flex flex-col items-center">
            <div className="space-y-2">
              <span className="bg-emerald-500/20 text-emerald-300 font-bold px-4 py-1.5 rounded-full text-sm border border-emerald-500/30 inline-flex items-center gap-2">
                <Smartphone className="w-4 h-4" /> Mở Camera điện thoại hoặc Zalo quét mã làm bài
              </span>
              <h2 className="text-3xl font-black tracking-tight text-white">{quizTitle}</h2>
              <p className="text-slate-300 text-base font-medium">Bộ đề ôn tập: {questions.length} câu trắc nghiệm</p>
            </div>

            {/* Giant QR */}
            <div className="p-6 bg-white rounded-3xl shadow-2xl border-4 border-emerald-400 max-w-[380px] w-full aspect-square flex items-center justify-center">
              <QRCodeSVG
                value={shareUrl || 'https://giaoviendoimoi.com'}
                size={320}
                level="L"
                includeMargin={false}
              />
            </div>

            <div className="flex items-center justify-center gap-4 pt-2">
              <button
                onClick={downloadQrCode}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-bold text-sm shadow-lg flex items-center gap-2 transition-all active:scale-95"
              >
                <Download className="w-4 h-4" /> Tải ảnh QR Code (.png)
              </button>
              <button
                onClick={() => setIsFullScreenQR(false)}
                className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl font-bold text-sm transition-all"
              >
                <Minimize2 className="w-4 h-4" /> Thu nhỏ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Dual Share Modal */}
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-4 relative animate-in zoom-in-95 border border-slate-100 max-h-[92vh] overflow-y-auto">
          
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
              <p className="text-xs text-slate-500">
                Chuẩn hóa 100% — Mở trực tiếp trên <strong>Zalo, Messenger, iPhone, Android, Máy tính</strong>
              </p>
            </div>
          </div>

          {/* Quiz Summary Badge */}
          <div className="p-3 bg-emerald-50/70 rounded-2xl border border-emerald-200/80 flex items-center justify-between text-xs">
            <div className="truncate pr-2">
              <p className="font-bold text-emerald-950 text-sm truncate">{quizTitle}</p>
              <p className="text-emerald-700 mt-0.5 font-medium">{questions.length} câu hỏi • Không giới hạn lượt nộp & thời gian</p>
            </div>
            <span className="bg-emerald-600 text-white font-bold px-3 py-1 rounded-full text-[11px] flex items-center gap-1 shrink-0 shadow-xs">
              <ShieldCheck className="w-3.5 h-3.5" /> Chuẩn Zalo & Web
            </span>
          </div>

          {/* DUAL OPTIONS: DIRECT LINK & QR CODE */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* OPTION 1: LINK TRỰC TIẾP CHUẨN ZALO */}
            <div className="flex flex-col justify-between p-4 bg-gradient-to-br from-blue-50/70 via-slate-50 to-blue-50/70 rounded-2xl border-2 border-blue-200 shadow-sm space-y-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 font-bold text-xs text-blue-950">
                    <LinkIcon className="w-4 h-4 text-blue-600" />
                    Cách 1: Gửi Đường Link
                  </span>
                  <span className="text-[10px] bg-blue-600 text-white font-bold px-2 py-0.5 rounded-full">
                    Gửi Zalo / SMS
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 leading-snug">
                  Đường link chuẩn của trang web, Zalo & Facebook không bao giờ chặn cảnh báo lừa đảo.
                </p>
              </div>

              {/* URL Box */}
              <div className="space-y-2">
                <div className="bg-white border border-blue-200 rounded-xl px-3 py-2 text-xs text-slate-700 font-mono select-all outline-none truncate shadow-inner">
                  {shareUrl || 'Đang tạo liên kết...'}
                </div>

                <button
                  onClick={handleCopy}
                  className={`w-full flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl font-bold text-xs text-white transition-all shadow-md active:scale-95 ${
                    copiedLink
                      ? 'bg-emerald-600 shadow-emerald-600/20'
                      : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/25'
                  }`}
                >
                  {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copiedLink ? "Đã sao chép link!" : "Sao chép Link gửi HS"}
                </button>
              </div>

              <div className="pt-1 border-t border-slate-200 flex items-center gap-1.5 text-[10px] text-slate-500 font-medium">
                <MessageSquare className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>Dán gửi vào nhóm chat Zalo, Messenger, Teams</span>
              </div>
            </div>

            {/* OPTION 2: MÃ QR CODE */}
            <div className="flex flex-col justify-between p-4 bg-gradient-to-br from-purple-50/70 via-slate-50 to-purple-50/70 rounded-2xl border-2 border-purple-200 shadow-sm space-y-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 font-bold text-xs text-purple-950">
                    <QrCode className="w-4 h-4 text-purple-600" />
                    Cách 2: Quét Mã QR Code
                  </span>
                  <span className="text-[10px] bg-purple-600 text-white font-bold px-2 py-0.5 rounded-full">
                    Quét camera
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 leading-snug">
                  Học sinh dùng camera điện thoại hoặc Zalo quét mã để làm bài trên lớp.
                </p>
              </div>

              {/* QR Display */}
              <div className="flex items-center justify-center">
                <div className="p-2 bg-white rounded-2xl shadow-sm border border-purple-200">
                  <QRCodeSVG
                    id="native-quiz-qr-svg"
                    value={shareUrl || 'https://giaoviendoimoi.com'}
                    size={120}
                    level="L"
                    includeMargin={true}
                  />
                </div>
              </div>

              {/* QR Actions */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={downloadQrCode}
                  className="flex items-center justify-center gap-1 py-2 px-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-md transition-all active:scale-95"
                >
                  <Download className="w-3.5 h-3.5" /> Tải ảnh QR
                </button>
                <button
                  onClick={() => setIsFullScreenQR(true)}
                  className="flex items-center justify-center gap-1 py-2 px-2 bg-white hover:bg-purple-50 text-purple-700 border border-purple-300 rounded-xl text-xs font-bold transition-all active:scale-95"
                >
                  <Maximize2 className="w-3.5 h-3.5" /> Chiếu lên bảng
                </button>
              </div>

              <div className="pt-1 border-t border-slate-200 flex items-center gap-1.5 text-[10px] text-purple-700 font-medium">
                <Smartphone className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                <span>Mọi dòng máy iPhone, Samsung, Xiaomi đều quét được</span>
              </div>
            </div>

          </div>

          {/* Vercel / Domain Configuration Toggle */}
          <div className="border-t border-slate-100 pt-3">
            <button
              onClick={() => setShowDomainEdit(!showDomainEdit)}
              className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1 transition-colors"
            >
              <Settings2 className="w-3.5 h-3.5" /> Tùy chỉnh tên miền Vercel / Website riêng của bạn (nếu có)
            </button>

            {showDomainEdit && (
              <div className="mt-2 p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2 animate-in fade-in">
                <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                  <Globe className="w-3.5 h-3.5 text-slate-500" /> Tên miền Website của bạn (Ví dụ: https://trac-nghiem-pta.vercel.app):
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customDomain}
                    onChange={(e) => handleDomainUpdate(e.target.value)}
                    placeholder="https://ten-ung-dung-cua-ban.vercel.app"
                    className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500"
                  />
                </div>
                <p className="text-[10px] text-slate-400">
                  Hệ thống đang tự động nhận diện tên miền máy chủ hiện tại. Nếu bạn đã triển khai lên Vercel, bạn có thể dán link Vercel vào đây để tạo link rút gọn theo tên miền của bạn.
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="pt-1 flex flex-col sm:flex-row gap-2 border-t border-slate-100">
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
