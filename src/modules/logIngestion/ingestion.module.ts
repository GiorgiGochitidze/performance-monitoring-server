import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Log } from './entities/Log.entity';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';
import { LogProcessor } from './log.processor';
import { IngestionGateway } from './ingestion.gateway';
import { LogSimulatorService } from './log.simulator.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Log]),
    BullModule.registerQueue({
      name: 'log',
    }),
  ],
  controllers: [IngestionController],
  providers: [
    IngestionService,
    LogProcessor,
    IngestionGateway,
    // Uncomment only in dev and when you want to simulate flow, otherwise db will get filled with mock data
    LogSimulatorService,
  ],
})
export class IngestionModule {}
