// ==========================================================
// こころタウン — じぶん設計
// なりたい自分1行保存、ライフマップ(5カテゴリ)、自分ペース宣言、
// 過去の自分との比較、同世代エピソード表示を扱う。
// ==========================================================

import { getState, updateState } from "./storage.js";
import { pickEpisode } from "./knowledge.js";
import { awardPoints } from "./gamification.js";

const LIFE_MAP_CATEGORIES = [
  { key: "career", label: "キャリア" },
  { key: "money", label: "お金" },
  { key: "love", label: "恋愛・結婚" },
  { key: "health", label: "健康" },
  { key: "self", label: "自分自身" },
];

const HORIZON_OPTIONS = [
  { value: "", label: "時期を選ぶ" },
  { value: "1y", label: "1年後" },
  { value: "3y", label: "3年後" },
  { value: "5y", label: "5年後" },
];

/** なりたい自分の1行を保存する。過去のスナップショットも履歴に積む。 */
function saveVision(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return { ok: false, reward: null };
  updateState((state) => {
    const ld = state.lifeDesign;
    if (ld.vision && ld.vision !== trimmed) {
      ld.visionHistory.push({ text: ld.vision, savedAt: new Date().toISOString() });
    }
    ld.vision = trimmed;
  });
  const reward = awardPoints("visionSaved");
  return { ok: true, reward };
}

/** ライフマップの1カテゴリを更新する */
function updateLifeMapEntry(categoryKey, text, horizon) {
  updateState((state) => {
    const entry = state.lifeDesign.lifeMap[categoryKey];
    if (!entry) return;
    entry.text = (text || "").trim();
    entry.horizon = horizon || "";
  });
  return awardPoints("lifeMapUpdated");
}

/** 自分ペース宣言を確定保存する（chat.jsのタグ検出から呼ばれる） */
function savePaceDeclaration(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return null;
  updateState((state) => {
    const pace = state.lifeDesign.pace;
    if (pace.current && pace.current !== trimmed) {
      pace.history.push({ text: pace.current, savedAt: new Date().toISOString() });
    }
    pace.current = trimmed;
  });
  return awardPoints("paceDeclaration");
}

/**
 * 過去の自分と今を比較する。
 * visionHistory + 現在のvisionを新しい順に並べ、直近2件を比較文にする。
 * 十分な履歴が無い場合は、その旨を返す。
 */
function comparePastAndNow() {
  const state = getState();
  const ld = state.lifeDesign;
  const timeline = [
    ...ld.visionHistory.map((h) => ({ text: h.text, at: h.savedAt })),
  ];
  if (ld.vision) {
    timeline.push({ text: ld.vision, at: new Date().toISOString() });
  }
  timeline.sort((a, b) => (a.at < b.at ? -1 : 1));

  if (timeline.length === 0) {
    return { hasData: false, message: "まだ「なりたい自分」が保存されていないよ。じぶん設計のところで1行書いてみてね。" };
  }
  if (timeline.length === 1) {
    return {
      hasData: true,
      message: `今のあなたが書いた「なりたい自分」はこれだよ。\n「${timeline[0].text}」\nこれからどう変わっていくか、また見に来てね。`,
    };
  }

  const prev = timeline[timeline.length - 2];
  const curr = timeline[timeline.length - 1];
  const prevDate = new Date(prev.at);
  const dateLabel = `${prevDate.getFullYear()}年${prevDate.getMonth() + 1}月`;

  return {
    hasData: true,
    message: `${dateLabel}ごろのあなたは「${prev.text}」と書いていたよ。\n今は「${curr.text}」なんだね。\n変わっていくのも、変わらないのも、どちらもあなたが積み重ねてきた証だよ。`,
  };
}

/** 同世代のリアルな声を1件表示用に取得する（tagは任意） */
function showPeerEpisode(tag) {
  return pickEpisode(tag);
}

/**
 * なりたい自分から逆算した一言を作る（AIを呼ばず、ローカルのテンプレートで簡易生成）。
 * ライフマップに登録があれば、それを踏まえた声かけにする。
 */
function buildBackcastMessage() {
  const state = getState();
  const ld = state.lifeDesign;
  if (!ld.vision) {
    return "まずは「なりたい自分」を1行、じぶん設計のページで書いてみようか。それがあると、今の一歩がもっと見えやすくなるよ。";
  }

  const filledCategories = LIFE_MAP_CATEGORIES.filter((c) => ld.lifeMap[c.key]?.text);
  if (filledCategories.length === 0) {
    return `「${ld.vision}」に向けて、まずはどのカテゴリから動いてみようか。ライフマップにひとつ書いてみるのもいいかもね。`;
  }

  const target = filledCategories[Math.floor(Math.random() * filledCategories.length)];
  const entry = ld.lifeMap[target.key];
  const horizonLabel = HORIZON_OPTIONS.find((h) => h.value === entry.horizon)?.label || "これから";

  return `「${ld.vision}」を目指してるんだったね。${target.label}の「${entry.text}」（${horizonLabel}）に近づくために、今週できる小さなことは何かありそう？`;
}

export {
  LIFE_MAP_CATEGORIES,
  HORIZON_OPTIONS,
  saveVision,
  updateLifeMapEntry,
  savePaceDeclaration,
  comparePastAndNow,
  showPeerEpisode,
  buildBackcastMessage,
};
