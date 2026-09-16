// ==========================================================
// こころタウン — アプリ本体（画面遷移・DOM結線）
// 各機能モジュール(storage/knowledge/chat/gamification/lifedesign/selfcare)
// をまとめて画面に反映する。
// ==========================================================

import { getState, exportData, importDataFromFile, resetAllData } from "./storage.js";
import { pickCheerMessage, CHARACTERS, CRISIS_RESOURCES } from "./knowledge.js";
import * as chat from "./chat.js";
import { levelProgress, getBadgeStatus, getCards, updateStreak } from "./gamification.js";
import {
  LIFE_MAP_CATEGORIES,
  HORIZON_OPTIONS,
  saveVision,
  updateLifeMapEntry,
  comparePastAndNow,
  showPeerEpisode,
  buildBackcastMessage,
} from "./lifedesign.js";
import {
  BREATH_PHASES,
  GROUNDING_STEPS,
  saveBodyLog,
  getBodyLogHistory,
  formatBodyLogEntry,
  recordSelfcareUsed,
} from "./selfcare.js";

// ---------------------------------------------------------
// 画面遷移
// ---------------------------------------------------------
const SCREEN_IDS = ["boot", "home", "chat", "selfcare", "lifedesign", "rewards", "settings"];

function showScreen(name) {
  for (const id of SCREEN_IDS) {
    const el = document.getElementById(`screen-${id}`);
    if (!el) continue;
    el.classList.toggle("active", id === name);
  }
  if (name === "home") renderHome();
  if (name === "lifedesign") renderLifeDesign();
  if (name === "rewards") renderRewards();
  if (name === "selfcare") resetSelfcareDetailViews();
  if (name === "settings") renderSettings();
}

document.querySelectorAll("[data-nav]").forEach((btn) => {
  btn.addEventListener("click", () => showScreen(btn.dataset.nav));
});

// ---------------------------------------------------------
// ホーム画面
// ---------------------------------------------------------
function renderHome() {
  const state = getState();
  document.getElementById("greeting-text").textContent = pickCheerMessage();

  const { level, ratio } = levelProgress(state.gamification.points || 0);
  document.getElementById("level-badge").textContent = `Lv.${level}`;
  document.getElementById("level-bar-fill").style.width = `${Math.round(ratio * 100)}%`;
  document.getElementById("point-count").textContent = `${state.gamification.points || 0} pt`;

  applyTownGrowth(level);
}

/** レベルに応じて町・キャラの見た目を少しずつ賑やかにする */
function applyTownGrowth(level) {
  const townChars = document.getElementById("town-characters");
  if (!townChars) return;
  const scale = Math.min(1.15, 1 + (level - 1) * 0.03);
  townChars.style.transform = `scale(${scale})`;

  // レベルが上がるほど、キャラたちの間隔と揺れ方が少し賑やかになる
  const ghost = document.getElementById("char-ghost");
  if (ghost) {
    ghost.style.filter = level >= 5 ? "drop-shadow(0 8px 10px rgba(60,90,80,0.28))" : "";
  }
}

// ---------------------------------------------------------
// 起動ローディング / AI初期化
// ---------------------------------------------------------
const bootBarFill = document.getElementById("boot-bar-fill");
const bootDetail = document.getElementById("boot-detail");
const btnSkipAi = document.getElementById("btn-skip-ai");

let skippedAi = false;

function updateBootProgress(progress) {
  if (!progress) return;
  const pct = Math.round((progress.progress || 0) * 100);
  bootBarFill.style.width = `${Math.max(4, pct)}%`;
  if (progress.text) bootDetail.textContent = progress.text;
}

async function bootSequence() {
  updateStreak();

  // AIの読み込みに時間がかかる場合、途中でスキップできるようにする
  const skipTimer = setTimeout(() => {
    btnSkipAi.hidden = false;
  }, 6000);

  btnSkipAi.addEventListener("click", () => {
    skippedAi = true;
    clearTimeout(skipTimer);
    showScreen("home");
  });

  try {
    await chat.ensureEngine(updateBootProgress);
    clearTimeout(skipTimer);
    if (!skippedAi) showScreen("home");
  } catch (e) {
    console.error("AIモデルの読み込みに失敗しました", e);
    clearTimeout(skipTimer);
    bootDetail.textContent = "AIの読み込みに失敗しました。通信環境を確認してもう一度試してみてね。";
    btnSkipAi.hidden = false;
  }
}

// ---------------------------------------------------------
// チャット画面
// ---------------------------------------------------------
const chatLogEl = document.getElementById("chat-log");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const crisisBanner = document.getElementById("crisis-banner");
const crisisLinksEl = document.getElementById("crisis-links");

function renderCrisisResources() {
  crisisLinksEl.innerHTML = CRISIS_RESOURCES.map(
    (r) => `<li><a href="tel:${r.phone.replace(/-/g, "")}">${r.name}：${r.phone}</a>（${r.note}）</li>`
  ).join("");
}
renderCrisisResources();

function appendMessageBubble({ role, content, charKey }) {
  const wrap = document.createElement("div");
  if (role === "user") {
    wrap.className = "msg msg-user";
    wrap.textContent = content;
  } else if (role === "assistant") {
    wrap.className = "msg msg-ai";
    const tagEl = document.createElement("span");
    tagEl.className = "msg-char-tag";
    tagEl.textContent = charKey && CHARACTERS[charKey] ? CHARACTERS[charKey].name : "";
    wrap.appendChild(tagEl);
    wrap.appendChild(document.createTextNode(content));
  } else {
    wrap.className = "msg msg-system";
    wrap.textContent = content;
  }
  chatLogEl.appendChild(wrap);
  chatLogEl.scrollTop = chatLogEl.scrollHeight;
  return wrap;
}

function renderChatHistory() {
  chatLogEl.innerHTML = "";
  const messages = chat.getRecentMessages(100);
  if (messages.length === 0) {
    appendMessageBubble({ role: "system", content: "話したいことを入力するか、上のボタンから話題を選んでね。" });
    return;
  }
  messages.forEach((m) => appendMessageBubble(m));
}

function showThinkingBubble() {
  const wrap = document.createElement("div");
  wrap.className = "msg-thinking";
  wrap.textContent = "……考え中";
  chatLogEl.appendChild(wrap);
  chatLogEl.scrollTop = chatLogEl.scrollHeight;
  return wrap;
}

async function handleAiTurn(actionPromise) {
  chatInput.disabled = true;
  const thinkingEl = showThinkingBubble();
  try {
    const result = await actionPromise;
    thinkingEl.remove();
    if (!result) return;
    appendMessageBubble({ role: "assistant", content: result.displayText, charKey: result.charKey });
    if (result.crisis) {
      crisisBanner.hidden = false;
    }
    if (result.rewardEvents) {
      result.rewardEvents.forEach((ev) => handleRewardEvent(ev));
    }
  } catch (e) {
    console.error("チャット応答エラー", e);
    thinkingEl.remove();
    appendMessageBubble({ role: "system", content: "うまく返事ができなかったよ。もう一度試してみてね。" });
  } finally {
    chatInput.disabled = false;
    chatInput.focus();
  }
}

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = chatInput.value;
  if (!text.trim()) return;
  chatInput.value = "";
  appendMessageBubble({ role: "user", content: text });
  handleAiTurn(chat.sendUserMessage(text, updateBootProgress).then((r) => {
    // sendUserMessageはユーザーメッセージも内部で保存済みなので、ここでは重複描画しない
    return r;
  }));
});

document.querySelectorAll(".topic-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    const topic = chip.dataset.topic;
    showScreen("chat");
    handleAiTurn(chat.startTopicGreeting(topic, updateBootProgress));
  });
});

// ---------------------------------------------------------
// セルフケア画面
// ---------------------------------------------------------
const careListEls = document.querySelectorAll(".care-card");
const careDetailEls = {
  breath: document.getElementById("care-breath"),
  grounding: document.getElementById("care-grounding"),
  bodylog: document.getElementById("care-bodylog"),
};
const careListWrap = document.querySelector(".care-list");

function resetSelfcareDetailViews() {
  careListWrap.hidden = false;
  Object.values(careDetailEls).forEach((el) => (el.hidden = true));
  stopBreathLoop();
  resetGroundingFlow();
  renderBodyLogHistory();
}

careListEls.forEach((card) => {
  card.addEventListener("click", () => {
    const key = card.dataset.care;
    careListWrap.hidden = true;
    Object.entries(careDetailEls).forEach(([k, el]) => (el.hidden = k !== key));
    if (key === "breath") stopBreathLoop();
    if (key === "grounding") resetGroundingFlow();
  });
});

document.querySelectorAll("[data-care-back]").forEach((btn) => {
  btn.addEventListener("click", () => resetSelfcareDetailViews());
});

// --- 深呼吸 ---
const breathCircle = document.getElementById("breath-circle");
const breathLabel = document.getElementById("breath-label");
const btnBreathToggle = document.getElementById("btn-breath-toggle");
let breathTimer = null;
let breathPhaseIndex = 0;
let breathRunning = false;

function stopBreathLoop() {
  breathRunning = false;
  clearTimeout(breathTimer);
  breathCircle.classList.remove("breathing-in", "breathing-out");
  breathLabel.textContent = "はじめる をおしてね";
  btnBreathToggle.textContent = "はじめる";
}

function runBreathPhase() {
  if (!breathRunning) return;
  const phase = BREATH_PHASES[breathPhaseIndex % BREATH_PHASES.length];
  breathLabel.textContent = phase.label;
  breathCircle.classList.remove("breathing-in", "breathing-out");
  if (phase.key === "in") breathCircle.classList.add("breathing-in");
  if (phase.key === "out") breathCircle.classList.add("breathing-out");

  breathTimer = setTimeout(() => {
    breathPhaseIndex += 1;
    runBreathPhase();
  }, phase.seconds * 1000);
}

btnBreathToggle.addEventListener("click", () => {
  if (breathRunning) {
    stopBreathLoop();
  } else {
    breathRunning = true;
    breathPhaseIndex = 0;
    btnBreathToggle.textContent = "やめる";
    runBreathPhase();
    handleRewardEvent(recordSelfcareUsed());
  }
});

// --- 5-4-3-2-1グラウンディング ---
const groundingStepWrap = document.getElementById("grounding-step-wrap");
const groundingDone = document.getElementById("grounding-done");
const groundingPrompt = document.getElementById("grounding-prompt");
const groundingInput = document.getElementById("grounding-input");
const btnGroundingNext = document.getElementById("btn-grounding-next");
let groundingIndex = 0;

function resetGroundingFlow() {
  groundingIndex = 0;
  groundingStepWrap.hidden = false;
  groundingDone.hidden = true;
  groundingInput.value = "";
  renderGroundingStep();
}

function renderGroundingStep() {
  if (groundingIndex >= GROUNDING_STEPS.length) {
    groundingStepWrap.hidden = true;
    groundingDone.hidden = false;
    handleRewardEvent(recordSelfcareUsed());
    return;
  }
  const step = GROUNDING_STEPS[groundingIndex];
  groundingPrompt.textContent = `${step.prompt}（${step.sense} ×${step.count}）`;
  groundingInput.value = "";
}

btnGroundingNext.addEventListener("click", () => {
  groundingIndex += 1;
  renderGroundingStep();
});

// --- 体調メモ ---
const bodylogForm = document.getElementById("bodylog-form");
const bodylogHistoryEl = document.getElementById("bodylog-history");

function renderBodyLogHistory() {
  const items = getBodyLogHistory(8);
  if (items.length === 0) {
    bodylogHistoryEl.innerHTML = "";
    return;
  }
  bodylogHistoryEl.innerHTML = items
    .map((entry) => `<div class="bodylog-history-item">${escapeHtml(formatBodyLogEntry(entry)).replace(/\n/g, "<br>")}</div>`)
    .join("");
}

bodylogForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const condition = document.getElementById("bodylog-condition").value;
  const sleepHours = document.getElementById("bodylog-sleep").value;
  const cycle = document.getElementById("bodylog-cycle").value;
  const note = document.getElementById("bodylog-note").value;

  saveBodyLog({ condition, sleepHours, cycle, note });
  document.getElementById("bodylog-note").value = "";
  document.getElementById("bodylog-sleep").value = "";
  renderBodyLogHistory();
});

document.getElementById("btn-nav-body").addEventListener("click", () => {
  showScreen("selfcare");
  careListWrap.hidden = true;
  Object.entries(careDetailEls).forEach(([k, el]) => (el.hidden = k !== "bodylog"));
});

// ---------------------------------------------------------
// じぶん設計画面
// ---------------------------------------------------------
const ldVisionInput = document.getElementById("ld-vision");
const btnSaveVision = document.getElementById("btn-save-vision");
const ldMapEl = document.getElementById("ld-map");
const ldPaceCurrentEl = document.getElementById("ld-pace-current");
const btnPaceStart = document.getElementById("btn-pace-start");
const btnComparePast = document.getElementById("btn-compare-past");
const compareResultEl = document.getElementById("compare-result");
const btnShowEpisode = document.getElementById("btn-show-episode");
const episodeResultEl = document.getElementById("episode-result");
const btnBackcast = document.getElementById("btn-backcast");
const backcastResultEl = document.getElementById("backcast-result");

function renderLifeDesign() {
  const state = getState();
  const ld = state.lifeDesign;

  ldVisionInput.value = ld.vision || "";
  ldPaceCurrentEl.textContent = ld.pace?.current ? `「${ld.pace.current}」` : "まだ宣言はありません";

  ldMapEl.innerHTML = LIFE_MAP_CATEGORIES.map((cat) => {
    const entry = ld.lifeMap[cat.key] || { text: "", horizon: "" };
    const options = HORIZON_OPTIONS.map(
      (h) => `<option value="${h.value}" ${h.value === entry.horizon ? "selected" : ""}>${h.label}</option>`
    ).join("");
    return `
      <div class="ld-map-row" data-category="${cat.key}">
        <span class="ld-map-label">${cat.label}</span>
        <input type="text" maxlength="60" placeholder="なりたい姿を一言で" value="${escapeHtml(entry.text)}" data-role="text" />
        <select data-role="horizon">${options}</select>
      </div>`;
  }).join("");

  ldMapEl.querySelectorAll(".ld-map-row").forEach((row) => {
    const catKey = row.dataset.category;
    const textInput = row.querySelector('[data-role="text"]');
    const horizonSelect = row.querySelector('[data-role="horizon"]');
    const commit = () => {
      handleRewardEvent(updateLifeMapEntry(catKey, textInput.value, horizonSelect.value));
    };
    textInput.addEventListener("blur", commit);
    horizonSelect.addEventListener("change", commit);
  });
}

btnSaveVision.addEventListener("click", () => {
  const { ok, reward } = saveVision(ldVisionInput.value);
  if (ok) {
    handleRewardEvent(reward);
    renderHome();
  }
});

btnPaceStart.addEventListener("click", () => {
  showScreen("chat");
  chat.setTopic("pace");
  handleAiTurn(chat.startTopicGreeting("pace", updateBootProgress));
});

btnComparePast.addEventListener("click", () => {
  const result = comparePastAndNow();
  compareResultEl.textContent = result.message;
});

btnShowEpisode.addEventListener("click", () => {
  const episode = showPeerEpisode();
  episodeResultEl.textContent = episode.text;
});

btnBackcast.addEventListener("click", () => {
  backcastResultEl.textContent = buildBackcastMessage();
});

// ---------------------------------------------------------
// ごほうび画面
// ---------------------------------------------------------
const rewardLevelBadge = document.getElementById("reward-level-badge");
const rewardPointCount = document.getElementById("reward-point-count");
const badgeGridEl = document.getElementById("badge-grid");
const cardListEl = document.getElementById("card-list");

function renderRewards() {
  const state = getState();
  const { level } = levelProgress(state.gamification.points || 0);
  rewardLevelBadge.textContent = `Lv.${level}`;
  rewardPointCount.textContent = `${state.gamification.points || 0} pt`;

  const badges = getBadgeStatus();
  badgeGridEl.innerHTML = badges
    .map(
      (b) => `<div class="badge-item ${b.unlocked ? "unlocked" : ""}">${b.icon}<span>${b.label}</span></div>`
    )
    .join("");

  const cards = getCards();
  if (cards.length === 0) {
    cardListEl.innerHTML = `<p class="ld-hint">まだカードはもらっていないよ。相談したり、セルフケアを試したりすると、ときどきキャラからカードがもらえるよ。</p>`;
  } else {
    cardListEl.innerHTML = cards
      .map(
        (c) => `<div class="reward-card-item"><img src="${c.charImage}" alt="" />${escapeHtml(c.text)}</div>`
      )
      .join("");
  }
}

// --- ご褒美ポップアップ ---
const rewardPopup = document.getElementById("reward-popup");
const rewardPopupChar = document.getElementById("reward-popup-char");
const rewardPopupText = document.getElementById("reward-popup-text");
const rewardPopupClose = document.getElementById("reward-popup-close");

function handleRewardEvent(ev) {
  if (!ev) return;
  renderHome();

  if (ev.newCard) {
    showRewardPopup(ev.newCard.charImage, ev.newCard.text);
    return;
  }
  if (ev.newBadges && ev.newBadges.length > 0) {
    const b = ev.newBadges[0];
    showRewardPopup("assets/ghost.png", `新しいバッジ「${b.label}」を手に入れたよ！`);
  }
}

function showRewardPopup(image, text) {
  rewardPopupChar.src = image;
  rewardPopupText.textContent = text;
  rewardPopup.hidden = false;
}

rewardPopupClose.addEventListener("click", () => {
  rewardPopup.hidden = true;
});

// ---------------------------------------------------------
// 設定画面（書き出し / 取込み / リセット / AI状態）
// ---------------------------------------------------------
const btnExport = document.getElementById("btn-export");
const btnImport = document.getElementById("btn-import");
const importFileInput = document.getElementById("import-file-input");
const settingsMessageEl = document.getElementById("settings-message");
const aiStatusEl = document.getElementById("ai-status");
const btnReloadModel = document.getElementById("btn-reload-model");
const btnResetAll = document.getElementById("btn-reset-all");
const btnOpenSettings = document.getElementById("btn-open-settings");

btnOpenSettings.addEventListener("click", () => showScreen("settings"));

function renderSettings() {
  aiStatusEl.textContent = chat.isEngineReady()
    ? `AIモデル（${chat.MODEL_ID}）は読み込み済みです。会話はこの端末内だけで処理されます。`
    : "AIモデルはまだ読み込まれていません。そうだん画面を開くと読み込みが始まります。";
}

btnExport.addEventListener("click", () => {
  exportData();
  settingsMessageEl.textContent = "バックアップファイルを書き出したよ。";
});

btnImport.addEventListener("click", () => importFileInput.click());

importFileInput.addEventListener("change", async () => {
  const file = importFileInput.files[0];
  if (!file) return;
  const result = await importDataFromFile(file);
  settingsMessageEl.textContent = result.message;
  importFileInput.value = "";
  if (result.ok) {
    renderHome();
    renderChatHistory();
  }
});

btnReloadModel.addEventListener("click", async () => {
  aiStatusEl.textContent = "読み込み中…";
  try {
    await chat.ensureEngine(updateBootProgress);
    renderSettings();
  } catch (e) {
    aiStatusEl.textContent = "読み込みに失敗したよ。通信環境を確認してね。";
  }
});

btnResetAll.addEventListener("click", () => {
  const confirmed = window.confirm("すべての記録を削除します。この操作は取り消せません。よろしいですか？");
  if (!confirmed) return;
  resetAllData();
  renderHome();
  renderChatHistory();
  settingsMessageEl.textContent = "すべてのデータを削除したよ。";
});

// ---------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------
function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------
// Service Worker 登録（PWA化）
// ---------------------------------------------------------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((e) => console.error("SW登録失敗", e));
  });
}

// ---------------------------------------------------------
// 初期化
// ---------------------------------------------------------
renderChatHistory();
bootSequence();
