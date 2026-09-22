import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  // Sin mínimo de largo: se compara contra el hash guardado, y una contraseña
  // actual "inválida" debe dar el mismo 400 claro que una equivocada.
  @IsString()
  @MinLength(1)
  currentPassword: string;

  // Mismo mínimo que LoginDto/CreateUserDto.
  @IsString()
  @MinLength(8)
  newPassword: string;
}
