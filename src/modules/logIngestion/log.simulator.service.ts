import {
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { IngestionService } from './ingestion.service';
import { CreateLogDTO } from './dto/create-log.dto';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class LogSimulatorService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private simulatorInterval!: NodeJS.Timeout;
  private isSimulating = false;

  // The 3 UUIDs we want to test with
  private readonly serverIds = [
    'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
    'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e',
    'c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f',
  ];

  private readonly logLevels = [
    'INFO',
    'INFO',
    'INFO',
    'WARN',
    'INFO',
    'CRITICAL',
  ];
  private readonly errorMessages = [
    'CPU utilization spiked to 94%',
    'Memory consumption crossing 88% threshold',
    'Database connection pool latency > 250ms',
    'Disk I/O read operations throttling',
    'Nginx microservice router heartbeat timeout',
  ];

  // 🔌 Inject the DataSource so we can seed the servers table if empty
  constructor(
    private readonly ingestionService: IngestionService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async onApplicationBootstrap() {
    await this.ensureMockServersExist();
    this.startSimulation();
  }

  onApplicationShutdown() {
    if (this.simulatorInterval) {
      clearInterval(this.simulatorInterval);
    }
  }

  // 🛡️ SEED FUNCTION: This inserts the mock parent records so foreign keys don't break!
  private async ensureMockServersExist() {
    console.log(
      '🌱 Checking and provisioning mock cluster nodes in the database...',
    );
    try {
      for (const id of this.serverIds) {
        // Updated to remove "updatedAt" so it targets only your existing columns
        await this.dataSource.query(`
          INSERT INTO "servers" ("id", "name", "status", "createdAt")
          VALUES ('${id}', 'Mock Server Node (${id.slice(0, 4)})', 'ACTIVE', NOW())
          ON CONFLICT ("id") DO NOTHING;
        `);
      }
      console.log(
        '✅ Mock cluster nodes confirmed inside the "servers" table.',
      );
    } catch (err) {
      console.error('Failed to seed mock cluster nodes:', err);
    }
  }

  private startSimulation() {
    if (this.isSimulating) return;
    this.isSimulating = true;

    console.log(
      '🧪 [SIMULATOR ACTIVATED] Flooding the log queue pipeline with mock cluster traffic...',
    );

    this.simulatorInterval = setInterval(() => {
      const randomServer =
        this.serverIds[Math.floor(Math.random() * this.serverIds.length)];
      const randomLevel =
        this.logLevels[Math.floor(Math.random() * this.logLevels.length)];
      const randomMessage =
        this.errorMessages[
          Math.floor(Math.random() * this.errorMessages.length)
        ];

      const mockLog: CreateLogDTO = {
        serverId: randomServer,
        level: randomLevel,
        message:
          randomLevel === 'CRITICAL'
            ? `🔥 CRITICAL ERRROR: ${randomMessage}`
            : randomMessage,
      };

      this.ingestionService.logRegister(mockLog).catch((err) => {
        console.error('Simulator failed to register item:', err);
      });
    }, 100);
  }
}
