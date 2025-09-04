
# AvaGPT - IA Offline (Zuera e Gentil)

Este é o projeto da AvaGPT, uma IA offline projetada para funcionar em navegadores ou empacotada como APK Android.

## Como usar

1. Abra `web/index.html` no navegador (não precisa de internet).
2. Digite algo e veja a Ava responder com bom humor.
3. O modelo está simulado em `assets/phi-2.Q4_K_M.gguf` — substitua pelo GGUF real para integração.

## Compilação APK (opcional)

- Use Flutter ou WebView wrapper para empacotar.
- Ou rode direto em navegador com permissão local.

---
Feito com sarcasmo e carinho 💬


## Deploy no GitHub Pages (sem build)
1. Crie um repositório chamado `ava-gpt-offline` no GitHub.
2. Envie estes arquivos (pasta inteira).
3. Em **Settings > Pages**, selecione **Deploy from a branch**.
4. Em **Branch**, escolha `main` e a pasta `/root` ou publique direto da pasta `/web` (recomendado).
   - Se usar `/web`, a URL final será `https://SEU_USUARIO.github.io/ava-gpt-offline/index.html`.
5. Acesse a página e verifique o prompt de instalação do PWA.

## Observações
- O arquivo `assets/phi-2.Q4_K_M.gguf` é grande. Considere usar **Git LFS** ou remover do GitHub e carregar via release/download quando necessário.
- O PWA funciona offline depois do primeiro acesso (cache).
