import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strips properties not defined in the DTO
      forbidNonWhitelisted: true, // throws if extra properties are sent, instead of silently dropping them
      transform: true, // auto-transforms payloads into DTO class instances - this is also what makes @Type() from class-transformer actually take effect
    }),
  );
  app.enableCors({
    origin: ['http://localhost:3000', 'https://mapwise-one.vercel.app'],
    credentials: true,
  });
  app.use(cookieParser());
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
