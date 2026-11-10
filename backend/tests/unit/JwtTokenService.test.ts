import jwt from 'jsonwebtoken';
import { TokenInvalidoError } from '../../src/domain/errors/DomainErrors';
import { JwtTokenService } from '../../src/infrastructure/adapters/out/security/JwtTokenService';

const secreto = 'test-secret-with-at-least-thirty-two-bytes';
const payload = { usuarioId: 42, email: 'ana@example.com', rol: 'usuario' as const };

describe('JwtTokenService', () => {
  const servicio = new JwtTokenService(secreto);

  it('emite tokens HS256 de vida corta con emisor, audiencia y sujeto vinculados', () => {
    const token = servicio.generarAccessToken(payload);
    const decodificado = jwt.decode(token, { complete: true });

    expect(decodificado?.header.alg).toBe('HS256');
    expect(servicio.verificarAccessToken(token)).toEqual(payload);
    expect(decodificado?.payload).toMatchObject({
      iss: 'ft-group',
      aud: 'ft-group-api',
      sub: '42',
    });
  });

  it('rechaza tokens firmados para otro emisor o audiencia', () => {
    const tokenOtroEmisor = jwt.sign(payload, secreto, {
      algorithm: 'HS256',
      issuer: 'otro-emisor',
      audience: 'ft-group-api',
      subject: '42',
      expiresIn: '15m',
    });
    const tokenOtraAudiencia = jwt.sign(payload, secreto, {
      algorithm: 'HS256',
      issuer: 'ft-group',
      audience: 'otro-servicio',
      subject: '42',
      expiresIn: '15m',
    });

    expect(() => servicio.verificarAccessToken(tokenOtroEmisor)).toThrow(TokenInvalidoError);
    expect(() => servicio.verificarAccessToken(tokenOtraAudiencia)).toThrow(TokenInvalidoError);
  });

  it('rechaza algoritmos distintos de HS256 y tokens sin sujeto válido', () => {
    const tokenAlgoritmoDistinto = jwt.sign(payload, secreto, {
      algorithm: 'HS384',
      issuer: 'ft-group',
      audience: 'ft-group-api',
      subject: '42',
      expiresIn: '15m',
    });
    const tokenSinSujeto = jwt.sign(payload, secreto, {
      algorithm: 'HS256',
      issuer: 'ft-group',
      audience: 'ft-group-api',
      subject: '41',
      expiresIn: '15m',
    });

    expect(() => servicio.verificarAccessToken(tokenAlgoritmoDistinto)).toThrow(TokenInvalidoError);
    expect(() => servicio.verificarAccessToken(tokenSinSujeto)).toThrow(TokenInvalidoError);
  });

  it('rechaza tokens sin rol permitido o sin expiración', () => {
    const tokenSinRol = jwt.sign(
      { usuarioId: 42, email: 'ana@example.com' },
      secreto,
      { algorithm: 'HS256', issuer: 'ft-group', audience: 'ft-group-api', subject: '42', expiresIn: '15m' },
    );
    const tokenSinExpiracion = jwt.sign(payload, secreto, {
      algorithm: 'HS256',
      issuer: 'ft-group',
      audience: 'ft-group-api',
      subject: '42',
    });

    expect(() => servicio.verificarAccessToken(tokenSinRol)).toThrow(TokenInvalidoError);
    expect(() => servicio.verificarAccessToken(tokenSinExpiracion)).toThrow(TokenInvalidoError);
  });
});
