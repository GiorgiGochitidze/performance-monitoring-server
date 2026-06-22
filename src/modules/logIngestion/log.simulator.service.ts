import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { IngestionGateway } from './ingestion.gateway';

interface ServerIdQueryResult {
  id: string;
}

// Define the shape of the Redis client to fix ESLint 'any' errors
interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<string>;
}

@Injectable()
export class LogSimulatorService implements OnModuleInit, OnModuleDestroy {
  private simulatorInterval: NodeJS.Timeout | null = null;
  private logsGeneratedThisSession = 0;
  private readonly MAX_LOGS_PER_SESSION = 500;
  private fallbackServerIds: string[] = [];
  private wasActive = false;

  private readonly DEMO_SERVER_1 = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
  private readonly DEMO_SERVER_2 = '47ac10b0-58cc-4372-a567-0e02b2c3d4e5';

  constructor(
    @InjectQueue('log') private readonly logQueue: Queue,
    private readonly dataSource: DataSource,
    private readonly ingestionGateway: IngestionGateway,
  ) {}

  public startSimulation() {
    if (this.simulatorInterval) return; // Prevent multiple intervals

    this.simulatorInterval = setInterval(() => {
      this.tickSimulator().catch(console.error);
    }, 100);
  }

  public stopSimulation() {
    if (this.simulatorInterval) {
      clearInterval(this.simulatorInterval);
      this.simulatorInterval = null;
    }
  }

  async onModuleInit() {
    try {
      // 1. Check for existing servers
      const result = await this.dataSource.query<ServerIdQueryResult[]>(
        'SELECT id FROM "servers" LIMIT 2',
      );

      if (result && result.length > 0) {
        this.fallbackServerIds = result.map((row) => row.id);
      } else {
        // 2. Seed demo servers if none exist
        await this.dataSource.query(
          `INSERT INTO "servers" (id, name, status)
           VALUES ($1, 'Demo Server 1', 'ONLINE'), ($2, 'Demo Server 2', 'ONLINE')
           ON CONFLICT (id) DO NOTHING`,
          [this.DEMO_SERVER_1, this.DEMO_SERVER_2],
        );
        this.fallbackServerIds = [this.DEMO_SERVER_1, this.DEMO_SERVER_2];
        console.log('[Simulator] Seeded demo servers successfully.');
      }
    } catch (err) {
      console.error(
        '[Simulator] Failed to pre-fetch or seed demo server IDs:',
        err,
      );
    }
  }

  onModuleDestroy() {
    if (this.simulatorInterval) {
      clearInterval(this.simulatorInterval);
    }
  }

  private async tickSimulator() {
    // Correctly typed Redis client
    const redisClient = (await this.logQueue.client) as unknown as RedisClient;
    const isDemoActive = await redisClient.get('demo-state:active');

    if (isDemoActive !== 'true') {
      if (this.wasActive) {
        this.ingestionGateway.broadcastDemoStopped();
        this.wasActive = false;
      }
      this.logsGeneratedThisSession = 0;
      return;
    }

    this.wasActive = true;

    if (this.logsGeneratedThisSession >= this.MAX_LOGS_PER_SESSION) {
      console.log('[Simulator] Session cap reached. Shutting down.');
      await redisClient.set('demo-state:active', '');
      this.ingestionGateway.broadcastDemoStopped();
      this.wasActive = false;
      this.logsGeneratedThisSession = 0;
      return;
    }

    const server1 = this.fallbackServerIds[0] || this.DEMO_SERVER_1;
    const server2 =
      this.fallbackServerIds[1] ||
      this.fallbackServerIds[0] ||
      this.DEMO_SERVER_2;

    const mockPayloads = [
      {
        level: 'INFO',
        serverId: server1,
        message: 'Health check passed smoothly.',
      },
      {
        level: 'INFO',
        serverId: server2,
        message: 'GET /api/v1/metrics status 200 OK.',
      },
      {
        level: 'WARN',
        serverId: server1,
        message: 'Memory usage mounting above 75%.',
      },
      {
        level: 'WARN',
        serverId: server2,
        message: 'High microservice network socket latency detected.',
      },
      {
        level: 'CRITICAL',
        serverId: server1,
        message: 'Database connection pool exhausted!',
      },
      {
        level: 'CRITICAL',
        serverId: server2,
        message: 'CPU Core throttling detected.',
      },
    ];

    const randomRoll =
      mockPayloads[Math.floor(Math.random() * mockPayloads.length)];

    await this.logQueue.add('process-log', {
      ...randomRoll,
      createdAt: new Date().toISOString(),
    });

    this.logsGeneratedThisSession++;
  }
}
