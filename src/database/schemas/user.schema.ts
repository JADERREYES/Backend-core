import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
  SUPER_ADMIN = 'super_admin',
}

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop({ required: true })
  name: string;

  @Prop({ type: String, enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @Prop({ default: 'active' })
  status: string;

  @Prop({ default: false })
  acceptedPolicies: boolean;

  @Prop({ default: 0 })
  messageCount: number;

  @Prop({ default: 100 })
  maxMessages: number;
}

export const UserSchema = SchemaFactory.createForClass(User);
