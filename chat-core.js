// /Ia/chat-core.js

// ===== Config =====
const MODEL_ID = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC"; // leve e garantido
// Se quiser mais esperto (e teu cel aguenta):
// const MODEL_ID = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";

const STORAGE_KEY = "ava_history_v1";
const MAX_TURNS = 10; // mantém últimas 10 trocas (user+assistant)

// ===== Persona =====
const SYSTEM_PROMPT = [
  "Você é Ava — uma IA sarcástica, gentil e fofinha.",
  "Fale em PT-BR, tom leve e natural, com humor e carinho sem ser boba.",
  "Seja direta e prática, respostas curtas (2–5 frases).",
  "Use emojis quando fizer sentido, sem exagerar (1–2).",
  "Evite palavrão pesado; pode usar gírias leves.",
  "Se não souber algo, assuma e proponha um caminho prático."
].join(" ");

// ===== Memória =====
function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) return parsed;
  } catch (_) {}
  return [{ role: "system", content: SYSTEM_PROMPT }];
}
function saveHistory(history) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(history)); } catch (_) {}
}
let HISTORY = loadHistory();

window.clearAvaMemory = function () {
  HISTORY = [{ role: "system", content: SYSTEM_PROMPT }];
  saveHistory(HISTORY);
  return "Memória da Ava zerada ✅";
};

// ===== Engine WebLLM =====
async function ensureModel() {
  if (window.AVA?.engine) return window.AVA;

  window.AVA = { initializing: true, engine: null };
  try {
    const { CreateMLCEngine } = globalThis.webllm || {};
    if (!CreateMLCEngine) {
      console.warn("WebLLM não carregou. Verifique o <script> no index.html.");
      window.AVA.initializing = false;
      return window.AVA;
    }

    // Emite eventos de progresso COM % para a barra no index.html
    const engine = await CreateMLCEngine(MODEL_ID, {
      initProgressCallback: (s) => {
        const text = (s && (s.text || s)) || "";
        const pct = (s && typeof s.progress === "number")
          ? Math.round(s.progress * 100)
          : null;
        console.log("[WebLLM]", text, pct != null ? `${pct}%` : "");
        window.dispatchEvent(new CustomEvent("ava:status", {
          detail: { text, pct }
        }));
      },
      // wasmNumThreads: 2, // opcional se quiser economizar
    });

    window.AVA.engine = engine;
    window.AVA.initializing = false;

    // Sinaliza "pronto"
    window.dispatchEvent(new CustomEvent("ava:status", {
      detail: { text: "Modelo pronto! 🚀", pct: 100 }
    }));

    return window.AVA;
  } catch (err) {
    console.error("Falha ao inicializar WebLLM:", err);
    window.AVA.initializing = false;
    window.AVA.engine = null;

    window.dispatchEvent(new CustomEvent("ava:status", {
      detail: { text: "Falha ao carregar a IA. Verifique conexão/armazenamento.", pct: null }
    }));

    return window.AVA;
  }
}

// ===== Geração =====
async function runLocalModel(history) {
  const AVA = await ensureModel();

  if (!AVA?.engine) {
    // Fallback fofinho para não quebrar
    return "Tô sem motor de IA aqui agora 😅. Mas segue firme: me diz o que você quer e eu te ajudo no modo manual!";
  }

  // Usa system + últimas N trocas
  const sys = history.find(m => m.role === "system") || { role: "system", content: SYSTEM_PROMPT };
  const turns = history.filter(m => m.role !== "system");
  const tail = turns.slice(-MAX_TURNS * 2);
  const messages = [sys, ...tail];

  const out = await AVA.engine.chat.completions.create({
    messages,
    temperature: 0.7,
    max_tokens: 180,
    stream: false
  });

  return out?.choices?.[0]?.message?.content || "Deu branco aqui… tenta reformular? 🤏";
}

// ===== API p/ index.html =====
async function sendMessage(userInput) {
  const text = (userInput || "").trim();
  if (!text) return "Manda algo primeiro que eu jogo junto 😄";

  HISTORY.push({ role: "user", content: text });

  try {
    const reply = await runLocalModel(HISTORY);

    HISTORY.push({ role: "assistant", content: reply });
    saveHistory(HISTORY);

    // Poda o histórico
    const sysIdx = HISTORY.findIndex(m => m.role === "system");
    const base = sysIdx >= 0 ? [HISTORY[sysIdx]] : [{ role: "system", content: SYSTEM_PROMPT }];
    const rest = HISTORY.filter(m => m.role !== "system");
    HISTORY = [...base, ...rest.slice(-MAX_TURNS * 2)];
    saveHistory(HISTORY);

    return reply.replace(/\s+$/, "") + " ✨";
  } catch (e) {
    console.error(e);
    return "Ops, falhei aqui. Vê se a internet tá ok e tenta de novo? 🙏";
  }
}

window.sendMessage = sendMessage;
