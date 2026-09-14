# Instruções do workspace

Esta pasta é um workspace Draftroom portátil. Ela contém protótipos e manifesto; não contém o código-fonte do viewer.

Quando o usuário pedir para iniciar o Draftroom:

1. preserve todos os arquivos desta pasta;
2. valide `experiment.json` e os caminhos dos frames;
3. procure um comando `protofield` já instalado ou um runtime fornecido pelo usuário;
4. execute `protofield inspect .` antes de abrir, quando possível;
5. execute `protofield open .` e informe a URL local;
6. pare diante de erro de manifesto ou asset, sem reescrever o workspace automaticamente.

O workspace pode conter feedback e ajustes locais em `.draftroom/`. Esses arquivos são dados de trabalho e não devem ser apagados durante a inicialização.
