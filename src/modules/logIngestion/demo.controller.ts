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
import { LogSimulatorService } from './log.simulator.service';

// Define the interface to satisfy ESLint
interface RedisClient {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    mode: string,
    duration: number,
  ): Promise<string>;
  del(key: string): Promise<number>;
}

@Controller('api/v1/demo')
export class DemoController {
  constructor(
    @InjectQueue('log') private readonly logQueue: Queue,
    private readonly simulatorService: LogSimulatorService,
  ) {}

  @Get('state')
  async getState() {
    // Cast to the interface instead of 'any'
    const redisClient = (await this.logQueue.client) as unknown as RedisClient;
    const isDemoActive = await redisClient.get('demo-state:active');
    return { active: isDemoActive === 'true' };
  }

  @Post('toggle')
  @HttpCode(HttpStatus.OK)
  async toggleState(@Body() body: { active: boolean }) {
    const redisClient = (await this.logQueue.client) as unknown as RedisClient;

    if (body.active) {
      this.simulatorService.startSimulation();
      // Now perfectly typed and safe
      await redisClient.set('demo-state:active', 'true', 'EX', 20);
    } else {
      this.simulatorService.stopSimulation();
      await redisClient.del('demo-state:active');
    }

    return { success: true, active: body.active };
  }
}
