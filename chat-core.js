// ===== Config =====
const MODEL_CANDIDATES = [
  "Phi-3-mini-4k-instruct-q4f16_1-MLC",   // 1º: mais estável/qualidade boa
  "Phi-2-q4f16_1-MLC",                    // 2º: fallback médio
  "Qwen2.5-0.5B-Instruct-q4f16_1-MLC"     // 3º: fallback leve
];

const STORAGE_KEY = "ava_history_v1";
const MAX_TURNS   = 10;

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

// ===== Helpers de status =====
function status(msg, pct = null) {
  window.dispatchEvent(new CustomEvent("ava:status", { detail: { text: msg, pct }}));
}

// ===== Resolver exports do WebLLM =====
function pickCreateFns(ns) {
  if (!ns) return {};
  const mod = ns.default && Object.keys(ns).length === 1 ? ns.default : ns;
  const CreateMLCEngine = mod.CreateMLCEngine || mod.createMLCEngine || mod.MLCEngine || null;
  const CreateWebWorkerMLCEngine = mod.CreateWebWorkerMLCEngine || mod.createWebWorkerMLCEngine || null;
  return { CreateMLCEngine, CreateWebWorkerMLCEngine };
}

// ===== Engine WebLLM =====
async function ensureModel() {
  if (window.AVA?.engine) return window.AVA;
  window.AVA = { initializing: true, engine: null, modelId: null };

  try {
    const wl = await waitFor(() => globalThis.webllm, 12000);
    const { CreateMLCEngine, CreateWebWorkerMLCEngine } = pickCreateFns(wl);
    if (!CreateMLCEngine && !CreateWebWorkerMLCEngine) {
      throw new Error("CreateMLCEngine ausente no módulo webllm");
    }
    const create = CreateMLCEngine || CreateWebWorkerMLCEngine;

    let lastErr = null;
    for (const MODEL_ID of MODEL_CANDIDATES) {
      try {
        status(`Baixando/abrindo modelo: ${MODEL_ID}…`, 1);

        const opts = {
          initProgressCallback: (s) => {
            const text = typeof s === "string" ? s : (s?.text || "");
            const pct  = typeof s?.progress === "number" ? Math.round(s.progress * 100) : null;
            status(text || "Preparando modelo…", pct);
          },
        };

        let engine;
        try {
          // alguns builds precisam de objeto { modelId }
          engine = await create({ modelId: MODEL_ID, ...opts });
        } catch {
          // fallback com string simples
          engine = await create(MODEL_ID, opts);
        }

        window.AVA.engine = engine;
        window.AVA.modelId = MODEL_ID;
        window.AVA.initializing = false;
        status(`Modelo ${MODEL_ID} pronto! 🚀`, 100);
        return window.AVA;
      } catch (e) {
        console.warn("[WebLLM] falha em", MODEL_ID, e);
        lastErr = e;
        status(`Falhou em ${MODEL_ID}. Tentando próximo…`);
      }
    }

    throw lastErr || new Error("Falha ao inicializar qualquer modelo");
  } catch (err) {
    console.error("Falha ao inicializar WebLLM:", err);
    window.AVA.initializing = false;
    window.AVA.engine = null;
    status("Falha ao carregar a IA: " + (err?.message || String(err)));
    return window.AVA;
  }
}

function waitFor(fn, ms = 8000, step = 100) {
  const t0 = Date.now();
  return new Promise((res, rej) => {
    (function loop() {
      try {
        const v = typeof fn === "function" ? fn() : fn;
        if (v) return res(v);
      } catch {}
      if (Date.now() - t0 >= ms) return rej(new Error("timeout"));
      setTimeout(loop, step);
    })();
  });
}

// ===== Geração =====
async function runLocalModel(history) {
  const AVA = await ensureModel();
  if (!AVA?.engine) {
    return "Tô sem motor de IA aqui agora 😅. Abre o console e vê o erro listado na faixa de status. ✨";
  }

  const sys = history.find(m => m.role === "system") || { role: "system", content: SYSTEM_PROMPT };
  const turns = history.filter(m => m.role !== "system");
  const messages = [sys, ...turns.slice(-MAX_TURNS * 2)];

  try {
    const openaiCreate = AVA.engine?.chat?.completions?.create;
    if (typeof openaiCreate === "function") {
      const out = await openaiCreate.call(AVA.engine.chat.completions, {
        messages,
        temperature: 0.7,
        max_tokens: 180,
        stream: false
      });
      return out?.choices?.[0]?.message?.content || "Deu branco aqui… tenta reformular? 🤏";
    }

    if (typeof AVA.engine?.chat === "function") {
      const out = await AVA.engine.chat({ messages, temperature: 0.7, max_tokens: 180 });
      if (typeof out === "string") return out;
      if (out?.choices?.[0]?.message?.content) return out.choices[0].message.content;
      if (out?.output_text) return out.output_text;
      return "Respondi mas não entendi o formato do retorno 😅";
    }

    throw new Error("Nenhuma API de chat encontrada no engine.");
  } catch (e) {
    console.error("Erro durante geração:", e);
    status("Erro na geração: " + (e?.message || e));
    throw e;
  }
}

// ===== API exposta =====
async function sendMessage(userInput) {
  const text = (userInput || "").trim();
  if (!text) return "Manda algo primeiro que eu jogo junto 😄";

  HISTORY.push({ role: "user", content: text });

  try {
    const reply = await runLocalModel(HISTORY);
    HISTORY.push({ role: "assistant", content: reply });
    saveHistory(HISTORY);

    const sysIdx = HISTORY.findIndex(m => m.role === "system");
    const base = sysIdx >= 0 ? [HISTORY[sysIdx]] : [{ role: "system", content: SYSTEM_PROMPT }];
    const rest = HISTORY.filter(m => m.role !== "system");
    HISTORY = [...base, ...rest.slice(-MAX_TURNS * 2)];
    saveHistory(HISTORY);

    return reply.replace(/\s+$/, "") + " ✨";
  } catch {
    return "Ops, falhei aqui. Vê a faixa de status (mostrei o motivo) e tenta de novo. 🙏";
  }
}

window.sendMessage  = sendMessage;
window.prewarmModel = ensureModel;
