import {
  Controller,
  Get,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Controller('api/v1/demo')
export class DemoController {
  constructor(@InjectQueue('log') private readonly logQueue: Queue) {}

  @Get('state')
  async getState() {
    const redisClient = (await this.logQueue.client) as unknown as {
      get: (key: string) => Promise<string | null>;
    };

    const isDemoActive = await redisClient.get('demo-state:active');
    return { active: isDemoActive === 'true' };
  }

  @Post('toggle')
  @HttpCode(HttpStatus.OK)
  async toggleState(@Body() body: { active: boolean }) {
    const redisClient = (await this.logQueue.client) as unknown as {
      set: (
        key: string,
        value: string,
        options?: { EX: number },
      ) => Promise<string>;
      del: (key: string) => Promise<number>;
    };

    if (body.active) {
      // Hard 20s cutoff - this TTL is the single source of truth for "is the demo running"
      await redisClient.set('demo-state:active', 'true', { EX: 20 });
    } else {
      await redisClient.del('demo-state:active');
    }

    return { success: true, active: body.active };
  }
}
