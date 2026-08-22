import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { StudentSubmission, ClassRoster } from '../types';
import { getTeacherId, getTeacherEmail, setTeacherEmail } from '../utils/shareUtils';
import MathRenderer from './MathRenderer';
import { 
  Users, 
  Award, 
  FileSpreadsheet, 
  RefreshCw, 
  Search, 
  Filter, 
  Trash2, 
  X, 
  CheckCircle2, 
  Clock, 
  GraduationCap, 
  ShieldCheck, 
  TrendingUp,
  AlertCircle,
  Mail,
  UserCheck,
  UserX,
  Plus,
  BookOpen,
  Eye,
  Copy,
  Check,
  Edit3,
  ListOrdered,
  Layers,
  ChevronRight,
  ClipboardCopy
} from 'lucide-react';

interface StudentSubmissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const StudentSubmissionsModal: React.FC<StudentSubmissionsModalProps> = ({
  isOpen,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'submissions' | 'classTracking' | 'manageRosters'>('submissions');
  const [submissions, setSubmissions] = useState<StudentSubmission[]>([]);
  const [rosters, setRosters] = useState<ClassRoster[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Teacher Email State
  const [currentTeacherEmail, setCurrentTeacherEmail] = useState<string>(() => getTeacherEmail());
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [emailInput, setEmailInput] = useState('');

  // Submissions Filters
  const [selectedQuiz, setSelectedQuiz] = useState<string>('all');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  // Detail View of a single submission
  const [viewingDetailSubmission, setViewingDetailSubmission] = useState<StudentSubmission | null>(null);

  // Class Tracking Filters
  const [trackingQuiz, setTrackingQuiz] = useState<string>('');
  const [trackingClass, setTrackingClass] = useState<string>('');
  const [trackingSubTab, setTrackingSubTab] = useState<'done' | 'notDone'>('done');
  const [copiedNotDone, setCopiedNotDone] = useState(false);

  // Manage Roster Form
  const [editingRosterId, setEditingRosterId] = useState<string | null>(null);
  const [newClassName, setNewClassName] = useState('');
  const [rawStudentNamesText, setRawStudentNamesText] = useState('');
  const [isSavingRoster, setIsSavingRoster] = useState(false);

  const teacherId = useMemo(() => getTeacherId(), []);

  // Fetch Submissions
  const fetchSubmissions = async (isBackground = false) => {
    if (!isBackground) {
      setIsLoading(true);
      setError(null);
    }
    try {
      const email = getTeacherEmail();
      const res = await fetch(`/api/teacher-submissions?teacherId=${encodeURIComponent(teacherId)}&teacherEmail=${encodeURIComponent(email)}`);
      if (!res.ok) {
        throw new Error('Không thể tải danh sách kết quả học sinh');
      }
      const data = await res.json();
      setSubmissions(data.submissions || []);
    } catch (err: any) {
      if (!isBackground) {
        console.error('Error fetching submissions:', err);
        setError(err.message || 'Lỗi khi tải dữ liệu');
      }
    } finally {
      if (!isBackground) {
        setIsLoading(false);
      }
    }
  };

  // Fetch Class Rosters
  const fetchRosters = async () => {
    try {
      const email = getTeacherEmail();
      const res = await fetch(`/api/class-rosters?teacherId=${encodeURIComponent(teacherId)}&teacherEmail=${encodeURIComponent(email)}`);
      if (res.ok) {
        const data = await res.json();
        setRosters(data.rosters || []);
      }
    } catch (err) {
      console.error('Error fetching rosters:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      const email = getTeacherEmail();
      setCurrentTeacherEmail(email);
      fetchSubmissions(false);
      fetchRosters();

      const interval = setInterval(() => {
        fetchSubmissions(true);
      }, 6000);

      return () => clearInterval(interval);
    }
  }, [isOpen, teacherId]);

  // Unique list of quizzes and classes for filter dropdowns
  const quizTitles = useMemo(() => {
    const set = new Set<string>();
    submissions.forEach(s => {
      if (s.quizTitle) set.add(s.quizTitle);
    });
    return Array.from(set);
  }, [submissions]);

  // Auto select default quiz and class for tracking if not set
  useEffect(() => {
    if (quizTitles.length > 0 && !trackingQuiz) {
      setTrackingQuiz(quizTitles[0]);
    }
  }, [quizTitles, trackingQuiz]);

  const classList = useMemo(() => {
    const set = new Set<string>();
    submissions.forEach(s => {
      if (s.studentClass) set.add(s.studentClass);
    });
    rosters.forEach(r => {
      if (r.className) set.add(r.className);
    });
    return Array.from(set).sort();
  }, [submissions, rosters]);

  useEffect(() => {
    if (classList.length > 0 && !trackingClass) {
      setTrackingClass(classList[0]);
    }
  }, [classList, trackingClass]);

  // Filtered submissions
  const filteredSubmissions = useMemo(() => {
    return submissions.filter(s => {
      const matchQuiz = selectedQuiz === 'all' || s.quizTitle === selectedQuiz;
      const matchClass = selectedClass === 'all' || s.studentClass === selectedClass;
      const matchSearch = !searchTerm.trim() || 
        s.studentName.toLowerCase().includes(searchTerm.toLowerCase().trim()) ||
        (s.studentClass && s.studentClass.toLowerCase().includes(searchTerm.toLowerCase().trim()));
      return matchQuiz && matchClass && matchSearch;
    });
  }, [submissions, selectedQuiz, selectedClass, searchTerm]);

  // Global Statistics
  const stats = useMemo(() => {
    const totalCount = filteredSubmissions.length;
    if (totalCount === 0) {
      return {
        uniqueStudents: 0,
        totalSubmissions: 0,
        avgScore: 0,
        maxScore: 0,
        minScore: 0,
        passRate: 0
      };
    }

    const uniqueStudentsSet = new Set<string>();
    let totalScore = 0;
    let max = -1;
    let min = 11;
    let passCount = 0;

    filteredSubmissions.forEach(s => {
      uniqueStudentsSet.add(`${s.studentName.toLowerCase()}_${(s.studentClass || '').toLowerCase()}`);
      totalScore += s.score;
      if (s.score > max) max = s.score;
      if (s.score < min) min = s.score;
      if (s.score >= 5.0) passCount++;
    });

    return {
      uniqueStudents: uniqueStudentsSet.size,
      totalSubmissions: totalCount,
      avgScore: Math.round((totalScore / totalCount) * 10) / 10,
      maxScore: max === -1 ? 0 : max,
      minScore: min === 11 ? 0 : min,
      passRate: Math.round((passCount / totalCount) * 100)
    };
  }, [filteredSubmissions]);

  // Class Tracking Analysis (Đã làm vs Chưa làm)
  const classTrackingAnalysis = useMemo(() => {
    if (!trackingClass) {
      return {
        rosterStudents: [],
        doneStudents: [],
        notDoneStudents: [],
        totalRoster: 0,
        doneCount: 0,
        notDoneCount: 0,
        doneRate: 0,
        avgScore: 0
      };
    }

    // Find roster for this class
    const roster = rosters.find(r => r.className.toLowerCase() === trackingClass.toLowerCase());
    const rosterNames = roster ? roster.studentNames : [];

    // Find submissions for this class and quiz
    const classSubs = submissions.filter(s => {
      const matchClass = s.studentClass && s.studentClass.toLowerCase() === trackingClass.toLowerCase();
      const matchQuiz = !trackingQuiz || s.quizTitle === trackingQuiz;
      return matchClass && matchQuiz;
    });

    // Map highest score per student
    const studentSubmissionMap = new Map<string, StudentSubmission>();
    classSubs.forEach(sub => {
      const cleanName = sub.studentName.trim().toLowerCase();
      const existing = studentSubmissionMap.get(cleanName);
      if (!existing || sub.score > existing.score) {
        studentSubmissionMap.set(cleanName, sub);
      }
    });

    const doneStudents: {
      name: string;
      submission?: StudentSubmission;
      score: number;
      correctCount: number;
      totalCount: number;
      timeSpentSeconds: number;
      submittedAt: number;
      attemptNumber: number;
    }[] = [];

    const notDoneStudents: string[] = [];

    if (rosterNames.length > 0) {
      rosterNames.forEach(name => {
        const cleanName = name.trim().toLowerCase();
        const sub = studentSubmissionMap.get(cleanName);
        if (sub) {
          doneStudents.push({
            name,
            submission: sub,
            score: sub.score,
            correctCount: sub.correctCount,
            totalCount: sub.totalCount,
            timeSpentSeconds: sub.timeSpentSeconds,
            submittedAt: sub.submittedAt,
            attemptNumber: sub.attemptNumber
          });
        } else {
          notDoneStudents.push(name);
        }
      });

      // Also append students who submitted but were not in official roster
      classSubs.forEach(sub => {
        const cleanName = sub.studentName.trim().toLowerCase();
        const isInRoster = rosterNames.some(rn => rn.trim().toLowerCase() === cleanName);
        if (!isInRoster && !doneStudents.some(d => d.name.toLowerCase() === cleanName)) {
          doneStudents.push({
            name: sub.studentName,
            submission: sub,
            score: sub.score,
            correctCount: sub.correctCount,
            totalCount: sub.totalCount,
            timeSpentSeconds: sub.timeSpentSeconds,
            submittedAt: sub.submittedAt,
            attemptNumber: sub.attemptNumber
          });
        }
      });
    } else {
      // If no official roster saved, all submitted students are "done"
      classSubs.forEach(sub => {
        const cleanName = sub.studentName.trim().toLowerCase();
        if (!doneStudents.some(d => d.name.toLowerCase() === cleanName)) {
          doneStudents.push({
            name: sub.studentName,
            submission: sub,
            score: sub.score,
            correctCount: sub.correctCount,
            totalCount: sub.totalCount,
            timeSpentSeconds: sub.timeSpentSeconds,
            submittedAt: sub.submittedAt,
            attemptNumber: sub.attemptNumber
          });
        }
      });
    }

    const totalRoster = rosterNames.length > 0 ? rosterNames.length : doneStudents.length;
    const doneCount = doneStudents.length;
    const notDoneCount = notDoneStudents.length;
    const doneRate = totalRoster > 0 ? Math.round((doneCount / totalRoster) * 100) : 0;
    const avgScore = doneCount > 0 
      ? Math.round((doneStudents.reduce((acc, s) => acc + s.score, 0) / doneCount) * 10) / 10
      : 0;

    return {
      rosterStudents: rosterNames,
      doneStudents,
      notDoneStudents,
      totalRoster,
      doneCount,
      notDoneCount,
      doneRate,
      avgScore
    };
  }, [trackingClass, trackingQuiz, rosters, submissions]);

  // Handle Save Roster
  const handleSaveRoster = async () => {
    if (!newClassName.trim()) {
      alert('Vui lòng nhập tên lớp (ví dụ: 12A1, 10A3...)');
      return;
    }

    const names = rawStudentNamesText
      .split('\n')
      .map(n => n.replace(/^[0-9]+[.\-)\s]+/, '').trim()) // remove leading numbers like "1. ", "2 - "
      .filter(n => n.length > 0);

    if (names.length === 0) {
      alert('Vui lòng nhập danh sách học sinh (mỗi dòng một tên)');
      return;
    }

    setIsSavingRoster(true);
    try {
      const email = getTeacherEmail();
      const res = await fetch('/api/class-rosters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingRosterId || undefined,
          teacherId,
          teacherEmail: email,
          className: newClassName.trim(),
          studentNames: names
        })
      });

      if (res.ok) {
        setNewClassName('');
        setRawStudentNamesText('');
        setEditingRosterId(null);
        await fetchRosters();
        setActiveTab('classTracking');
        setTrackingClass(newClassName.trim());
      } else {
        alert('Lỗi khi lưu danh sách lớp');
      }
    } catch (err) {
      console.error('Error saving roster:', err);
      alert('Lỗi kết nối máy chủ');
    } finally {
      setIsSavingRoster(false);
    }
  };

  // Handle Edit Roster
  const handleEditRoster = (roster: ClassRoster) => {
    setEditingRosterId(roster.id);
    setNewClassName(roster.className);
    setRawStudentNamesText(roster.studentNames.join('\n'));
    setActiveTab('manageRosters');
  };

  // Handle Delete Roster
  const handleDeleteRoster = async (id: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa danh sách lớp này?')) return;
    try {
      const res = await fetch(`/api/class-rosters/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setRosters(prev => prev.filter(r => r.id !== id));
      }
    } catch (err) {
      console.error('Error deleting roster:', err);
    }
  };

  // Copy List of Not Done Students to paste into Zalo
  const handleCopyNotDone = async () => {
    if (classTrackingAnalysis.notDoneStudents.length === 0) return;
    const text = `📢 THÔNG BÁO BÀI TẬP: ${trackingQuiz || 'Trắc nghiệm'}\nLớp: ${trackingClass}\n\nDanh sách các bạn CHƯA NỘP BÀI (${classTrackingAnalysis.notDoneStudents.length} bạn):\n` +
      classTrackingAnalysis.notDoneStudents.map((name, idx) => `${idx + 1}. ${name}`).join('\n') +
      `\n\n👉 Các em khẩn trương hoàn thành bài tập theo link cô/thầy đã gửi nhé!`;

    try {
      await navigator.clipboard.writeText(text);
      setCopiedNotDone(true);
      setTimeout(() => setCopiedNotDone(false), 2500);
    } catch (e) {
      console.error(e);
    }
  };

  // Handle Teacher Email Update
  const handleSaveTeacherEmail = () => {
    const clean = emailInput.trim().toLowerCase();
    if (clean) {
      setTeacherEmail(clean);
      setCurrentTeacherEmail(clean);
      setIsEditingEmail(false);
      fetchSubmissions(false);
      fetchRosters();
    }
  };

  // Handle Export Excel (Submissions or Class Tracking)
  const handleExportExcel = () => {
    if (activeTab === 'classTracking') {
      // Export Class Roster Tracking
      const doneData = classTrackingAnalysis.doneStudents.map((s, idx) => {
        const dateStr = new Date(s.submittedAt).toLocaleString('vi-VN');
        return {
          "STT": idx + 1,
          "Họ và tên": s.name,
          "Lớp": trackingClass,
          "Bài làm": trackingQuiz,
          "Trạng thái": "Đã nộp",
          "Điểm số (Thang 10)": s.score,
          "Số câu đúng": `${s.correctCount}/${s.totalCount}`,
          "Thời gian làm": `${Math.floor(s.timeSpentSeconds / 60)}p ${s.timeSpentSeconds % 60}s`,
          "Lần nộp": `Lần ${s.attemptNumber || 1}`,
          "Ngày giờ nộp": dateStr
        };
      });

      const notDoneData = classTrackingAnalysis.notDoneStudents.map((name, idx) => ({
        "STT": doneData.length + idx + 1,
        "Họ và tên": name,
        "Lớp": trackingClass,
        "Bài làm": trackingQuiz,
        "Trạng thái": "CHƯA NỘP",
        "Điểm số (Thang 10)": "---",
        "Số câu đúng": "---",
        "Thời gian làm": "---",
        "Lần nộp": "---",
        "Ngày giờ nộp": "---"
      }));

      const fullData = [...doneData, ...notDoneData];
      const ws = XLSX.utils.json_to_sheet(fullData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `Lop_${trackingClass}`);
      XLSX.writeFile(wb, `Bang_Diem_Kiem_Soat_Lop_${trackingClass}_${Date.now()}.xlsx`);
      return;
    }

    if (filteredSubmissions.length === 0) return;

    const dataToExport = filteredSubmissions.map((s, idx) => {
      const dateStr = new Date(s.submittedAt).toLocaleString('vi-VN');
      let xepLoai = 'Cần cố gắng';
      if (s.score >= 9.0) xepLoai = 'Xuất sắc';
      else if (s.score >= 8.0) xepLoai = 'Giỏi';
      else if (s.score >= 6.5) xepLoai = 'Khá';
      else if (s.score >= 5.0) xepLoai = 'Trung bình';

      return {
        "STT": idx + 1,
        "Họ và tên học sinh": s.studentName,
        "Lớp / Trường": s.studentClass || "---",
        "Bài làm": s.quizTitle,
        "Môn / Khối": `${s.subject || ''} ${s.grade ? `Lớp ${s.grade}` : ''}`.trim(),
        "Điểm số (Thang 10)": s.score,
        "Số câu đúng": `${s.correctCount}/${s.totalCount}`,
        "Tỷ lệ đúng (%)": `${Math.round((s.correctCount / (s.totalCount || 1)) * 100)}%`,
        "Thời gian làm bài (giây)": `${Math.floor(s.timeSpentSeconds / 60)}p ${s.timeSpentSeconds % 60}s`,
        "Lần nộp": `Lần ${s.attemptNumber || 1}`,
        "Xếp loại": xepLoai,
        "Ngày giờ nộp": dateStr
      };
    });

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ket_Qua_Hoc_Sinh");
    const safeTitle = selectedQuiz !== 'all' ? selectedQuiz.replace(/[\\/:*?"<>|]/g, '_') : 'Tat_Ca_Bai_Tap';
    XLSX.writeFile(wb, `Bang_Diem_Hoc_Sinh_${safeTitle}_${Date.now()}.xlsx`);
  };

  // Handle delete submission
  const handleDeleteSubmission = async (id: string) => {
    try {
      const email = getTeacherEmail();
      const res = await fetch(`/api/teacher-submissions/${id}?teacherId=${encodeURIComponent(teacherId)}&teacherEmail=${encodeURIComponent(email)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setSubmissions(prev => prev.filter(s => s.id !== id));
        if (viewingDetailSubmission && viewingDetailSubmission.id === id) {
          setViewingDetailSubmission(null);
        }
      }
    } catch (err) {
      console.error('Error deleting submission:', err);
    }
  };

  // Handle clear all
  const handleClearAll = async () => {
    try {
      const email = getTeacherEmail();
      const res = await fetch(`/api/teacher-submissions/clear-all?teacherId=${encodeURIComponent(teacherId)}&teacherEmail=${encodeURIComponent(email)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setSubmissions([]);
        setShowConfirmClear(false);
        setViewingDetailSubmission(null);
      }
    } catch (err) {
      console.error('Error clearing submissions:', err);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}p ${secs < 10 ? '0' : ''}${secs}s`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-6xl w-full max-h-[94vh] shadow-2xl flex flex-col overflow-hidden border border-slate-200">
        
        {/* Modal Top Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-blue-50/90 via-indigo-50/60 to-white">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-bold text-slate-800">Quản Lý & Kiểm Soát Học Sinh Làm Bài</h2>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  <ShieldCheck className="w-3.5 h-3.5" /> Đồng bộ Realtime
                </span>
              </div>

              {/* Teacher Account Link */}
              <div className="text-xs text-slate-600 mt-1 flex items-center gap-2 flex-wrap">
                <span className="flex items-center gap-1 font-medium text-slate-700 bg-white px-2 py-0.5 rounded-lg border border-slate-200 shadow-xs">
                  <Mail className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Gmail giáo viên: <strong className="text-indigo-700 font-mono">{currentTeacherEmail}</strong></span>
                </span>

                {isEditingEmail ? (
                  <span className="inline-flex items-center gap-1">
                    <input
                      type="email"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder="email@gmail.com"
                      className="px-2 py-0.5 text-xs border border-indigo-300 rounded-lg outline-none bg-white focus:ring-1 focus:ring-indigo-500"
                    />
                    <button
                      onClick={handleSaveTeacherEmail}
                      className="px-2 py-0.5 bg-indigo-600 text-white rounded text-[11px] font-bold"
                    >
                      Lưu
                    </button>
                    <button
                      onClick={() => setIsEditingEmail(false)}
                      className="px-1.5 py-0.5 text-slate-500 text-[11px]"
                    >
                      Hủy
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => {
                      setEmailInput(currentTeacherEmail);
                      setIsEditingEmail(true);
                    }}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold underline flex items-center gap-0.5"
                  >
                    <Edit3 className="w-3 h-3" /> Đổi Gmail
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              onClick={() => setShowGuide(!showGuide)}
              className="px-3 py-2 rounded-xl text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-all flex items-center gap-1.5"
            >
              <AlertCircle className="w-4 h-4 text-blue-600" />
              <span>{showGuide ? 'Đóng hướng dẫn' : '💡 Cách đồng bộ'}</span>
            </button>
            <button
              onClick={() => {
                fetchSubmissions(false);
                fetchRosters();
              }}
              disabled={isLoading}
              className="p-2.5 rounded-xl text-slate-600 hover:bg-white hover:text-blue-600 border border-slate-200 transition-all shadow-xs"
              title="Làm mới dữ liệu ngay"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-blue-600' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2.5 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Expandable Guide Banner */}
        {showGuide && (
          <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-200 text-xs text-slate-700 space-y-2 animate-in fade-in">
            <div className="font-bold text-blue-900 flex items-center gap-1.5 text-sm">
              <span>📌 Cơ chế liên kết & kiểm soát số lượng học sinh làm / chưa làm:</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
              <div className="p-3 bg-white rounded-xl border border-blue-100 shadow-xs">
                <span className="font-bold text-blue-800 block mb-1">1. Gắn sẵn Gmail vào Link</span>
                <p className="text-slate-600 leading-relaxed text-[11px]">
                  Khi bạn bấm <strong>"Gửi bài cho HS"</strong>, hệ thống tự động mã hóa Gmail của bạn vào link. Học sinh mở làm trên máy nào thì kết quả đều tự động gửi thẳng về tài khoản Gmail này.
                </p>
              </div>
              <div className="p-3 bg-white rounded-xl border border-blue-100 shadow-xs">
                <span className="font-bold text-purple-800 block mb-1">2. Nhập Danh Sách Sĩ Số Lớp</span>
                <p className="text-slate-600 leading-relaxed text-[11px]">
                  Ở mục <strong>"Quản lý danh sách lớp"</strong>, bạn dán danh sách tên học sinh (từ Word hoặc Excel). Hệ thống sẽ tự động đối chiếu để biết em nào <strong>ĐÃ LÀM</strong> và em nào <strong>CHƯA LÀM</strong>.
                </p>
              </div>
              <div className="p-3 bg-white rounded-xl border border-blue-100 shadow-xs">
                <span className="font-bold text-emerald-800 block mb-1">3. Kiểm Soát & Nhắc Nhở Zalo</span>
                <p className="text-slate-600 leading-relaxed text-[11px]">
                  Bấm 1 nút <strong>"Sao chép DS Chưa nộp"</strong> để gửi ngay danh sách các em chưa làm bài vào nhóm chat Zalo/Facebook nhắc nhở, hoặc bấm <strong>"Xuất Excel"</strong> để lưu sổ điểm.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="px-5 pt-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => {
              setActiveTab('submissions');
              setViewingDetailSubmission(null);
            }}
            className={`pb-2.5 px-4 font-bold text-xs flex items-center gap-2 border-b-2 transition-all shrink-0 ${
              activeTab === 'submissions'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ListOrdered className="w-4 h-4" />
            <span>Lịch Sử Bài Làm ({submissions.length})</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('classTracking');
              setViewingDetailSubmission(null);
            }}
            className={`pb-2.5 px-4 font-bold text-xs flex items-center gap-2 border-b-2 transition-all shrink-0 ${
              activeTab === 'classTracking'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <UserCheck className="w-4 h-4 text-purple-600" />
            <span>Kiểm Soát Học Sinh Làm / Chưa Làm</span>
            <span className="bg-purple-100 text-purple-800 text-[10px] px-2 py-0.5 rounded-full font-bold">Mới</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('manageRosters');
              setViewingDetailSubmission(null);
            }}
            className={`pb-2.5 px-4 font-bold text-xs flex items-center gap-2 border-b-2 transition-all shrink-0 ${
              activeTab === 'manageRosters'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Danh Sách Lớp Học ({rosters.length} lớp)</span>
          </button>
        </div>

        {/* TAB 1: ALL SUBMISSIONS HISTORY */}
        {activeTab === 'submissions' && (
          <>
            {/* Overview Stats Bar */}
            <div className="p-4 bg-slate-50/80 border-b border-slate-200/80 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
                <div className="flex items-center gap-1.5 text-slate-500 text-xs font-medium mb-0.5">
                  <Users className="w-3.5 h-3.5 text-blue-600" />
                  <span>Số học sinh</span>
                </div>
                <div className="text-xl font-bold text-slate-800">{stats.uniqueStudents} <span className="text-xs font-normal text-slate-500">em</span></div>
              </div>

              <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
                <div className="flex items-center gap-1.5 text-slate-500 text-xs font-medium mb-0.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-purple-600" />
                  <span>Lượt nộp bài</span>
                </div>
                <div className="text-xl font-bold text-slate-800">{stats.totalSubmissions} <span className="text-xs font-normal text-slate-500">lượt</span></div>
              </div>

              <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
                <div className="flex items-center gap-1.5 text-slate-500 text-xs font-medium mb-0.5">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Điểm trung bình</span>
                </div>
                <div className="text-xl font-bold text-emerald-600">{stats.avgScore} <span className="text-xs font-normal text-slate-500">/ 10</span></div>
              </div>

              <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
                <div className="flex items-center gap-1.5 text-slate-500 text-xs font-medium mb-0.5">
                  <Award className="w-3.5 h-3.5 text-amber-500" />
                  <span>Điểm cao nhất</span>
                </div>
                <div className="text-xl font-bold text-amber-600">{stats.maxScore} <span className="text-xs font-normal text-slate-500">đ</span></div>
              </div>

              <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
                <div className="flex items-center gap-1.5 text-slate-500 text-xs font-medium mb-0.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Điểm thấp nhất</span>
                </div>
                <div className="text-xl font-bold text-slate-700">{stats.minScore} <span className="text-xs font-normal text-slate-500">đ</span></div>
              </div>

              <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
                <div className="flex items-center gap-1.5 text-slate-500 text-xs font-medium mb-0.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Tỷ lệ đạt (&ge;5đ)</span>
                </div>
                <div className="text-xl font-bold text-blue-600">{stats.passRate}%</div>
              </div>
            </div>

            {/* Filters Bar */}
            <div className="p-3.5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
                {/* Search */}
                <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Tìm tên học sinh, lớp..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none bg-slate-50/50"
                  />
                  {searchTerm && (
                    <button 
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                    >
                      ×
                    </button>
                  )}
                </div>

                {/* Quiz Filter */}
                {quizTitles.length > 0 && (
                  <div className="flex items-center gap-1">
                    <Filter className="w-3.5 h-3.5 text-slate-400" />
                    <select
                      value={selectedQuiz}
                      onChange={(e) => setSelectedQuiz(e.target.value)}
                      className="text-xs py-1.5 px-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 font-medium outline-none focus:ring-2 focus:ring-blue-500 max-w-[200px] truncate"
                    >
                      <option value="all">Tất cả bài tập ({quizTitles.length})</option>
                      {quizTitles.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Class Filter */}
                {classList.length > 0 && (
                  <select
                    value={selectedClass}
                    onChange={(e) => setSelectedClass(e.target.value)}
                    className="text-xs py-1.5 px-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 font-medium outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">Tất cả lớp ({classList.length})</option>
                    {classList.map(c => (
                      <option key={c} value={c}>Lớp {c}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportExcel}
                  disabled={filteredSubmissions.length === 0}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-bold text-xs shadow-sm transition-all active:scale-95"
                >
                  <FileSpreadsheet className="w-4 h-4" /> Xuất Excel ({filteredSubmissions.length})
                </button>

                {submissions.length > 0 && (
                  <button
                    onClick={() => setShowConfirmClear(true)}
                    className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-xl transition-colors border border-rose-200"
                    title="Xóa tất cả kết quả"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Submissions Table */}
            <div className="flex-1 overflow-y-auto p-4">
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-xs flex items-center gap-2 mb-4">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {isLoading ? (
                <div className="h-64 flex flex-col items-center justify-center space-y-3">
                  <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-xs text-slate-500 font-medium">Đang tải danh sách kết quả học sinh...</p>
                </div>
              ) : filteredSubmissions.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-center p-6 space-y-3">
                  <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center">
                    <Users className="w-8 h-8" />
                  </div>
                  <div className="max-w-sm">
                    <h3 className="font-bold text-slate-700 text-sm">Chưa có học sinh nào nộp bài</h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Hãy gửi link bài tập cho học sinh. Khi học sinh làm xong và bấm "Nộp bài", kết quả sẽ tự động lưu và hiển thị tại đây theo thời gian thực.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 select-none">
                      <tr>
                        <th className="py-2.5 px-3 text-center w-12">STT</th>
                        <th className="py-2.5 px-4">Học sinh</th>
                        <th className="py-2.5 px-3">Lớp / Trường</th>
                        <th className="py-2.5 px-4">Bài tập</th>
                        <th className="py-2.5 px-3 text-center">Điểm số</th>
                        <th className="py-2.5 px-3 text-center">Số câu đúng</th>
                        <th className="py-2.5 px-3 text-center">Thời gian</th>
                        <th className="py-2.5 px-3 text-center">Số lần</th>
                        <th className="py-2.5 px-4">Ngày giờ nộp</th>
                        <th className="py-2.5 px-3 text-center w-24">Chi tiết</th>
                        <th className="py-2.5 px-2 text-center w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredSubmissions.map((sub, index) => {
                        let scoreBadgeColor = 'bg-rose-100 text-rose-800 border-rose-200';
                        if (sub.score >= 8.5) {
                          scoreBadgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-200';
                        } else if (sub.score >= 6.5) {
                          scoreBadgeColor = 'bg-blue-100 text-blue-800 border-blue-200';
                        } else if (sub.score >= 5.0) {
                          scoreBadgeColor = 'bg-amber-100 text-amber-800 border-amber-200';
                        }

                        const timeStr = new Date(sub.submittedAt).toLocaleString('vi-VN', {
                          hour: '2-digit',
                          minute: '2-digit',
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric'
                        });

                        return (
                          <tr key={sub.id} className="hover:bg-blue-50/30 transition-colors">
                            <td className="py-2.5 px-3 text-center font-mono font-medium text-slate-400">
                              {index + 1}
                            </td>
                            <td className="py-2.5 px-4">
                              <div className="font-bold text-slate-800">{sub.studentName}</div>
                            </td>
                            <td className="py-2.5 px-3">
                              {sub.studentClass ? (
                                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-[11px]">
                                  {sub.studentClass}
                                </span>
                              ) : (
                                <span className="text-slate-400 italic">---</span>
                              )}
                            </td>
                            <td className="py-2.5 px-4">
                              <div className="font-medium text-slate-700 max-w-xs truncate" title={sub.quizTitle}>
                                {sub.quizTitle}
                              </div>
                              {(sub.subject || sub.grade) && (
                                <div className="text-[10px] text-slate-400">
                                  {sub.subject} {sub.grade ? `• Lớp ${sub.grade}` : ''}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-xs border ${scoreBadgeColor}`}>
                                {sub.score.toFixed(1)} đ
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center font-semibold text-slate-700">
                              {sub.correctCount} / {sub.totalCount}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono text-slate-600">
                              {formatDuration(sub.timeSpentSeconds)}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold ${
                                sub.attemptNumber > 1 ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-slate-50 text-slate-600'
                              }`}>
                                Lần {sub.attemptNumber || 1}
                              </span>
                            </td>
                            <td className="py-2.5 px-4 text-slate-500 font-mono text-[11px]">
                              {timeStr}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <button
                                onClick={() => setViewingDetailSubmission(sub)}
                                className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold rounded-lg text-[11px] flex items-center justify-center gap-1 mx-auto transition-colors"
                              >
                                <Eye className="w-3 h-3" /> Xem bài
                              </button>
                            </td>
                            <td className="py-2.5 px-2 text-center">
                              <button
                                onClick={() => handleDeleteSubmission(sub.id)}
                                className="p-1 text-slate-300 hover:text-rose-500 rounded transition-colors"
                                title="Xóa kết quả này"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* TAB 2: CLASS TRACKING (ĐÃ LÀM VS CHƯA LÀM) */}
        {activeTab === 'classTracking' && (
          <div className="flex-1 overflow-y-auto flex flex-col">
            
            {/* Filter Bar for Class Tracking */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                
                {/* Select Class */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-purple-600" /> Chọn Lớp:
                  </span>
                  <select
                    value={trackingClass}
                    onChange={(e) => setTrackingClass(e.target.value)}
                    className="text-xs py-1.5 px-3 rounded-xl border border-slate-300 bg-white text-slate-800 font-bold outline-none focus:ring-2 focus:ring-purple-500 shadow-xs"
                  >
                    {classList.length === 0 ? (
                      <option value="">Chưa có lớp nào</option>
                    ) : (
                      classList.map(c => (
                        <option key={c} value={c}>Lớp {c}</option>
                      ))
                    )}
                  </select>
                </div>

                {/* Select Quiz */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <BookOpen className="w-3.5 h-3.5 text-blue-600" /> Chọn Bài tập:
                  </span>
                  <select
                    value={trackingQuiz}
                    onChange={(e) => setTrackingQuiz(e.target.value)}
                    className="text-xs py-1.5 px-3 rounded-xl border border-slate-300 bg-white text-slate-800 font-medium outline-none focus:ring-2 focus:ring-blue-500 max-w-xs truncate shadow-xs"
                  >
                    {quizTitles.length === 0 ? (
                      <option value="">Tất cả bài tập</option>
                    ) : (
                      <>
                        <option value="">Tất cả bài tập</option>
                        {quizTitles.map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </>
                    )}
                  </select>
                </div>

              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportExcel}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-sm transition-all active:scale-95"
                >
                  <FileSpreadsheet className="w-4 h-4" /> Xuất Bảng Điểm Lớp
                </button>

                <button
                  onClick={() => setActiveTab('manageRosters')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl font-semibold text-xs transition-all shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5 text-indigo-600" /> Nhập Sĩ Số Lớp
                </button>
              </div>
            </div>

            {/* Tracking Summary KPI */}
            <div className="p-4 bg-white border-b border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-purple-50/80 rounded-2xl border border-purple-200">
                <p className="text-xs text-purple-700 font-semibold">Sĩ số lớp {trackingClass || '...'}</p>
                <div className="text-2xl font-black text-purple-950 mt-1">
                  {classTrackingAnalysis.totalRoster} <span className="text-xs font-normal text-purple-600">học sinh</span>
                </div>
              </div>

              <div className="p-3 bg-emerald-50/80 rounded-2xl border border-emerald-200">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-emerald-700 font-semibold">Đã hoàn thành bài</p>
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-200/70 px-2 py-0.5 rounded-full">
                    {classTrackingAnalysis.doneRate}%
                  </span>
                </div>
                <div className="text-2xl font-black text-emerald-950 mt-1">
                  {classTrackingAnalysis.doneCount} <span className="text-xs font-normal text-emerald-600">em</span>
                </div>
              </div>

              <div className="p-3 bg-rose-50/80 rounded-2xl border border-rose-200">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-rose-700 font-semibold">Chưa làm bài</p>
                  <span className="text-xs font-bold text-rose-700 bg-rose-200/70 px-2 py-0.5 rounded-full">
                    {100 - classTrackingAnalysis.doneRate}%
                  </span>
                </div>
                <div className="text-2xl font-black text-rose-950 mt-1">
                  {classTrackingAnalysis.notDoneCount} <span className="text-xs font-normal text-rose-600">em</span>
                </div>
              </div>

              <div className="p-3 bg-blue-50/80 rounded-2xl border border-blue-200">
                <p className="text-xs text-blue-700 font-semibold">Điểm trung bình lớp</p>
                <div className="text-2xl font-black text-blue-950 mt-1">
                  {classTrackingAnalysis.avgScore} <span className="text-xs font-normal text-blue-600">/ 10</span>
                </div>
              </div>
            </div>

            {/* Sub-Tabs: Đã làm vs Chưa làm */}
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTrackingSubTab('done')}
                  className={`px-4 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                    trackingSubTab === 'done'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Danh sách ĐÃ LÀM ({classTrackingAnalysis.doneCount} em)</span>
                </button>

                <button
                  onClick={() => setTrackingSubTab('notDone')}
                  className={`px-4 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                    trackingSubTab === 'notDone'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  <UserX className="w-4 h-4" />
                  <span>Danh sách CHƯA LÀM ({classTrackingAnalysis.notDoneCount} em)</span>
                </button>
              </div>

              {trackingSubTab === 'notDone' && classTrackingAnalysis.notDoneStudents.length > 0 && (
                <button
                  onClick={handleCopyNotDone}
                  className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
                >
                  {copiedNotDone ? <Check className="w-4 h-4" /> : <ClipboardCopy className="w-4 h-4" />}
                  <span>{copiedNotDone ? 'Đã sao chép để dán Zalo!' : 'Sao chép DS Chưa nộp (gửi Zalo)'}</span>
                </button>
              )}
            </div>

            {/* List Area */}
            <div className="flex-1 p-4 overflow-y-auto">
              {trackingSubTab === 'done' ? (
                classTrackingAnalysis.doneStudents.length === 0 ? (
                  <div className="h-48 flex flex-col items-center justify-center text-center p-4">
                    <UserX className="w-12 h-12 text-slate-300 mb-2" />
                    <p className="text-xs font-bold text-slate-600">Chưa có học sinh nào trong lớp hoàn thành bài tập này</p>
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3 text-center w-12">STT</th>
                          <th className="py-2.5 px-4">Họ và tên học sinh</th>
                          <th className="py-2.5 px-3">Lớp</th>
                          <th className="py-2.5 px-3 text-center">Điểm số</th>
                          <th className="py-2.5 px-3 text-center">Số câu đúng</th>
                          <th className="py-2.5 px-3 text-center">Thời gian làm</th>
                          <th className="py-2.5 px-3 text-center">Lần nộp</th>
                          <th className="py-2.5 px-4">Thời gian nộp</th>
                          <th className="py-2.5 px-3 text-center w-24">Chi tiết</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {classTrackingAnalysis.doneStudents.map((item, idx) => {
                          let scoreBadgeColor = 'bg-rose-100 text-rose-800 border-rose-200';
                          if (item.score >= 8.5) {
                            scoreBadgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-200';
                          } else if (item.score >= 6.5) {
                            scoreBadgeColor = 'bg-blue-100 text-blue-800 border-blue-200';
                          } else if (item.score >= 5.0) {
                            scoreBadgeColor = 'bg-amber-100 text-amber-800 border-amber-200';
                          }

                          const timeStr = new Date(item.submittedAt).toLocaleString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit',
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric'
                          });

                          return (
                            <tr key={idx} className="hover:bg-emerald-50/30 transition-colors">
                              <td className="py-2.5 px-3 text-center font-mono font-medium text-slate-400">
                                {idx + 1}
                              </td>
                              <td className="py-2.5 px-4 font-bold text-slate-800">
                                {item.name}
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-[11px]">
                                  {trackingClass}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <span className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-xs border ${scoreBadgeColor}`}>
                                  {item.score.toFixed(1)} đ
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-center font-semibold text-slate-700">
                                {item.correctCount} / {item.totalCount}
                              </td>
                              <td className="py-2.5 px-3 text-center font-mono text-slate-600">
                                {formatDuration(item.timeSpentSeconds)}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-bold">
                                  Lần {item.attemptNumber || 1}
                                </span>
                              </td>
                              <td className="py-2.5 px-4 text-slate-500 font-mono text-[11px]">
                                {timeStr}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                {item.submission ? (
                                  <button
                                    onClick={() => setViewingDetailSubmission(item.submission!)}
                                    className="px-2 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold rounded text-[11px] flex items-center justify-center gap-1 mx-auto"
                                  >
                                    <Eye className="w-3 h-3" /> Xem bài
                                  </button>
                                ) : (
                                  <span className="text-slate-400 text-[11px]">---</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              ) : (
                classTrackingAnalysis.notDoneStudents.length === 0 ? (
                  <div className="h-48 flex flex-col items-center justify-center text-center p-4 bg-emerald-50/50 rounded-2xl border border-emerald-200">
                    <CheckCircle2 className="w-12 h-12 text-emerald-600 mb-2" />
                    <h4 className="font-bold text-emerald-950 text-sm">Tuyệt vời! 100% học sinh trong danh sách đã hoàn thành bài</h4>
                    <p className="text-xs text-emerald-700 mt-1">Không có học sinh nào bị sót bài làm.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between text-xs text-rose-800">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>Có <strong>{classTrackingAnalysis.notDoneStudents.length}</strong> học sinh trong danh sách lớp <strong>{trackingClass}</strong> chưa làm bài tập này.</span>
                      </div>
                    </div>

                    <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                          <tr>
                            <th className="py-2.5 px-3 text-center w-12">STT</th>
                            <th className="py-2.5 px-4">Họ và tên học sinh</th>
                            <th className="py-2.5 px-4">Lớp</th>
                            <th className="py-2.5 px-4">Trạng thái</th>
                            <th className="py-2.5 px-4 text-right">Hành động</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {classTrackingAnalysis.notDoneStudents.map((name, idx) => (
                            <tr key={idx} className="hover:bg-rose-50/30 transition-colors">
                              <td className="py-2.5 px-3 text-center font-mono font-medium text-slate-400">
                                {idx + 1}
                              </td>
                              <td className="py-2.5 px-4 font-bold text-slate-800">
                                {name}
                              </td>
                              <td className="py-2.5 px-4">
                                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-[11px]">
                                  {trackingClass}
                                </span>
                              </td>
                              <td className="py-2.5 px-4">
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                  <UserX className="w-3 h-3" /> Chưa làm bài
                                </span>
                              </td>
                              <td className="py-2.5 px-4 text-right">
                                <span className="text-[11px] text-slate-400 italic">Cần nhắc nhở</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              )}
            </div>

          </div>
        )}

        {/* TAB 3: MANAGE CLASS ROSTERS */}
        {activeTab === 'manageRosters' && (
          <div className="flex-1 p-5 overflow-y-auto space-y-6">
            
            {/* Create / Edit Form */}
            <div className="p-5 bg-indigo-50/60 border border-indigo-200 rounded-3xl space-y-4 shadow-xs">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-indigo-950 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-indigo-600" />
                  <span>{editingRosterId ? 'Chỉnh Sửa Danh Sách Lớp' : 'Thêm / Nhập Danh Sách Sĩ Số Lớp Mới'}</span>
                </h3>
                {editingRosterId && (
                  <button
                    onClick={() => {
                      setEditingRosterId(null);
                      setNewClassName('');
                      setRawStudentNamesText('');
                    }}
                    className="text-xs text-slate-500 hover:text-slate-700 underline"
                  >
                    Hủy chỉnh sửa
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Tên Lớp (Ví dụ: 12A1, 10A2, 9B...):</label>
                  <input
                    type="text"
                    value={newClassName}
                    onChange={(e) => setNewClassName(e.target.value)}
                    placeholder="Nhập tên lớp..."
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                  />
                  <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">
                    💡 Học sinh khi làm bài nhập lớp này sẽ tự động được khớp với danh sách sĩ số để kiểm soát.
                  </p>
                </div>

                <div className="md:col-span-2">
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Danh Sách Tên Học Sinh (Dán danh sách từ Word/Excel - mỗi dòng 1 tên):
                  </label>
                  <textarea
                    rows={6}
                    value={rawStudentNamesText}
                    onChange={(e) => setRawStudentNamesText(e.target.value)}
                    placeholder={"1. Nguyễn Văn A\n2. Trần Thị B\n3. Lê Văn C\n..."}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={handleSaveRoster}
                  disabled={isSavingRoster}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-md transition-all active:scale-95 flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSavingRoster ? 'Đang lưu...' : 'Lưu Danh Sách Lớp'}</span>
                </button>
              </div>
            </div>

            {/* List of Existing Rosters */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-600" />
                <span>Các Lớp Đã Lưu Trong Hệ Thống ({rosters.length})</span>
              </h3>

              {rosters.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-500">
                  Chưa có danh sách lớp nào được tạo. Hãy nhập danh sách lớp ở khung phía trên để hệ thống tự động kiểm soát học sinh làm và chưa làm bài!
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {rosters.map(roster => (
                    <div key={roster.id} className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-3">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-base font-black text-slate-900">Lớp {roster.className}</span>
                          <span className="bg-indigo-100 text-indigo-800 text-xs font-bold px-2.5 py-0.5 rounded-full">
                            {roster.studentNames.length} học sinh
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                          {roster.studentNames.slice(0, 5).join(', ')}{roster.studentNames.length > 5 ? '...' : ''}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                        <button
                          onClick={() => {
                            setTrackingClass(roster.className);
                            setActiveTab('classTracking');
                          }}
                          className="text-xs font-bold text-purple-600 hover:text-purple-800 flex items-center gap-1"
                        >
                          Kiểm soát bài làm <ChevronRight className="w-3.5 h-3.5" />
                        </button>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleEditRoster(roster)}
                            className="p-1 text-slate-400 hover:text-indigo-600 rounded"
                            title="Sửa danh sách"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteRoster(roster.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded"
                            title="Xóa lớp"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

        {/* Modal Footer */}
        <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="text-slate-500">
            Tài khoản: <strong className="text-slate-700">{currentTeacherEmail}</strong> • Tự động lưu trữ và đồng bộ đám mây
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-all"
          >
            Đóng
          </button>
        </div>

        {/* POPUP: VIEW STUDENT SUBMISSION DETAIL (TỪNG CÂU ĐÚNG SAI) */}
        {viewingDetailSubmission && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-60 animate-in fade-in">
            <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[88vh] shadow-2xl flex flex-col overflow-hidden border border-slate-200">
              {/* Header */}
              <div className="p-4 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-indigo-50 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Chi Tiết Bài Làm: <span className="text-blue-700">{viewingDetailSubmission.studentName}</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Lớp: <strong>{viewingDetailSubmission.studentClass || '---'}</strong> • Điểm số: <strong className="text-blue-600">{viewingDetailSubmission.score} đ</strong> ({viewingDetailSubmission.correctCount}/{viewingDetailSubmission.totalCount} câu đúng)
                  </p>
                </div>
                <button
                  onClick={() => setViewingDetailSubmission(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Answers Details List */}
              <div className="flex-1 p-5 overflow-y-auto space-y-4">
                {viewingDetailSubmission.answersDetails && viewingDetailSubmission.answersDetails.length > 0 ? (
                  viewingDetailSubmission.answersDetails.map((ans, idx) => (
                    <div 
                      key={idx}
                      className={`p-4 rounded-2xl border ${
                        ans.isCorrect 
                          ? 'bg-emerald-50/40 border-emerald-200' 
                          : 'bg-rose-50/40 border-rose-200'
                      }`}
                    >
                      <div className="flex items-start gap-2 justify-between">
                        <div className="font-bold text-xs text-slate-800 flex items-start gap-1.5 flex-1">
                          <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 shrink-0">Câu {idx + 1}</span>
                          <div className="flex-1">
                            <MathRenderer text={ans.question} />
                          </div>
                        </div>
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold shrink-0 ${
                          ans.isCorrect ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                        }`}>
                          {ans.isCorrect ? 'ĐÚNG' : 'SAI'}
                        </span>
                      </div>

                      <div className="mt-3 pt-2 border-t border-slate-200/60 grid grid-cols-2 gap-2 text-xs">
                        <div className="p-2 rounded-xl bg-white border border-slate-200">
                          <span className="text-[10px] text-slate-400 block font-semibold">Học sinh chọn:</span>
                          <span className={`font-bold ${ans.isCorrect ? 'text-emerald-700' : 'text-rose-700'}`}>
                            Đáp án {ans.selectedAnswer}
                          </span>
                        </div>

                        <div className="p-2 rounded-xl bg-white border border-slate-200">
                          <span className="text-[10px] text-slate-400 block font-semibold">Đáp án đúng:</span>
                          <span className="font-bold text-emerald-700">
                            Đáp án {ans.correctAnswer}
                          </span>
                        </div>
                      </div>

                      {ans.explanation && (
                        <div className="mt-2 text-xs text-slate-600 bg-white/80 p-2.5 rounded-xl border border-slate-100">
                          <strong className="text-blue-700">Giải thích:</strong> <MathRenderer text={ans.explanation} />
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-xs text-slate-500">
                    Bài làm này được nộp trước khi kích hoạt tính năng lưu chi tiết từng câu hỏi. Các bài làm mới nộp từ bây giờ sẽ hiển thị đầy đủ chi tiết từng câu!
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-3 bg-slate-50 border-t border-slate-200 text-right">
                <button
                  onClick={() => setViewingDetailSubmission(null)}
                  className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl text-xs"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirmation Clear All Modal */}
        {showConfirmClear && (
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-70">
            <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-200 space-y-4 text-center">
              <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
                <Trash2 className="w-6 h-6" />
              </div>
              <h4 className="text-base font-bold text-slate-800">Xóa toàn bộ lịch sử làm bài?</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Tất cả dữ liệu nộp bài của học sinh đối với tài khoản của bạn sẽ bị xóa. Hành động này không thể hoàn tác.
              </p>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowConfirmClear(false)}
                  className="flex-1 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
                >
                  Hủy
                </button>
                <button
                  onClick={handleClearAll}
                  className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md"
                >
                  Xóa tất cả
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default StudentSubmissionsModal;
