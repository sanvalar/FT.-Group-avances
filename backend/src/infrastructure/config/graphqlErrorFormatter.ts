import { GraphQLError } from 'graphql';
import { DomainError } from '../../domain/errors/DomainErrors';

const CODIGOS_DOMINIO: Record<string, string> = {
  AccesoDenegadoError: 'FORBIDDEN',
  UsuarioInactivoError: 'FORBIDDEN',
  TokenInvalidoError: 'UNAUTHENTICATED',
  UsuarioNoEncontradoError: 'NOT_FOUND',
  GrupoNoEncontradoError: 'NOT_FOUND',
  GastoNoEncontradoError: 'NOT_FOUND',
  NotificacionNoEncontradaError: 'NOT_FOUND',
  TicketNoEncontradoError: 'NOT_FOUND',
  EmailYaRegistradoError: 'CONFLICT',
  ConflictoEstadoError: 'CONFLICT',
  ValidacionError: 'BAD_USER_INPUT',
  CredencialesInvalidasError: 'UNAUTHENTICATED',
  AsistenteNoDisponibleError: 'SERVICE_UNAVAILABLE',
};

function formatearConCodigo(error: GraphQLError, message: string, code: string): GraphQLError {
  return new GraphQLError(message, {
    nodes: error.nodes,
    path: error.path,
    extensions: { code },
  });
}

export function formatGraphQLError(error: Readonly<GraphQLError | Error>): GraphQLError | Error {
  if (!(error instanceof GraphQLError)) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      type: 'graphql_resolver_failed',
      errorName: error.name || 'Error',
    }));
    return new GraphQLError('Ha ocurrido un error inesperado al procesar la solicitud.', {
      extensions: { code: 'INTERNAL_SERVER_ERROR' },
    });
  }

  const originalError = error.originalError;
  if (!originalError) return error;

  if (originalError instanceof GraphQLError && typeof originalError.extensions.code === 'string') {
    return formatearConCodigo(error, originalError.message, originalError.extensions.code);
  }

  if (originalError instanceof DomainError) {
    const code = CODIGOS_DOMINIO[originalError.name] ?? 'BAD_USER_INPUT';
    return formatearConCodigo(error, originalError.message, code);
  }

  const errorName = originalError.name || 'Error';
  const errorCode = 'code' in originalError ? originalError.code : undefined;
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error',
    type: 'graphql_resolver_failed',
    errorName,
    code: typeof errorCode === 'string' ? errorCode : undefined,
  }));

  return formatearConCodigo(
    error,
    'Ha ocurrido un error inesperado al procesar la solicitud.',
    'INTERNAL_SERVER_ERROR',
  );
}
