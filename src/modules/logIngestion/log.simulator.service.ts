import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { IngestionGateway } from './ingestion.gateway';

interface ServerIdQueryResult {
  id: string;
}

@Injectable()
export class LogSimulatorService implements OnModuleInit, OnModuleDestroy {
  private simulatorInterval!: NodeJS.Timeout;

  // Auto-stop tracking variables
  private logsGeneratedThisSession = 0;
  private readonly MAX_LOGS_PER_SESSION = 500; // safety net, separate from the 20s TTL
  private fallbackServerIds: string[] = [];

  // Tracks last known active state so we only broadcast "stopped" once per transition,
  // not on every single tick while it's already off
  private wasActive = false;

  constructor(
    @InjectQueue('log') private readonly logQueue: Queue,
    private readonly dataSource: DataSource,
    private readonly ingestionGateway: IngestionGateway,
  ) {}

  async onModuleInit() {
    try {
      const result = await this.dataSource.query<ServerIdQueryResult[]>(
        'SELECT id FROM "servers" LIMIT 2',
      );
      if (result && result.length > 0) {
        this.fallbackServerIds = result.map((row) => row.id);
      }
    } catch (err) {
      console.error('Failed to pre-fetch real server IDs for simulator:', err);
    }

    this.simulatorInterval = setInterval(() => {
      this.tickSimulator().catch((err) => console.error(err));
    }, 100);
  }

  onModuleDestroy() {
    if (this.simulatorInterval) {
      clearInterval(this.simulatorInterval);
    }
  }

  private async tickSimulator() {
    const redisClient = (await this.logQueue.client) as unknown as {
      get: (key: string) => Promise<string | null>;
      set: (key: string, value: string) => Promise<string>;
    };

    const isDemoActive = await redisClient.get('demo-state:active');

    // Off because of manual stop OR the 20s TTL expired naturally
    if (isDemoActive !== 'true') {
      if (this.wasActive) {
        this.ingestionGateway.broadcastDemoStopped();
        this.wasActive = false;
      }
      this.logsGeneratedThisSession = 0;
      return;
    }

    this.wasActive = true;

    // Hard safety cap reached -> autostop and reset Redis key
    if (this.logsGeneratedThisSession >= this.MAX_LOGS_PER_SESSION) {
      console.log(
        `[Simulator] Reached cap of ${this.MAX_LOGS_PER_SESSION} records. Triggering automatic shutdown...`,
      );
      await redisClient.set('demo-state:active', '');
      this.ingestionGateway.broadcastDemoStopped();
      this.wasActive = false;
      this.logsGeneratedThisSession = 0;
      return;
    }

    const server1 =
      this.fallbackServerIds[0] || '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
    const server2 =
      this.fallbackServerIds[1] ||
      this.fallbackServerIds[0] ||
      '47ac10b0-58cc-4372-a567-0e02b2c3d4e5';

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
        message: 'Database connection pool exhausted! Rejecting clients.',
      },
      {
        level: 'CRITICAL',
        serverId: server2,
        message: 'CPU Core core-0 throttling under high-load loop execution.',
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
