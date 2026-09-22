import { ExecutionContext, Injectable } from '@nestjs/common';
import {
  ThrottlerException,
  ThrottlerGuard,
  type ThrottlerLimitDetail,
} from '@nestjs/throttler';

// Análogo a LoginThrottlerGuard, con su propio mensaje. El contador es por
// handler (la clave del throttler incluye clase y método), así que no compite
// con el de login aunque compartan ThrottlerModule.
@Injectable()
export class ChangePasswordThrottlerGuard extends ThrottlerGuard {
  protected override async throwThrottlingException(
    _context: ExecutionContext,
    _throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    throw new ThrottlerException(
      'Demasiados intentos de cambio de contraseña. Espera un minuto antes de volver a intentar.',
    );
  }
}
