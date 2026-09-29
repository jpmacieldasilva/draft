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

## Fase 2 — Manifesto v2 (estados, grafo, decisão)

Manifesto:

1. Um manifesto v1 sem `schemaVersion` deixa de abrir, ou é reescrito só por ter sido aberto. (`manifest.spec.ts` — "manifesto v1 sem schemaVersion abre sem ser reescrito")
2. A migração perde campos desconhecidos do manifesto ou dos frames. (`manifest.spec.ts` — "migra conexões do layout para edges sem perder campos desconhecidos")
3. As conexões antigas em `.draft/layout.json` somem sem ir para o manifesto, ou continuam só no estado local. (mesmo cenário)
4. Uma aresta aponta para um frame inexistente, ou aparece duplicada, e o viewer quebra ou desenha lixo; a API aceita salvar isso. (`manifest.spec.ts` — "aresta para frame inexistente ou duplicada é ignorada com aviso")
5. Um ciclo no fluxo (erro → tentar de novo → carregando) trava o viewer ou o `context`. (`manifest.spec.ts` — "ciclos no fluxo não travam viewer nem context")
6. `role: control` aparece em mais de um frame do mesmo grupo sem aviso. (`manifest.spec.ts` — "mais de um controle no mesmo grupo gera aviso")
7. Uma conexão desenhada no canvas vai para `.draft/` (que não vai para o Git) em vez do manifesto. (`workflows.spec.ts` — "cria conexão rotulada e navega no minimapa")
8. Renomear ou duplicar um frame pela interface apaga `decision`, `edges` ou metadados; duplicar o controle cria um segundo controle. (`manifest.spec.ts` — "renomear e duplicar preservam decisão, arestas e papéis")
9. `draft create --flow` gera estados sem arestas, ou arestas para frames que não existem. (`manifest.spec.ts` — "create --flow gera estados ligados")

Interface:

10. Estado e papel do frame não aparecem no canvas. (`manifest.spec.ts` — "selos de estado e papel aparecem no cabeçalho do frame")
11. Hipótese, critério, o que o frame testa e o sinal pretendido não aparecem para quem revisa. (`manifest.spec.ts` — "decisão, teste e sinal aparecem no painel de informações")
12. O modo comparar aparece sem controle, mostra o par errado ou esconde o critério. (`manifest.spec.ts` — "comparar mostra controle e variante lado a lado com o critério")

## Fase 3 — Estudo navegável e compartilhamento

1. Um clique em `[data-draft-goto]` dentro do iframe não chega ao viewer por causa da sandbox, e a apresentação não muda de frame. (`nav.spec.ts` — "data-draft-goto navega entre frames na apresentação")
2. `data-draft-goto` aponta para um frame inexistente e o viewer quebra ou navega para lugar nenhum sem avisar. (`nav.spec.ts` — "destino inexistente avisa e mantém o frame atual")
3. Em Inspecionar ou Comentar, clicar num link de fluxo navega em vez de selecionar. (`nav.spec.ts` — "links de fluxo não navegam em Inspecionar")
4. No canvas (fora da apresentação), o link de fluxo não faz nada visível. (`nav.spec.ts` — "no canvas o link de fluxo seleciona o destino")
5. As setas do teclado não seguem `edges`, voltar não retorna ao frame anterior, ou um ciclo trava a navegação. (`nav.spec.ts` — "setas seguem edges, voltam pelo histórico e atravessam ciclos")
6. Depois de clicar dentro do protótipo, o foco fica no iframe e as setas param de navegar. (mesmo cenário)
7. A apresentação não mostra para onde o fluxo pode seguir. (`nav.spec.ts` — "apresentação lista os próximos passos do fluxo")
8. O export perde as arestas ou os comentários, ou deixa resolver comentários no bundle somente leitura; não há como exportar sem comentários. (`nav.spec.ts` — "export leva arestas e comentários somente leitura")

## Fase 4 — Distribuição, idioma, MCP e rede

Distribuição:

1. O pacote continua `private` ou o tarball não leva `dist/`, a ponte do iframe ou o exemplo, e `npx draft-viewer` quebra depois de instalado. (`dist.spec.ts` — "tarball instalado abre o viewer e roda o CLI")
2. O tarball leva coisas que não deveria: `src/`, `tests/`, `.draft/`, evidências. (mesmo cenário)

Idioma:

3. Com `DRAFT_LANG=en`, o viewer ou o CLI continuam em português. (`dist.spec.ts` — "DRAFT_LANG=en troca viewer e CLI para inglês")
4. `"locale": "en"` no manifesto é ignorado. (`dist.spec.ts` — "locale do manifesto escolhe o idioma")
5. Um idioma desconhecido quebra a interface ou mostra chaves cruas. (`dist.spec.ts` — "idioma desconhecido cai em pt-BR")
6. Uma string existe em um idioma e falta no outro. (coberto em tempo de compilação: o dicionário `en` precisa ter as mesmas chaves que `pt-BR`; `npm run check` falha)

MCP:

7. `draft mcp` não sobe ou não expõe as ferramentas. (`mcp.spec.ts` — "servidor MCP lista as ferramentas do Draft")
8. `write_frame` grava fora de `frames/<id>/` (`../`, caminho absoluto, dotfile, outro frame) ou num tipo de arquivo privado. (`mcp.spec.ts` — "write_frame recusa caminhos fora do frame")
9. `write_frame` grava num frame reivindicado por outro ator. (`mcp.spec.ts` — "write_frame respeita claims de outros atores")
10. `get_selection` devolve algo velho ou inventado: sem seleção deve ser `null`; depois de selecionar no Inspect deve trazer frame e seletor. (`mcp.spec.ts` — "get_selection segue a seleção do viewer e write_frame recarrega o frame")
11. Um frame gravado pelo MCP não recarrega no viewer aberto. (mesmo cenário)
12. `update_manifest` aceita aresta inválida ou frame inexistente, ou apaga campos desconhecidos. (`mcp.spec.ts` — "update_manifest valida e preserva campos desconhecidos")
13. `resolve_feedback` com id inexistente derruba o servidor em vez de devolver erro. (`mcp.spec.ts` — "resolve_feedback com id inexistente devolve erro")

Rede:

14. Um recurso remoto é bloqueado pela CSP e ninguém fica sabendo. (`network.spec.ts` — "recurso remoto bloqueado mostra aviso no frame")
15. `allowNetwork` aceita curinga, esquema, espaço ou palavra-chave de CSP e alarga a política. (`network.spec.ts` — "allowNetwork recusa entradas perigosas")
16. Um host liberado em `allowNetwork` continua bloqueado ou gera aviso. (`network.spec.ts` — "host liberado entra na CSP e não gera aviso")
