import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../users/entities/user.entity.js';

@Entity({ name: 'refresh_tokens' })
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  // Nunca se guarda el valor real del refresh token, solo su hash (bcrypt,
  // mismo criterio que User.passwordHash) — ver RefreshTokensService.
  @Column({ type: 'varchar', name: 'token_hash' })
  tokenHash: string;

  // timestamptz, no timestamp: la comparación contra Date.now() en
  // RefreshTokensService necesita un instante absoluto. Un "timestamp"
  // (sin zona horaria) se guarda/lee como hora de pared, y `pg` lo parsea
  // asumiendo la zona horaria local del proceso de Node — con Postgres en
  // UTC y Node en una zona con offset negativo (ej. Perú, UTC-5), un token
  // "vencido hace 1 hora" se leía como vencido en el futuro.
  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt: Date;

  @Column({ type: 'boolean', default: false })
  revoked: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
