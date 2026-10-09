# Chá de Bebê do Heitor

Site responsivo para o chá de bebê, pronto para hospedagem no **Netlify** com repositório **GitHub**. Foi recuperado do layout original e preserva as fontes incorporadas, o xadrez verde-claro e a lista de 43 presentes (100 unidades). Sem música e sem checkout.

## Funcionalidades

- Listagem de 43 sugestões com quantidade máxima definida para cada mimo.
- Um convidado pode escolher vários presentes e indicar quantidades por item.
- Reservas sincronizadas entre celulares por função serverless e Netlify Blobs (store `presentes-heitor`).
- Vagas de presentes ficam ocultas quando o limite é alcançado.
- Reserva feita com escrita condicional **por unidade** (`onlyIfNew` ou `onlyIfMatch`), sem sobrescrever reservas de outros convidados.
- O convidado pode consultar seus mimos e liberá-los usando um token de navegador salvo em armazenamento local.
- A mensagem de que **não é uma compra** aparece antes da escolha e novamente após a confirmação.
- Zero formulários de identificação, checkout, pagamento, cookies de terceiros ou música.

## Publicação

**Estado atual:** o projeto Netlify `cha-do-heitor` foi criado, mas **nenhum deploy foi executado**. Não distribua o endereço até a implantação e o teste da função `/api/presentes`.

1. No GitHub conectado à conta `marcosjunior.rial@gmail.com`, crie um repositório vazio chamado `cha-do-heitor`.
2. Faça o upload de todos os arquivos e diretórios deste ZIP, preservando as pastas, na raiz do repositório (ou envie com `git push`). O `netlify.toml` deve estar na raiz.
3. Em https://app.netlify.com/projects/cha-do-heitor, associe o repositório GitHub à implantação contínua. Publish dir: `public`, Functions dir: `netlify/functions`. O `netlify.toml` define ambos automaticamente. Se a interface não permitir conectar esse site vazio ao GitHub, importe o repositório como novo projeto e só distribua o novo endereço **depois** de confirmar.
4. Aguarde o Netlify marcar o deploy como **Published**, abra a página e confirme que os presentes aparecem (não deve mostrar erro de sincronização). Teste a confirmação em duas abas/navegadores e o esgotamento de um item de uma unidade.

**Importante:** não publicar apenas `public/` por drag-and-drop, pois isso não inclui a função que registra reservas. Deploy pela integração Git ou via CLI de build do Netlify.

## Desenvolvimento / testes

```sh
npm install
npm test
```

O projeto usa HTML, CSS e JS incorporados, sem React e sem etapa de compilação frontend. Apenas uma dependência Node para armazenamento: `@netlify/blobs`. Os dados estão em `data/gifts.mjs`. Ao alterar produtos/quantidades, atualize a lista `const items` em `public/index.html` para manter frontend e backend idênticos; modificar quantidades de itens já reservados pode exigir reconciliação manual do armazenamento.

## Considerações

- Sem login ou identificação pessoal; o comprovante da reserva é o token criptograficamente aleatório guardado **somente no navegador de quem escolheu**. Se limpar os dados do navegador, perderá a capacidade de liberar o mimo; as reservas continuarão ocupadas. O sistema não solicita nomes.
- A confirmação de vários itens pode ser **parcial** quando outro convidado esgota algo durante a escolha. O site comunica o que foi efetivamente reservado.
- A API tem limitação básica de frequência por IP. Atores maliciosos ainda podem ocupar presentes intencionalmente, como em qualquer sistema sem autenticação.
- Netlify Blobs possui limites/custos de uso e suas escritas condicionais não substituem transações SQL em cenários críticos. Este desenho mantém uma chave por **unidade física** para não depender de um contador global.
- Há zero chamadas de atualização enquanto a página está em primeiro plano; sincroniza ao abrir, ao confirmar/liberar ou ao voltar à aba depois de 45 segundos, economizando invocações.
- O painel de administração **simulado** da prévia foi removido da versão pública para não apresentar controles falsos nem permitir alterações não protegidas.

## Informação do evento

14 de novembro, às 18h — Salão Condomínio Moradas. Convite e referências visuais no projeto original.


## Área dos papais (acesso administrativo)

O botão **Área dos papais** está no cabeçalho e no rodapé. Acesso direto: `https://chadoheitor.netlify.app/#papais`.

A área mostra unidades escolhidas/disponíveis e permite **liberar uma unidade por vez**, se algum convidado desistir. Não revela identidade ou navegador dos convidados.

**Configuração única obrigatória para habilitar o acesso:** no painel do Netlify do projeto `chadoheitor`, abra **Environment variables** e adicione uma variável de nome `HEITOR_ADMIN_PASSWORD` com uma senha forte (mínimo 12 caracteres). Mantenha-a privada e nunca a grave no GitHub, em arquivos do site ou no convite. Depois, execute **Trigger deploy** para que a função leia a nova variável. A senha é solicitada pelo próprio site e é conferida exclusivamente no servidor; sem a variável configurada, o painel administrativo informa que está indisponível.

O acesso não tem cadastro e a senha não é armazenada no dispositivo. O botão **Sair do painel** encerra a sessão e limpa a senha da memória do navegador. Os convidados continuam reservando presentes normalmente mesmo sem a configuração administrativa.