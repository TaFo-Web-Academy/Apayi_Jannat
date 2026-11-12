"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  FileDown,
  Lock,
  Phone,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from "lucide-react";
import EmotionalMapCard from "@/components/EmotionalMapCard";
import {
  DEFAULT_TEST,
  EMOTIONAL_STATES,
  OptionLetter,
  SubmissionRecord,
  TestConfig,
} from "@/lib/test-data";
import {
  loadTestConfig,
  safeCopyToClipboard,
  saveSubmission,
} from "@/lib/storage";
import { printSubmissionPdf } from "@/lib/export-utils";

type Step = "register" | "quiz" | "result";

const PROGRESS_SESSION_KEY = "jannat_active_quiz_progress_v3";

export default function HomePage() {
  const [testConfig, setTestConfig] = useState<TestConfig>(DEFAULT_TEST);
  const [step, setStep] = useState<Step>("register");

  // ONLY Phone number (strictly 9 digits)
  const [phoneDigits, setPhoneDigits] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [quizError, setQuizError] = useState("");

  // Quiz state & smooth transition state
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLeaving, setIsLeaving] = useState(false);
  const [answers, setAnswers] = useState<Record<number, OptionLetter>>({});
  const [submission, setSubmission] = useState<SubmissionRecord | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedFull, setCopiedFull] = useState(false);
  const transitionTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load config & restore unfinished session if browser was refreshed
  useEffect(() => {
    loadTestConfig().then((cfg) => setTestConfig(cfg));
    try {
      const savedSession = sessionStorage.getItem(PROGRESS_SESSION_KEY);
      if (savedSession) {
        const parsed = JSON.parse(savedSession);
        if (
          typeof parsed.phoneDigits === "string" &&
          /^\d{9}$/.test(parsed.phoneDigits)
        ) {
          setPhoneDigits(parsed.phoneDigits);
          if (parsed.answers && typeof parsed.answers === "object") {
            setAnswers(parsed.answers);
          }
          if (typeof parsed.currentIndex === "number") {
            setCurrentIndex(parsed.currentIndex);
          }
          if (parsed.step === "quiz") {
            setStep("quiz");
          }
        }
      }
    } catch {
      // ignore
    }
    return () => {
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    };
  }, []);

  // Save progress to sessionStorage automatically
  useEffect(() => {
    try {
      if (step === "quiz") {
        sessionStorage.setItem(
          PROGRESS_SESSION_KEY,
          JSON.stringify({
            step,
            phoneDigits,
            answers,
            currentIndex,
          })
        );
      } else if (step === "result") {
        sessionStorage.removeItem(PROGRESS_SESSION_KEY);
      }
    } catch {
      // ignore
    }
  }, [step, phoneDigits, answers, currentIndex]);

  const questions =
    testConfig.questions && testConfig.questions.length > 0
      ? testConfig.questions
      : DEFAULT_TEST.questions;
  const safeIndex = Math.min(Math.max(0, currentIndex), questions.length - 1);
  const currentQuestion = questions[safeIndex] || questions[0];
  const currentQuestionAnswered = Boolean(answers[currentQuestion?.id]);
  const answeredCount = Object.keys(answers).length;
  const allAnswered = answeredCount >= questions.length;

  // Determine the furthest question index the user is allowed to visit
  const maxUnlockedIndex = React.useMemo(() => {
    for (let i = 0; i < questions.length; i++) {
      if (!answers[questions[i].id]) {
        return i;
      }
    }
    return questions.length - 1;
  }, [questions, answers]);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const onlyNums = e.target.value.replace(/\D/g, "").slice(0, 9);
    setPhoneDigits(onlyNums);
    if (phoneError) setPhoneError("");
  };

  const handleStartTest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{9}$/.test(phoneDigits)) {
      setPhoneError(
        `Рақами телефон бояд аниқ аз 9 рақам иборат бошад (шумо ${phoneDigits.length} рақам ворид кардед)`
      );
      return;
    }
    setPhoneError("");
    setQuizError("");
    setAnswers({});
    setCurrentIndex(0);
    setIsLeaving(false);
    setStep("quiz");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const finalizeAndShowResult = async (
    finalAnswers: Record<number, OptionLetter>
  ) => {
    const formattedPhone = `+992 ${phoneDigits}`;
    const saved = await saveSubmission(
      {
        respondentName: formattedPhone,
        respondentPhone: phoneDigits,
        answers: finalAnswers,
      },
      testConfig
    );
    setSubmission(saved);
    setIsLeaving(false);
    setStep("result");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Smooth automatic progression after selecting an answer
  const handleSelectOption = (letter: OptionLetter) => {
    if (isLeaving) return; // Prevent double-clicks during smooth animation

    const qId = currentQuestion.id;
    const updatedAnswers = { ...answers, [qId]: letter };
    setAnswers(updatedAnswers);
    if (quizError) setQuizError("");

    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
    }

    // Brief visual confirmation of selection, then smooth fade/slide to next question
    transitionTimerRef.current = setTimeout(() => {
      setIsLeaving(true);
      transitionTimerRef.current = setTimeout(() => {
        if (safeIndex < questions.length - 1) {
          setCurrentIndex(safeIndex + 1);
          setIsLeaving(false);
        } else {
          // Last question answered -> automatically open result!
          finalizeAndShowResult(updatedAnswers);
        }
      }, 190);
    }, 180);
  };

  const handleGoToQuestion = (targetIdx: number) => {
    if (isLeaving) return;
    if (targetIdx > maxUnlockedIndex) {
      setQuizError(
        "Лутфан аввал ба саволи ҷорӣ ҷавоб диҳед, сипас ба саволи баъдӣ гузаред."
      );
      return;
    }
    setQuizError("");
    setIsLeaving(true);
    setTimeout(() => {
      setCurrentIndex(targetIdx);
      setIsLeaving(false);
    }, 150);
  };

  const handleFinishTest = async () => {
    const firstMissingIdx = questions.findIndex((q) => !answers[q.id]);
    if (firstMissingIdx !== -1) {
      setCurrentIndex(firstMissingIdx);
      setQuizError(
        `Лутфан аввал ба саволи ${questions[firstMissingIdx].id} ҷавоб интихоб кунед`
      );
      return;
    }
    await finalizeAndShowResult(answers);
  };

  const handleCopyAnswerSheet = () => {
    if (!submission) return;
    safeCopyToClipboard(submission.answerCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2200);
  };

  const handleCopyFullReport = () => {
    if (!submission) return;
    const scoreLines = submission.scores
      .map((s) => `• ${s.shortName}: ${s.percentage}%`)
      .join("\n");
    const text = [
      `ТЕСТИ ХУДШИНОСӢ`,
      `Телефон: +992 ${submission.respondentPhone || phoneDigits}`,
      `Варақаи ҷавобҳо: ${submission.answerCode}`,
      ``,
      `Харитаи эҳсосоти шумо:`,
      scoreLines,
      ``,
      `Ҳолати бештар такроршаванда: ${submission.dominantState.fullName} (${submission.dominantState.percentage}%)`,
    ].join("\n");

    safeCopyToClipboard(text);
    setCopiedFull(true);
    setTimeout(() => setCopiedFull(false), 2200);
  };

  const handleRestart = () => {
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    try {
      sessionStorage.removeItem(PROGRESS_SESSION_KEY);
    } catch {
      // ignore
    }
    setAnswers({});
    setCurrentIndex(0);
    setIsLeaving(false);
    setSubmission(null);
    setQuizError("");
    setStep("register");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8F5] text-[#1F1D1A]">
      {/* Minimalist Editorial Header */}
      <header className="bg-white/95 backdrop-blur-md border-b border-[#EFECE6] sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <button
            type="button"
            onClick={handleRestart}
            className="text-left group focus:outline-none"
          >
            <span className="block font-serif text-base sm:text-lg font-medium text-[#1F1D1A] tracking-tight group-hover:text-[#8C5D50] transition-colors">
              Тести Худшиносӣ
            </span>
            <span className="block text-[11px] uppercase tracking-[0.14em] text-[#8C7A6B]">
              {step === "register"
                ? "Воридшавӣ бо рақами телефон"
                : `Рақам: +992 ${phoneDigits}`}
            </span>
          </button>

          <div className="flex items-center gap-3">
            {step === "quiz" && (
              <span className="text-xs font-medium px-3 py-1 rounded-full bg-[#F5ECEA] text-[#6E463B]">
                {answeredCount} / {questions.length}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12 flex flex-col justify-center">
        {/* PAGE 1: ONLY 9-DIGIT PHONE NUMBER */}
        {step === "register" && (
          <div className="max-w-md w-full mx-auto animate-fade-in">
            <form
              onSubmit={handleStartTest}
              noValidate
              className="bg-white border border-[#E8E2D9] rounded-3xl p-7 sm:p-10 shadow-soft space-y-6"
            >
              <div>
                <div className="w-12 h-0.5 bg-[#C49A8E] mb-5" />
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FBF7F6] border border-[#EAD8D3] text-[#8C5D50] text-xs font-medium mb-3">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>ТЕСТИ ХУДШИНОСӢ • 10 савол</span>
                </div>
                <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-[#1F1D1A] leading-snug">
                  Рақами телефони худро ворид кунед
                </h1>
                <p className="text-sm text-[#787167] mt-1.5 leading-relaxed">
                  Барои оғози тест рақами 9-рақамаи телефони худро нависед:
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#5C564E]">
                    Рақами телефон <span className="text-[#A87668]">*</span>
                  </label>
                  <span
                    className={`text-xs font-semibold tabular-nums transition-colors ${
                      phoneDigits.length === 9
                        ? "text-[#2E8565]"
                        : "text-[#8C7A6B]"
                    }`}
                  >
                    {phoneDigits.length} / 9 рақам
                  </span>
                </div>

                <div
                  className={`flex items-center rounded-2xl bg-[#FAF8F5] border ${
                    phoneError
                      ? "border-red-400 focus-within:border-red-500"
                      : phoneDigits.length === 9
                      ? "border-[#3B9B78] bg-white shadow-xs"
                      : "border-[#E8E2D9] focus-within:border-[#8C5D50] focus-within:bg-white"
                  } transition-all overflow-hidden`}
                >
                  <div className="pl-4 pr-3 py-3.5 flex items-center gap-2 border-r border-[#E8E2D9] text-[#5C564E] text-sm sm:text-base font-medium select-none bg-[#F3EFEA]/60">
                    <Phone className="w-4 h-4 text-[#8C5D50]" />
                    <span>+992</span>
                  </div>
                  <input
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]{9}"
                    maxLength={9}
                    autoFocus
                    required
                    value={phoneDigits}
                    onChange={handlePhoneChange}
                    placeholder="900123456"
                    className="w-full px-4 py-3.5 bg-transparent text-[#1F1D1A] placeholder-[#ACA59B] text-base sm:text-lg font-medium tracking-wider focus:outline-none tabular-nums"
                  />
                </div>

                {phoneError && (
                  <p className="text-xs text-red-600 mt-2 font-medium animate-fade-in">
                    {phoneError}
                  </p>
                )}
              </div>

              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-2.5 px-7 py-4 rounded-2xl bg-[#1F1D1A] hover:bg-[#332F2A] hover:-translate-y-0.5 text-white font-medium text-sm sm:text-base transition-all duration-200 shadow-sm"
              >
                <span>Оғози тест</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}

        {/* PAGE 2: QUIZ QUESTIONS (Strict sequential answering + smooth animation) */}
        {step === "quiz" && currentQuestion && (
          <div className="space-y-6">
            {/* Top Progress & Question Selector */}
            <div className="bg-white border border-[#E8E2D9] rounded-3xl p-5 sm:p-6 shadow-soft">
              <div className="flex items-center justify-between text-xs sm:text-sm mb-3">
                <span className="font-semibold text-[#8C5D50] uppercase tracking-wider">
                  Саволи {safeIndex + 1} аз {questions.length}
                </span>
                <span className="text-[#787167] font-medium">
                  Соҳа: {currentQuestion.sphere}
                </span>
              </div>

              {/* Smooth Progress Bar */}
              <div className="w-full h-2 bg-[#EFECE6] rounded-full overflow-hidden mb-4">
                <div
                  className="h-full bg-[#8C5D50] rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${((safeIndex + 1) / questions.length) * 100}%`,
                  }}
                />
              </div>

              {/* 1..10 Question Pills (Locked for future unanswered questions) */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {questions.map((q, idx) => {
                  const chosen = answers[q.id];
                  const isCurrent = idx === safeIndex;
                  const isLocked = idx > maxUnlockedIndex;
                  return (
                    <button
                      key={q.id}
                      type="button"
                      disabled={isLocked}
                      onClick={() => handleGoToQuestion(idx)}
                      className={`h-8 min-w-[34px] px-2.5 rounded-xl text-xs font-medium transition-all duration-200 shrink-0 border flex items-center justify-center gap-1 ${
                        isCurrent
                          ? "bg-[#1F1D1A] text-white border-[#1F1D1A] shadow-xs"
                          : chosen
                          ? "bg-[#F5ECEA] text-[#6E463B] border-[#EAD8D3] hover:bg-[#EAD8D3]"
                          : "bg-[#FAF8F5] text-[#ACA59B] border-[#EFECE6] opacity-60 cursor-not-allowed"
                      }`}
                    >
                      <span>{q.id}</span>
                      {chosen ? (
                        <span className="font-bold">·{chosen}</span>
                      ) : isLocked ? (
                        <Lock className="w-2.5 h-2.5 opacity-60" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            {quizError && (
              <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-xs sm:text-sm text-red-700 font-medium animate-fade-in">
                {quizError}
              </div>
            )}

            {/* Active Question Card with Smooth Enter/Leave Animation */}
            <div
              key={currentQuestion.id}
              className={`bg-white border border-[#E8E2D9] rounded-3xl p-6 sm:p-9 shadow-soft transition-all duration-200 ${
                isLeaving
                  ? "opacity-0 -translate-x-4 scale-[0.99]"
                  : "animate-question-enter"
              }`}
            >
              <div className="mb-6">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="inline-block text-xs font-medium px-3 py-1 rounded-full bg-[#FAF8F5] border border-[#E8E2D9] text-[#787167]">
                    Саволи {currentQuestion.id} • {currentQuestion.sphere}
                  </span>
                  <span className="text-[11px] text-[#8C7A6B]">
                    Як ҷавобро интихоб кунед
                  </span>
                </div>
                <h2 className="font-serif text-xl sm:text-2xl md:text-[26px] font-semibold text-[#1F1D1A] leading-snug">
                  {currentQuestion.question}
                </h2>
              </div>

              <div className="space-y-2.5">
                {currentQuestion.options.map((opt) => {
                  const isSelected = answers[currentQuestion.id] === opt.letter;
                  return (
                    <button
                      key={opt.letter}
                      type="button"
                      onClick={() => handleSelectOption(opt.letter)}
                      className={`option-card w-full text-left p-4 rounded-2xl border flex items-start justify-between gap-3.5 group ${
                        isSelected
                          ? "bg-[#FBF7F6] border-[#8C5D50] shadow-sm"
                          : "bg-[#FDFCFB] border-[#E8E2D9] hover:border-[#C49A8E] hover:bg-white"
                      }`}
                    >
                      <div className="flex items-start gap-3.5">
                        <span
                          className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-semibold shrink-0 transition-all duration-200 ${
                            isSelected
                              ? "bg-[#8C5D50] text-white scale-105"
                              : "bg-[#F3EFEA] text-[#4A453E] group-hover:bg-[#8C5D50] group-hover:text-white group-hover:scale-105"
                          }`}
                        >
                          {opt.letter}
                        </span>
                        <span
                          className={`text-sm sm:text-[15px] leading-relaxed pt-1 transition-colors ${
                            isSelected
                              ? "text-[#1F1D1A] font-semibold"
                              : "text-[#2B2824] group-hover:text-[#1F1D1A]"
                          }`}
                        >
                          {opt.text}
                        </span>
                      </div>

                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-1 transition-all duration-200 ${
                          isSelected
                            ? "bg-[#8C5D50] text-white scale-100 opacity-100"
                            : "border border-[#E8E2D9] text-transparent group-hover:border-[#C49A8E] scale-90 opacity-60"
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Navigation Footer */}
              <div className="mt-8 pt-6 border-t border-[#EFECE6] flex items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={() =>
                    safeIndex === 0
                      ? setStep("register")
                      : handleGoToQuestion(Math.max(0, safeIndex - 1))
                  }
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium text-[#5C564E] hover:text-[#1F1D1A] transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>
                    {safeIndex === 0 ? "Тағйири рақам" : "Саволи қаблӣ"}
                  </span>
                </button>

                {safeIndex < questions.length - 1 ? (
                  <button
                    type="button"
                    disabled={!currentQuestionAnswered}
                    onClick={() => handleGoToQuestion(safeIndex + 1)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#FAF8F5] hover:bg-[#F3EFEA] disabled:opacity-40 disabled:pointer-events-none border border-[#E8E2D9] text-xs sm:text-sm font-medium text-[#1F1D1A] transition-all"
                  >
                    <span>Саволи баъдӣ</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!allAnswered}
                    onClick={handleFinishTest}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#1F1D1A] hover:bg-[#332F2A] disabled:opacity-40 disabled:pointer-events-none text-white text-sm font-medium transition-all shadow-sm"
                  >
                    <span>Дидани натиҷаи тест</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* PAGE 3: RESULT VIEW */}
        {step === "result" && submission && (
          <div className="space-y-6 animate-fade-in">
            {/* Top Respondent Summary Bar */}
            <div className="bg-white border border-[#E8E2D9] rounded-3xl p-5 sm:p-6 shadow-soft flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-[#F5ECEA] text-[#8C5D50] flex items-center justify-center shrink-0">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-[#8C7A6B]">
                    Натиҷаи тести худшиносӣ
                  </p>
                  <h1 className="font-serif text-lg sm:text-xl font-semibold text-[#1F1D1A]">
                    +992 {submission.respondentPhone || phoneDigits}
                  </h1>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => printSubmissionPdf(submission)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1F1D1A] hover:bg-[#332F2A] text-white text-xs sm:text-sm font-medium transition-all"
                >
                  <FileDown className="w-4 h-4" />
                  <span>Боргирии PDF / Чоп</span>
                </button>

                <button
                  type="button"
                  onClick={handleRestart}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#FAF8F5] hover:bg-[#F3EFEA] border border-[#E8E2D9] text-xs sm:text-sm font-medium text-[#4A453E] transition-all"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Аз нав</span>
                </button>
              </div>
            </div>

            {/* 1. EXACT SCREENSHOT MATCH: "Харитаи эҳсосоти шумо" Card */}
            <EmotionalMapCard
              scores={submission.scores}
              dominantState={submission.dominantState}
              showSummaryInsideCard={true}
            />

            {/* 2. Answer Sheet Copy Card ("Нусхабардории варақаи ҷавобҳо") */}
            <div className="bg-white border border-[#E8E2D9] rounded-3xl p-6 sm:p-8 shadow-soft space-y-4">
              <div>
                <h3 className="font-serif text-lg sm:text-xl font-semibold text-[#1F1D1A]">
                  Варақаи ҷавобҳои шумо
                </h3>
                <p className="text-xs sm:text-sm text-[#787167]">
                  Ҷавобҳоятро бо чунин тартиб нусхабардорӣ кунед:
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-[#E8E2D9] font-mono text-sm sm:text-base font-semibold text-[#1F1D1A] tracking-wide select-all">
                {submission.answerCode}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleCopyAnswerSheet}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#8C5D50] hover:bg-[#6E463B] text-white text-xs sm:text-sm font-medium transition-all"
                >
                  {copiedCode ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Нусхабардорӣ шуд!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Нусхабардории варақаи ҷавобҳо</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleCopyFullReport}
                  className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl bg-[#FAF8F5] hover:bg-[#F3EFEA] border border-[#E8E2D9] text-[#4A453E] text-xs sm:text-sm font-medium transition-all"
                >
                  {copiedFull ? (
                    <>
                      <Check className="w-4 h-4 text-[#2E8565]" />
                      <span>Матни пурра нусхабардорӣ шуд</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Нусхабардории матни пурра бо фоизҳо</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* 3. Difficult Spheres & Strong Spheres Analysis */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Difficult Spheres */}
              <div className="bg-white border border-[#E8E2D9] rounded-3xl p-6 shadow-soft">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-serif text-lg font-semibold text-[#1F1D1A]">
                    Соҳаҳои душвори зиндагӣ
                  </h3>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#FBF7F6] text-[#A96840] border border-[#EAD8D3]">
                    {submission.vulnerablePercentage}%
                  </span>
                </div>

                {submission.difficultSpheres.length === 0 ? (
                  <p className="text-sm text-[#5C564E] leading-relaxed">
                    Дар ҷавобҳои шумо ҳолатҳои вазнини эҳсосӣ (А, Б, В, Г) интихоб нашудаанд.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {submission.difficultSpheres.map((item) => (
                      <li
                        key={item.questionId}
                        className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-[#EFECE6] text-xs sm:text-sm"
                      >
                        <div className="flex items-center justify-between font-medium text-[#1F1D1A] mb-1">
                          <span>
                            {item.questionId}. {item.sphere}
                          </span>
                          <span className="text-[#C07D53] font-semibold">
                            {item.letter} • {EMOTIONAL_STATES[item.letter].shortName}
                          </span>
                        </div>
                        <p className="text-[#5C564E] text-xs leading-relaxed">
                          «{item.answerText}»
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Resourceful / Strong Spheres */}
              <div className="bg-white border border-[#E8E2D9] rounded-3xl p-6 shadow-soft">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-serif text-lg font-semibold text-[#1F1D1A]">
                    Нуқтаҳои устувор ва қувват
                  </h3>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#F4F8F6] text-[#2E8565] border border-[#CBE4D9]">
                    {submission.resourcefulPercentage}%
                  </span>
                </div>

                {submission.strongSpheres.length === 0 ? (
                  <p className="text-sm text-[#5C564E] leading-relaxed">
                    Ҳоло захираи равонии шумо ба дастгирӣ ва истироҳат ниёз дорад.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {submission.strongSpheres.map((item) => (
                      <li
                        key={item.questionId}
                        className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-[#EFECE6] text-xs sm:text-sm"
                      >
                        <div className="flex items-center justify-between font-medium text-[#1F1D1A] mb-1">
                          <span>
                            {item.questionId}. {item.sphere}
                          </span>
                          <span className="text-[#2E8565] font-semibold">
                            {item.letter} • {EMOTIONAL_STATES[item.letter].shortName}
                          </span>
                        </div>
                        <p className="text-[#5C564E] text-xs leading-relaxed">
                          «{item.answerText}»
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* 4. 5 Practical Exercises ("5 машқи амалӣ барои беҳтар кардани ҳолат") */}
            <div className="bg-white border border-[#E8E2D9] rounded-3xl p-6 sm:p-8 shadow-soft">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#F4F8F6] text-[#2E8565] text-xs font-medium mb-3">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Тавсияҳои амалӣ</span>
              </div>
              <h3 className="font-serif text-xl sm:text-2xl font-semibold text-[#1F1D1A] mb-2">
                5 машқи амалӣ барои беҳтар кардани ҳолат
              </h3>
              <p className="text-xs sm:text-sm text-[#787167] mb-5">
                Машқҳои махсус барои ҳолати бештар такроршавандаи шумо (
                <strong className="text-[#1F1D1A]">
                  {submission.dominantState.fullName}
                </strong>
                ):
              </p>

              <ol className="space-y-3">
                {(
                  EMOTIONAL_STATES[submission.dominantState.letter]?.exercises ||
                  EMOTIONAL_STATES["В"].exercises
                ).map((exercise, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-3.5 p-4 rounded-2xl bg-[#FAF8F5] border border-[#EFECE6]"
                  >
                    <span className="w-7 h-7 rounded-xl bg-[#8C5D50] text-white text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">
                      {index + 1}
                    </span>
                    <span className="text-sm sm:text-[15px] text-[#2B2824] leading-relaxed">
                      {exercise}
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Disclaimer */}
            <div className="p-5 rounded-2xl bg-[#FAF8F5] border border-[#E8E2D9] flex items-start gap-3 text-xs sm:text-sm text-[#787167]">
              <ShieldCheck className="w-5 h-5 text-[#8C5D50] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p>
                  Ин фоизҳо танҳо ҳиссаи ҷавобҳоро нишон медиҳанд, на сатҳи илмии энергия.
                </p>
                <p>{testConfig.disclaimer}</p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Minimalist Footer */}
      <footer className="border-t border-[#EFECE6] bg-white py-6 mt-12">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#8C7A6B]">
          <span>
            {phoneDigits ? `Рақам: +992 ${phoneDigits}` : "Тести Худшиносӣ"}
          </span>
          <span>Аз рӯйи идеяҳои Дэвид Ҳокинс</span>
        </div>
      </footer>
    </div>
  );
}
