# Modos de falha

Cada fase lista primeiro como o sistema pode falhar. Cada item tem um cenário E2E correspondente (arquivo e título do teste entre parênteses). O código só é escrito depois que a lista e os cenários existem.

Rodar: `npm run build && npm run test:e2e`. Evidência: `e2e-evidence/evidence.json` (hash de cada arquivo do workspace antes e depois de cada cenário) e `playwright-report/`.

## Fase 0 — Base confiável

1. Um ajuste do Inspect num frame grava num CSS vinculado por outros frames e muda outras alternativas. (`inspect.spec.ts` — "ajuste em CSS compartilhado fica só no frame editado")
2. Desfazer o ajuste de um seletor apaga ajustes salvos em outros seletores. (`inspect.spec.ts` — "restaurar um seletor preserva ajustes de outros seletores")
3. Desfazer apaga uma edição que um agente fez no arquivo depois do ajuste. (`inspect.spec.ts` — "restaurar preserva edição posterior do agente")
4. O seletor casa com vários elementos e o ajuste cai no elemento errado. (`inspect.spec.ts` — "seletor ambíguo é recusado sem tocar no arquivo")
5. Um título com `<`, `&` ou `"` quebra o HTML gerado por `create` e por **Adicionar protótipo**. (`inspect.spec.ts` — "títulos com caracteres especiais geram HTML válido")
6. O estado é gravado em `.draft/` mas lido de `.draftroom/` (ou o contrário), e comentários ou claims antigos somem. (`inspect.spec.ts` — "estado legado em .draftroom migra para .draft sem perder comentários")

## Fase 1 — Ciclo com o agente

1. O agente não encontra os comentários abertos, ou recebe comentários já resolvidos como pendentes. (`agent.spec.ts` — "context e feedback list entregam só o que está aberto, com seletor e frame")
2. Resolver um id inexistente responde sucesso ou grava lixo no log. (`agent.spec.ts` — "resolver id inexistente falha sem tocar no log")
3. Escritas concorrentes do CLI e do viewer corrompem `feedback.jsonl` (linha partida, evento perdido). (`agent.spec.ts` — "CLI e viewer escrevendo ao mesmo tempo mantêm o log íntegro")
4. `context` expõe arquivos privados (dotfiles, `.env`, `node_modules`) ou conteúdo fora do workspace. (`agent.spec.ts` — "context não expõe arquivos privados")
5. Um resolve feito pelo CLI não aparece no viewer aberto. (`agent.spec.ts` — "resolve pelo CLI aparece no viewer aberto")
6. Com o manifesto quebrado, `context` imprime algo vago ou sai com código 0. (`agent.spec.ts` — "manifesto inválido faz context falhar com a mensagem exata")
7. O agente edita um frame que outra pessoa ou agente reivindicou, porque `context` não mostra os claims ativos. (`agent.spec.ts` — "context mostra claims ativos por frame")
