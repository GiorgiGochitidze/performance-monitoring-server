import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Server } from './Server.entity';

@Entity('logs')
export class Log {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  level!: string; // "INFO", "WARN", "CRITICAL"

  @Column('text')
  message!: string;

  @Column()
  @Index() // Adds a critical database index for fast querying by server
  serverId!: string;

  @ManyToOne(() => Server, (server) => server.logs, { onDelete: 'CASCADE' })
  server!: Server;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;
}
