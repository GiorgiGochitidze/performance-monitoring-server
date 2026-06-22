import { Injectable } from '@nestjs/common';
import { CreateLogDTO } from './dto/create-log.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class IngestionService {
  constructor(@InjectQueue('log') private readonly logQueue: Queue) {}

  async logRegister(log: CreateLogDTO) {
    await this.logQueue.add('ingest-single-log', log, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    });
  }
}
