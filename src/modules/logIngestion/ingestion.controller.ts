import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { IngestionService } from './ingestion.service';
import { CreateLogDTO } from './dto/create-log.dto';

@Controller('ingestion')
export class IngestionController {
  constructor(private ingestionService: IngestionService) {}
  @Post('log')
  @HttpCode(HttpStatus.ACCEPTED)
  async logRegister(@Body() logDto: CreateLogDTO) {
    await this.ingestionService.logRegister(logDto);

    return { status: 'Accepted', message: 'Log Buffered Successfully' };
  }
}
