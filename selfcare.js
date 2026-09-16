// ==========================================================
// こころタウン — セルフケア
// 深呼吸ガイド、5-4-3-2-1グラウンディング、体調メモの記録ロジック。
// アニメーションのDOM操作はapp.js側で行い、ここではデータと
// ステップ進行のロジックだけを扱う。
// ==========================================================

import { getState, updateState, genId } from "./storage.js";
import { awardPoints } from "./gamification.js";

/** 深呼吸のフェーズ（吸って→止めて→吐いて）を秒数付きで定義 */
const BREATH_PHASES = [
  { key: "in", label: "吸って…", seconds: 4 },
  { key: "hold", label: "とめて…", seconds: 2 },
  { key: "out", label: "吐いて…", seconds: 4 },
];

/** 5-4-3-2-1グラウンディングの各ステップの問いかけ */
const GROUNDING_STEPS = [
  { count: 5, sense: "見えるもの", prompt: "今、目に見えるものを5つ、思いつくままに教えて。" },
  { count: 4, sense: "聞こえる音", prompt: "今、聞こえている音を4つ、感じてみて。" },
  { count: 3, sense: "触れられるもの", prompt: "今、触れられるものを3つ、探してみて。" },
  { count: 2, sense: "香り", prompt: "今、感じられる香りを2つ、意識してみて。" },
  { count: 1, sense: "味", prompt: "今、感じられる味を1つ、思い出してみて。" },
];

const BODYLOG_CONDITION_LABELS = {
  good: "元気",
  normal: "ふつう",
  tired: "つかれ気味",
  bad: "しんどい",
};

const BODYLOG_CYCLE_LABELS = {
  menstrual: "生理中",
  follicular: "生理後（低温期）",
  ovulation: "排卵期",
  luteal: "生理前（高温期）",
};

/** 体調メモを1件保存する */
function saveBodyLog({ condition, sleepHours, cycle, note }) {
  const entry = {
    id: genId(),
    condition: condition || "normal",
    sleepHours: sleepHours === "" || sleepHours == null ? null : Number(sleepHours),
    cycle: cycle || "",
    note: (note || "").trim(),
    createdAt: new Date().toISOString(),
  };
  updateState((state) => {
    state.bodyLogs.push(entry);
  });
  awardPoints("bodyLog");
  return entry;
}

/** 体調メモの履歴を新しい順で取得する（直近件数を指定可） */
function getBodyLogHistory(limit = 10) {
  const state = getState();
  return [...state.bodyLogs].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, limit);
}

function formatBodyLogEntry(entry) {
  const date = new Date(entry.createdAt);
  const dateLabel = `${date.getMonth() + 1}/${date.getDate()}`;
  const conditionLabel = BODYLOG_CONDITION_LABELS[entry.condition] || entry.condition;
  const parts = [`${dateLabel}｜${conditionLabel}`];
  if (entry.sleepHours != null) parts.push(`睡眠${entry.sleepHours}h`);
  if (entry.cycle) parts.push(BODYLOG_CYCLE_LABELS[entry.cycle] || entry.cycle);
  let line = parts.join("・");
  if (entry.note) line += `\n　${entry.note}`;
  return line;
}

/** セルフケア利用（呼吸法・グラウンディング）を記録してポイント加算 */
function recordSelfcareUsed() {
  return awardPoints("selfcareUsed");
}

export {
  BREATH_PHASES,
  GROUNDING_STEPS,
  BODYLOG_CONDITION_LABELS,
  BODYLOG_CYCLE_LABELS,
  saveBodyLog,
  getBodyLogHistory,
  formatBodyLogEntry,
  recordSelfcareUsed,
};
