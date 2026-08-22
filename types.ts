export interface QuizOption {
  key: string; // A, B, C, D
  text: string;
}

export interface QuizQuestion {
  id: number;
  question_content: string;
  options: QuizOption[];
  correct_answer: string; // A, B, C, or D
  level: string; // Nhận biết, Thông hiểu, etc.
  explanation?: string;
}

export enum BloomLevel {
  KNOWLEDGE = "Nhận biết",
  COMPREHENSION = "Thông hiểu",
  APPLICATION_LOW = "Vận dụng thấp",
  APPLICATION_HIGH = "Vận dụng cao"
}

export interface QuizConfig {
  level?: string;
  subject: string;
  grade: string;
  lessonName?: string;
  questionCount: number;
  bloomLevels: BloomLevel[];
  optionCount: number;
  isTrueFalse?: boolean;
  sourceText?: string;
}

export interface HistoryItem {
  id: string;
  timestamp: number;
  title: string;
  questions: QuizQuestion[];
}

export interface QuestionAnswerDetail {
  questionId: number;
  question: string;
  selectedAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  explanation?: string;
}

export interface StudentSubmission {
  id: string;
  teacherId: string;
  teacherEmail?: string;
  quizTitle: string;
  subject?: string;
  grade?: string;
  studentName: string;
  studentClass: string;
  score: number; // e.g. 8.5
  correctCount: number;
  totalCount: number;
  timeSpentSeconds: number;
  submittedAt: number; // timestamp ms
  attemptNumber: number; // 1, 2, 3...
  answersDetails?: QuestionAnswerDetail[];
}

export interface ClassRoster {
  id: string;
  teacherEmail?: string;
  teacherId: string;
  className: string;
  studentNames: string[];
  createdAt: number;
  updatedAt: number;
}

export type GenerationStatus = 'idle' | 'processing_file' | 'generating' | 'success' | 'error';
