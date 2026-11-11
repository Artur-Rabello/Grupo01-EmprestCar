import express from 'express';
import { randomUUID } from 'crypto';

const app = express();
app.use(express.json());

const PORT = 3000;
const host = '127.0.0.1';

const SERVICOS = {
  rest: 'http://' + host + ':3001',
  graphql: 'http://' + host + ':4000'
};

// Chaves de API registradas
const CLIENTES_API = {
  'chave-app-locatario-123': { id: 'app-locatario', limitePorMinuto: 10 },
  'chave-painel-locador-456': { id: 'painel-locador', limitePorMinuto: 60 }
};

// Rate Limit em memória
const requisicoesPorCliente = new Map();

// Classe de Disjuntor (Circuit Breaker)
class CircuitBreaker {
  constructor(nome, limiteFalhas = 3, tempoAbertoMs = 10000) {
    this.nome = nome;
    this.limiteFalhas = limiteFalhas;
    this.tempoAbertoMs = tempoAbertoMs;
    this.falhas = 0;
    this.estado = 'FECHADO'; // FECHADO, ABERTO, MEIO_ABERTO
    this.proximaTentativa = 0;
  }

  podeExecutar() {
    if (this.estado === 'ABERTO') {
      if (Date.now() >= this.proximaTentativa) {
        this.estado = 'MEIO_ABERTO';
        console.log(`[CircuitBreaker: ${this.nome}] Entrando em estado MEIO-ABERTO para teste.`);
        return true;
      }
      return false;
    }
    return true;
  }

  registrarSucesso() {
    this.falhas = 0;
    this.estado = 'FECHADO';
  }

  registrarFalha() {
    this.falhas++;
    console.warn(`[CircuitBreaker: ${this.nome}] Falha registrada (${this.falhas}/${this.limiteFalhas})`);
    if (this.falhas >= this.limiteFalhas) {
      this.estado = 'ABERTO';
      this.proximaTentativa = Date.now() + this.tempoAbertoMs;
      console.error(`[CircuitBreaker: ${this.nome}] DISJUNTOR ABERTO! Bloqueando requisições por 10s.`);
    }
  }
}

const disjuntorRest = new CircuitBreaker('REST-API');

// Helper Problem Details (RFC 9457)
function enviarProblema(res, status, title, detail, instance = '/api') {
  res.status(status).setHeader('Content-Type', 'application/problem+json').json({
    type: `problem/${status}`,
    title,
    status,
    detail,
    instance
  });
}

// FILTRO 1: Correlação (X-Request-Id) e Logging de Latência
app.use((req, res, next) => {
  req.requestId = req.headers['x-request-id'] || randomUUID();
  req.inicio = Date.now();

  res.on('finish', () => {
    const duracao = Date.now() - req.inicio;
    console.log(`[API Gateway] [${req.requestId}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duracao} ms)`);
  });

  next();
});

// FILTRO 2: Autenticação por Chave de API (X-API-Key)
app.use('/api', (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || !CLIENTES_API[apiKey]) {
    return enviarProblema(res, 401, 'Não Autorizado', 'Chave de API (X-API-Key) ausente ou inválida.', req.originalUrl);
  }

  req.cliente = CLIENTES_API[apiKey];

  // FILTRO 3: Rate Limiting por Janela Fixa (1 minuto)
  const agora = Date.now();
  const minutoAtual = Math.floor(agora / 60000);
  const chaveCliente = `${req.cliente.id}:${minutoAtual}`;

  const contagemAtual = (requisicoesPorCliente.get(chaveCliente) || 0) + 1;
  requisicoesPorCliente.set(chaveCliente, contagemAtual);

  res.setHeader('X-RateLimit-Limit', req.cliente.limitePorMinuto);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, req.cliente.limitePorMinuto - contagemAtual));

  if (contagemAtual > req.cliente.limitePorMinuto) {
    res.setHeader('Retry-After', 60);
    return enviarProblema(res, 429, 'Muitas Requisições', `Limite de ${req.cliente.limitePorMinuto} requisições por minuto excedido.`, req.originalUrl);
  }

  next();
});

// Helper de Leitura HTTP com Timeout (2000 ms)
async function lerUpstream(urlTarget, reqOptions = {}, disjuntor = null) {
  if (disjuntor && !disjuntor.podeExecutar()) {
    const erroDisjuntor = new Error('Disjuntor Aberto');
    erroDisjuntor.status = 503;
    throw erroDisjuntor;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);

  try {
    const res = await fetch(urlTarget, {
      ...reqOptions,
      signal: controller.signal
    });

    clearTimeout(timer);

    if (res.status >= 500 && disjuntor) {
      disjuntor.registrarFalha();
    } else if (disjuntor) {
      disjuntor.registrarSucesso();
    }

    return res;
  } catch (err) {
    clearTimeout(timer);
    if (disjuntor) disjuntor.registrarFalha();
    throw err;
  }
}

// ROTA AGREGADA: GET /api/painel/locacoes/:id (com Degradação Graciosa)
app.get('/api/painel/locacoes/:id', async (req, res) => {
  try {
    const urlLoc = `${SERVICOS.rest}/locacoes/${encodeURIComponent(req.params.id)}`;
    const resLoc = await lerUpstream(urlLoc, { headers: { 'X-Request-Id': req.requestId } }, disjuntorRest);

    if (!resLoc.ok) {
      const errBody = await resLoc.json();
      return res.status(resLoc.status).json(errBody);
    }

    const locacao = await resLoc.json();

    // Consulta paralela ao serviço de veículos com Promise.allSettled
    const resultados = await Promise.allSettled([
      lerUpstream(`${SERVICOS.rest}/veiculos/${encodeURIComponent(locacao.veiculoId)}`, { headers: { 'X-Request-Id': req.requestId } })
    ]);

    let veiculoDados = null;
    let houveFalhaVeiculo = false;

    if (resultados[0].status === 'fulfilled' && resultados[0].value.ok) {
      veiculoDados = await resultados[0].value.json();
    } else {
      houveFalhaVeiculo = true;
    }

    res.json({
      id: locacao.id,
      dataInicio: locacao.dataInicio,
      dataFim: locacao.dataFim,
      valorTotal: locacao.valorTotal,
      status: locacao.status,
      veiculo: veiculoDados ? {
        id: veiculoDados.id,
        modelo: veiculoDados.modelo,
        marca: veiculoDados.marca,
        placa: veiculoDados.placa,
        valorDiario: veiculoDados.valorDiario
      } : null,
      parcial: houveFalhaVeiculo
    });
  } catch (err) {
    if (err.status === 503) {
      res.setHeader('Retry-After', 10);
      return enviarProblema(res, 503, 'Serviço Indisponível', 'Disjuntor de proteção acionado para a API REST.', req.originalUrl);
    }
    if (err.name === 'AbortError') {
      return enviarProblema(res, 504, 'Timeout no Gateway', 'O serviço upstream excedeu o tempo limite de 2000 ms.', req.originalUrl);
    }
    return enviarProblema(res, 502, 'Bad Gateway', 'Não foi possível conectar ao serviço interno.', req.originalUrl);
  }
});

// PROXY GENERATION: /api/locacoes, /api/veiculos
app.all('/api/locacoes*', async (req, res) => {
  const caminhoTarget = req.originalUrl.replace('/api/locacoes', '/locacoes');
  const targetUrl = `${SERVICOS.rest}${caminhoTarget}`;

  try {
    const upstreamRes = await lerUpstream(targetUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': req.requestId,
        'X-Cliente-Id': req.cliente.id
      },
      body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? JSON.stringify(req.body) : undefined
    }, disjuntorRest);

    res.status(upstreamRes.status);

    // Reescrita automática do cabeçalho Location (201 Created)
    const locationHeader = upstreamRes.headers.get('location');
    if (locationHeader) {
      res.setHeader('Location', `/api${locationHeader}`);
    }

    const data = await upstreamRes.json();
    res.json(data);
  } catch (err) {
    if (err.status === 503) {
      res.setHeader('Retry-After', 10);
      return enviarProblema(res, 503, 'Serviço Indisponível', 'Disjuntor aberto para a API REST.', req.originalUrl);
    }
    if (err.name === 'AbortError') {
      return enviarProblema(res, 504, 'Gateway Timeout', 'O serviço REST não respondeu em 2000 ms.', req.originalUrl);
    }
    return enviarProblema(res, 502, 'Bad Gateway', 'Falha na comunicação com o serviço REST interno.', req.originalUrl);
  }
});

app.all('/api/veiculos*', async (req, res) => {
  const caminhoTarget = req.originalUrl.replace('/api/veiculos', '/veiculos');
  const targetUrl = `${SERVICOS.rest}${caminhoTarget}`;

  try {
    const upstreamRes = await lerUpstream(targetUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': req.requestId,
        'X-Cliente-Id': req.cliente.id
      }
    }, disjuntorRest);

    res.status(upstreamRes.status);
    const data = await upstreamRes.json();
    res.json(data);
  } catch (err) {
    if (err.name === 'AbortError') {
      return enviarProblema(res, 504, 'Gateway Timeout', 'Timeout no serviço de veículos.', req.originalUrl);
    }
    return enviarProblema(res, 502, 'Bad Gateway', 'Serviço de veículos fora do ar.', req.originalUrl);
  }
});

// PROXY GRAPHQL: /api/graphql
app.all('/api/graphql*', async (req, res) => {
  const targetUrl = `${SERVICOS.graphql}`;

  try {
    const upstreamRes = await lerUpstream(targetUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': req.requestId
      },
      body: req.method === 'POST' ? JSON.stringify(req.body) : undefined
    });

    res.status(upstreamRes.status);
    const data = await upstreamRes.json();
    res.json(data);
  } catch (err) {
    return enviarProblema(res, 502, 'Bad Gateway', 'Serviço GraphQL indisponível.', req.originalUrl);
  }
});

app.listen(PORT, () => {
  console.log(`[API Gateway] Ponto único de entrada público ativo na porta ${PORT}`);
});
