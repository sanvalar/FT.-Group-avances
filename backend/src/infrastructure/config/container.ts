import { pool, poolHistorico } from '../adapters/out/persistence/postgres/db';
import { PostgresUsuarioRepository } from '../adapters/out/persistence/postgres/PostgresUsuarioRepository';
import { PostgresRefreshTokenRepository } from '../adapters/out/persistence/postgres/PostgresRefreshTokenRepository';
import { Argon2PasswordHasher } from '../adapters/out/security/Argon2PasswordHasher';
import { JwtTokenService } from '../adapters/out/security/JwtTokenService';
import { RegistrarUsuarioUseCaseImpl } from '../../application/usecases/RegistrarUsuarioUseCaseImpl';
import { IniciarSesionUseCaseImpl } from '../../application/usecases/IniciarSesionUseCaseImpl';
import { RefrescarTokenUseCaseImpl } from '../../application/usecases/RefrescarTokenUseCaseImpl';
import { CerrarSesionUseCaseImpl } from '../../application/usecases/CerrarSesionUseCaseImpl';
import { ObtenerPerfilUseCaseImpl } from '../../application/usecases/ObtenerPerfilUseCaseImpl';
import { env } from './env';
import { ActualizarPerfilUseCaseImpl } from '../../application/usecases/ActualizarPerfilUseCaseImpl';
import { DesactivarCuentaUseCaseImpl } from '../../application/usecases/DesactivarCuentaUseCaseImpl';
import { ActivarCuentaUseCaseImpl } from '../../application/usecases/ActivarCuentaUseCaseImpl';
import { GrupoGastoService } from '../../application/services/GrupoGastoService';
import { PostgresGrupoGastoRepository } from '../adapters/out/persistence/postgres/PostgresGrupoGastoRepository';
import { GrupoGastoController } from '../adapters/in/http/controllers/GrupoGastoController';
import { PostgresAdministracionRepository } from '../adapters/out/persistence/postgres/PostgresAdministracionRepository';
import { AdministracionService } from '../../application/services/AdministracionService';
import { AdministracionController } from '../adapters/in/http/controllers/AdministracionController';
import { PostgresAuditoriaRepository } from '../adapters/out/persistence/postgres/PostgresAuditoriaRepository';
import { AuditoriaService } from '../../application/services/AuditoriaService';
import { AuditoriaController } from '../adapters/in/http/controllers/AuditoriaController';
import { PostgresSoporteRepository } from '../adapters/out/persistence/postgres/PostgresSoporteRepository';
import { SoporteService } from '../../application/services/SoporteService';
import { AsistenteService } from '../../application/services/AsistenteService';
import { OpenAIAsistente } from '../adapters/out/ia/OpenAIAsistente';
import { construirPromptSoporte } from '../adapters/out/ia/promptSoporte';
import { SoporteController } from '../adapters/in/http/controllers/SoporteController';
import { AsistenteController } from '../adapters/in/http/controllers/AsistenteController';

/**
 * "Composition root" / contenedor de dependencias manual.
 *
 * Aqui, y SOLO aqui, se conectan los puertos con sus adaptadores
 * concretos (Postgres, Argon2id, JWT). Este es el unico archivo que
 * conecta los adaptadores concretos con los casos de uso.
 * el dominio y la capa de aplicacion no se tocan.
 */

// --- Adaptadores de salida (infraestructura) ---
const usuarioRepository = new PostgresUsuarioRepository(pool);
const refreshTokenRepository = new PostgresRefreshTokenRepository(pool);
const passwordHasher = new Argon2PasswordHasher();
const tokenService = new JwtTokenService(env.jwtSecret, env.jwtExpiracion);

// --- Casos de uso (capa de aplicacion) ---
export const registrarUsuarioUseCase = new RegistrarUsuarioUseCaseImpl(usuarioRepository, passwordHasher);

export const iniciarSesionUseCase = new IniciarSesionUseCaseImpl(
  usuarioRepository,
  refreshTokenRepository,
  passwordHasher,
  tokenService
);

export const refrescarTokenUseCase = new RefrescarTokenUseCaseImpl(
  usuarioRepository,
  refreshTokenRepository,
  tokenService
);

export const cerrarSesionUseCase = new CerrarSesionUseCaseImpl(refreshTokenRepository);

export const obtenerPerfilUseCase = new ObtenerPerfilUseCaseImpl(usuarioRepository);
export const actualizarPerfilUseCase = new ActualizarPerfilUseCaseImpl(usuarioRepository);
export const desactivarCuentaUseCase = new DesactivarCuentaUseCaseImpl(usuarioRepository, refreshTokenRepository);
export const activarCuentaUseCase = new ActivarCuentaUseCaseImpl(usuarioRepository);

const grupoGastoRepository = new PostgresGrupoGastoRepository(pool);
const grupoGastoService = new GrupoGastoService(grupoGastoRepository);
export const grupoGastoController = new GrupoGastoController(grupoGastoService);

const administracionRepository = new PostgresAdministracionRepository(pool, poolHistorico);
const administracionService = new AdministracionService(administracionRepository);
export const administracionController = new AdministracionController(administracionService);

const auditoriaRepository = new PostgresAuditoriaRepository(pool);
export const auditoriaService = new AuditoriaService(auditoriaRepository);
export const auditoriaController = new AuditoriaController(auditoriaService);

// --- Modulo de soporte y asistente conversacional ---
// El adaptador del modelo se construye siempre; si falta IA_API_KEY queda
// marcado como no disponible y el endpoint responde 503 sin romper nada.
const soporteRepository = new PostgresSoporteRepository(pool);
const soporteService = new SoporteService(soporteRepository);
export const soporteController = new SoporteController(soporteService);

const asistenteIA = new OpenAIAsistente({
  apiKey: env.iaApiKey,
  baseUrl: env.iaBaseUrl,
  modelo: env.iaModelo,
  temperatura: env.iaTemperatura,
  maxTokens: env.iaMaxTokens,
  timeoutMs: env.iaTimeoutMs,
});

export const asistenteService = new AsistenteService(
  asistenteIA,
  soporteService,
  soporteRepository,
  construirPromptSoporte,
);
export const asistenteController = new AsistenteController(asistenteService, usuarioRepository);

// Exportado para que el middleware de autenticacion pueda verificar
// access tokens sin duplicar la logica de JWT.
export const tokenServiceInstancia = tokenService;
export const usuarioRepositoryInstancia = usuarioRepository;
export const refreshTokenRepositoryInstancia = refreshTokenRepository;
