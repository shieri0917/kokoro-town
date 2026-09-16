// ==========================================================
// こころタウン — ゲーミフィケーション
// ポイント/レベル/バッジ/ご褒美カードの管理。
// キャラの見た目（表情・町の賑やかさ）はレベルに応じてapp.js側で反映する。
// ==========================================================

import { getState, updateState, genId } from "./storage.js";
import { CHARACTERS, pickRandomCharacterKey } from "./knowledge.js";

/** レベルアップに必要なポイント（レベルNに達するための累積ポイント） */
const LEVEL_THRESHOLDS = [0, 20, 50, 90, 140, 200, 280, 380, 500, 650, 820];

/** ポイントを付与する行動の種類ごとの獲得ポイント */
const POINT_RULES = {
  chatReply: 3, // 1往復の相談ごと
  smallStep: 8, // 小さな一歩の提案が出た
  paceDeclaration: 15, // 自分ペース宣言が完成した
  strengthFound: 12, // 強みが見つかった
  bodyLog: 5, // 体調メモの記録
  selfcareUsed: 6, // セルフケアショートカット利用
  visionSaved: 5, // なりたい自分を保存
  lifeMapUpdated: 5, // ライフマップ更新
};

/** バッジの定義。unlockCheck(state) が true を返すと解放される。 */
const BADGE_DEFS = [
  {
    id: "first_chat",
    icon: "💬",
    label: "はじめの一歩",
    unlockCheck: (s) => s.chatMessages.some((m) => m.role === "user"),
  },
  {
    id: "first_bodylog",
    icon: "🩷",
    label: "からだ記録",
    unlockCheck: (s) => s.bodyLogs.length >= 1,
  },
  {
    id: "first_selfcare",
    icon: "🌿",
    label: "ひと休み",
    unlockCheck: (s) => (s.gamification.selfcareCount || 0) >= 1,
  },
  {
    id: "vision_set",
    icon: "🌟",
    label: "なりたい自分",
    unlockCheck: (s) => !!(s.lifeDesign && s.lifeDesign.vision),
  },
  {
    id: "pace_declared",
    icon: "🐾",
    label: "自分ペース",
    unlockCheck: (s) => !!(s.lifeDesign && s.lifeDesign.pace && s.lifeDesign.pace.current),
  },
  {
    id: "strength_found",
    icon: "✨",
    label: "強み発見",
    unlockCheck: (s) => (s.gamification.strengthCount || 0) >= 1,
  },
  {
    id: "streak_3",
    icon: "🔥",
    label: "3日つづいた",
    unlockCheck: (s) => (s.gamification.streakDays || 0) >= 3,
  },
  {
    id: "level_3",
    icon: "🏡",
    label: "町がにぎやか",
    unlockCheck: (s) => calcLevel(s.gamification.points || 0) >= 3,
  },
];

/** ご褒美カードのメッセージ素材（獲得時にランダムで選ばれる） */
const REWARD_CARD_TEXTS = [
  "いつも自分のペースで進んでいて、それがちゃんとえらいことだよ。",
  "小さな一歩を積み重ねてるの、ちゃんと見てたよ。",
  "つらい日も、逃げずに向き合ってるのすごいと思う。",
  "誰かと比べなくても、あなたのままで十分だよ。",
  "今日ここに来てくれたこと、それだけでもう十分頑張ってる。",
];

function calcLevel(points) {
  let level = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (points >= LEVEL_THRESHOLDS[i]) level = i + 1;
  }
  return level;
}

function levelProgress(points) {
  const level = calcLevel(points);
  const currentThreshold = LEVEL_THRESHOLDS[level - 1] ?? 0;
  const nextThreshold = LEVEL_THRESHOLDS[level] ?? currentThreshold + 200;
  const span = nextThreshold - currentThreshold;
  const progressed = points - currentThreshold;
  const ratio = span > 0 ? Math.min(1, Math.max(0, progressed / span)) : 1;
  return { level, currentThreshold, nextThreshold, ratio };
}

/**
 * ポイントを加算し、レベルアップ/新規バッジ/ご褒美カードを判定する。
 * @param {keyof typeof POINT_RULES} ruleKey
 * @returns {{ pointsGained: number, newBadges: object[], newCard: object|null, leveledUp: boolean }}
 */
function awardPoints(ruleKey) {
  const gained = POINT_RULES[ruleKey] ?? 0;
  let newBadges = [];
  let newCard = null;
  let leveledUp = false;

  updateState((state) => {
    const g = state.gamification;
    const beforeLevel = calcLevel(g.points || 0);
    g.points = (g.points || 0) + gained;
    const afterLevel = calcLevel(g.points);
    leveledUp = afterLevel > beforeLevel;
    g.level = afterLevel;

    if (ruleKey === "selfcareUsed") g.selfcareCount = (g.selfcareCount || 0) + 1;
    if (ruleKey === "strengthFound") g.strengthCount = (g.strengthCount || 0) + 1;

    // バッジ判定
    for (const def of BADGE_DEFS) {
      if (!g.unlockedBadges.includes(def.id) && def.unlockCheck(state)) {
        g.unlockedBadges.push(def.id);
        newBadges.push(def);
      }
    }

    // レベルアップ、またはポイント行動のたびに一定確率でご褒美カードを渡す
    const shouldGiveCard = leveledUp || Math.random() < 0.18;
    if (shouldGiveCard) {
      const text = REWARD_CARD_TEXTS[Math.floor(Math.random() * REWARD_CARD_TEXTS.length)];
      const charKey = pickRandomCharacterKey();
      newCard = {
        id: genId(),
        text,
        charKey,
        charImage: CHARACTERS[charKey].image,
        obtainedAt: new Date().toISOString(),
      };
      g.cards.push(newCard);
    }
  });

  return { pointsGained: gained, newBadges, newCard, leveledUp };
}

/** ストリーク（連続来訪日数）を更新する。1日1回だけ呼べば十分。 */
function updateStreak() {
  let result = { streakDays: 0, isNewDay: false };
  updateState((state) => {
    const g = state.gamification;
    const today = new Date();
    const todayStr = today.toDateString();
    const lastStr = g.lastVisitAt ? new Date(g.lastVisitAt).toDateString() : null;

    if (lastStr === todayStr) {
      result = { streakDays: g.streakDays || 0, isNewDay: false };
      return;
    }

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const isConsecutive = lastStr === yesterday.toDateString();

    g.streakDays = isConsecutive ? (g.streakDays || 0) + 1 : 1;
    g.lastVisitAt = today.toISOString();
    result = { streakDays: g.streakDays, isNewDay: true };
  });
  return result;
}

function getBadgeStatus() {
  const state = getState();
  const unlocked = new Set(state.gamification.unlockedBadges || []);
  return BADGE_DEFS.map((def) => ({ ...def, unlocked: unlocked.has(def.id) }));
}

function getCards() {
  const state = getState();
  return [...(state.gamification.cards || [])].sort((a, b) => (a.obtainedAt < b.obtainedAt ? 1 : -1));
}

export {
  LEVEL_THRESHOLDS,
  POINT_RULES,
  BADGE_DEFS,
  calcLevel,
  levelProgress,
  awardPoints,
  updateStreak,
  getBadgeStatus,
  getCards,
};
