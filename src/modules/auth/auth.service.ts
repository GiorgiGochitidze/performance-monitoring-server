import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateAuthDto } from './dto/create-auth.dto';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument } from './schema/UserAuth.schema';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { Response as ExpressResponse } from 'express';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
  ) {}

  async signUp(
    createAuthDto: CreateAuthDto,
    res: ExpressResponse,
  ): Promise<{ message: string }> {
    const { email, password } = createAuthDto;

    try {
      const existingUser = await this.userModel.findOne({ email });
      if (existingUser) {
        throw new ConflictException('User with this email already exists');
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const newUser = (await this.userModel.create({
        email,
        password: hashedPassword,
      })) as UserDocument;

      await this.setTokenCookies(res, newUser);

      return { message: 'Successfully Signed Up' };
    } catch (error: unknown) {
      if (error instanceof Error && 'status' in error) {
        throw error;
      }
      throw new InternalServerErrorException(
        error instanceof Error
          ? error.message
          : 'Unexpected error during registration',
      );
    }
  }

  async signIn(
    createAuthDto: CreateAuthDto,
    res: ExpressResponse,
  ): Promise<{ message: string }> {
    const { email, password } = createAuthDto;

    try {
      const user = await this.userModel.findOne({ email });
      if (!user) {
        throw new UnauthorizedException('Invalid credentials');
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        throw new UnauthorizedException('Invalid credentials');
      }

      await this.setTokenCookies(res, user);

      return { message: 'Successfully Signed In' };
    } catch (error: unknown) {
      if (error instanceof Error && 'status' in error) throw error;
      throw new InternalServerErrorException(
        error instanceof Error
          ? error.message
          : 'Unexpected error during login',
      );
    }
  }

  async refreshTokens(
    userId: string,
    rawRefreshToken: string,
    res: ExpressResponse,
  ): Promise<{ message: string }> {
    try {
      const user = await this.userModel.findById(userId);
      if (!user || !user.refreshToken) {
        throw new UnauthorizedException('Access Denied: Session closed');
      }

      const isTokenValid = await bcrypt.compare(
        rawRefreshToken,
        user.refreshToken,
      );
      if (!isTokenValid) {
        user.refreshToken = null;
        await user.save();
        throw new ForbiddenException('Compromised session detected');
      }

      await this.setTokenCookies(res, user);

      return { message: 'Tokens rotated successfully' };
    } catch (error: unknown) {
      if (error instanceof Error && 'status' in error) throw error;
      throw new UnauthorizedException('Session rotation failed');
    }
  }

  private async setTokenCookies(
    res: ExpressResponse,
    user: UserDocument,
  ): Promise<void> {
    const payload = { id: user._id, email: user.email };

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

    user.refreshToken = hashedToken;
    await user.save();

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
