# Lista que entende o que você escreve

Um app de lista minimalista: uma barra de entrada no topo e os itens organizados sozinhos em cards por tipo — **tarefa**, **link**, **compra**, **nota** e **data**.

Quatro frames lado a lado no canvas, todos com os mesmos dados de exemplo:

| Frame | Papel | Ideia |
| --- | --- | --- |
| `base` | control | Versão clara e limpa, grupos em uma coluna. |
| `launcher` | variant | Paleta de comandos escura sobre um fundo suave, com atalhos de teclado. |
| `mosaico` | variant | Grade em mosaico com cards em tons pastel e números de data grandes. |
| `lateral` | variant | Versão compacta com barra lateral e contadores por tipo. |

Abra com `draft open examples/lista` e use **Compare** para ver control e variantes juntos.

Os arquivos `frames/<id>/summary.json` e `frames/<id>/questions.json` mostram o ciclo com o agente: um frame pronto (com suposições para aceitar ou rejeitar), um frame que precisa de você e, com `.draft/presence.json`, um frame em andamento.
