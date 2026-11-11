import express from 'express';

const app = express();
app.use(express.json());

const PORT = 3001;

const veiculos = [
  { id: 'v1111111-1111-1111-1111-111111111111', modelo: 'Corolla', marca: 'Toyota', placa: 'ABC-1234', ano: 2023, valorDiario: 150.0, categoria: 'SEDAN', proprietarioId: 'u1' },
  { id: 'v2222222-2222-2222-2222-222222222222', modelo: 'Civic', marca: 'Honda', placa: 'XYZ-5678', ano: 2024, valorDiario: 180.0, categoria: 'SEDAN', proprietarioId: 'u1' },
  { id: 'v3333333-3333-3333-3333-333333333333', modelo: 'Porsche 911', marca: 'Porsche', placa: 'LUX-9999', ano: 2024, valorDiario: 1200.0, categoria: 'LUXO', proprietarioId: 'u2' },
  { id: 'v4444444-4444-4444-4444-444444444444', modelo: 'Renegade', marca: 'Jeep', placa: 'SUV-8888', ano: 2022, valorDiario: 200.0, categoria: 'SUV', proprietarioId: 'u2' }
];

const locatarios = [
  { id: 'u1000000-0000-0000-0000-000000000100', nome: 'Carlos Silva', email: 'carlos@dominio.com', idade: 28, cnhValida: true },
  { id: 'u2000000-0000-0000-0000-000000000200', nome: 'Mariana Costa', email: 'mariana@dominio.com', idade: 22, cnhValida: true },
  { id: 'u3000000-0000-0000-0000-000000000300', nome: 'João Pedro', email: 'joao@dominio.com', idade: 35, cnhValida: false }
];

let locacoes = [
  {
    id: 1,
    veiculoId: 'v1111111-1111-1111-1111-111111111111',
    locatarioId: 'u1000000-0000-0000-0000-000000000100',
    dataInicio: '2026-11-15T10:00:00Z',
    dataFim: '2026-11-20T10:00:00Z',
    valorTotal: 750.0,
    status: 'CONFIRMADA'
  }
];

let proximoIdLocacao = 2;

function enviarProblema(res, status, title, detail, erros = [], instance = '/locacoes') {
  res.status(status).setHeader('Content-Type', 'application/problem+json').json({
    type: `problem/${status}`,
    title,
    status,
    detail,
    instance,
    erros
  });
}

app.use((req, res, next) => {
  const reqId = req.headers['x-request-id'] || 'req-id';
  console.log(`[REST API] [${reqId}] ${req.method} ${req.url}`);
  next();
});

app.get('/veiculos', (req, res) => {
  const { categoria } = req.query;
  let resultado = veiculos;
  if (categoria) {
    resultado = resultado.filter(v => v.categoria.toUpperCase() === categoria.toUpperCase());
  }
  res.json(resultado);
});

app.get('/veiculos/:id', (req, res) => {
  const v = veiculos.find(item => item.id === req.params.id);
  if (!v) return enviarProblema(res, 404, 'Não Encontrado', 'Veículo não localizado.');
  res.json(v);
});

app.get('/locatarios/:id', (req, res) => {
  const l = locatarios.find(item => item.id === req.params.id);
  if (!l) return enviarProblema(res, 404, 'Não Encontrado', 'Locatário não localizado.');
  res.json(l);
});

app.get('/locacoes', (req, res) => {
  let { status, categoria, pagina = 1, limite = 10 } = req.query;
  limite = Math.min(parseInt(limite) || 10, 50);
  pagina = parseInt(pagina) || 1;

  let resultado = [...locacoes];

  if (status) {
    resultado = resultado.filter(l => l.status.toUpperCase() === status.toUpperCase());
  }

  if (categoria) {
    resultado = resultado.filter(l => {
      const v = veiculos.find(item => item.id === l.veiculoId);
      return v && v.categoria.toUpperCase() === categoria.toUpperCase();
    });
  }

  const inicio = (pagina - 1) * limite;
  res.json({
    total: resultado.length,
    pagina,
    limite,
    dados: resultado.slice(inicio, inicio + limite)
  });
});

app.get('/locacoes/:id', (req, res) => {
  const loc = locacoes.find(l => l.id === parseInt(req.params.id));
  if (!loc) return enviarProblema(res, 404, 'Reserva não encontrada', `A reserva ID ${req.params.id} não foi localizada.`);
  res.json(loc);
});

app.post('/locacoes', (req, res) => {
  const { veiculoId, locatarioId, dataInicio, dataFim } = req.body;

  const erros = [];
  if (!veiculoId) erros.push({ campo: 'veiculoId', mensagem: 'ID do veículo é obrigatório.' });
  if (!locatarioId) erros.push({ campo: 'locatarioId', mensagem: 'ID do locatário é obrigatório.' });
  if (!dataInicio) erros.push({ campo: 'dataInicio', mensagem: 'Data inicial é obrigatória.' });
  if (!dataFim) erros.push({ campo: 'dataFim', mensagem: 'Data final é obrigatória.' });

  if (erros.length > 0) {
    return enviarProblema(res, 422, 'Dados Inválidos', 'Erros nos campos informados.', erros);
  }

  const veiculo = veiculos.find(v => v.id === veiculoId);
  if (!veiculo) return enviarProblema(res, 404, 'Veículo não encontrado', 'O veículo informado não existe.');

  const locatario = locatarios.find(l => l.id === locatarioId);
  if (!locatario) return enviarProblema(res, 404, 'Locatário não encontrado', 'O locatário informado não existe.');

  const dtInicio = new Date(dataInicio);
  const dtFim = new Date(dataFim);

  // REGRA 1: CNH Válida e Datas
  if (!locatario.cnhValida) {
    return enviarProblema(res, 422, 'CNH Inválida', 'Locatário com CNH vencida ou suspensa.');
  }
  if (dtFim <= dtInicio) {
    return enviarProblema(res, 422, 'Período Inválido', 'Data final deve ser posterior à data inicial.');
  }

  // REGRA 3: Idade Mínima
  if (veiculo.categoria === 'LUXO' && locatario.idade < 25) {
    return enviarProblema(res, 422, 'Restrição de Categoria', 'Veículos da categoria LUXO exigem idade mínima de 25 anos.');
  }

  // REGRA 2: Overbooking
  const conflito = locacoes.find(l => {
    if (l.veiculoId !== veiculoId || l.status === 'CANCELADA') return false;
    const lInicio = new Date(l.dataInicio);
    const lFim = new Date(l.dataFim);
    return (dtInicio < lFim && dtFim > lInicio);
  });

  if (conflito) {
    return enviarProblema(res, 409, 'Conflito de Agenda', 'Veículo indisponível para a data informada.');
  }

  const dias = Math.ceil((dtFim - dtInicio) / (1000 * 60 * 60 * 24));
  const valorTotal = dias * veiculo.valorDiario;

  const novaLocacao = {
    id: proximoIdLocacao++,
    veiculoId,
    locatarioId,
    dataInicio,
    dataFim,
    valorTotal,
    status: 'CONFIRMADA'
  };

  locacoes.push(novaLocacao);

  res.status(201)
    .setHeader('Location', `/locacoes/${novaLocacao.id}`)
    .json(novaLocacao);
});

app.put('/locacoes/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const idx = locacoes.findIndex(l => l.id === id);
  if (idx === -1) return enviarProblema(res, 404, 'Não Encontrado', 'Locação não localizada.');

  const { veiculoId, locatarioId, dataInicio, dataFim, status } = req.body;
  if (!veiculoId || !locatarioId || !dataInicio || !dataFim || !status) {
    return enviarProblema(res, 422, 'Substituição Incompleta', 'PUT exige a substituição integral dos campos.');
  }

  locacoes[idx] = { id, veiculoId, locatarioId, dataInicio, dataFim, valorTotal: req.body.valorTotal || locacoes[idx].valorTotal, status };
  res.json(locacoes[idx]);
});

app.patch('/locacoes/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const loc = locacoes.find(l => l.id === id);
  if (!loc) return enviarProblema(res, 404, 'Não Encontrado', 'Locação não localizada.');

  const camposPermitidos = ['dataFim', 'status'];
  const somenteCampos = {};
  for (const k of Object.keys(req.body)) {
    if (camposPermitidos.includes(k)) somenteCampos[k] = req.body[k];
  }

  Object.assign(loc, somenteCampos);
  res.json(loc);
});

app.delete('/locacoes/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const idx = locacoes.findIndex(l => l.id === id);
  if (idx === -1) return enviarProblema(res, 404, 'Não Encontrado', 'Locação não localizada.');

  locacoes.splice(idx, 1);
  res.status(204).end();
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[REST API] Ativa em 127.0.0.1:${PORT}`);
});
