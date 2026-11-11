# Script de testes das 8 Cenas do EmprestCar

GATEWAY_URL="http://localhost:3000"
KEY_LOCATARIO="chave-app-locatario-123"
KEY_LOCADOR="chave-painel-locador-456"

echo "=== CENA 1: Validação de Portas ==="
curl -X GET "$GATEWAY_URL/api/veiculos" -H "X-API-Key: $KEY_LOCATARIO"

echo ""
echo "=== CENA 2: POST /api/locacoes (201 Created) ==="
curl -X POST "$GATEWAY_URL/api/locacoes" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $KEY_LOCATARIO" \
  -d '{
    "veiculoId": "v2222222-2222-2222-2222-222222222222",
    "locatarioId": "u1000000-0000-0000-0000-000000000100",
    "dataInicio": "2026-12-01T10:00:00Z",
    "dataFim": "2026-12-05T10:00:00Z"
  }'

echo ""
echo "=== CENA 5: Consulta GraphQL ==="
curl -X POST "$GATEWAY_URL/api/graphql" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $KEY_LOCATARIO" \
  -d '{
    "query": "query { veiculos { modelo marca placa } }"
  }'

echo ""
echo "=== CENA 7: Rota Agregada com Degradação Graciosa ==="
curl -X GET "$GATEWAY_URL/api/painel/locacoes/1" -H "X-API-Key: $KEY_LOCADOR"
echo ""
