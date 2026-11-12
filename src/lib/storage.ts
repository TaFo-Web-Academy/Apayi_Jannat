import { supabase, isSupabaseConfigured } from "./supabase";
import {
  DEFAULT_TEST,
  OptionLetter,
  SubmissionRecord,
  TestConfig,
  calculateTestResult
} from "./test-data";

const SUBMISSIONS_STORAGE_KEY = "jannat_psych_submissions_v1";
const TEST_CONFIG_STORAGE_KEY = "jannat_psych_test_config_v1";
export const ADMIN_TOKEN_STORAGE_KEY = "jannat_admin_token_v2";

export const GO_API_BASE =
  process.env.NEXT_PUBLIC_GO_API_URL || "http://localhost:8080/api";

function getAdminAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) || "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 1500
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, {
    ...options,
    signal: controller.signal
  }).finally(() => clearTimeout(timer));
}

function createSampleSubmissions(): SubmissionRecord[] {
  const sample1Answers: Record<number, OptionLetter> = {
    1: "В",
    2: "Б",
    3: "В",
    4: "Г",
    5: "Д",
    6: "Е",
    7: "Ж",
    8: "В",
    9: "Д",
    10: "Г"
  };
  const calc1 = calculateTestResult(sample1Answers, DEFAULT_TEST);

  const sample2Answers: Record<number, OptionLetter> = {
    1: "Ж",
    2: "З",
    3: "Е",
    4: "З",
    5: "Д",
    6: "Ж",
    7: "З",
    8: "Ж",
    9: "Е",
    10: "З"
  };
  const calc2 = calculateTestResult(sample2Answers, DEFAULT_TEST);

  return [
    {
      id: "demo-1",
      createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
      respondentName: "Мадина Раҳимова (Намуна)",
      respondentAge: "28",
      respondentGender: "Зан",
      respondentPhone: "+992 900 12 34 56",
      respondentNote: "Намунаи натиҷаи тест",
      answers: sample1Answers,
      ...calc1
    },
    {
      id: "demo-2",
      createdAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
      respondentName: "Нилуфар Каримова (Намуна)",
      respondentAge: "34",
      respondentGender: "Зан",
      respondentPhone: "+992 93 555 77 88",
      respondentNote: "",
      answers: sample2Answers,
      ...calc2
    }
  ];
}

export async function saveSubmission(
  input: {
    respondentName: string;
    respondentAge?: string;
    respondentGender?: string;
    respondentPhone?: string;
    respondentNote?: string;
    answers: Record<number, OptionLetter>;
  },
  testConfig: TestConfig = DEFAULT_TEST
): Promise<SubmissionRecord> {
  // Compute instantaneously (<0.1ms) so UI never waits
  const calculated = calculateTestResult(input.answers, testConfig);
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `sub-${Date.now()}`;

  const cleanName = input.respondentName.trim().slice(0, 120) || "Иштирокчии беном";
  const cleanAge = input.respondentAge?.trim().slice(0, 10) || "";
  const cleanGender = input.respondentGender?.trim().slice(0, 20) || "Зан";
  const cleanPhone = input.respondentPhone?.trim().slice(0, 40) || "";
  const cleanNote = input.respondentNote?.trim().slice(0, 500) || "";

  const optimisticRecord: SubmissionRecord = {
    id,
    createdAt: new Date().toISOString(),
    respondentName: cleanName,
    respondentAge: cleanAge,
    respondentGender: cleanGender,
    respondentPhone: cleanPhone,
    respondentNote: cleanNote,
    answers: input.answers,
    ...calculated
  };

  // Mirror to localStorage immediately (0ms)
  if (typeof window !== "undefined") {
    try {
      const existingRaw = localStorage.getItem(SUBMISSIONS_STORAGE_KEY);
      const existing: SubmissionRecord[] = existingRaw
        ? JSON.parse(existingRaw)
        : createSampleSubmissions();
      const updated = [optimisticRecord, ...existing];
      localStorage.setItem(SUBMISSIONS_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore storage quota errors
    }
  }

  // Send to Ultra-Fast Golang Backend asynchronously without blocking UI
  fetchWithTimeout(
    `${GO_API_BASE}/submissions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        respondentName: cleanName,
        respondentAge: cleanAge,
        respondentGender: cleanGender,
        respondentPhone: cleanPhone,
        respondentNote: cleanNote,
        answers: input.answers
      })
    },
    1500
  ).catch(() => {
    // If Go server is not used, fallback to Supabase if configured
    if (isSupabaseConfigured && supabase) {
      supabase
        .from("submissions")
        .insert({
          id: optimisticRecord.id,
          created_at: optimisticRecord.createdAt,
          respondent_name: optimisticRecord.respondentName,
          respondent_age: optimisticRecord.respondentAge,
          respondent_gender: optimisticRecord.respondentGender,
          respondent_phone: optimisticRecord.respondentPhone,
          respondent_note: optimisticRecord.respondentNote,
          answers: optimisticRecord.answers,
          answer_code: optimisticRecord.answerCode,
          scores: optimisticRecord.scores,
          dominant_state: optimisticRecord.dominantState,
          vulnerable_percentage: optimisticRecord.vulnerablePercentage,
          resourceful_percentage: optimisticRecord.resourcefulPercentage,
          difficult_spheres: optimisticRecord.difficultSpheres,
          strong_spheres: optimisticRecord.strongSpheres
        })
        .then(() => {});
    }
  });

  return optimisticRecord;
}

export async function getSubmissions(): Promise<SubmissionRecord[]> {
  try {
    const res = await fetchWithTimeout(
      `${GO_API_BASE}/submissions`,
      { cache: "no-store" },
      1200
    );
    if (res.ok) {
      const data = (await res.json()) as SubmissionRecord[];
      if (Array.isArray(data)) {
        return data;
      }
    }
  } catch {
    // Fallback
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from("submissions")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error && data) {
        return data.map((row: Record<string, unknown>) => ({
          id: String(row.id),
          createdAt: String(row.created_at),
          respondentName: String(row.respondent_name || ""),
          respondentAge: String(row.respondent_age || ""),
          respondentGender: String(row.respondent_gender || ""),
          respondentPhone: String(row.respondent_phone || ""),
          respondentNote: String(row.respondent_note || ""),
          answers: (row.answers as Record<number, OptionLetter>) || {},
          answerCode: String(row.answer_code || ""),
          scores: (row.scores as SubmissionRecord["scores"]) || [],
          dominantState:
            (row.dominant_state as SubmissionRecord["dominantState"]) || {
              letter: "В",
              shortName: "Тарс",
              fullName: "Тарс ва ноамнӣ",
              category: "vulnerable",
              count: 0,
              percentage: 0
            },
          vulnerablePercentage: Number(row.vulnerable_percentage || 0),
          resourcefulPercentage: Number(row.resourceful_percentage || 0),
          difficultSpheres:
            (row.difficult_spheres as SubmissionRecord["difficultSpheres"]) || [],
          strongSpheres:
            (row.strong_spheres as SubmissionRecord["strongSpheres"]) || []
        }));
      }
    } catch {
      // Fallback
    }
  }

  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(SUBMISSIONS_STORAGE_KEY);
      if (!raw) {
        const samples = createSampleSubmissions();
        localStorage.setItem(SUBMISSIONS_STORAGE_KEY, JSON.stringify(samples));
        return samples;
      }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : createSampleSubmissions();
    } catch {
      return createSampleSubmissions();
    }
  }

  return [];
}

export async function deleteSubmission(id: string): Promise<void> {
  fetchWithTimeout(
    `${GO_API_BASE}/submissions/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers: {
        ...getAdminAuthHeaders()
      }
    },
    1200
  ).catch(() => {});

  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(SUBMISSIONS_STORAGE_KEY);
      if (raw) {
        const list: SubmissionRecord[] = JSON.parse(raw);
        const filtered = list.filter((item) => item.id !== id);
        localStorage.setItem(SUBMISSIONS_STORAGE_KEY, JSON.stringify(filtered));
      }
    } catch {
      // ignore
    }
  }

  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from("submissions").delete().eq("id", id);
    } catch {
      // ignore
    }
  }
}

export async function loadTestConfig(): Promise<TestConfig> {
  try {
    const res = await fetchWithTimeout(
      `${GO_API_BASE}/test`,
      { cache: "no-store" },
      1000
    );
    if (res.ok) {
      const cfg = (await res.json()) as TestConfig;
      if (cfg && Array.isArray(cfg.questions) && cfg.questions.length > 0) {
        return cfg;
      }
    }
  } catch {
    // fallback
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from("test_configs")
        .select("config")
        .eq("id", DEFAULT_TEST.id)
        .single();
      if (!error && data && data.config) {
        return data.config as TestConfig;
      }
    } catch {
      // Fallback
    }
  }

  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(TEST_CONFIG_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as TestConfig;
        if (parsed && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
  }

  return DEFAULT_TEST;
}

export async function saveTestConfig(config: TestConfig): Promise<void> {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(TEST_CONFIG_STORAGE_KEY, JSON.stringify(config));
    } catch {
      // ignore
    }
  }

  fetchWithTimeout(
    `${GO_API_BASE}/test`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...getAdminAuthHeaders()
      },
      body: JSON.stringify(config)
    },
    1500
  ).catch(() => {});

  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from("test_configs").upsert({
        id: config.id,
        updated_at: new Date().toISOString(),
        config
      });
    } catch {
      // ignore
    }
  }
}

export async function resetTestConfig(): Promise<TestConfig> {
  if (typeof window !== "undefined") {
    localStorage.removeItem(TEST_CONFIG_STORAGE_KEY);
  }

  try {
    const res = await fetchWithTimeout(
      `${GO_API_BASE}/test/reset`,
      {
        method: "POST",
        headers: {
          ...getAdminAuthHeaders()
        }
      },
      1200
    );
    if (res.ok) {
      return (await res.json()) as TestConfig;
    }
  } catch {
    // ignore
  }

  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from("test_configs").delete().eq("id", DEFAULT_TEST.id);
    } catch {
      // ignore
    }
  }
  return DEFAULT_TEST;
}

export function safeCopyToClipboard(text: string): boolean {
  if (typeof window === "undefined") return false;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => {
      fallbackCopyText(text);
    });
    return true;
  }
  return fallbackCopyText(text);
}

function fallbackCopyText(text: string): boolean {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return true;
  } catch {
    return false;
  }
}
