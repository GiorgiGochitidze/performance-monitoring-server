import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Server } from '../../logIngestion/entities/Server.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true, type: 'varchar' })
  email!: string;

  @Column({ type: 'varchar', select: false })
  password!: string;

  @OneToMany(() => Server, (server) => server.user)
  servers!: Server[];

  @Column({ type: 'varchar', nullable: true, default: null })
  refreshToken!: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;
}
