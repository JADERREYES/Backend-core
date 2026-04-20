import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UserRole = 'user' | 'superadmin';

export type UserDocument = HydratedDocument<User>;

export type SafeUser = {
  id: string;
  _id: string;
  email: string;
  name?: string;
  role: UserRole;
  isActive: boolean;
  isEmailVerified: boolean;
  twoFactorEnabled?: boolean;
  twoFactorMethod?: 'email' | 'sms' | 'totp';
  lastLoginAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
};

@Schema({ timestamps: true })
export class User {
  _id: Types.ObjectId;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop()
  name: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ type: String, enum: ['user', 'superadmin'], default: 'user' })
  role: UserRole;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  isEmailVerified: boolean;

  @Prop({ default: false })
  twoFactorEnabled: boolean;

  @Prop({ type: String, enum: ['email', 'sms', 'totp'], default: 'email' })
  twoFactorMethod: 'email' | 'sms' | 'totp';

  @Prop()
  pendingEmail?: string;

  @Prop()
  emailChangeCodeHash?: string;

  @Prop({ type: Date })
  emailChangeCodeExpiresAt?: Date;

  @Prop()
  twoFactorCodeHash?: string;

  @Prop({ type: Date })
  twoFactorCodeExpiresAt?: Date;

  @Prop({ type: Date })
  lastLoginAt: Date;

  createdAt?: Date;

  updatedAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
