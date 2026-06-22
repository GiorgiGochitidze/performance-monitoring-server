import { Processor, WorkerHost } from '@nestjs/bullmq';
import { OnModuleDestroy } from '@nestjs/common';
import { CreateLogDTO } from './dto/create-log.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Log } from './entities/Log.entity';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import { IngestionGateway } from './ingestion.gateway';

interface ActiveAlert {
  message: string;
  count: number;
  suppressed: number;
}

@Processor('log')
export class LogProcessor extends WorkerHost implements OnModuleDestroy {
  private logBuffer: CreateLogDTO[] = [];
  // Tracks unique critical alert statistics for the current batch window
  private activeAlerts: Record<string, ActiveAlert> = {};
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

  // 🌟 UPDATED: Returns a boolean indicating if the alert actually fired or was suppressed
  private async handleCriticalAlert(
    serverId: string,
    message: string,
  ): Promise<boolean> {
    const lockKey = `alert-cooldown:${serverId}`;

    try {
      const redisClient = (await this.worker.client) as unknown as {
        set: (
          key: string,
          value: string,
          options: { EX: number; NX: boolean },
        ) => Promise<string | null>;
        ttl: (key: string) => Promise<number>;
      };

      const acquiredLock = await redisClient.set(lockKey, 'ACTIVE', {
        EX: 60,
        NX: true,
      });

      if (acquiredLock === 'OK') {
        console.log(
          `[CRITICAL ALERT DISPATCHED] Server [${serverId}]: "${message}". Notification sent to Discord/Slack webhooks.`,
        );
        return true; // Dispatched successfully
      } else {
        const remainingTtl = await redisClient.ttl(lockKey);
        console.warn(
          `[Alert Shielded] Muting repeating critical alert for server [${serverId}]. Lock active for another ${remainingTtl}s.`,
        );
        return false; // Muted / Suppressed
      }
    } catch (redisError) {
      console.error(
        'Failed to communicate with the rate-limiting Redis lock cache:',
        redisError,
      );
      return false;
    }
  }

  async process(job: Job<CreateLogDTO>): Promise<void> {
    const { level, serverId, message } = job.data;

    if (level === 'CRITICAL') {
      const isDispatched = await this.handleCriticalAlert(serverId, message);

      // Extract a clean string identifier for grouping (e.g. "CPU utilization spiked to 94%")
      const alertKey = message.replace('🔥 CRITICAL ERRROR: ', '').trim();

      // Initialize the tracking state for this specific type if it's new to the window
      if (!this.activeAlerts[alertKey]) {
        this.activeAlerts[alertKey] = {
          message: alertKey,
          count: 0,
          suppressed: 0,
        };
      }

      // Update counters based on the Redis lock response
      this.activeAlerts[alertKey].count += 1;
      if (!isDispatched) {
        this.activeAlerts[alertKey].suppressed += 1;
      }
    }

    // The log still flows safely down to Postgres so you have complete records!
    this.logBuffer.push(job.data);

    if (this.logBuffer.length >= this.BATCH_SIZE) {
      await this.flushBufferToDatabase();
    }
  }

  private async flushBufferToDatabase(): Promise<void> {
    if (this.logBuffer.length === 0) return;

    // Snapshot current states and clear properties instantly to prevent concurrency mutations
    const itemsToInsert = [...this.logBuffer];
    const alertsToBroadcast = Object.values(this.activeAlerts); // 🌟 FIX: Convert our dictionary values into a clean array!

    this.logBuffer = [];
    this.activeAlerts = {}; // Reset the map for the next 5-second interval

    try {
      await this.logRepository.save(itemsToInsert);

      console.log(
        `[BullMQ Batch] Successfully flushed ${itemsToInsert.length} log records to PostgreSQL.`,
      );

      // 🌟 FIX: Send the clean array matching the gateway signature perfectly
      this.ingestionGateway.broadcastMetrics(itemsToInsert, alertsToBroadcast);
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
