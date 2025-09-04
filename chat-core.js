const INITIAL_PROMPT = `Você é Ava, uma IA sarcástica e gentil...`;

// URL do seu servidor (troque pelo seu, e use HTTPS)
const API_URL = "https://SEU_SERVIDOR/v1/chat/completions";

async function runLocalModel(prompt) {
  const r = await fetch(API_URL, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      model: "phi-2.Q4_K_M.gguf",
      messages: [
        { role: "system", content: "Você é Ava, sarcástica e gentil." },
        { role: "user", content: prompt }
      ],
      temperature: 0.7
    })
  });
  const data = await r.json();
  return data.choices?.[0]?.message?.content || "Sem resposta do servidor.";
}

// >>> agora sendMessage também é assíncrona
async function sendMessage(userInput) {
  const prompt = `${INITIAL_PROMPT}\nUsuário: ${userInput}\nAva:`;
  try {
    return await runLocalModel(prompt);
  } catch (e) {
    console.error(e);
    return "Falha ao falar com a IA. Confere a URL do servidor e o CORS.";
  }
}

// expõe no window por segurança
window.sendMessage = sendMessage;
