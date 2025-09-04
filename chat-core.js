async function runLocalModel(prompt) {
  const r = await fetch("http://SEU_SERVIDOR:8080/v1/chat/completions", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      model: "phi-2.Q4_K_M.gguf",
      messages: [
        {role:"system", content:"Você é Ava..."},
        {role:"user", content: prompt}
      ],
      temperature: 0.7
    })
  });
  const data = await r.json();
  return data.choices?.[0]?.message?.content || "Sem resposta";
}
