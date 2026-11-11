import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { GraphQLError } from 'graphql';

const restHost = '127.0.0.1';
const restPort = 3001;
const baseUrl = 'http://' + restHost + ':' + restPort;

const typeDefs = `
  enum CategoriaVeiculo {
    COMPACTO
    SEDAN
    SUV
    LUXO
  }

  type Veiculo {
    id: ID!
    modelo: String!
    marca: String!
    placa: String!
    ano: Int!
    valorDiario: Float!
    categoria: CategoriaVeiculo!
    proprietarioId: ID!
  }

  type Locatario {
    id: ID!
    nome: String!
    email: String!
    idade: Int!
    locacoes: [Locacao!]!
  }

  type Locacao {
    id: ID!
    dataInicio: String!
    dataFim: String!
    valorTotal: Float!
    status: String!
    veiculo: Veiculo!
    locatario: Locatario!
  }

  input NovaLocacaoInput {
    veiculoId: ID!
    locatarioId: ID!
    dataInicio: String!
    dataFim: String!
  }

  type Query {
    veiculos(categoria: CategoriaVeiculo): [Veiculo!]!
    locacao(id: ID!): Locacao
    locatario(id: ID!): Locatario
  }

  type Mutation {
    criarLocacao(dados: NovaLocacaoInput!): Locacao!
  }
`;

const resolvers = {
  Query: {
    veiculos: async (_, { categoria }, context) => {
      const target = categoria ? `${baseUrl}/veiculos?categoria=${categoria}` : `${baseUrl}/veiculos`;
      const res = await fetch(target, { headers: { 'X-Request-Id': context.requestId } });
      return await res.json();
    },

    locacao: async (_, { id }, context) => {
      const res = await fetch(`${baseUrl}/locacoes/${id}`, { headers: { 'X-Request-Id': context.requestId } });
      if (res.status === 404) {
        throw new GraphQLError(`Reserva ID ${id} não localizada.`, {
          extensions: { code: 'NOT_FOUND', http: { status: 404 } }
        });
      }
      return await res.json();
    },

    locatario: async (_, { id }, context) => {
      const res = await fetch(`${baseUrl}/locatarios/${id}`, { headers: { 'X-Request-Id': context.requestId } });
      if (res.status === 404) {
        throw new GraphQLError(`Locatário ID ${id} não localizado.`, {
          extensions: { code: 'NOT_FOUND', http: { status: 404 } }
        });
      }
      return await res.json();
    }
  },

  Locacao: {
    veiculo: async (parent, _, context) => {
      const res = await fetch(`${baseUrl}/veiculos/${parent.veiculoId}`, { headers: { 'X-Request-Id': context.requestId } });
      return await res.json();
    },
    locatario: async (parent, _, context) => {
      const res = await fetch(`${baseUrl}/locatarios/${parent.locatarioId}`, { headers: { 'X-Request-Id': context.requestId } });
      return await res.json();
    }
  },

  Locatario: {
    locacoes: async (parent, _, context) => {
      const res = await fetch(`${baseUrl}/locacoes`, { headers: { 'X-Request-Id': context.requestId } });
      const data = await res.json();
      const todas = data.dados || data;
      return todas.filter(l => l.locatarioId === parent.id);
    }
  },

  Mutation: {
    criarLocacao: async (_, { dados }, context) => {
      const res = await fetch(`${baseUrl}/locacoes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Request-Id': context.requestId
        },
        body: JSON.stringify(dados)
      });

      const body = await res.json();

      if (!res.ok) {
        const code = res.status === 409 ? 'CONFLICT' : 'BAD_USER_INPUT';
        throw new GraphQLError(body.detail || 'Falha ao criar locação.', {
          extensions: {
            code,
            http: { status: res.status },
            erros: body.erros || []
          }
        });
      }

      return body;
    }
  }
};

const server = new ApolloServer({ typeDefs, resolvers });

const { url } = await startStandaloneServer(server, {
  listen: { port: 4000, host: '127.0.0.1' },
  context: async ({ req }) => ({
    requestId: req.headers['x-request-id'] || 'gql-req-id'
  })
});

console.log(`[GraphQL Server] Apollo Server 5 ativo em ${url}`);
