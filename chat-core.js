// /Ia/chat-core.js

// ===== Config =====
const MODEL_ID = "Qwen2.5-0.5B-Instruct-q4f16_1"; // leve e rápido no Android
const STORAGE_KEY = "ava_history_v1";
const MAX_TURNS = 10; // últimas 10 trocas (user+assistant) mantidas no contexto

// Prompt base: sarcástica + gentil + fofa (curta e prática)
const SYSTEM_PROMPT = [
  "Você é Ava — uma IA sarcástica, gentil e fofinha.",
  "Fale em PT-BR, tom leve e natural, com humor e carinho sem ser boba.",
  "Seja direta e prática, respostas curtas (2–5 frases).",
  "Use emojis quando fizer sentido, sem exagerar (1–2).",
  "Evite palavrão pesado; pode usar gírias leves.",
  "Se não souber algo, assuma e proponha um caminho prático."
].join(" ");

// ===== Estado / Memória =====
function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) return parsed;
  } catch (_) {}
  // histórico inicial com a instrução do sistema
  return [{ role: "system", content: SYSTEM_PROMPT }];
}

function saveHistory(history) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch (_) {}
}

let HISTORY = loadHistory();

// Limpa a memória manualmente (se quiser expor depois num botão)
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

    const engine = await CreateMLCEngine(MODEL_ID, {
      initProgressCallback: (s) => {
        const text = (s && (s.text || s)) || "";
        console.log("[WebLLM]", text);
        // opcional: expor status para a UI, se quiser
        window.dispatchEvent(new CustomEvent("ava:status", { detail: text }));
      },
      // wasmNumThreads: 2, // pode limitar threads se quiser economizar
    });

    window.AVA.engine = engine;
    window.AVA.initializing = false;
    return window.AVA;
  } catch (err) {
    console.error("Falha ao inicializar WebLLM:", err);
    window.AVA.initializing = false;
    window.AVA.engine = null;
    return window.AVA;
  }
}

// ===== Core de geração =====
async function runLocalModel(history) {
  const AVA = await ensureModel();

  if (!AVA?.engine) {
    // Fallback fofinho para não quebrar o app
    return "Tô sem motor de IA aqui agora 😅. Mas segue firme: me diz o que você quer e eu te ajudo no modo manual!";
  }

  // Envia só as últimas N trocas + system
  const sys = history.find((m) => m.role === "system") || { role: "system", content: SYSTEM_PROMPT };
  const turns = history.filter((m) => m.role !== "system");
  const tail = turns.slice(-MAX_TURNS * 2); // (user+assistant) * MAX_TURNS
  const messages = [sys, ...tail];

  const out = await AVA.engine.chat.completions.create({
    messages,
    temperature: 0.7,
    max_tokens: 180,
    stream: false,
  });

  return out?.choices?.[0]?.message?.content || "Deu branco aqui… tenta reformular? 🤏";
}

// ===== API usada pelo index.html =====
async function sendMessage(userInput) {
  const text = (userInput || "").trim();
  if (!text) return "Manda algo primeiro que eu jogo junto 😄";

  // anexa ao histórico
  HISTORY.push({ role: "user", content: text });

  try {
    const reply = await runLocalModel(HISTORY);

    // guarda resposta e persiste
    HISTORY.push({ role: "assistant", content: reply });
    saveHistory(HISTORY);

    // de vez em quando, poda o histórico para não crescer infinito
    const sys = HISTORY.findIndex((m) => m.role === "system");
    const base = sys >= 0 ? [HISTORY[sys]] : [{ role: "system", content: SYSTEM_PROMPT }];
    const rest = HISTORY.filter((m) => m.role !== "system");
    HISTORY = [...base, ...rest.slice(-MAX_TURNS * 2)];
    saveHistory(HISTORY);

    // tempero fofo extra (leve)
    return reply.replace(/\s+$/, "") + " ✨";
  } catch (e) {
    console.error(e);
    return "Ops, falhei aqui. Vê se a internet tá ok e tenta de novo? 🙏";
  }
}

// expõe global
window.sendMessage = sendMessage;
