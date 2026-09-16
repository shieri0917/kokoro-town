// ==========================================================
// こころタウン — チャット（そうだん）
// WebLLM（ブラウザ内ローカルAI）を使った相談チャット。
// 会話はすべてこの端末内で処理され、外部には送信されない
// （初回のモデルダウンロードのみhuggingface等のCDNへ通信する）。
// ==========================================================

import { getState, updateState, genId } from "./storage.js";
import {
  BASE_SYSTEM_PROMPT,
  TOPIC_GUIDES,
  REVERSE_QUESTION_SEEDS,
  detectCrisis,
  CRISIS_RESOURCES,
  CHARACTERS,
  CHARACTER_KEYS,
  pickRandomCharacterKey,
  extractResponseTags,
} from "./knowledge.js";
import { awardPoints } from "./gamification.js";
import { savePaceDeclaration } from "./lifedesign.js";

// 使うモデル。スマホでも動きやすいよう、軽量サイズを既定にする。
const MODEL_ID = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";

let engine = null;
let engineLoading = null; // Promise
let currentTopic = null;
let lastCharacterKey = pickRandomCharacterKey();

/** WebLLMのエンジンをロードする（初回はモデルダウンロードが走る） */
async function ensureEngine(onProgress) {
  if (engine) return engine;
  if (engineLoading) return engineLoading;

  engineLoading = (async () => {
    const webllm = await import("https://esm.run/@mlc-ai/web-llm");
    const created = await webllm.CreateMLCEngine(MODEL_ID, {
      initProgressCallback: (progress) => {
        if (onProgress) onProgress(progress);
      },
    });
    engine = created;
    return created;
  })();

  try {
    return await engineLoading;
  } finally {
    engineLoading = null;
  }
}

function isEngineReady() {
  return !!engine;
}

/** 現在のトピックを設定する（ショートカットボタン押下時） */
function setTopic(topicKey) {
  currentTopic = topicKey;
}

function getTopic() {
  return currentTopic;
}

/** システムプロンプトを、現在のトピックとユーザーの人生設計情報を踏まえて組み立てる */
function buildSystemPrompt() {
  const state = getState();
  let prompt = BASE_SYSTEM_PROMPT;

  if (currentTopic && TOPIC_GUIDES[currentTopic]) {
    prompt += `\n\n${TOPIC_GUIDES[currentTopic]}`;
  }

  const vision = state.lifeDesign?.vision;
  if (vision) {
    prompt += `\n\n【参考】このユーザーが以前保存した「なりたい自分」は次の通り。会話の流れに合えば触れてよいが、毎回無理に絡めなくてよい：「${vision}」`;
  }

  const pace = state.lifeDesign?.pace?.current;
  if (pace) {
    prompt += `\n\n【参考】このユーザーが以前宣言した「自分のペース」は次の通り：「${pace}」`;
  }

  return prompt;
}

/** 直近の会話履歴をAPI用の messages 形式に変換する（直近20件程度に絞る） */
function buildMessageHistory() {
  const state = getState();
  const recent = state.chatMessages.slice(-20).filter((m) => m.role === "user" || m.role === "assistant");
  return recent.map((m) => ({ role: m.role, content: m.content }));
}

/** チャットログにメッセージを追加して保存する */
function appendMessage({ role, content, topic, charKey }) {
  const msg = {
    id: genId(),
    role,
    content,
    topic: topic || currentTopic || null,
    charKey: charKey || null,
    createdAt: new Date().toISOString(),
  };
  updateState((state) => {
    state.chatMessages.push(msg);
  });
  return msg;
}

function getRecentMessages(limit = 200) {
  const state = getState();
  return state.chatMessages.slice(-limit);
}

/** ユーザーの発言が短い/淡白なとき、逆質問シードを1つ返す（AIに直接聞き返しを混ぜてもらうためのヒント文） */
function pickReverseQuestionSeed() {
  return REVERSE_QUESTION_SEEDS[Math.floor(Math.random() * REVERSE_QUESTION_SEEDS.length)];
}

function isShortInput(text) {
  const trimmed = (text || "").trim();
  return trimmed.length > 0 && trimmed.length <= 6;
}

/**
 * ユーザーの発言を送信し、AIの返答を取得する。
 * 戻り値: { displayText, tags, charKey, crisis }
 */
async function sendUserMessage(userText, onProgress) {
  const trimmed = (userText || "").trim();
  if (!trimmed) return null;

  const crisis = detectCrisis(trimmed);
  appendMessage({ role: "user", content: trimmed });

  if (crisis) {
    // クライシス時はAIの生成に加え、必ず相談窓口の情報を別途表示する（app.js側でCRISIS_RESOURCESを描画）。
    // AIには温かく受け止める返答をさせる。
  }

  await ensureEngine(onProgress);

  const messages = [{ role: "system", content: buildSystemPrompt() }, ...buildMessageHistory()];

  // 発言が短い場合は、逆質問を促す小さなヒントをシステム側に追加する
  if (isShortInput(trimmed)) {
    messages.push({
      role: "system",
      content: `ユーザーの発言が短いです。会話を終わらせず、次のような聞き方を参考に、必ず1つ聞き返してください（そのまま使わなくてよい）：「${pickReverseQuestionSeed()}」`,
    });
  }

  const completion = await engine.chat.completions.create({ messages, temperature: 0.8 });
  const rawText = completion.choices[0]?.message?.content?.trim() || "うまく言葉が出てこなかった…もう一度聞かせてくれる？";

  const { displayText, tags } = extractResponseTags(rawText);
  const charKey = pickRandomCharacterKey();
  lastCharacterKey = charKey;

  appendMessage({ role: "assistant", content: displayText, charKey });

  const rewardEvents = [awardPoints("chatReply")];
  if (tags.SMALL_STEP) {
    rewardEvents.push(awardPoints("smallStep"));
  }
  if (tags.PACE_DECLARATION) {
    const paceReward = savePaceDeclaration(tags.PACE_DECLARATION);
    if (paceReward) rewardEvents.push(paceReward);
  }
  if (tags.STRENGTH_FOUND) {
    rewardEvents.push(awardPoints("strengthFound"));
  }

  return { displayText, tags, charKey, crisis, rewardEvents };
}

/** トピックショートカット押下時に、話しかけの一言をユーザーの代わりに投げず、システムだけ切り替えて最初の一言をAIに促す */
async function startTopicGreeting(topicKey, onProgress) {
  setTopic(topicKey);
  await ensureEngine(onProgress);

  const messages = [
    { role: "system", content: buildSystemPrompt() },
    ...buildMessageHistory(),
    { role: "system", content: "ユーザーが今、このトピックのボタンを押しました。会話の最初の一言として、短く話しかけてください。" },
  ];

  const completion = await engine.chat.completions.create({ messages, temperature: 0.85 });
  const rawText = completion.choices[0]?.message?.content?.trim() || "";
  const { displayText, tags } = extractResponseTags(rawText);
  const charKey = pickRandomCharacterKey();
  lastCharacterKey = charKey;

  appendMessage({ role: "assistant", content: displayText, charKey, topic: topicKey });
  return { displayText, tags, charKey };
}

export {
  MODEL_ID,
  ensureEngine,
  isEngineReady,
  setTopic,
  getTopic,
  sendUserMessage,
  startTopicGreeting,
  appendMessage,
  getRecentMessages,
  CRISIS_RESOURCES,
};
