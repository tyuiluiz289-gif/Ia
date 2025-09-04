// /la/chat-core.js

// ===== Config =====
const MODEL_ID = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC"; // modelo leve e compatível
const STORAGE_KEY = "ava_history_v1";
const MAX_TURNS = 10;

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
  } catch {}
  return [{ role: "system", content: SYSTEM_PROMPT }];
}
function saveHistory(history) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(history)); } catch {}
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
    const w = globalThis.webllm;
    if (!w || !w.CreateMLCEngine) {
      const msg = "WebLLM não está disponível (script não carregou).";
      window.dispatchEvent(new CustomEvent("ava:status", { detail: msg }));
      throw new Error(msg);
    }

    // IMPORTANTE: forçar 1 thread evita exigência de COOP/COEP (GitHub Pages)
    const engine = await w.CreateMLCEngine(MODEL_ID, {
      wasmNumThreads: 1,
      initProgressCallback: (s) => {
        const text = (s && (s.text || s)) || "";
        const pct = typeof s?.progress === "number" ? Math.round(s.progress * 100) : null;
        window.dispatchEvent(new CustomEvent("ava:status", { detail: { text, pct } }));
      }
    });

    window.AVA.engine = engine;
    window.AVA.initializing = false;
    window.dispatchEvent(new CustomEvent("ava:status", { detail: { text: "Modelo pronto! 🚀", pct: 100 } }));
    return window.AVA;
  } catch (err) {
    console.error(err);
    window.AVA.initializing = false;
    window.AVA.engine = null;
    window.dispatchEvent(new CustomEvent("ava:status", { detail: "Falha ao iniciar a IA: " + err.message }));
    throw err; // deixa estourar para o index capturar
  }
}

// ===== Geração =====
async function runLocalModel(history) {
  const AVA = await ensureModel(); // pode lançar erro (capturado no index)
  if (!AVA?.engine) {
    return "Tô sem motor de IA aqui agora 😅. Me diz o que você quer e eu te ajudo no modo manual!";
  }

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
  const reply = await runLocalModel(HISTORY); // deixa erro subir

  HISTORY.push({ role: "assistant", content: reply });
  saveHistory(HISTORY);

  // Poda
  const sysIdx = HISTORY.findIndex(m => m.role === "system");
  const base = sysIdx >= 0 ? [HISTORY[sysIdx]] : [{ role: "system", content: SYSTEM_PROMPT }];
  const rest = HISTORY.filter(m => m.role !== "system");
  HISTORY = [...base, ...rest.slice(-MAX_TURNS * 2)];
  saveHistory(HISTORY);

  return reply.replace(/\s+$/, "") + " ✨";
}

window.sendMessage = sendMessage;
window.prewarmModel = ensureModel;
