"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Copy,
  Database,
  Download,
  Eye,
  EyeOff,
  FileDown,
  Lock,
  LogOut,
  RotateCcw,
  Save,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";
import EmotionalMapCard from "@/components/EmotionalMapCard";
import {
  DEFAULT_TEST,
  EMOTIONAL_STATES,
  ORDERED_LETTERS,
  SubmissionRecord,
  TestConfig,
} from "@/lib/test-data";
import {
  ADMIN_TOKEN_STORAGE_KEY,
  GO_API_BASE,
  deleteSubmission,
  getSubmissions,
  loadTestConfig,
  resetTestConfig,
  safeCopyToClipboard,
  saveTestConfig,
} from "@/lib/storage";
import {
  exportSubmissionsToExcel,
  printSubmissionPdf,
} from "@/lib/export-utils";
import { isSupabaseConfigured } from "@/lib/supabase";

const ADMIN_AUTH_KEY = "jannat_admin_auth_v2";
const ADMIN_LOCKOUT_KEY = "jannat_admin_lockout_until_v2";
const ADMIN_FAILS_KEY = "jannat_admin_fails_v2";
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const EXPECTED_PASSWORD =
  process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "Mustafo2010#";

type AdminTab = "submissions" | "editor" | "database";

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [lockRemainingSec, setLockRemainingSec] = useState(0);
  const [isVerifying, setIsVerifying] = useState(false);

  const [activeTab, setActiveTab] = useState<AdminTab>("submissions");
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterLetter, setFilterLetter] = useState<string>("ALL");
  const [selectedSubmission, setSelectedSubmission] =
    useState<SubmissionRecord | null>(null);

  // Test Editor state
  const [testConfig, setTestConfig] = useState<TestConfig>(DEFAULT_TEST);
  const [editorSaved, setEditorSaved] = useState(false);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  // Check session & lockout timer on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const rawAuth = sessionStorage.getItem(ADMIN_AUTH_KEY);
        if (rawAuth) {
          const parsed = JSON.parse(rawAuth);
          if (parsed.exp && Date.now() < parsed.exp) {
            setIsAuthenticated(true);
          } else {
            sessionStorage.removeItem(ADMIN_AUTH_KEY);
            sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
          }
        }
      } catch {
        // ignore
      }
      updateLockoutCountdown();
    }
    refreshData();
  }, []);

  // Tick lockout countdown every second if locked
  useEffect(() => {
    if (lockRemainingSec <= 0) return;
    const timer = setInterval(() => {
      updateLockoutCountdown();
    }, 1000);
    return () => clearInterval(timer);
  }, [lockRemainingSec]);

  const updateLockoutCountdown = () => {
    if (typeof window === "undefined") return;
    const until = Number(localStorage.getItem(ADMIN_LOCKOUT_KEY) || "0");
    const diff = Math.ceil((until - Date.now()) / 1000);
    if (diff > 0) {
      setLockRemainingSec(diff);
    } else {
      setLockRemainingSec(0);
    }
  };

  const refreshData = async () => {
    setLoading(true);
    const [subs, cfg] = await Promise.all([
      getSubmissions(),
      loadTestConfig(),
    ]);
    setSubmissions(subs);
    setTestConfig(cfg);
    setLoading(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockRemainingSec > 0 || isVerifying) return;

    const trimmed = passwordInput.trim();
    if (!trimmed) {
      setLoginError("Лутфан рамзи дастрасиро ворид кунед");
      return;
    }

    setIsVerifying(true);
    setLoginError("");

    try {
      // 1. Try Golang Backend verification first (Constant-time + HMAC token + IP rate limit)
      const res = await fetch(`${GO_API_BASE}/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: trimmed }),
      });
      const data = await res.json();

      if (res.ok && data.authenticated) {
        completeSuccessfulLogin(data.token || "local-verified");
        return;
      }

      if (res.status === 429 && data.remainingSec) {
        const until = Date.now() + Number(data.remainingSec) * 1000;
        localStorage.setItem(ADMIN_LOCKOUT_KEY, String(until));
        setLockRemainingSec(Number(data.remainingSec));
        setLoginError(
          data.error ||
            "Аз сабаби кӯшишҳои зиёди нодуруст дастрасӣ муваққатан маҳдуд шуд."
        );
        return;
      }

      setLoginError(data.error || "Рамзи воридшавӣ нодуруст аст");
      registerClientFailure();
    } catch {
      // 2. Fallback local check if Go server is offline
      if (trimmed === EXPECTED_PASSWORD) {
        completeSuccessfulLogin("local-verified");
      } else {
        registerClientFailure();
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const completeSuccessfulLogin = (token: string) => {
    localStorage.removeItem(ADMIN_FAILS_KEY);
    localStorage.removeItem(ADMIN_LOCKOUT_KEY);
    sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
    sessionStorage.setItem(
      ADMIN_AUTH_KEY,
      JSON.stringify({ exp: Date.now() + SESSION_TTL_MS })
    );
    setPasswordInput("");
    setLoginError("");
    setIsAuthenticated(true);
  };

  const registerClientFailure = () => {
    const currentFails =
      Number(localStorage.getItem(ADMIN_FAILS_KEY) || "0") + 1;
    if (currentFails >= MAX_ATTEMPTS) {
      const until = Date.now() + LOCKOUT_MS;
      localStorage.setItem(ADMIN_LOCKOUT_KEY, String(until));
      localStorage.setItem(ADMIN_FAILS_KEY, "0");
      setLockRemainingSec(Math.ceil(LOCKOUT_MS / 1000));
      setLoginError(
        "5 кӯшиши нодуруст! Воридшавӣ барои 5 дақиқа маҳдуд карда шуд."
      );
    } else {
      localStorage.setItem(ADMIN_FAILS_KEY, String(currentFails));
      const left = MAX_ATTEMPTS - currentFails;
      setLoginError(`Рамз нодуруст аст. Кӯшишҳои боқимонда: ${left}`);
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setPasswordInput("");
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(ADMIN_AUTH_KEY);
      sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteSubmission(id);
    setSubmissions((prev) => prev.filter((item) => item.id !== id));
    if (selectedSubmission?.id === id) {
      setSelectedSubmission(null);
    }
  };

  const handleSaveEditor = async () => {
    await saveTestConfig(testConfig);
    setEditorSaved(true);
    setTimeout(() => setEditorSaved(false), 2500);
  };

  const handleResetEditor = async () => {
    const fresh = await resetTestConfig();
    setTestConfig(fresh);
    setEditorSaved(true);
    setTimeout(() => setEditorSaved(false), 2500);
  };

  const filteredSubmissions = useMemo(() => {
    return submissions.filter((s) => {
      const matchesSearch =
        !searchQuery.trim() ||
        s.respondentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.respondentPhone || "")
          .toLowerCase()
          .includes(searchQuery.toLowerCase()) ||
        s.answerCode.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesLetter =
        filterLetter === "ALL" || s.dominantState.letter === filterLetter;

      return matchesSearch && matchesLetter;
    });
  }, [submissions, searchQuery, filterLetter]);

  const stats = useMemo(() => {
    const total = submissions.length;
    if (total === 0) {
      return {
        total: 0,
        avgResourceful: 0,
        avgVulnerable: 0,
        topState: "—",
      };
    }
    const avgResourceful = Math.round(
      submissions.reduce((acc, s) => acc + s.resourcefulPercentage, 0) / total
    );
    const avgVulnerable = Math.round(
      submissions.reduce((acc, s) => acc + s.vulnerablePercentage, 0) / total
    );

    const freq: Record<string, number> = {};
    submissions.forEach((s) => {
      const name = s.dominantState.shortName;
      freq[name] = (freq[name] || 0) + 1;
    });
    const topState =
      Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";

    return { total, avgResourceful, avgVulnerable, topState };
  }, [submissions]);

  // HARDENED LOGIN SCREEN (Zero password hints + Brute-force lockout)
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex flex-col justify-center items-center px-4">
        <div className="w-full max-w-md bg-white border border-[#E8E2D9] rounded-3xl p-8 sm:p-10 shadow-soft animate-fade-in">
          <div className="flex items-center justify-between mb-6">
            <div className="w-12 h-12 rounded-2xl bg-[#F5ECEA] text-[#8C5D50] flex items-center justify-center">
              <Lock className="w-5 h-5" />
            </div>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-3 py-1 rounded-full bg-[#F4F8F6] text-[#2E8565] border border-[#CBE4D9]">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Ҳимояи фаъол</span>
            </span>
          </div>

          <h1 className="font-serif text-2xl font-semibold text-[#1F1D1A] mb-1">
            Дастрасии махфӣ (Админ)
          </h1>
          <p className="text-sm text-[#787167] mb-6">
            Барои ворид шудан ба панели идоракунӣ коди махфиро ворид намоед.
          </p>

          {lockRemainingSec > 0 ? (
            <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm space-y-1.5 mb-4">
              <div className="flex items-center gap-2 font-semibold">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>Воридшавӣ муваққатан маҳдуд шуд</span>
              </div>
              <p>
                Аз сабаби 5 кӯшиши нодуруст, лутфан пас аз{" "}
                <strong className="font-mono">{lockRemainingSec} сония</strong>{" "}
                дубора кӯшиш кунед.
              </p>
            </div>
          ) : (
            <form onSubmit={handleLogin} noValidate className="space-y-4">
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-[#5C564E] mb-2">
                  Коди махфӣ
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete="off"
                    value={passwordInput}
                    onChange={(e) => {
                      setPasswordInput(e.target.value);
                      if (loginError) setLoginError("");
                    }}
                    placeholder="••••••••••••"
                    className="w-full pl-4 pr-11 py-3.5 rounded-2xl bg-[#FAF8F5] border border-[#E8E2D9] focus:border-[#8C5D50] text-sm focus:outline-none focus:bg-white transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#8C7A6B] hover:text-[#1F1D1A]"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {loginError && (
                  <p className="text-xs text-red-600 mt-2 font-medium">
                    {loginError}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isVerifying || lockRemainingSec > 0}
                className="w-full py-3.5 rounded-2xl bg-[#1F1D1A] hover:bg-[#332F2A] disabled:opacity-50 text-white text-sm font-medium transition-all"
              >
                {isVerifying ? "Санҷиш..." : "Ворид шудан"}
              </button>
            </form>
          )}

          <div className="mt-6 pt-5 border-t border-[#EFECE6] flex items-center justify-between text-xs text-[#8C7A6B]">
            <span>HMAC-SHA256 • Anti-Brute-Force</span>
            <Link
              href="/"
              className="text-[#8C5D50] hover:underline font-medium"
            >
              ← Бозгашт ба тест
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#1F1D1A] flex flex-col">
      {/* Top Bar */}
      <header className="bg-white border-b border-[#E8E2D9] sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-[#5C564E] hover:text-[#1F1D1A] px-3 py-1.5 rounded-xl bg-[#FAF8F5] border border-[#E8E2D9]"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Ба саҳифаи тест</span>
            </Link>
            <div className="hidden sm:block">
              <span className="font-serif text-base font-semibold text-[#1F1D1A]">
                Админ-панели Тести Худшиносӣ
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`hidden md:inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border ${
                isSupabaseConfigured
                  ? "bg-[#F4F8F6] text-[#2E8565] border-[#CBE4D9]"
                  : "bg-[#FBF7F6] text-[#8C5D50] border-[#EAD8D3]"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isSupabaseConfigured ? "bg-[#2E8565]" : "bg-[#C07D53]"
                }`}
              />
              {isSupabaseConfigured ? "Supabase Cloud" : "Go + Local DB"}
            </span>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-[#787167] hover:text-[#1F1D1A] border border-[#E8E2D9]"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Баромад</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Tabs Navigation */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="inline-flex p-1 rounded-2xl bg-white border border-[#E8E2D9]">
            <button
              type="button"
              onClick={() => setActiveTab("submissions")}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                activeTab === "submissions"
                  ? "bg-[#1F1D1A] text-white"
                  : "text-[#5C564E] hover:text-[#1F1D1A]"
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Натиҷаҳои иштирокчиён ({submissions.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("editor")}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                activeTab === "editor"
                  ? "bg-[#1F1D1A] text-white"
                  : "text-[#5C564E] hover:text-[#1F1D1A]"
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Таҳрири саволҳои тест</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("database")}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                activeTab === "database"
                  ? "bg-[#1F1D1A] text-white"
                  : "text-[#5C564E] hover:text-[#1F1D1A]"
              }`}
            >
              <Database className="w-4 h-4" />
              <span>Supabase ва Домен (Ройгон)</span>
            </button>
          </div>

          {activeTab === "submissions" && (
            <button
              type="button"
              onClick={() => exportSubmissionsToExcel(filteredSubmissions)}
              disabled={filteredSubmissions.length === 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-[#2E8565] hover:bg-[#236B50] disabled:opacity-40 text-white text-xs sm:text-sm font-medium transition-all shadow-sm"
            >
              <Download className="w-4 h-4" />
              <span>Боргирии Excel (.xlsx)</span>
            </button>
          )}
        </div>

        {/* TAB 1: SUBMISSIONS */}
        {activeTab === "submissions" && (
          <div className="space-y-6">
            {/* Summary KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-[#E8E2D9] rounded-3xl p-5 shadow-soft">
                <p className="text-xs uppercase tracking-wider text-[#8C7A6B] mb-1">
                  Ҳамагӣ супориданд
                </p>
                <p className="font-serif text-2xl sm:text-3xl font-semibold text-[#1F1D1A]">
                  {stats.total} нафар
                </p>
              </div>

              <div className="bg-white border border-[#E8E2D9] rounded-3xl p-5 shadow-soft">
                <p className="text-xs uppercase tracking-wider text-[#8C7A6B] mb-1">
                  Ҳолати бештар вохӯранда
                </p>
                <p className="font-serif text-2xl sm:text-3xl font-semibold text-[#8C5D50]">
                  {stats.topState}
                </p>
              </div>

              <div className="bg-white border border-[#E8E2D9] rounded-3xl p-5 shadow-soft">
                <p className="text-xs uppercase tracking-wider text-[#8C7A6B] mb-1">
                  Ҳиссаи миёнаи устувор (Д–З)
                </p>
                <p className="font-serif text-2xl sm:text-3xl font-semibold text-[#2E8565]">
                  {stats.avgResourceful}%
                </p>
              </div>

              <div className="bg-white border border-[#E8E2D9] rounded-3xl p-5 shadow-soft">
                <p className="text-xs uppercase tracking-wider text-[#8C7A6B] mb-1">
                  Ҳиссаи миёнаи ҳассос (А–Г)
                </p>
                <p className="font-serif text-2xl sm:text-3xl font-semibold text-[#C07D53]">
                  {stats.avgVulnerable}%
                </p>
              </div>
            </div>

            {/* Search and Filter Bar */}
            <div className="bg-white border border-[#E8E2D9] rounded-3xl p-4 sm:p-5 shadow-soft flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[#8C7A6B] absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Ҷустуҷӯ аз рӯйи телефон ё коди ҷавобҳо..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-[#FAF8F5] border border-[#E8E2D9] text-sm focus:outline-none focus:border-[#8C5D50] focus:bg-white"
                />
              </div>

              <select
                value={filterLetter}
                onChange={(e) => setFilterLetter(e.target.value)}
                className="px-4 py-2.5 rounded-2xl bg-[#FAF8F5] border border-[#E8E2D9] text-sm text-[#1F1D1A] focus:outline-none focus:border-[#8C5D50]"
              >
                <option value="ALL">Ҳамаи ҳолатҳои эҳсосӣ</option>
                {ORDERED_LETTERS.map((l) => (
                  <option key={l} value={l}>
                    {l} — {EMOTIONAL_STATES[l].fullName}
                  </option>
                ))}
              </select>
            </div>

            {/* Submissions Table */}
            <div className="bg-white border border-[#E8E2D9] rounded-3xl overflow-hidden shadow-soft">
              {loading ? (
                <div className="p-12 text-center text-sm text-[#787167]">
                  Боргирии натиҷаҳо...
                </div>
              ) : filteredSubmissions.length === 0 ? (
                <div className="p-12 text-center text-sm text-[#787167]">
                  Ягон натиҷа ёфт нашуд.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#EFECE6] bg-[#FAF8F5] text-[11px] uppercase tracking-wider text-[#787167]">
                        <th className="py-3.5 px-5">Иштирокчӣ / Рақами телефон</th>
                        <th className="py-3.5 px-4">Варақаи ҷавобҳо (1–10)</th>
                        <th className="py-3.5 px-4">Ҳолати асосӣ</th>
                        <th className="py-3.5 px-4">Тавозун</th>
                        <th className="py-3.5 px-4">Сана</th>
                        <th className="py-3.5 px-5 text-right">Амалҳо</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EFECE6] text-sm">
                      {filteredSubmissions.map((sub) => {
                        const isVuln =
                          sub.dominantState.category === "vulnerable";
                        return (
                          <tr
                            key={sub.id}
                            className="hover:bg-[#FAF8F5]/70 transition-colors"
                          >
                            <td className="py-4 px-5">
                              <div className="font-semibold text-[#1F1D1A]">
                                {sub.respondentPhone
                                  ? `+992 ${sub.respondentPhone.replace(/^\+?992\s*/, "")}`
                                  : sub.respondentName}
                              </div>
                              {sub.respondentName &&
                                !sub.respondentName.startsWith("+992") && (
                                  <div className="text-xs text-[#787167]">
                                    {sub.respondentName}
                                  </div>
                                )}
                            </td>

                            <td className="py-4 px-4">
                              <div className="inline-flex items-center gap-2 font-mono text-xs bg-[#FAF8F5] border border-[#E8E2D9] px-2.5 py-1.5 rounded-xl text-[#3D3832]">
                                <span>{sub.answerCode}</span>
                                <button
                                  type="button"
                                  title="Нусхабардорӣ"
                                  onClick={() => {
                                    safeCopyToClipboard(sub.answerCode);
                                    setCopiedCodeId(sub.id);
                                    setTimeout(
                                      () => setCopiedCodeId(null),
                                      2000
                                    );
                                  }}
                                  className="text-[#8C5D50] hover:text-[#1F1D1A]"
                                >
                                  {copiedCodeId === sub.id ? (
                                    <Check className="w-3.5 h-3.5 text-[#2E8565]" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                            </td>

                            <td className="py-4 px-4">
                              <span
                                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-white"
                                style={{
                                  backgroundColor: isVuln
                                    ? "#C07D53"
                                    : "#3B9B78",
                                }}
                              >
                                {sub.dominantState.shortName} (
                                {sub.dominantState.percentage}%)
                              </span>
                            </td>

                            <td className="py-4 px-4 text-xs">
                              <span className="text-[#C07D53] font-medium">
                                Ҳассос: {sub.vulnerablePercentage}%
                              </span>
                              <span className="mx-1.5 text-[#D5CFC7]">|</span>
                              <span className="text-[#2E8565] font-medium">
                                Устувор: {sub.resourcefulPercentage}%
                              </span>
                            </td>

                            <td className="py-4 px-4 text-xs text-[#787167]">
                              {new Date(sub.createdAt).toLocaleString("ru-RU", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </td>

                            <td className="py-4 px-5 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setSelectedSubmission(sub)}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#FAF8F5] hover:bg-[#F3EFEA] border border-[#E8E2D9] text-xs font-medium text-[#1F1D1A]"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>Харита</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => printSubmissionPdf(sub)}
                                  title="Чопи PDF"
                                  className="p-1.5 rounded-xl bg-[#FAF8F5] hover:bg-[#F3EFEA] border border-[#E8E2D9] text-[#5C564E] hover:text-[#1F1D1A]"
                                >
                                  <FileDown className="w-4 h-4" />
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleDelete(sub.id)}
                                  title="Нест кардан"
                                  className="p-1.5 rounded-xl bg-[#FAF8F5] hover:bg-red-50 border border-[#E8E2D9] text-[#787167] hover:text-red-600"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: TEST QUESTIONS EDITOR */}
        {activeTab === "editor" && (
          <div className="space-y-6">
            <div className="bg-white border border-[#E8E2D9] rounded-3xl p-6 sm:p-8 shadow-soft space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#EFECE6] pb-5">
                <div>
                  <h2 className="font-serif text-xl font-semibold text-[#1F1D1A]">
                    Таҳрири матн ва саволҳои тест
                  </h2>
                  <p className="text-xs sm:text-sm text-[#787167]">
                    Шумо метавонед матни ҳар як савол ё варианти ҷавобро тағйир диҳед
                  </p>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleResetEditor}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#FAF8F5] hover:bg-[#F3EFEA] border border-[#E8E2D9] text-xs font-medium text-[#5C564E]"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Барқарор кардани стандарт</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveEditor}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1F1D1A] hover:bg-[#332F2A] text-white text-xs sm:text-sm font-medium"
                  >
                    {editorSaved ? (
                      <>
                        <Check className="w-4 h-4 text-[#3B9B78]" />
                        <span>Захира шуд!</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        <span>Захира кардани тағйирот</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wider text-[#5C564E] mb-1.5">
                    Сарлавҳаи тест
                  </label>
                  <input
                    type="text"
                    value={testConfig.title}
                    onChange={(e) =>
                      setTestConfig({ ...testConfig, title: e.target.value })
                    }
                    className="w-full px-4 py-2.5 rounded-xl bg-[#FAF8F5] border border-[#E8E2D9] text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium uppercase tracking-wider text-[#5C564E] mb-1.5">
                    Зерсарлавҳа
                  </label>
                  <input
                    type="text"
                    value={testConfig.subtitle}
                    onChange={(e) =>
                      setTestConfig({ ...testConfig, subtitle: e.target.value })
                    }
                    className="w-full px-4 py-2.5 rounded-xl bg-[#FAF8F5] border border-[#E8E2D9] text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-[#5C564E] mb-1.5">
                  Дастури тест
                </label>
                <textarea
                  rows={2}
                  value={testConfig.instruction}
                  onChange={(e) =>
                    setTestConfig({
                      ...testConfig,
                      instruction: e.target.value,
                    })
                  }
                  className="w-full px-4 py-2.5 rounded-xl bg-[#FAF8F5] border border-[#E8E2D9] text-sm"
                />
              </div>
            </div>

            {/* Questions List Editor */}
            <div className="space-y-4">
              {testConfig.questions.map((q, qIdx) => (
                <div
                  key={q.id}
                  className="bg-white border border-[#E8E2D9] rounded-3xl p-6 shadow-soft space-y-4"
                >
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#8C5D50] mb-1">
                        Саволи {q.id} — Соҳаи зиндагӣ
                      </label>
                      <input
                        type="text"
                        value={q.sphere}
                        onChange={(e) => {
                          const nextQ = [...testConfig.questions];
                          nextQ[qIdx] = { ...q, sphere: e.target.value };
                          setTestConfig({ ...testConfig, questions: nextQ });
                        }}
                        className="w-full px-3.5 py-2 rounded-xl bg-[#FAF8F5] border border-[#E8E2D9] text-sm"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-[#1F1D1A] mb-1">
                        Матни савол
                      </label>
                      <input
                        type="text"
                        value={q.question}
                        onChange={(e) => {
                          const nextQ = [...testConfig.questions];
                          nextQ[qIdx] = { ...q, question: e.target.value };
                          setTestConfig({ ...testConfig, questions: nextQ });
                        }}
                        className="w-full px-3.5 py-2 rounded-xl bg-[#FAF8F5] border border-[#E8E2D9] text-sm font-medium"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-2">
                    {q.options.map((opt, optIdx) => (
                      <div
                        key={opt.letter}
                        className="flex items-center gap-2 bg-[#FAF8F5] p-2 rounded-xl border border-[#EFECE6]"
                      >
                        <span className="w-7 h-7 rounded-lg bg-white border border-[#E8E2D9] flex items-center justify-center text-xs font-bold text-[#8C5D50] shrink-0">
                          {opt.letter}
                        </span>
                        <input
                          type="text"
                          value={opt.text}
                          onChange={(e) => {
                            const nextQ = [...testConfig.questions];
                            const nextOpts = [...q.options];
                            nextOpts[optIdx] = {
                              ...opt,
                              text: e.target.value,
                            };
                            nextQ[qIdx] = { ...q, options: nextOpts };
                            setTestConfig({ ...testConfig, questions: nextQ });
                          }}
                          className="w-full bg-transparent text-xs sm:text-sm text-[#1F1D1A] focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: FREE SUPABASE & VERCEL GUIDE */}
        {activeTab === "database" && (
          <div className="bg-white border border-[#E8E2D9] rounded-3xl p-6 sm:p-8 shadow-soft space-y-6">
            <div>
              <h2 className="font-serif text-xl sm:text-2xl font-semibold text-[#1F1D1A]">
                Роҳнамои пайвасти ройгон (Supabase + Vercel)
              </h2>
              <p className="text-sm text-[#5C564E] mt-1">
                Чӣ тавр сайтро комилан ройгон (0$) бо базаи маълумот ва домени худ дар интернет фаъол кунед:
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-5 rounded-2xl bg-[#FAF8F5] border border-[#EFECE6] space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#8C5D50]">
                  Қадами 1 • Базаи маълумот
                </span>
                <h3 className="font-semibold text-base text-[#1F1D1A]">
                  Supabase.com (Free)
                </h3>
                <p className="text-xs text-[#5C564E] leading-relaxed">
                  1. Дар сайт <strong>supabase.com</strong> аккаунти ройгон кушоед ва <strong>New Project</strong> созед.
                  <br />
                  2. Ба бахши <strong>SQL Editor</strong> даромада, коди файли <code>supabase/schema.sql</code>-ро гузоред ва <strong>Run</strong> пахш кунед.
                  <br />
                  3. Аз <strong>Project Settings → API</strong> ду калидро гиред: <code>Project URL</code> ва <code>anon public key</code>.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-[#FAF8F5] border border-[#EFECE6] space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#8C5D50]">
                  Қадами 2 • Код дар GitHub
                </span>
                <h3 className="font-semibold text-base text-[#1F1D1A]">
                  GitHub Repository
                </h3>
                <p className="text-xs text-[#5C564E] leading-relaxed">
                  1. Дар <strong>github.com</strong> репозиторияи нав созед.
                  <br />
                  2. Ин лоиҳаро ба GitHub бор кунед (<code>git push</code>).
                  <br />
                  3. Ҳар вақте ки шумо дар код тағйирот ворид кунед, сайт худкор нав мешавад.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-[#FAF8F5] border border-[#EFECE6] space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#8C5D50]">
                  Қадами 3 • Хостинг ва Домен
                </span>
                <h3 className="font-semibold text-base text-[#1F1D1A]">
                  Vercel.com (Free)
                </h3>
                <p className="text-xs text-[#5C564E] leading-relaxed">
                  1. Дар <strong>vercel.com</strong> тавассути GitHub ворид шавед ва <strong>Add New Project</strong> пахш кунед.
                  <br />
                  2. Дар бахши <strong>Environment Variables</strong> калидҳои Supabase (<code>NEXT_PUBLIC_SUPABASE_URL</code> ва <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>)-ро гузоред.
                  <br />
                  3. Дар <strong>Settings → Domains</strong> домени дилхоҳи худро интихоб кунед!
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* MODAL FOR RESPONDENT DETAILS */}
      {selectedSubmission && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#FAF8F5] border border-[#E8E2D9] rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8 shadow-card space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-[#8C7A6B]">
                  Варақаи муфассали иштирокчӣ
                </p>
                <h2 className="font-serif text-2xl font-semibold text-[#1F1D1A]">
                  {selectedSubmission.respondentPhone
                    ? `+992 ${selectedSubmission.respondentPhone.replace(/^\+?992\s*/, "")}`
                    : selectedSubmission.respondentName}
                </h2>
                <p className="text-xs text-[#787167] mt-0.5">
                  {new Date(selectedSubmission.createdAt).toLocaleString(
                    "ru-RU"
                  )}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedSubmission(null)}
                className="p-2 rounded-xl bg-white border border-[#E8E2D9] text-[#5C564E] hover:text-[#1F1D1A]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-white border border-[#E8E2D9] flex items-center justify-between gap-3">
              <span className="font-mono text-xs sm:text-sm font-semibold text-[#1F1D1A]">
                {selectedSubmission.answerCode}
              </span>
              <button
                type="button"
                onClick={() => printSubmissionPdf(selectedSubmission)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1F1D1A] text-white text-xs font-medium shrink-0"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>Чопи PDF</span>
              </button>
            </div>

            <EmotionalMapCard
              scores={selectedSubmission.scores}
              dominantState={selectedSubmission.dominantState}
              showSummaryInsideCard={true}
            />

            {/* Detailed 10 Answers */}
            <div className="bg-white border border-[#E8E2D9] rounded-3xl p-5 sm:p-6 space-y-3">
              <h3 className="font-serif text-lg font-semibold text-[#1F1D1A]">
                Ҷавобҳо ба 10 савол
              </h3>
              <div className="space-y-2.5">
                {testConfig.questions.map((q) => {
                  const chosenLetter = selectedSubmission.answers[q.id];
                  const chosenOpt = q.options.find(
                    (o) => o.letter === chosenLetter
                  );
                  const st = chosenLetter
                    ? EMOTIONAL_STATES[chosenLetter]
                    : null;
                  return (
                    <div
                      key={q.id}
                      className="p-3 rounded-2xl bg-[#FAF8F5] border border-[#EFECE6] text-xs sm:text-sm"
                    >
                      <div className="flex items-center justify-between gap-2 font-medium text-[#1F1D1A] mb-1">
                        <span>
                          {q.id}. {q.question}
                        </span>
                        {chosenLetter && st && (
                          <span
                            className="px-2 py-0.5 rounded-md text-white text-[11px] font-semibold shrink-0"
                            style={{ backgroundColor: st.color }}
                          >
                            {chosenLetter} • {st.shortName}
                          </span>
                        )}
                      </div>
                      <p className="text-[#5C564E] text-xs">
                        {chosenOpt ? chosenOpt.text : "Ҷавоб дода нашудааст"}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
