import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { IngestionModule } from './modules/logIngestion/ingestion.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const dbUrl = configService.get<string>('DATABASE_URL') || '';
        // Automatically detect if we are connecting to Neon or Localhost
        const isNeon = dbUrl.includes('neon.tech');

        return {
          type: 'postgres',
          url: dbUrl,
          entities: [__dirname + '/**/*.entity.{js,ts}'],
          autoLoadEntities: true,
          synchronize: process.env.NODE_ENV !== 'production',
          ssl: isNeon ? { rejectUnauthorized: false } : false,
          extra: isNeon ? { sslmode: 'verify-full' } : {},
        };
      },
    }),
    BullModule.forRoot({
      connection: {
        host: 'localhost',
        port: 6379,
      },
    }),
    AuthModule,
    IngestionModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
