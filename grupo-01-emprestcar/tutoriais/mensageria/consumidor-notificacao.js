import amqp from 'amqplib';

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
const EXCHANGE = 'frota.eventos';
const FILA = 'fila.notificacao';
const ROUTING_KEY = 'locacao.*';

async function iniciarConsumidorNotificacao() {
  try {
    const conn = await amqp.connect(RABBITMQ_URL);
    const channel = await conn.createChannel();

    await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
    await channel.assertQueue(FILA, { durable: true });
    await channel.bindQueue(FILA, EXCHANGE, ROUTING_KEY);

    channel.prefetch(1); // Consumo justo

    console.log(`[Consumidor Notificação] Aguardando mensagens na fila '${FILA}'...`);

    channel.consume(FILA, (msg) => {
      if (!msg) return;

      const requestId = msg.properties.headers['X-Request-Id'] || 'sem-id';
      try {
        const evento = JSON.parse(msg.content.toString());
        console.log(`[Consumidor Notificação] [${requestId}] Evento recebido: ${evento.evento} | Locação ID: ${evento.locacaoId}`);
        console.log(`[Consumidor Notificação] Enviando e-mail/SMS de confirmação para o locatário ${evento.locatarioId}...`);
        
        channel.ack(msg);
      } catch (err) {
        console.error(`[Consumidor Notificação] [${requestId}] Erro no processamento:`, err.message);
        channel.nack(msg, false, false); // Rejeita e envia para DLQ
      }
    });
  } catch (err) {
    console.warn('[Consumidor Notificação] Broker indisponível. Simulação de escuta concluída.');
  }
}

iniciarConsumidorNotificacao();
