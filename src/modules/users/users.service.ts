import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User } from './schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  async create(createUserDto: CreateUserDto) {
    const email = this.normalizeEmail(createUserDto.email);
    const name = createUserDto.name?.trim();
    const passwordHash = await bcrypt.hash(createUserDto.password, 10);
    const newUser = new this.userModel({
      email,
      name: name || email.split('@')[0],
      passwordHash,
      role: createUserDto.role || 'user',
      isActive: createUserDto.isActive ?? true,
      isEmailVerified: createUserDto.isEmailVerified ?? false,
    });

    const savedUser = await newUser.save();
    return this.sanitizeUser(savedUser);
  }

  async findAll() {
    return this.userModel.find().select('-passwordHash').lean().exec();
  }

  async findOne(id: string) {
    return this.userModel.findById(id).select('-passwordHash').lean().exec();
  }

  async findByEmail(email: string) {
    return this.userModel.findOne({ email: this.normalizeEmail(email) }).exec();
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const updatePayload = { ...updateUserDto } as Record<string, unknown>;

    if (typeof updateUserDto.email === 'string' && updateUserDto.email) {
      updatePayload.email = this.normalizeEmail(updateUserDto.email);
    }

    if (typeof updateUserDto.password === 'string' && updateUserDto.password) {
      updatePayload.passwordHash = await bcrypt.hash(updateUserDto.password, 10);
    }

    delete updatePayload.password;

    const updatedUser = await this.userModel
      .findByIdAndUpdate(id, updatePayload, { new: true })
      .exec();

    return updatedUser ? this.sanitizeUser(updatedUser) : null;
  }

  async updateStatus(id: string, isActive: boolean) {
    return this.userModel
      .findByIdAndUpdate(id, { isActive }, { new: true })
      .select('-passwordHash')
      .lean()
      .exec();
  }

  async updateRole(id: string, role: string) {
    return this.userModel
      .findByIdAndUpdate(id, { role }, { new: true })
      .select('-passwordHash')
      .lean()
      .exec();
  }

  async remove(id: string) {
    return this.userModel.findByIdAndDelete(id).exec();
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private sanitizeUser(user: any) {
    const source =
      typeof user.toObject === 'function' ? user.toObject() : { ...user };
    const { passwordHash, ...result } = source;
    return result;
  }
}
