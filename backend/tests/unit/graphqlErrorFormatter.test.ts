import { GraphQLError } from 'graphql';
import { AccesoDenegadoError, ValidacionError } from '../../src/domain/errors/DomainErrors';
import { formatGraphQLError } from '../../src/infrastructure/config/graphqlErrorFormatter';

describe('formatGraphQLError', () => {
  it('preserves safe domain messages and assigns stable error codes', () => {
    const error = new GraphQLError('denied', {
      originalError: new AccesoDenegadoError('No tienes permisos.'),
      path: ['usuarios'],
    });

    const formatted = formatGraphQLError(error);
    expect(formatted).toBeInstanceOf(GraphQLError);
    expect(formatted.message).toBe('No tienes permisos.');
    expect((formatted as GraphQLError).extensions.code).toBe('FORBIDDEN');
  });

  it('marks validation errors as bad user input', () => {
    const error = new GraphQLError('invalid', {
      originalError: new ValidacionError('El límite no es válido.'),
    });

    const formatted = formatGraphQLError(error) as GraphQLError;
    expect(formatted.message).toBe('El límite no es válido.');
    expect(formatted.extensions.code).toBe('BAD_USER_INPUT');
  });

  it('logs unexpected errors without exposing internal details', () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const error = new GraphQLError('database password leaked', {
        originalError: new Error('database password leaked'),
        path: ['miPanel'],
      });

      const formatted = formatGraphQLError(error) as GraphQLError;
      expect(formatted.message).toBe('Ha ocurrido un error inesperado al procesar la solicitud.');
      expect(formatted.path).toEqual(['miPanel']);
      expect(formatted.extensions.code).toBe('INTERNAL_SERVER_ERROR');
      expect(log).toHaveBeenCalledTimes(1);
      expect(log.mock.calls[0][0]).not.toContain('database password leaked');
    } finally {
      log.mockRestore();
    }
  });
});
