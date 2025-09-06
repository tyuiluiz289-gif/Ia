// ===== Config =====
const MODEL_CANDIDATES = [
  "Phi-3-mini-4k-instruct-q4f16_1-MLC",   // 1º: mais estável/qualidade boa
  "Phi-2-q4f16_1-MLC",                    // 2º: fallback médio
  "Qwen2.5-0.5B-Instruct-q4f16_1-MLC"     // 3º: fallback leve
];

const STORAGE_KEY = "ava_history_v1";
const MAX_TURNS   = 10;

// ==== Local-first (opcional) ====
const TRY_LOCAL_FIRST   = true;          // true: tenta local -> CDN; false: CDN -> local
const LOCAL_MODELS_BASE = "./models/";   // ex: ./models/Phi-3-mini-4k-instruct-q4f16_1-MLC/

// ==== CPU "modo seguro" (opcional) ====
// Se sua GPU vive quebrando no shader, ligue isto:
const FORCE_CPU   = false;               // true = força CPU/WASM
const WASM_THREADS = 2;                  // 1-2 é seguro em mobile
const SAFE_THREADS = (typeof SharedArrayBuffer !== "undefined") ? WASM_THREADS : 1;

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

// ===== Helpers de status =====
function status(msg, pct = null) {
  window.dispatchEvent(new CustomEvent("ava:status", { detail: { text: msg, pct }}));
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

// ===== Resolver exports do WebLLM =====
function pickCreateFns(ns) {
  if (!ns) return {};
  const mod = ns.default && Object.keys(ns).length === 1 ? ns.default : ns;
  const CreateMLCEngine = mod.CreateMLCEngine || mod.createMLCEngine || mod.MLCEngine || null;
  const CreateWebWorkerMLCEngine = mod.CreateWebWorkerMLCEngine || mod.createWebWorkerMLCEngine || null;
  return { CreateMLCEngine, CreateWebWorkerMLCEngine };
}

function makeInitCallback() {
  return (s) => {
    const text = typeof s === "string" ? s : (s?.text || "");
    const pct  = typeof s?.progress === "number" ? Math.round(s.progress * 100) : null;
    status(text || "Preparando modelo…", pct);
  };
}

// Cria engine apontando para fonte "local" (appConfig.model_list) ou "cdn"
async function buildEngine(createFn, MODEL_ID, source /* "local"|"cdn" */) {
  const initProgressCallback = makeInitCallback();

  // base de opções comum
  const baseOpts = {
    initProgressCallback,
    ...(FORCE_CPU ? { useGPU: false, preferredDeviceType: "cpu", wasmNumThreads: SAFE_THREADS } : {})
  };

  // quando "local", passamos uma model_list dizendo de onde ler os shards
  const localOpts = {
    ...baseOpts,
    appConfig: {
      model_list: [
        {
          model_url: `${LOCAL_MODELS_BASE}${MODEL_ID}/`,
          model_id: MODEL_ID
        }
      ]
    }
  };

  const opts = (source === "local") ? localOpts : baseOpts;

  // alguns builds exigem { modelId }, outros aceitam string
  try {
    return await createFn({ modelId: MODEL_ID, ...opts });
  } catch {
    return await createFn(MODEL_ID, opts);
  }
}

// ===== Engine WebLLM =====
async function ensureModel() {
  if (window.AVA?.engine) return window.AVA;
  window.AVA = { initializing: true, engine: null, modelId: null };

  // “mensagem gentil” se a inicialização demorar
  const initWatch = setTimeout(() => {
    status("Ainda compilando/baixando… a primeira vez costuma demorar um pouco 😉");
  }, 15000);

  try {
    const wl = await waitFor(() => globalThis.webllm, 12000);
    const { CreateMLCEngine, CreateWebWorkerMLCEngine } = pickCreateFns(wl);
    if (!CreateMLCEngine && !CreateWebWorkerMLCEngine) {
      throw new Error("CreateMLCEngine ausente no módulo webllm");
    }

    // Worker costuma ser mais estável no Android
    const create = CreateWebWorkerMLCEngine || CreateMLCEngine;

    let lastErr = null;
    for (const MODEL_ID of MODEL_CANDIDATES) {
      // ordem de fontes (local-first ou cdn-first)
      const sources = TRY_LOCAL_FIRST ? ["local", "cdn"] : ["cdn", "local"];

      for (const src of sources) {
        try {
          status(`Abrindo ${MODEL_ID} (${src.toUpperCase()})…`, 1);
          const engine = await buildEngine(create, MODEL_ID, src);

          window.AVA.engine = engine;
          window.AVA.modelId = MODEL_ID;
          window.AVA.initializing = false;
          clearTimeout(initWatch);
          status(`Modelo ${MODEL_ID} (${src}) pronto! 🚀`, 100);
          return window.AVA;
        } catch (e) {
          const msg = String(e?.message || e);
          // dica específica para erro de shader da GPU
          if (
            msg.includes("Invalid ShaderModule") ||
            msg.includes("compute stage") ||
            msg.includes("entryPoint") ||
            msg.includes("shader")
          ) {
            status("Falha nos shaders da GPU. Ative FORCE_CPU=true (modo seguro) e recarregue. 🔧");
          } else {
            status(`Falhou ${MODEL_ID} em ${src}. Tentando próximo…`);
          }
          console.warn(`[WebLLM] falhou ${MODEL_ID} (${src})`, e);
          lastErr = e;
        }
      }
    }

    throw lastErr || new Error("Falha ao inicializar qualquer modelo");
  } catch (err) {
    console.error("Falha ao inicializar WebLLM:", err);
    window.AVA.initializing = false;
    window.AVA.engine = null;
    status("Falha ao carregar a IA: " + (err?.message || String(err)));
    return window.AVA;
  } finally {
    clearTimeout(initWatch);
  }
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
    // Preferência: API OpenAI-compat
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

    // Fallback: API clássica
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

  // Se ainda está inicializando (baixando/compilando), avisa
  if (window.AVA?.initializing && !window.AVA?.engine) {
    return "Ainda estou carregando o modelo… espera o “Modelo pronto 🚀” e manda de novo 😉";
  }

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
  } catch {
    return "Ops, falhei aqui. Vê a faixa de status (mostrei o motivo) e tenta de novo. 🙏";
  }
}

window.sendMessage  = sendMessage;
window.prewarmModel = ensureModel;

// Evita worker/zombie ocupando RAM ao fechar a aba/app
window.addEventListener("beforeunload", () => {
  try { window.AVA?.engine?.dispose?.(); } catch {}
});
