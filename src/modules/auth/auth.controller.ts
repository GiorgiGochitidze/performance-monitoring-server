import {
  Controller,
  Post,
  Body,
  Res,
  HttpCode,
  HttpStatus,
  Get,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateAuthDto } from './dto/create-auth.dto';
import type { Response as ExpressResponse } from 'express';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtPayload } from './strategies/jwt.strategy';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import type { Request as ExpressRequest } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signUp')
  async signUp(
    @Body() createAuthDto: CreateAuthDto,
    @Res({ passthrough: true }) res: ExpressResponse,
  ) {
    return this.authService.signUp(createAuthDto, res);
  }

  @Post('signIn')
  @HttpCode(HttpStatus.OK)
  async signIn(
    @Body() createAuthDto: CreateAuthDto,
    @Res({ passthrough: true }) res: ExpressResponse,
  ) {
    return this.authService.signIn(createAuthDto, res);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@Req() req: { user: JwtPayload }) {
    return req.user;
  }

  @Get('refresh')
  @UseGuards(JwtRefreshGuard)
  async refresh(
    @Req() req: ExpressRequest,
    @Res({ passthrough: true }) res: ExpressResponse,
  ) {
    const userPayload = req.user as {
      id: string;
      email: string;
      refreshToken: string;
    };

    return await this.authService.refreshTokens(
      userPayload.id,
      userPayload.refreshToken,
      res,
    );
  }
}
