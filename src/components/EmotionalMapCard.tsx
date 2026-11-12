"use client";

import React from "react";
import { CalculatedStateScore, EMOTIONAL_STATES } from "@/lib/test-data";

interface EmotionalMapCardProps {
  scores: CalculatedStateScore[];
  dominantState: CalculatedStateScore;
  showSummaryInsideCard?: boolean;
}

export default function EmotionalMapCard({
  scores,
  dominantState,
  showSummaryInsideCard = true,
}: EmotionalMapCardProps) {
  const dominantInfo =
    EMOTIONAL_STATES[dominantState.letter] || EMOTIONAL_STATES["В"];

  // Find all states with highest count if there's a tie
  const topStates = scores.filter(
    (s) => s.percentage === dominantState.percentage && s.percentage > 0
  );
  const topNames = topStates.map((s) => s.shortName.toLowerCase()).join(" ва ");

  return (
    <div className="bg-white border border-[#E8E2D9] rounded-3xl p-6 sm:p-8 shadow-soft">
      <h2 className="text-xl sm:text-2xl font-bold text-[#1F1D1A] tracking-tight mb-6">
        Харитаи эҳсосоти шумо
      </h2>

      <div className="space-y-4">
        {scores.map((item) => {
          const isVulnerable = item.category === "vulnerable";
          const barColor = isVulnerable ? "#C07D53" : "#3B9B78";

          return (
            <div key={item.letter} className="space-y-1.5">
              <div className="flex items-center justify-between text-[15px] sm:text-base">
                <span className="text-[#2B2824] font-normal">
                  {item.shortName}
                </span>
                <span className="text-[#1F1D1A] font-medium tabular-nums">
                  {item.percentage}%
                </span>
              </div>

              <div className="w-full h-2.5 bg-[#EFECE6] rounded-full overflow-hidden">
                {item.percentage > 0 && (
                  <div
                    className="h-full rounded-full animate-bar"
                    style={{
                      width: `${item.percentage}%`,
                      backgroundColor: barColor,
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showSummaryInsideCard && (
        <div className="mt-7 pt-6 border-t border-[#EFECE6]">
          <p className="text-[15px] sm:text-base leading-relaxed text-[#2B2824]">
            <strong className="font-semibold text-[#1F1D1A]">Хулоса:</strong>{" "}
            Дар ин натиҷа ҳолати{" "}
            <span className="font-semibold text-[#1F1D1A]">
              {topNames || dominantState.shortName.toLowerCase()}
            </span>{" "}
            бештар такрор шудааст ({dominantState.percentage}%).{" "}
            {dominantInfo.summary}
          </p>
        </div>
      )}
    </div>
  );
}
