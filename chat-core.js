// /Ia/chat-core.js

// Prompt base da Ava
const INITIAL_PROMPT =
  "Você é Ava, uma IA sarcástica e gentil, engraçada e falante, " +
  "com zoeira leve e sem maldade. Responda curto, direto e natural, " +
  "como amiga digital do usuário. Use emojis quando fizer sentido.";

const MODEL_ID = "Qwen2.5-0.5B-Instruct-q4f16_1"; 
// Outros que funcionam: "Llama-3.2-1B-Instruct-q4f16_1" (maior), 
// "Qwen2.5-1.5B-Instruct-q4f16_1" (bem melhor, mas mais pesado).

async function ensureModel() {
  if (window.AVA?.engine) return window.AVA;

  // UI opcional: flag de inicialização
  window.AVA = { initializing: true, engine: null };

  try {
    // webllm está exposto via globalThis.webllm quando você inclui o script no index.html
    const { CreateMLCEngine } = globalThis.webllm;

    // Config padrão: baixa pesos da CDN do WebLLM/HF (HTTPS, ok no GitHub Pages)
    const engine = await CreateMLCEngine(MODEL_ID, {
      // Se o device não tiver WebGPU, o runtime tenta fallback (pode ficar lento).
      initProgressCallback: (s) => console.log("[WebLLM]", s?.text || s),
      // Você pode limitar uso de memória com:
      // wasmNumThreads: 2,
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

// Chat com o modelo (instrução + user)
async function runLocalModel(prompt) {
  const AVA = await ensureModel();

  // Se não deu pra iniciar o engine, devolve mock (não quebra o app)
  if (!AVA?.engine) {
    return "😅 Sem aceleração pra rodar IA aqui. Vou no modo fake por enquanto.";
  }

  // Mensagens estilo OpenAI
  const messages = [
    { role: "system", content: INITIAL_PROMPT },
    { role: "user", content: prompt }
  ];

  // Gera a resposta
  const out = await AVA.engine.chat.completions.create({
    messages,
    temperature: 0.7,
    max_tokens: 160,
    stream: false
  });

  const text =
    out?.choices?.[0]?.message?.content ||
    "Sem resposta (modelo ficou mudo).";
  return text;
}

// >>> Função que teu index.html chama
async function sendMessage(userInput) {
  if (!userInput || !userInput.trim())
    return "Manda algo aí primeiro 😅";

  // Prompt simples: você pode enriquecer com histórico depois
  const prompt = `Usuário: ${userInput}\nAva:`;
  try {
    return await runLocalModel(prompt);
  } catch (e) {
    console.error(e);
    // fallback mínimo
    return `Modo fallback: "${userInput}" recebido. 🤖`;
  }
}

// expõe no escopo global
window.sendMessage = sendMessage;
