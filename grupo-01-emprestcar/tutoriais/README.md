# EmprestCar — Sistema de Locação Veicular P2P
> **Trabalho Prático Final de Arquitetura de Software — Grupo 01**
> **Integrantes:** Artur Rabello, João Teixeira, Luis Fernando, Manassés Zenaro, Miguel Ângelo, Rafael Spaziani.

---

## 1. Tema e Núcleo Implementado

O **EmprestCar** é uma plataforma *peer-to-peer* (P2P) de aluguel descentralizado de veículos que conecta diretamente proprietários de automóveis (locadores) e condutores em busca de locação (locatários). A plataforma elimina as burocracias das locadoras tradicionais ao oferecer validação digital de credenciais (CNH), busca flexível por categorias e cálculo síncrono com pagamento integrado.

O núcleo implementado abrange o ciclo de vida completo de uma locação: desde a pesquisa de veículos disponíveis com paginação e filtros, passando pela reserva síncrona com validação de regras de negócio (prevenção de *overbooking*, checagem de CNH e idade mínima por categoria), publicação assíncrona de eventos via **RabbitMQ** para serviços de notificação e gestão de frota, consulta agregada via **GraphQL** no painel do locatário e proteção periférica unificada por um **API Gateway** com autenticação, limites de taxa (*Rate Limiting*) e resiliência (*Circuit Breaker*).

---

## 2. Divisão de Responsabilidades da Equipe

| Integrante | Papel na Defesa | Responsabilidade Principal no Sistema |
| :--- | :--- | :--- |
| **Artur Rabello** | Pessoa 1 | Visão Geral do Produto, Personas, ASRs 1 a 5 e Atributos de Qualidade |
| **João Teixeira** | Pessoa 2 | Caderno EARS, Decomposição C4 Nível 3 (GRASP) e ADR-001 (UUID Imutável) |
| **Luis Fernando** | Pessoa 3 | API REST Core (`/veiculos`, `/locacoes`), Regras de Negócio e Erros RFC 9457 |
| **Manassés Zenaro** | Pessoa 4 | Mensageria RabbitMQ, Consumidores de Notificação/Frota, DLQ e Idempotência |
| **Miguel Ângelo** | Pessoa 5 | Servidor GraphQL, Resolvers HTTP e Otimização do Painel do Locatário |
| **Rafael Spaziani** | Pessoa 6 | API Gateway (Porta 3000), Autenticação X-API-Key, Rate Limit e Circuit Breaker |

---

## 3. Tabela de Processos e Portas de Rede

A topologia de rede garante o **isolamento dos serviços internos**, permitindo que apenas o **API Gateway** escute na porta pública externa:

| Processo | Serviço / Camada | Endereço / Porta | Acesso de Rede |
| :--- | :--- | :--- | :--- |
| **API Gateway** | Gateway de Borda | `Porta 3000` | **Público** (Única entrada exposta) |
| **API REST** | Serviço Core do Domínio | `Porta 3001` | **Privado** (Rede interna 127.0.0.1) |
| **GraphQL** | Servidor Apollo 5 | `Porta 4000` | **Privado** (Rede interna 127.0.0.1) |
| **RabbitMQ** | Broker AMQP | `Porta 5672` | **Privado** (Comunicação AMQP) |
| **RabbitMQ Web** | Painel de Gerenciamento | `Porta 15672` | **Privado / Gestão** (guest/guest) |

---

## 4. Pré-requisitos e Instruções de Execução em Máquina Limpa

### **Pré-requisitos:**
* **Node.js**: Versão 22 LTS ou superior.
* **Docker Desktop**: Em execução (para subir a imagem do RabbitMQ 4).

### **Passo a Passo para Execução:**

1. **Subir o Broker RabbitMQ:**
   ```bash
   cd tutoriais
   docker compose up -d
   ```
   *Confira se o painel web está acessível na porta 15672 (login: `guest`, senha: `guest`).*

2. **Instalar as Dependências do Node.js:**
   ```bash
   npm install
   ```

3. **Iniciar os Processos em Terminais Separados (ou em background):**

   * **Terminal 1 — API REST Core:**
     ```bash
     node rest/server.js
     ```
   * **Terminal 2 — Consumidor de Notificação:**
     ```bash
     node mensageria/consumidor-notificacao.js
     ```
   * **Terminal 3 — Consumidor de Frota:**
     ```bash
     node mensageria/consumidor-frota.js
     ```
   * **Terminal 4 — Servidor GraphQL:**
     ```bash
     node graphql/server.js
     ```
   * **Terminal 5 — API Gateway (Porta Pública 3000):**
     ```bash
     node gateway/server.js
     ```

---

## 5. Chaves de API e Credenciais de Teste

| Cliente / Ator | Chave HTTP Header (`X-API-Key`) | Identificador Interno | Plano / Limite de Uso |
| :--- | :--- | :--- | :--- |
| **App Locatário** | `chave-app-locatario-123` | `app-locatario` | Plano Básico (10 req/min) |
| **Painel Locador** | `chave-painel-locador-456` | `painel-locador` | Plano Empresarial (60 req/min) |

---

## 6. Roteiro da Demonstração Prática (As 8 Cenas)

Para executar a validação automatizada de todas as cenas, rode o script de testes:
```bash
bash testes/cenarios.sh
```

Ou execute manualmente cada comando cURL:

### **Cena 1: Ambiente no Ar e Isolamento de Rede**
* Teste acesso público direto à API REST (Bloqueado/Privado): `curl -i 127.0.0.1:3001/veiculos`
* Teste de Saúde no Gateway público: `curl -i localhost:3000/saude`

### **Cena 2: Operações da API REST via Gateway e Regra de Negócio (422)**
* **Criar Reserva Válida (201 Created com Location):**
  ```bash
  curl -i -X POST localhost:3000/api/locacoes \
    -H "X-API-Key: chave-app-locatario-123" \
    -H "Content-Type: application/json" \
    -d '{"veiculoId":1,"locatarioId":"9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d","dataInicio":"2026-12-01","dataFim":"2026-12-05"}'
  ```
* **Provocar Regra de Negócio (422 - Idade menor que 25 para Categoria LUXO):**
  ```bash
  curl -i -X POST localhost:3000/api/locacoes \
    -H "X-API-Key: chave-app-locatario-123" \
    -H "Content-Type: application/json" \
    -d '{"veiculoId":4,"locatarioId":"jovem-18-anos","dataInicio":"2026-12-01","dataFim":"2026-12-05"}'
  ```

### **Cena 3: Evento Assíncrono no RabbitMQ e Consumidores em Ação**
Observe os logs nos terminais dos consumidores ao criar a reserva na Cena 2:
* `Consumidor Notificação`: Dispara e-mail e SMS ao motorista com o cabeçalho `X-Request-Id`.
* `Consumidor Frota`: Sinaliza indisponibilidade e agenda protocolo de higienização.

### **Cena 4: Tratamento de Falha (DLQ) e Idempotência**
* Ao simular reentrega da mesma mensagem, a verificação por ID da locação evita duplicação de higienização ou e-mails.

### **Cena 5: Consulta Agregada no Servidor GraphQL**
Abra o Apollo Sandbox na porta 4000 ou execute via cURL:
```bash
curl -i -X POST localhost:3000/api/graphql \
  -H "X-API-Key: chave-app-locatario-123" \
  -H "Content-Type: application/json" \
  -d '{"query":"query { locatario(id: \"1\") { nome locacoes { id valorTotal veiculo { modelo placa } } } }"}'
```

### **Cena 6: Proteções do Gateway (401, 429, 502 e 503 Circuit Breaker)**
* **Sem chave (401 Unauthorized):** `curl -i localhost:3000/api/locacoes`
* **Estouro de Quota (429 Too Many Requests):** Disparar 11 requisições com `chave-app-locatario-123`.
* **Disjuntor (503 Service Unavailable):** Desligar a API REST (Ctrl+C no Terminal 1) e chamar 3 vezes `localhost:3000/api/locacoes`.

### **Cena 7: Rota Agregada e Degradação Graciosa**
Com a API REST de veículos desligada, chame o painel no Gateway:
```bash
curl -i localhost:3000/api/painel/locacoes/1 -H "X-API-Key: chave-app-locatario-123"
```
*Retorna 200 OK com os dados do contrato, `veiculo: null` e `"parcial": true`.*

### **Cena 8: Rastreabilidade Distribuída (`X-Request-Id`)**
Verifique a presença do mesmo UUID impresso nos logs de todas as 4 camadas durante a transação.

---

## 7. Decisões Arquiteturais e Limitações

1. **SPOF do Gateway:** Em produção, o Gateway executará em cluster horizontal com **Redis** compartilhado para controle de Rate Limit.
2. **Escrita Dupla (REST/RabbitMQ):** Solucionada em produção com o padrão **Transactional Outbox**.
3. **Segurança Interna:** Repasse do `X-Cliente-Id` será protegido por certificados **mTLS** ou tokens **JWT internos**.

---

## 8. Repositório Git e Recursos de Apoio

* **Repositório Git:** Repositório do projeto mantido no GitHub da equipe do Grupo 01.
* **Vídeo de Demonstração (Plano B):** Vídeo gravado em alta definição disponibilizado na pasta compartilhada da equipe.
* **Uso de IA:** Utilizado o Gemini / NotebookLM como assistente para estruturação do OpenAPI, revisão de scripts e diagramação PDF.

---
*Engenharia de Software III — 2026*
