import * as XLSX from "xlsx";
import { EMOTIONAL_STATES, SubmissionRecord } from "./test-data";

function escapeHtml(unsafe: string | undefined | null): string {
  if (!unsafe) return "";
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function exportSubmissionsToExcel(submissions: SubmissionRecord[]): void {
  const rows = submissions.map((sub, idx) => {
    const scoreMap: Record<string, number> = {};
    sub.scores.forEach((s) => {
      scoreMap[s.shortName] = s.percentage;
    });

    return {
      "№": idx + 1,
      "Сана ва вақт": new Date(sub.createdAt).toLocaleString("ru-RU"),
      "Ному насаб": sub.respondentName,
      "Синну сол": sub.respondentAge || "—",
      "Ҷинс": sub.respondentGender || "—",
      "Телефон": sub.respondentPhone || "—",
      "Варақаи ҷавобҳо": sub.answerCode,
      "Ҳолати бартаридошта": `${sub.dominantState.fullName} (${sub.dominantState.percentage}%)`,
      "Ноумедӣ (А) %": scoreMap["Ноумедӣ"] ?? 0,
      "Гунаҳкорӣ (Б) %": scoreMap["Гунаҳкорӣ"] ?? 0,
      "Тарс (В) %": scoreMap["Тарс"] ?? 0,
      "Хашм (Г) %": scoreMap["Хашм"] ?? 0,
      "Ҷасорат (Д) %": scoreMap["Ҷасорат"] ?? 0,
      "Фаҳмиш (Е) %": scoreMap["Фаҳмиш"] ?? 0,
      "Қабул (Ж) %": scoreMap["Қабул"] ?? 0,
      "Оромӣ (З) %": scoreMap["Оромӣ"] ?? 0,
      "Ҳиссаи ҳолатҳои устувор %": sub.resourcefulPercentage,
      "Соҳаҳои душвор": sub.difficultSpheres
        .map((d) => `${d.sphere} (${d.letter})`)
        .join("; ")
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet["!cols"] = [
    { wch: 5 },
    { wch: 18 },
    { wch: 26 },
    { wch: 10 },
    { wch: 10 },
    { wch: 18 },
    { wch: 36 },
    { wch: 30 },
    { wch: 14 },
    { wch: 15 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 22 },
    { wch: 45 }
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Натиҷаҳои Тест");

  const dateStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `Natijaho_Jannat_Test_${dateStr}.xlsx`);
}

export function printSubmissionPdf(submission: SubmissionRecord): void {
  if (typeof window === "undefined") return;

  const dominantInfo =
    EMOTIONAL_STATES[submission.dominantState.letter] || EMOTIONAL_STATES["В"];

  const barsHtml = submission.scores
    .map((s) => {
      const barColor = s.category === "vulnerable" ? "#C07D53" : "#3B9B78";
      const safePct = Math.max(0, Math.min(100, Number(s.percentage) || 0));
      const width = safePct > 0 ? `${safePct}%` : "0%";
      return `
        <div style="margin-bottom: 14px;">
          <div style="display:flex; justify-content:space-between; font-size:14px; margin-bottom:6px; color:#1F1D1A;">
            <span>${escapeHtml(s.shortName)}</span>
            <strong style="font-weight:600;">${safePct}%</strong>
          </div>
          <div style="height:10px; width:100%; background:#EFECE6; border-radius:999px; overflow:hidden;">
            <div style="height:100%; width:${width}; background:${barColor}; border-radius:999px;"></div>
          </div>
        </div>
      `;
    })
    .join("");

  const difficultHtml =
    submission.difficultSpheres.length > 0
      ? submission.difficultSpheres
          .map(
            (d) =>
              `<li style="margin-bottom:6px;"><strong>${escapeHtml(d.sphere)}</strong> — ${escapeHtml(d.stateName)} (${escapeHtml(d.letter)}): <span style="color:#57534E;">«${escapeHtml(d.answerText)}»</span></li>`
          )
          .join("")
      : `<li>Ҳамаи ҷавобҳо дар ҳолатҳои устувор ва созанда интихоб шудаанд.</li>`;

  const exercisesHtml = dominantInfo.exercises
    .map((ex) => `<li style="margin-bottom:8px;">${escapeHtml(ex)}</li>`)
    .join("");

  const safeName = escapeHtml(submission.respondentName);
  const safeAge = escapeHtml(submission.respondentAge || "—");
  const safePhone = escapeHtml(submission.respondentPhone || "—");
  const safeDomName = escapeHtml(submission.dominantState.fullName);
  const safeDomPct = Math.max(0, Math.min(100, Number(submission.dominantState.percentage) || 0));
  const safeCode = escapeHtml(submission.answerCode);

  const html = `
    <!DOCTYPE html>
    <html lang="tg">
    <head>
      <meta charset="UTF-8" />
      <title>Натиҷаи тест — ${safeName}</title>
      <style>
        @page { size: A4; margin: 16mm; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          color: #1F1D1A;
          background: #FFFFFF;
          line-height: 1.5;
          margin: 0;
          padding: 0;
        }
        .header {
          border-bottom: 1px solid #E8E2D9;
          padding-bottom: 14px;
          margin-bottom: 20px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }
        .title {
          font-family: Georgia, serif;
          font-size: 20px;
          font-weight: 600;
          margin: 0 0 4px 0;
        }
        .subtitle {
          font-size: 12px;
          color: #787167;
          margin: 0;
        }
        .card {
          border: 1px solid #E8E2D9;
          border-radius: 16px;
          padding: 20px;
          margin-bottom: 18px;
          background: #FDFCFB;
        }
        h2 {
          font-size: 17px;
          margin: 0 0 14px 0;
          color: #1F1D1A;
        }
        .meta-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          font-size: 13px;
          margin-bottom: 16px;
        }
        .code-box {
          background: #F5ECEA;
          padding: 10px 14px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 600;
          color: #6E463B;
          margin-bottom: 18px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <p class="title">ТЕСТИ ХУДШИНОСӢ: ХАРИТАИ ЭҲСОСОТ</p>
          <p class="subtitle">Иштирокчӣ: ${safeName} • Аз рӯйи идеяҳои Дэвид Ҳокинс</p>
        </div>
        <div style="text-align:right; font-size:12px; color:#787167;">
          ${new Date(submission.createdAt).toLocaleDateString("ru-RU")}
        </div>
      </div>

      <div class="meta-grid">
        <div><strong>Иштирокчӣ:</strong> ${safeName}</div>
        <div><strong>Синну сол:</strong> ${safeAge}</div>
        <div><strong>Рақами телефон:</strong> ${safePhone}</div>
        <div><strong>Ҳолати асосӣ:</strong> ${safeDomName} (${safeDomPct}%)</div>
      </div>

      <div class="code-box">
        Варақаи ҷавобҳо: ${safeCode}
      </div>

      <div class="card">
        <h2>Харитаи эҳсосоти шумо</h2>
        ${barsHtml}
      </div>

      <div class="card">
        <h2>Хулоса ва таҳлил</h2>
        <p style="font-size:14px; margin:0 0 10px 0;">
          <strong>Хулоса:</strong> Дар ин натиҷа ҳолати <strong>«${submission.dominantState.shortName.toLowerCase()}»</strong> бештар такрор шудааст (${submission.dominantState.percentage}%). ${dominantInfo.summary}
        </p>
      </div>

      <div class="card">
        <h2>Соҳаҳои душвори зиндагӣ</h2>
        <ul style="margin:0; padding-left:18px; font-size:13px;">
          ${difficultHtml}
        </ul>
      </div>

      <div class="card">
        <h2>5 машқи амалӣ барои беҳтар кардани ҳолат</h2>
        <ol style="margin:0; padding-left:18px; font-size:13px;">
          ${exercisesHtml}
        </ol>
      </div>

      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
          }, 250);
        };
      </script>
    </body>
    </html>
  `;

  const printWin = window.open("", "_blank", "width=850,height=900");
  if (printWin) {
    printWin.document.open();
    printWin.document.write(html);
    printWin.document.close();
  }
}
