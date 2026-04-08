import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop()
  name: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ type: String, enum: ['user', 'superadmin'], default: 'user' })
  role: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  isEmailVerified: boolean;

  @Prop({ type: Date })
  lastLoginAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Exportar el tipo UserDocument
export type UserDocument = User & Document;
