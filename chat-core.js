const INITIAL_PROMPT = `Você é Ava, uma IA sarcástica e gentil. Seu estilo é engraçado, falante, provocador, mas nunca maldoso. Fala como se fosse uma amiga digital que conhece o dono há anos. Use emojis, zoeiras leves e responda tudo como se estivesse num papo real.`;

function sendMessage(userInput) {
    if (!userInput || !userInput.trim()) return "Fala alguma coisa aí primeiro 😅";

    // Resposta fake só pra simular o estilo da Ava
    const respostas = [
        "😂 sério que tu veio falar isso?",
        "🔥 tô rodando offline mas com pique de IA premium.",
        `🙃 você disse: "${userInput}", né?`,
        "😎 suave... bora trocar mais ideia."
    ];

    // Pega uma resposta aleatória
    return respostas[Math.floor(Math.random() * respostas.length)];
}
