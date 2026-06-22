import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateAuthDto } from './dto/create-auth.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { Response as ExpressResponse } from 'express';
import { User } from './entities/UserAuth.entity';

interface TokenPayload {
  id: string;
  email: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }

  async signUp(
    createAuthDto: CreateAuthDto,
    res: ExpressResponse,
  ): Promise<{ message: string }> {
    const { email, password } = createAuthDto;

    try {
      const existingUser = await this.userRepository.findOneBy({ email });
      if (existingUser) {
        throw new ConflictException('User with this email already exists');
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const newUser = this.userRepository.create({
        email,
        password: hashedPassword,
      });
      await this.userRepository.save(newUser);

      await this.setTokenCookies(res, { id: newUser.id, email: newUser.email });

      return { message: 'Successfully Signed Up' };
    } catch (error: unknown) {
      if (error instanceof Error && 'status' in error) throw error;
      throw new InternalServerErrorException(
        this.getErrorMessage(error) || 'Unexpected error during registration',
      );
    }
  }

  async signIn(
    createAuthDto: CreateAuthDto,
    res: ExpressResponse,
  ): Promise<{ message: string }> {
    const { email, password } = createAuthDto;

    try {
      const user = await this.userRepository.findOneBy({ email });
      if (!user) {
        throw new UnauthorizedException('Invalid credentials');
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        throw new UnauthorizedException('Invalid credentials');
      }

      await this.setTokenCookies(res, { id: user.id, email: user.email });

      return { message: 'Successfully Signed In' };
    } catch (error: unknown) {
      if (error instanceof Error && 'status' in error) throw error;
      throw new InternalServerErrorException(
        this.getErrorMessage(error) || 'Unexpected error during login',
      );
    }
  }

  async refreshTokens(
    userId: string,
    rawRefreshToken: string,
    res: ExpressResponse,
  ): Promise<{ message: string }> {
    try {
      const user = await this.userRepository.findOneBy({ id: userId });
      if (!user || !user.refreshToken) {
        throw new UnauthorizedException('Access Denied: Session closed');
      }

      const isTokenValid = await bcrypt.compare(
        rawRefreshToken,
        user.refreshToken,
      );
      if (!isTokenValid) {
        await this.userRepository.update(userId, { refreshToken: null });
        throw new ForbiddenException('Compromised session detected');
      }

      await this.setTokenCookies(res, { id: user.id, email: user.email });

      return { message: 'Tokens rotated successfully' };
    } catch (error: unknown) {
      if (error instanceof Error && 'status' in error) throw error;
      throw new UnauthorizedException('Session rotation failed');
    }
  }

  private async setTokenCookies(
    res: ExpressResponse,
    user: TokenPayload,
  ): Promise<void> {
    const payload = { id: user.id, email: user.email };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_SECRET,
        expiresIn: '15m',
      }),
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: '7d',
      }),
    ]);

    const hashedToken = await bcrypt.hash(refreshToken, 10);

    await this.userRepository.update(user.id, { refreshToken: hashedToken });

    const isProd = process.env.NODE_ENV === 'production';

    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 15 * 60 * 1000,
    });

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/auth/refresh',
    });
  }
}
