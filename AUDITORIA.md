# Auditoria técnica — 19/11/2026

Base examinada: branch `checkout-sacola`, commit `db8fd65`.

## Falhas corrigidas

- `commerceAccount` consultava sessões com finalidade `account`, enquanto o banco registra `login`. Clientes autenticados poderiam ser recusados nos pedidos, endereços e sacola. A consulta agora usa `login`. Testes verificam também revogação e exigência de AAL2.
- Cookies com escape URI inválido lançavam exceção. Agora são tratados como ausência de credencial.
- A API comercial convertia erros de autenticação em 503. Agora preserva 401/403 para orientar corretamente o cliente.
- O leitor JSON comercial rejeitava Content-Type válido com diferenças de caixa ou espaço. Agora normaliza o cabeçalho, mantendo a recusa de outros formatos.
- Campos textuais de endereço aceitavam caracteres de controle, inclusive quebras de linha removidas silenciosamente por trim. A validação compartilhada entre cliente e servidor agora os rejeita antes de aparar espaços.
- O efeito do mega menu capturava uma função de fechamento sem declará-la como dependência. A função agora usa useCallback e o efeito acompanha sua versão atual.

## Verificações executadas

- Vitest, incluindo os 44 testes existentes e 31 novos casos de regressão e limites do servidor.
- TypeScript com `tsc --noEmit`, ESLint e build de produção.
- Execução direta do Worker compilado em Node, com contexto mínimo simulado de execução. Foram percorridos 25 endereços, incluindo os oito produtos, duas coleções, conta, sacola, checkout, administração, sitemap e três caminhos inválidos. Nenhuma resposta 500. Os caminhos inválidos retornaram 404. Os arquivos locais referenciados no HTML dessas respostas estavam presentes.
- As respostas HTML percorridas continham CSP e `no-store`. Isso valida o Worker local, sem comprovar a configuração do host final. A área Minha conta é client-only e seu redirecionamento foi verificado no navegador.
- No Chrome de desktop, verificados menu por clique e Escape com retorno de foco, coleção HYBRD, adição à sacola, aumento de quantidade, subtotal e persistência após recarregar. Verificados redirecionamento de Minha conta para Entrar, navegação circular do carrossel, lightbox, loop ampliado e Escape com retorno de foco.
- Na home de desktop não foram observadas imagens carregadas quebradas nem transbordamento horizontal. Imagens lazy ainda não carregadas e telas móveis não estão certificadas por essa checagem.
- Consulta ao endpoint de avisos do npm para 515 nomes de pacotes encontrados na árvore local instalada. Nenhum aviso alto ou crítico retornado. Dois pacotes com avisos moderados, esbuild e minimatch, associados a ferramentas de desenvolvimento. O comando npm audit padrão não pôde usar o projeto porque o lockfile é bun.lock e Bun não está disponível neste ambiente.

## Limitações e pendências

- Não há credenciais de Supabase, CAPTCHA ou pagamento de homologação configuradas no ambiente. Os testes de sessão e autorização usam respostas simuladas. Não foram comprovados no serviço real cadastro, e-mails, redefinição, TOTP, concorrência no PostgreSQL, RLS aplicada, reserva de estoque, frete ou cobrança/reembolso.
- As migrações declaram RLS e restrições de acesso. A presença delas nos arquivos não comprova que foram aplicadas no banco de produção.
- A exclusão da conta chama deleteUser. A migração comercial mantém pedidos com user_id nulo e conserva e-mail, endereço e final do CPF. É necessário definir e implementar a retenção/anonimização dos pedidos antes de considerar atendida a promessa de remoção dos dados pessoais. Não houve alteração desses registros nesta auditoria.
- Permanecem nove avisos ESLint sobre Fast Refresh em módulos que exportam componentes e utilitários. Não são erros de compilação.
- A árvore node_modules preexistente contém esbuild 0.25.12 incompatível com a faixa declarada pelo Vite instalado. O build funcionou, mas uma instalação limpa pelo lockfile deve ser validada no ambiente de integração. Não foram alteradas dependências ou lockfile.
- Permanecem avisos de build de plugins/dependências. O build de produção concluiu. A auditoria não substitui teste de carga, pentest externo, avaliação completa de acessibilidade ou homologação em dispositivos móveis.

## Revalidação das proteções de lançamento

Na branch `checkout-sacola`, 93 testes da aplicação e cinco do limitador passaram. Em um PostgreSQL temporário, todas as migrações foram aplicadas. As verificações cobriram dois compradores concorrentes, expiração de reserva, as três pausas de cartão, reenvio e revogação de links e isolamento de perfis, endereços e pedidos entre duas sessões de clientes. A perda da sessão removeu o acesso aos dados protegidos.

O Worker compilado passou por 28 verificações locais, incluindo os oito produtos, duas coleções e as respostas de autenticação e indisponibilidade de serviço. A homologação do domínio, do CAPTCHA, do envio de e-mail e do provedor de pagamento continua dependente das configurações externas. A política de retenção dos dados dos pedidos após a exclusão de conta continua pendente.
