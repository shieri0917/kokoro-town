// ==========================================================
// こころタウン — データ保存レイヤー
// すべてのデータは localStorage に保存され、この端末の外には出ない。
// 会話ログ・体調メモ・人生設計・ゲーミフィケーションの状態を1つの
// JSONオブジェクトとして管理し、書き出し/取込みもこのファイルで扱う。
// ==========================================================

const STORAGE_KEY = "kokoro-town-data-v1";
const SCHEMA_VERSION = 1;

/** アプリの初期状態（新規インストール時） */
function createDefaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: new Date().toISOString(),

    // ---- チャット履歴（画面表示用。トピックごとには分けない） ----
    chatMessages: [
      // { id, role: 'user'|'assistant'|'system', content, topic, createdAt }
    ],

    // ---- 体調メモ ----
    bodyLogs: [
      // { id, condition, sleepHours, cycle, note, createdAt }
    ],

    // ---- 人生設計 ----
    lifeDesign: {
      vision: "", // なりたい自分 1行
      visionHistory: [], // { text, savedAt } 過去の自分との比較用スナップショット
      lifeMap: {
        career: { text: "", horizon: "" },
        money: { text: "", horizon: "" },
        love: { text: "", horizon: "" },
        health: { text: "", horizon: "" },
        self: { text: "", horizon: "" },
      },
      pace: {
        current: "", // 現在の自分ペース宣言
        history: [], // { text, savedAt }
      },
    },

    // ---- ゲーミフィケーション ----
    gamification: {
      points: 0,
      level: 1,
      unlockedBadges: [], // badge id の配列
      cards: [], // { id, text, charImage, obtainedAt }
      lastVisitAt: null,
      streakDays: 0,
    },

    // ---- その他 ----
    settings: {
      lastAiCheckAt: null,
    },
  };
}

/** 保存済みデータを読み込む。無ければデフォルトを生成して返す。 */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultState();
    const parsed = JSON.parse(raw);
    return migrateState(parsed);
  } catch (e) {
    console.error("データの読み込みに失敗しました。初期状態で開始します。", e);
    return createDefaultState();
  }
}

/** 将来のスキーマ変更に備えたマイグレーション処理（現状はv1のみ） */
function migrateState(parsed) {
  const base = createDefaultState();
  if (!parsed || typeof parsed !== "object") return base;

  // 浅いマージではネストが吹っ飛ぶため、既知のトップレベルキーだけ手動で補完する
  const merged = { ...base, ...parsed };
  merged.lifeDesign = { ...base.lifeDesign, ...(parsed.lifeDesign || {}) };
  merged.lifeDesign.lifeMap = { ...base.lifeDesign.lifeMap, ...((parsed.lifeDesign || {}).lifeMap || {}) };
  merged.lifeDesign.pace = { ...base.lifeDesign.pace, ...((parsed.lifeDesign || {}).pace || {}) };
  merged.gamification = { ...base.gamification, ...(parsed.gamification || {}) };
  merged.settings = { ...base.settings, ...(parsed.settings || {}) };
  merged.chatMessages = Array.isArray(parsed.chatMessages) ? parsed.chatMessages : [];
  merged.bodyLogs = Array.isArray(parsed.bodyLogs) ? parsed.bodyLogs : [];
  merged.schemaVersion = SCHEMA_VERSION;
  return merged;
}

let _state = loadState();
const _listeners = new Set();

/** 現在の状態を取得する（直接ミューテートせず、update()経由で変更すること） */
function getState() {
  return _state;
}

/** 状態を更新して保存する。updaterは state を直接書き換える関数。 */
function updateState(updater) {
  updater(_state);
  persist();
  _listeners.forEach((fn) => {
    try {
      fn(_state);
    } catch (e) {
      console.error("storage listener error", e);
    }
  });
}

function onStateChange(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_state));
  } catch (e) {
    console.error("データの保存に失敗しました（ストレージの空き容量不足の可能性があります）", e);
  }
}

function genId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ==========================================================
// 書き出し / 取込み
// ==========================================================

/** 現在のデータをJSONファイルとしてダウンロードする */
function exportData() {
  const payload = {
    app: "kokoro-town",
    exportedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
    data: _state,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const dateStr = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `kokoro-town-backup-${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * 書き出したJSONファイルからデータを復元する。
 * @param {File} file
 * @returns {Promise<{ok: boolean, message: string}>}
 */
function importDataFromFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const dataPart = parsed && parsed.data ? parsed.data : parsed;
        if (!dataPart || typeof dataPart !== "object") {
          resolve({ ok: false, message: "ファイルの形式が正しくありません。" });
          return;
        }
        _state = migrateState(dataPart);
        persist();
        _listeners.forEach((fn) => fn(_state));
        resolve({ ok: true, message: "データを取り込みました。" });
      } catch (e) {
        console.error("import error", e);
        resolve({ ok: false, message: "ファイルの読み込みに失敗しました。こころタウンで書き出したファイルを選んでください。" });
      }
    };
    reader.onerror = () => resolve({ ok: false, message: "ファイルの読み込みに失敗しました。" });
    reader.readAsText(file);
  });
}

/** 全データを初期化する */
function resetAllData() {
  _state = createDefaultState();
  persist();
  _listeners.forEach((fn) => fn(_state));
}

export {
  getState,
  updateState,
  onStateChange,
  genId,
  exportData,
  importDataFromFile,
  resetAllData,
};
