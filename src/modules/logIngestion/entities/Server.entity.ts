import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../auth/entities/UserAuth.entity';
import { Log } from './Log.entity';

@Entity('servers')
export class Server {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ default: 'ONLINE' }) // ONLINE, OFFLINE, DEGRADED
  status!: string;

  @ManyToOne(() => User, (user) => user.servers, { onDelete: 'CASCADE' })
  user!: User;

  @OneToMany(() => Log, (log) => log.server)
  logs!: Log[];

  @CreateDateColumn()
  createdAt!: Date;
}
