// ===== Config =====
const MODEL_ID = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC"; // leve
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

// ===== Helpers de status (mandam msg pro index) =====
function status(msg, pct = null) {
  window.dispatchEvent(new CustomEvent("ava:status", { detail: { text: msg, pct }}));
}

// ===== Engine WebLLM =====
async function ensureModel() {
  if (window.AVA?.engine) return window.AVA;

  window.AVA = { initializing: true, engine: null };

  try {
    const { CreateMLCEngine, CreateWebWorkerMLCEngine } = globalThis.webllm || {};
    if (!CreateMLCEngine && !CreateWebWorkerMLCEngine) {
      status("WebLLM ainda não disponível no global (aguardando loader)...");
      throw new Error("Runtime do WebLLM não disponível (CreateMLCEngine ausente).");
    }

    status("Baixando/abrindo modelo…", 1);

    const create = CreateMLCEngine || CreateWebWorkerMLCEngine;
    const engine = await create(MODEL_ID, {
      initProgressCallback: (s) => {
        const text = (s && (s.text || s)) || "";
        const pct = (s && typeof s.progress === "number")
          ? Math.round(s.progress * 100)
          : null;
        status(text || "Preparando modelo…", pct);
      },
      // wasmNumThreads: 2, // opcional
    });

    window.AVA.engine = engine;
    window.AVA.initializing = false;

    status("Modelo pronto! 🚀", 100);
    return window.AVA;
  } catch (err) {
    console.error("Falha ao inicializar WebLLM:", err);
    window.AVA.initializing = false;
    window.AVA.engine = null;
    status("Falha ao carregar a IA: " + (err?.message || String(err)));
    return window.AVA;
  }
}

// ===== Geração =====
async function runLocalModel(history) {
  const AVA = await ensureModel();
  if (!AVA?.engine) {
    return "Tô sem motor de IA aqui agora 😅. Abre o console e vê o erro listado na faixa de status.";
  }

  const sys = history.find(m => m.role === "system") || { role: "system", content: SYSTEM_PROMPT };
  const turns = history.filter(m => m.role !== "system");
  const messages = [sys, ...turns.slice(-MAX_TURNS * 2)];

  try {
    // Preferência: API OpenAI-compat
    const openaiApi = AVA.engine?.chat?.completions?.create;
    if (typeof openaiApi === "function") {
      const out = await AVA.engine.chat.completions.create({
        messages,
        temperature: 0.7,
        max_tokens: 180,
        stream: false
      });
      return out?.choices?.[0]?.message?.content || "Deu branco aqui… tenta reformular? 🤏";
    }

    // Fallback: API clássica (algumas builds expõem engine.chat)
    if (typeof AVA.engine?.chat === "function") {
      const out = await AVA.engine.chat({ messages, temperature: 0.7, max_tokens: 180 });
      // diferentes builds retornam formatos distintos; tenta extrair texto:
      if (typeof out === "string") return out;
      if (out?.choices?.[0]?.message?.content) return out.choices[0].message.content;
      if (out?.output_text) return out.output_text;
      return "Respondi mas não entendi o formato do retorno 😅";
    }

    throw new Error("Nenhuma API de chat encontrada no engine (OpenAI ou clássica).");
  } catch (e) {
    console.error("Erro durante geração:", e);
    status("Erro na geração: " + (e?.message || e));
    throw e; // deixa o index cair no catch e trocar a linha “digitando...”
  }
}

// ===== API exposta p/ index.html =====
async function sendMessage(userInput) {
  const text = (userInput || "").trim();
  if (!text) return "Manda algo primeiro que eu jogo junto 😄";

  HISTORY.push({ role: "user", content: text });

  try {
    const reply = await runLocalModel(HISTORY);

    HISTORY.push({ role: "assistant", content: reply });
    saveHistory(HISTORY);

    // poda histórico
    const sysIdx = HISTORY.findIndex(m => m.role === "system");
    const base = sysIdx >= 0 ? [HISTORY[sysIdx]] : [{ role: "system", content: SYSTEM_PROMPT }];
    const rest = HISTORY.filter(m => m.role !== "system");
    HISTORY = [...base, ...rest.slice(-MAX_TURNS * 2)];
    saveHistory(HISTORY);

    return reply.replace(/\s+$/, "") + " ✨";
  } catch (e) {
    // já logamos/mostramos status acima
    return "Ops, falhei aqui. Vê a faixa de status (mostrei o motivo) e tenta de novo. 🙏";
  }
}

window.sendMessage = sendMessage;
window.prewarmModel = ensureModel;
