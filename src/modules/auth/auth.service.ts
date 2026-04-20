import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { User } from '../users/schemas/user.schema';
import type {
  SafeUser,
  UserDocument,
  UserRole,
} from '../users/schemas/user.schema';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RequestEmailChangeDto } from './dto/request-email-change.dto';
import { ConfirmEmailChangeDto } from './dto/confirm-email-change.dto';
import {
  ConfirmTwoFactorDto,
  DisableTwoFactorDto,
  RequestTwoFactorDto,
} from './dto/two-factor.dto';
import { NotificationsService } from '../../common/notifications/notifications.service';

type LoginResult =
  | { user: SafeUser; token: string }
  | {
      twoFactorRequired: true;
      method: 'email' | 'sms' | 'totp';
      message: string;
      devCode?: string;
    };

type CodePurpose = 'emailChange' | 'twoFactor';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectConnection() private readonly connection: Connection,
    private jwtService: JwtService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async register(
    registerDto: RegisterDto,
  ): Promise<{ user: SafeUser; token: string }> {
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
      role: 'user',
    });

    await user.save();
    const userId = this.getUserId(user);

    await this.subscriptionsService.createTrialForNewUser(userId);

    const token = this.generateToken(userId, user.email, user.role);

    return { user: this.sanitizeUser(user), token };
  }

  async login(loginDto: LoginDto): Promise<LoginResult> {
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

    if (!user.isActive) {
      throw new UnauthorizedException('Cuenta inactiva');
    }

    if (user.twoFactorEnabled) {
      if (!loginDto.twoFactorCode) {
        const devCode = await this.issueVerificationCode(user, 'twoFactor');
        return {
          twoFactorRequired: true,
          method: user.twoFactorMethod || 'email',
          message:
            user.twoFactorMethod === 'sms'
              ? 'Codigo de doble verificacion enviado al telefono configurado'
              : 'Codigo de doble verificacion enviado al correo configurado',
          devCode,
        };
      }

      await this.verifyCode(user, loginDto.twoFactorCode, 'twoFactor');
      user.twoFactorCodeHash = undefined;
      user.twoFactorCodeExpiresAt = undefined;
    }

    user.lastLoginAt = new Date();
    await user.save();
    const userId = this.getUserId(user);

    await this.subscriptionsService.ensureUserSubscription(userId);

    const token = this.generateToken(userId, user.email, user.role);

    return { user: this.sanitizeUser(user), token };
  }

  async getProfile(userId: string): Promise<SafeUser> {
    const user = await this.userModel.findById(userId).exec();

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    return this.sanitizeUser(user);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.getUserForSensitiveAction(userId);
    await this.assertPassword(user, dto.currentPassword);

    user.passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await user.save();

    return { message: 'Contrasena actualizada correctamente' };
  }

  async requestEmailChange(userId: string, dto: RequestEmailChangeDto) {
    const user = await this.getUserForSensitiveAction(userId);
    await this.assertPassword(user, dto.currentPassword);

    const newEmail = this.normalizeEmail(dto.newEmail);
    const existingUser = await this.userModel
      .findOne({ email: newEmail, _id: { $ne: user._id } })
      .exec();

    if (existingUser) {
      throw new BadRequestException('El nuevo correo ya esta registrado');
    }

    user.pendingEmail = newEmail;
    const devCode = await this.issueVerificationCode(user, 'emailChange');

    return {
      message: 'Codigo de verificacion enviado al nuevo correo',
      devCode,
    };
  }

  async confirmEmailChange(userId: string, dto: ConfirmEmailChangeDto) {
    const user = await this.getUserForSensitiveAction(userId);

    if (!user.pendingEmail) {
      throw new BadRequestException('No hay cambio de correo pendiente');
    }

    await this.verifyCode(user, dto.code, 'emailChange');

    const existingUser = await this.userModel
      .findOne({ email: user.pendingEmail, _id: { $ne: user._id } })
      .exec();

    if (existingUser) {
      throw new BadRequestException('El nuevo correo ya esta registrado');
    }

    user.email = user.pendingEmail;
    user.pendingEmail = undefined;
    user.emailChangeCodeHash = undefined;
    user.emailChangeCodeExpiresAt = undefined;
    user.isEmailVerified = true;
    await user.save();

    return {
      message: 'Correo actualizado correctamente',
      user: this.sanitizeUser(user),
    };
  }

  async requestTwoFactorSetup(userId: string, dto: RequestTwoFactorDto) {
    const user = await this.getUserForSensitiveAction(userId);
    await this.assertPassword(user, dto.currentPassword);

    user.twoFactorMethod = dto.method || 'email';
    if (user.twoFactorMethod === 'sms' && !user.phone?.trim()) {
      throw new BadRequestException(
        'No hay telefono configurado para activar 2FA por SMS',
      );
    }

    const devCode = await this.issueVerificationCode(user, 'twoFactor');

    return {
      message:
        user.twoFactorMethod === 'sms'
          ? 'Codigo enviado al telefono configurado'
          : 'Codigo enviado al correo configurado',
      method: user.twoFactorMethod,
      devCode,
    };
  }

  async confirmTwoFactorSetup(userId: string, dto: ConfirmTwoFactorDto) {
    const user = await this.getUserForSensitiveAction(userId);
    await this.verifyCode(user, dto.code, 'twoFactor');

    user.twoFactorEnabled = true;
    user.twoFactorCodeHash = undefined;
    user.twoFactorCodeExpiresAt = undefined;
    await user.save();

    return {
      message: 'Doble verificacion activada correctamente',
      user: this.sanitizeUser(user),
    };
  }

  async disableTwoFactor(userId: string, dto: DisableTwoFactorDto) {
    const user = await this.getUserForSensitiveAction(userId);
    await this.assertPassword(user, dto.currentPassword);

    user.twoFactorEnabled = false;
    user.twoFactorCodeHash = undefined;
    user.twoFactorCodeExpiresAt = undefined;
    await user.save();

    return {
      message: 'Doble verificacion desactivada correctamente',
      user: this.sanitizeUser(user),
    };
  }

  async deleteAccount(userId: string) {
    const user = await this.userModel.findById(userId).exec();

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    const objectId = new Types.ObjectId(userId);
    const chatIds = await this.connection
      .collection('chats')
      .find({ userId: objectId }, { projection: { _id: 1 } })
      .toArray();

    await Promise.all([
      this.connection.collection('messages').deleteMany({
        $or: [
          { senderId: objectId },
          { chatId: { $in: chatIds.map((chat) => chat._id) } },
        ],
      }),
      this.connection.collection('chats').deleteMany({ userId: objectId }),
      this.connection.collection('profiles').deleteMany({ userId: objectId }),
      this.connection.collection('reminders').deleteMany({ userId: objectId }),
      this.connection
        .collection('supportrequests')
        .deleteMany({ userId: objectId }),
      this.connection
        .collection('subscriptionrequests')
        .deleteMany({ userId: objectId }),
      this.connection
        .collection('premiumrequests')
        .deleteMany({ userId: objectId }),
      this.connection
        .collection('subscriptions')
        .deleteMany({ userId: objectId }),
      this.connection
        .collection('subscriptionactivations')
        .deleteMany({ userId: objectId }),
    ]);

    await user.deleteOne();

    return { message: 'Cuenta eliminada correctamente' };
  }

  private generateToken(userId: string, email: string, role: UserRole): string {
    return this.jwtService.sign({ sub: userId, email, role });
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private getUserId(user: UserDocument): string {
    return user._id.toString();
  }

  private sanitizeUser(user: UserDocument): SafeUser {
    const userId = this.getUserId(user);

    return {
      id: userId,
      _id: userId,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      isEmailVerified: user.isEmailVerified,
      twoFactorEnabled: user.twoFactorEnabled,
      twoFactorMethod: user.twoFactorMethod,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private async getUserForSensitiveAction(
    userId: string,
  ): Promise<UserDocument> {
    const user = await this.userModel.findById(userId).exec();

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    return user;
  }

  private async assertPassword(user: UserDocument, password: string) {
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Contrasena actual invalida');
    }
  }

  private async issueVerificationCode(
    user: UserDocument,
    purpose: CodePurpose,
  ) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    if (purpose === 'emailChange') {
      user.emailChangeCodeHash = codeHash;
      user.emailChangeCodeExpiresAt = expiresAt;
    } else {
      user.twoFactorCodeHash = codeHash;
      user.twoFactorCodeExpiresAt = expiresAt;
    }

    await user.save();

    const channel = this.getCodeChannel(user, purpose);
    const delivery = await this.notificationsService.sendVerificationCode({
      channel,
      to: this.getCodeRecipient(user, purpose),
      code,
      purpose,
    });

    return delivery.devCodeAllowed ? code : undefined;
  }

  private getCodeChannel(
    user: UserDocument,
    purpose: CodePurpose,
  ): 'email' | 'sms' {
    if (purpose === 'twoFactor' && user.twoFactorMethod === 'sms') {
      return 'sms';
    }

    return 'email';
  }

  private getCodeRecipient(user: UserDocument, purpose: CodePurpose) {
    if (purpose === 'emailChange') {
      return user.pendingEmail;
    }

    if (user.twoFactorMethod === 'sms') {
      return user.phone;
    }

    return user.email;
  }

  private async verifyCode(
    user: UserDocument,
    code: string,
    purpose: CodePurpose,
  ) {
    const codeHash =
      purpose === 'emailChange'
        ? user.emailChangeCodeHash
        : user.twoFactorCodeHash;
    const expiresAt =
      purpose === 'emailChange'
        ? user.emailChangeCodeExpiresAt
        : user.twoFactorCodeExpiresAt;

    if (!codeHash || !expiresAt || expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Codigo vencido o no solicitado');
    }

    const isCodeValid = await bcrypt.compare(code, codeHash);
    if (!isCodeValid) {
      throw new UnauthorizedException('Codigo de verificacion invalido');
    }
  }
}
