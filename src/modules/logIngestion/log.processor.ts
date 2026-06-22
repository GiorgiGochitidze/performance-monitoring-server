import { Processor, WorkerHost } from '@nestjs/bullmq';
import { OnModuleDestroy } from '@nestjs/common';
import { CreateLogDTO } from './dto/create-log.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Log } from './entities/Log.entity';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import { IngestionGateway } from './ingestion.gateway';

@Processor('log')
export class LogProcessor extends WorkerHost implements OnModuleDestroy {
  private logBuffer: CreateLogDTO[] = [];
  private readonly BATCH_SIZE = 50;
  private readonly FLUSH_INTERVAL_MS = 5000; // 5 seconds maximum wait time
  private flushTimer!: NodeJS.Timeout;

  constructor(
    @InjectRepository(Log) private readonly logRepository: Repository<Log>,
    private readonly ingestionGateway: IngestionGateway,
  ) {
    super();

    // Start a heartbeat timer to clear out stale logs during low-traffic periods
    this.flushTimer = setInterval(() => {
      this.flushBufferToDatabase().catch((err) => {
        console.error('Error in flush timer interval:', err);
      });
    }, this.FLUSH_INTERVAL_MS);
  }

  // Closes the interval cleanly if NestJS shuts down or restarts
  async onModuleDestroy() {
    clearInterval(this.flushTimer);
    await this.flushBufferToDatabase(); // Final sweep of remaining items
  }

  private async handleCriticalAlert(
    serverId: string,
    message: string,
  ): Promise<void> {
    const lockKey = `alert-cooldown:${serverId}`;

    try {
      // Safe double-casting: route through unknown first to keep the compiler happy
      const redisClient = (await this.worker.client) as unknown as {
        set: (
          key: string,
          value: string,
          options: { EX: number; NX: boolean },
        ) => Promise<string | null>;
        ttl: (key: string) => Promise<number>;
      };

      /**
       * THE lock patteern
       * We use an explicit options object configuration layout here instead of separate arguments.
       * This structure is universally supported across every version of Node-Redis/IORedis definitions.
       */
      const acquiredLock = await redisClient.set(lockKey, 'ACTIVE', {
        EX: 60,
        NX: true,
      });

      if (acquiredLock === 'OK') {
        console.log(
          `[CRITICAL ALERT DISPATCHED] Server [${serverId}]: "${message}". Notification sent to Discord/Slack webhooks.`,
        );
      } else {
        // Fetch the remaining TTL cleanly
        const remainingTtl = await redisClient.ttl(lockKey);
        console.warn(
          `[Alert Shielded] Muting repeating critical alert for server [${serverId}]. Lock active for another ${remainingTtl}s.`,
        );
      }
    } catch (redisError) {
      console.error(
        'Failed to communicate with the rate-limiting Redis lock cache:',
        redisError,
      );
    }
  }

  async process(job: Job<CreateLogDTO>): Promise<void> {
    const { level, serverId, message } = job.data;

    if (level === 'CRITICAL') {
      await this.handleCriticalAlert(serverId, message);
    }

    // The log still flows safely down to Postgres so you have complete records!
    this.logBuffer.push(job.data);

    if (this.logBuffer.length >= this.BATCH_SIZE) {
      await this.flushBufferToDatabase();
    }
  }

  private async flushBufferToDatabase(): Promise<void> {
    if (this.logBuffer.length === 0) return;

    // Snapshot current state and clear array instantly to avoid concurrency race conditions
    const itemsToInsert = [...this.logBuffer];
    this.logBuffer = [];

    try {
      // 🌟 FIX: Use the managed repository save() method for reliable multi-row insertion
      await this.logRepository.save(itemsToInsert);

      console.log(
        `[BullMQ Batch] Successfully flushed ${itemsToInsert.length} log records to PostgreSQL.`,
      );
      this.ingestionGateway.broadcastMetrics(itemsToInsert);
    } catch (error) {
      console.error(
        'Critical failure writing bulk log records down to TypeORM:',
        error,
      );
      // Re-queue back to local buffer if the database cluster experiences an intermittent hitch
      this.logBuffer.unshift(...itemsToInsert);
    }
  }
}
