import amqp from 'amqplib';

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
const EXCHANGE = 'frota.eventos';
const FILA = 'fila.frota';
const DLX = 'locacao.dlx';
const DLQ = 'locacao.dlq';
const ROUTING_KEY = 'locacao.criada';

// Tabela em memória para garantia de Idempotência
const processados = new Set();

async function iniciarConsumidorFrota() {
  try {
    const conn = await amqp.connect(RABBITMQ_URL);
    const channel = await conn.createChannel();

    // Configuração de Dead Letter Exchange (DLQ)
    await channel.assertExchange(DLX, 'direct', { durable: true });
    await channel.assertQueue(DLQ, { durable: true });
    await channel.bindQueue(DLQ, DLX, 'mortas');

    await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
    await channel.assertQueue(FILA, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': DLX,
        'x-dead-letter-routing-key': 'mortas'
      }
    });

    await channel.bindQueue(FILA, EXCHANGE, ROUTING_KEY);
    channel.prefetch(1); // Prefetch 1 para distribuição justa

    console.log(`[Consumidor Frota] Aguardando mensagens na fila '${FILA}' (DLQ configurada)...`);

    channel.consume(FILA, (msg) => {
      if (!msg) return;

      const requestId = msg.properties.headers['X-Request-Id'] || 'sem-id';
      try {
        const evento = JSON.parse(msg.content.toString());

        // Verificação de Idempotência
        const chaveUnica = `locacao-${evento.locacaoId}`;
        if (processados.has(chaveUnica)) {
          console.warn(`[Consumidor Frota] [${requestId}] Mensagem duplicada ignorada (Idempotência): Reserva ID ${evento.locacaoId}`);
          channel.ack(msg);
          return;
        }

        console.log(`[Consumidor Frota] [${requestId}] Evento recebido: ${evento.evento} | Veículo ID: ${evento.veiculoId}`);
        console.log(`[Consumidor Frota] Atualizando agenda do proprietário e agendando higienização do veículo...`);

        // Registrar como processado
        processados.add(chaveUnica);
        channel.ack(msg);
      } catch (err) {
        console.error(`[Consumidor Frota] [${requestId}] Falha grave no payload. Rejeitando mensagem para DLQ...`);
        channel.nack(msg, false, false); // NACK sem requeue -> envia para DLQ
      }
    });
  } catch (err) {
    console.warn('[Consumidor Frota] Broker indisponível. Simulação de escuta concluída.');
  }
}

iniciarConsumidorFrota();
