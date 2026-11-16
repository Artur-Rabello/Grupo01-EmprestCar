# EmprestCar — Sistema de Locação Veicular P2P
> **Trabalho Prático Final de Arquitetura de Software — Grupo 01**
> **Integrantes:** Artur Rabello, João Teixeira, Luis Fernando, Manassés Zenaro, Miguel Ângelo, Rafael Spaziani.

---

## 1. Tema e Núcleo Implementado

O **EmprestCar** é uma plataforma *peer-to-peer* (P2P) de aluguel descentralizado de veículos que conecta diretamente proprietários de automóveis (locadores) e condutores em busca de locação (locatários). A plataforma elimina as burocracias das locadoras tradicionais ao oferecer validação digital de credenciais (CNH), busca flexível por categorias e cálculo síncrono com pagamento integrado.

O núcleo implementado abrange o ciclo de vida de uma locação: a pesquisa de veículos com filtro, ordenação e paginação; a reserva síncrona com regras de negócio (prevenção de *overbooking*, CNH válida e idade mínima para a categoria LUXO); a publicação assíncrona dos eventos `locacao.criada` e `locacao.cancelada` no **RabbitMQ** para os serviços de notificação e de frota; a consulta do painel do locatário em uma única chamada **GraphQL**; e a proteção de borda por um **API Gateway** com autenticação por chave, limite de uso, timeout, *circuit breaker* e uma rota agregada que junta a locação, o veículo e o pagamento (o serviço de pagamentos simula o gateway de pagamento externo do C4 nível 2).

---

## 2. Divisão de Responsabilidades da Equipe

| Integrante | Papel na Defesa | Responsabilidade Principal no Sistema |
| :--- | :--- | :--- |
| **Artur Rabello de Oliveira** | Pessoa 1 | Visão Geral do Produto, Personas, ASRs 1 a 5 e Atributos de Qualidade |
| **Rafael Spaziani** | Pessoa 2 | Caderno EARS, Decomposição C4 Nível 3 (GRASP) e ADR-001 |
| **Luis Fernando** | Pessoa 3 | API REST Core (`/veiculos`, `/locacoes`), Regras de Negócio e Erros RFC 9457 |
| **Miguel Ângelo** | Pessoa 4 | Mensageria RabbitMQ, Consumidores de Notificação/Frota, DLQ e Idempotência |
| **Manassés Zenaro** | Pessoa 5 | Servidor GraphQL, Resolvers HTTP e Otimização do Painel do Locatário |
| **João Teixeira** | Pessoa 6 | API Gateway (Porta 3000), Autenticação X-API-Key, Rate Limit e Circuit Breaker |

---

## 3. Tabela de Processos e Portas de Rede

Só o **API Gateway** ouve na porta pública. Os outros serviços ouvem apenas em `127.0.0.1`.

| Processo | Arquivo | Endereço / Porta | Acesso de Rede |
| :--- | :--- | :--- | :--- |
| **API Gateway** | `gateway/server.js` | `0.0.0.0:3000` | **Público** (única entrada exposta) |
| **API REST** | `rest/server.js` | `127.0.0.1:3001` | Privado |
| **Serviço de Pagamentos** | `rest/servico-pagamentos.js` | `127.0.0.1:3002` | Privado (simula o gateway de pagamento externo) |
| **GraphQL** (Apollo Server 5) | `graphql/server.js` | `127.0.0.1:4000` | Privado |
| **Consumidor de Notificação** | `mensageria/consumidor-notificacao.js` | — | Lê a fila `fila.notificacao` |
| **Consumidor de Frota** | `mensageria/consumidor-frota.js` | — | Lê a fila `fila.frota` |
| **RabbitMQ** | `compose.yaml` (Docker) | `5672` (AMQP) e `15672` (painel) | Painel: `guest` / `guest` |

---

## 4. Pré-requisitos e Execução em Máquina Limpa

### Pré-requisitos
* **Node.js** 22 ou superior.
* **Docker Desktop** aberto e em execução (para o RabbitMQ 4).

### Passo a passo (todos os comandos dentro da pasta `tutoriais`)

1. **Instalar as dependências:**
   ```bash
   npm install
   ```
2. **Subir o RabbitMQ:**
   ```bash
   npm run rabbit:up
   ```
   Espere uns 15 segundos e abra http://localhost:15672 (usuário `guest`, senha `guest`).
3. **Subir os 6 processos em um terminal só:**
   ```bash
   npm run demo
   ```
   Os consumidores sobem primeiro, porque são eles que criam as filas. Cada linha do log começa com o nome do processo (`gateway`, `rest`, `frota`...).
   Com o demo rodando, dá para digitar neste mesmo terminal `parar <nome>` e `iniciar <nome>` (por exemplo, `parar pagamentos`). **Ctrl+C** encerra tudo.
4. Abra **outro terminal**, também na pasta `tutoriais`, para os scripts de teste da seção 6.

Para desligar o RabbitMQ no fim: `npm run rabbit:down`.

> Também dá para rodar cada processo no seu terminal (`npm run start:notificacao`, `start:frota`, `start:rest`, `start:pagamentos`, `start:graphql` e `start:gateway`, nessa ordem).
> As portas e endereços podem ser trocados por variáveis de ambiente (veja `.env.example`); sem nada configurado, valem as da tabela acima.

---

## 5. Chaves de API e Usuários de Teste (todos fictícios)

| Cliente | Cabeçalho `X-API-Key` | Identificador | Limite |
| :--- | :--- | :--- | :--- |
| **App Locatário** | `chave-app-locatario-123` | `app-locatario` | 10 requisições por minuto |
| **Painel Locador** | `chave-painel-locador-456` | `painel-locador` | 60 requisições por minuto |

| Locatário | ID | Situação usada nos testes |
| :--- | :--- | :--- |
| Carlos Silva | `u1000000-0000-0000-0000-000000000100` | 28 anos, CNH válida (caso de sucesso) |
| Mariana Costa | `u2000000-0000-0000-0000-000000000200` | 22 anos: não pode alugar carro LUXO (422) |
| João Pedro | `u3000000-0000-0000-0000-000000000300` | CNH vencida (422) |

| Veículo | ID | Categoria | Diária |
| :--- | :--- | :--- | :--- |
| Toyota Corolla ABC-1234 | `v1111111-1111-1111-1111-111111111111` | SEDAN | R$ 150 (já reservado de 15 a 20/11/2026: locação 1) |
| Honda Civic XYZ-5678 | `v2222222-2222-2222-2222-222222222222` | SEDAN | R$ 180 |
| Porsche 911 LUX-9999 | `v3333333-3333-3333-3333-333333333333` | LUXO | R$ 1.200 |
| Jeep Renegade SUV-8888 | `v4444444-4444-4444-4444-444444444444` | SUV | R$ 200 |

Os dados ficam em memória: reiniciar o `npm run demo` volta tudo ao estado inicial.

---

## 6. Roteiro da Demonstração (as 8 cenas)

Terminal 1: `npm run demo` rodando. Terminal 2: os comandos abaixo, na pasta `tutoriais`.

### Cena 1: Ambiente no ar
* Mostrar o terminal do `npm run demo` com os 6 processos.
* Tabela de portas (Windows):
  ```bash
  netstat -ano | findstr LISTENING | findstr ":3000 :3001 :3002 :4000"
  ```
  (Linux/macOS: `lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(3000|3001|3002|4000)'`)
* Só a 3000 aparece em `0.0.0.0`; 3001, 3002 e 4000 aparecem em `127.0.0.1`.

### Cena 2: API REST pelo gateway
```bash
node testes/cliente.js
```
Cria uma locação (**201** com `Location`), lê (**200**), substitui (PUT), cancela (PATCH), lista com filtro/ordenação/paginação, remove (**204**) e lê de novo (**404**). Depois provoca as regras de negócio: *overbooking* (**409**), idade mínima para LUXO e CNH vencida (**422**), campos obrigatórios (**422**), ID inválido e página zero (**400**). Todos os erros vêm em Problem Details.

### Cena 3: Evento no RabbitMQ
* No log do `npm run demo`, logo depois do passo 2 do `cliente.js`: a `rest` publica `locacao.criada`, o consumidor de **notificação** envia o e-mail/SMS e o de **frota** atualiza a agenda e agenda a higienização. No passo 5 (cancelamento), a `rest` publica `locacao.cancelada` e **só a notificação** recebe.
* Painel http://localhost:15672 → aba **Exchanges** → `frota.eventos` (tipo topic) → **Bindings**: `fila.notificacao` ligada com `locacao.*` e `fila.frota` ligada só com `locacao.criada`.
* A API respondeu 201 sem esperar os consumidores.

### Cena 4: Falha e duplicidade
```bash
node testes/publicar-teste.mjs falha
node testes/publicar-teste.mjs invalida
node testes/publicar-teste.mjs duplicada
```
* `falha`: evento de um veículo que não existe. A frota tenta **3 vezes** (`Falhou (tentativa 1 de 3)`, `2 de 3`) e manda para a DLQ (`Enviada para a DLQ (locacao.dlq)`).
* `invalida`: mensagem que nem é JSON. Vai **direto** para a DLQ, sem nova tentativa.
* `duplicada`: o mesmo evento (mesmo `id`) duas vezes. Os dois consumidores processam o primeiro e ignoram o segundo (`Mensagem duplicada ignorada (Idempotência)`).
* No painel, aba **Queues and Streams**: `locacao.dlq` com as mensagens que falharam.

### Cena 5: GraphQL
```bash
node testes/graphql.js
```
Executa a tela "painel do locatário": **uma** consulta com aninhamento (locatário → locações → veículo) e mostra quantas chamadas REST ela substituiu (o próprio servidor conta: `GET /locatarios/{id}`, `GET /locacoes?locatarioId=` e um `GET /veiculos/{id}` por locação). Depois executa a mutation `criarLocacao` com uma regra violada e mostra o erro com `code: BAD_USER_INPUT`.
(Opcional: o Apollo Sandbox abre em http://localhost:4000 na própria máquina.)

### Cena 6: Proteções do gateway
```bash
node testes/teste-gateway.js chaves
```
**200** com chave, **401** sem chave e, no app do locatário (10 por minuto), as chamadas 11 e 12 dão **429** com `Retry-After`.

No terminal do demo, digite `parar pagamentos`. No terminal 2:
```bash
node testes/teste-gateway.js 502
```
**502** três vezes (serviço fora do ar) e, na quarta, **503**: o disjuntor abriu e recusa sem nem tentar.
No terminal do demo, digite `iniciar pagamentos`, espere 10 segundos e rode:
```bash
node testes/teste-gateway.js recuperacao
```
Volta **200**: o disjuntor fechou de novo.

O teste completo, com o **504** de timeout (pagamento lento, 3 vezes) seguido de **503**, é `node testes/teste-gateway.js` (sem argumento).

### Cena 7: Rota agregada e degradação graciosa
```bash
node testes/painel.js 1
```
`GET /api/painel/locacoes/1` junta a locação e o veículo (API REST) com o pagamento (serviço de pagamentos): **resposta completa**.
No terminal do demo, `parar pagamentos`, e rode `node testes/painel.js 1` de novo: **200** com `"pagamento": null`, `"parcial": true` e `"indisponiveis": ["pagamento"]`. Depois, `iniciar pagamentos`.

### Cena 8: Fechamento e rastreabilidade
* Diagrama e 2 decisões justificadas (no relatório).
* O `cliente.js` mostra o `X-Request-Id` da criação da locação (passo 2). Procure esse id no terminal do demo (Ctrl+F): ele aparece nas linhas do `gateway`, da `rest`, da `notificacao` e da `frota`.

---

## 7. Decisões Arquiteturais e Limitações

**Decisões**
1. **Mensageria para os efeitos da reserva:** a API responde 201 sem esperar o e-mail nem a agenda da frota. Se um consumidor falhar, a reserva já está confirmada e a mensagem vai para a DLQ depois de 3 tentativas.
2. **Gateway como entrada única:** chave, limite por cliente, timeout e disjuntor ficam em um lugar só, e os serviços internos não ficam expostos.
3. **Rota agregada com degradação graciosa:** a locação é indispensável; o veículo e o pagamento são complementares. Se o serviço de pagamentos cair, o painel continua respondendo, marcado como parcial.

**Limitações**
1. **SPOF do Gateway:** uma instância só, com o limite de uso em memória. Em produção: várias instâncias atrás de um balanceador e contadores no **Redis**.
2. **Escrita dupla (REST/RabbitMQ):** se a API cair entre gravar e publicar, o evento se perde. Em produção: padrão **Transactional Outbox**.
3. **Segurança interna:** o `X-Cliente-Id` repassado pelo gateway não é verificado pelos serviços. Em produção: **mTLS** ou **JWT interno**.
4. **Dados e idempotência em memória:** reiniciar a API apaga as locações, e reiniciar um consumidor esquece os eventos já processados.

---

## 8. Repositório Git, Vídeo e Uso de IA

* **Repositório Git:** <COLOCAR AQUI O LINK DO REPOSITÓRIO>
* **Vídeo de reserva (Plano B):** <COLOCAR AQUI O LINK DO VÍDEO, SE HOUVER>
* **Uso de IA:** Gemini / NotebookLM como apoio na estruturação do OpenAPI, na revisão de scripts e na diagramação dos PDFs. Claude (Anthropic) na revisão final do código: nova tentativa e DLQ na mensageria, serviço de pagamentos e rota agregada, Apollo Server 5, scripts de teste das cenas e este README. Todo o conteúdo foi revisado pela equipe.

---

## 9. Referências

* FIELDING, R.; NOTTINGHAM, M.; RESCHKE, J. **RFC 9110**: HTTP Semantics. IETF, 2022.
* NOTTINGHAM, M.; WILDE, E.; DALAL, S. **RFC 9457**: Problem Details for HTTP APIs. IETF, 2023.
* HOHPE, G.; WOOLF, B. **Enterprise Integration Patterns**: Designing, Building, and Deploying Messaging Solutions. Boston: Addison-Wesley, 2003.
* RICHARDSON, C. **Microservices Patterns**: With Examples in Java. Shelter Island: Manning, 2018.
* NYGARD, M. T. **Release It!** Design and Deploy Production-Ready Software. 2. ed. Raleigh: Pragmatic Bookshelf, 2018.
* MAVIN, A. et al. Easy Approach to Requirements Syntax (EARS). In: IEEE International Requirements Engineering Conference (RE), 2009.
* Tutoriais da disciplina: API REST, Mensageria, GraphQL e API Gateway.

---
*Engenharia de Software III — 2026*
