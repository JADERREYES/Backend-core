import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { User } from '../users/schemas/user.schema';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    private jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto) {
    const email = this.normalizeEmail(registerDto.email);
    const name = registerDto.name?.trim();
    const { password } = registerDto;

    const existingUser = await this.userModel.findOne({ email }).exec();
    if (existingUser) {
      throw new UnauthorizedException('Email ya registrado');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = new this.userModel({
      email,
      name: name || email.split('@')[0],
      passwordHash,
    });

    await user.save();

    const token = this.generateToken(
      user._id.toString(),
      user.email,
      user.role || 'user',
    );

    return { user: this.sanitizeUser(user), token };
  }

  async login(loginDto: LoginDto) {
    const email = this.normalizeEmail(loginDto.email);
    const { password, adminOnly } = loginDto;

    const user = await this.userModel.findOne({ email }).exec();
    if (!user) {
      throw new UnauthorizedException('Credenciales invalidas');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales invalidas');
    }

    if (adminOnly && user.role !== 'superadmin') {
      throw new UnauthorizedException(
        'Esta cuenta no tiene acceso al panel de super administracion',
      );
    }

    user.lastLoginAt = new Date();
    await user.save();

    const token = this.generateToken(
      user._id.toString(),
      user.email,
      user.role || 'user',
    );

    return { user: this.sanitizeUser(user), token };
  }

  async getProfile(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .select('-passwordHash')
      .lean()
      .exec();

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    return user;
  }

  private generateToken(userId: string, email: string, role: string): string {
    return this.jwtService.sign({ sub: userId, email, role });
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private sanitizeUser(user: any) {
    const source =
      typeof user.toObject === 'function' ? user.toObject() : { ...user };
    const { passwordHash, ...result } = source;
    return result;
  }
}
