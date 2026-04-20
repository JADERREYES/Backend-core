import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User } from './schemas/user.schema';
import type { SafeUser, UserDocument, UserRole } from './schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import {
  buildPaginatedResult,
  normalizePagination,
  PaginatedResult,
} from '../../common/pagination';

type UserListQuery = {
  page?: string | number;
  limit?: string | number;
  search?: string;
  role?: string;
  isActive?: string;
};

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<SafeUser> {
    const email = this.normalizeEmail(createUserDto.email);
    const name = createUserDto.name?.trim();
    const passwordHash = await bcrypt.hash(createUserDto.password, 10);
    const newUser = new this.userModel({
      email,
      name: name || email.split('@')[0],
      passwordHash,
      role: createUserDto.role ?? 'user',
      isActive: createUserDto.isActive ?? true,
      isEmailVerified: createUserDto.isEmailVerified ?? false,
    });

    const savedUser = await newUser.save();
    return this.sanitizeUser(savedUser);
  }

  async findAll(): Promise<SafeUser[]> {
    const users = await this.userModel.find().exec();
    return users.map((user) => this.sanitizeUser(user));
  }

  async findAllPaginated(
    query: UserListQuery,
  ): Promise<PaginatedResult<SafeUser>> {
    const { page, limit, skip } = normalizePagination(query);
    const filter: Record<string, unknown> = {};

    if (query.search?.trim()) {
      const search = query.search.trim();
      filter.$or = [
        { email: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
      ];
    }

    if (query.role && ['user', 'superadmin'].includes(query.role)) {
      filter.role = query.role;
    }

    if (query.isActive === 'true' || query.isActive === 'false') {
      filter.isActive = query.isActive === 'true';
    }

    const [users, total] = await Promise.all([
      this.userModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.userModel.countDocuments(filter).exec(),
    ]);

    return buildPaginatedResult(
      users.map((user) => this.sanitizeUser(user)),
      page,
      limit,
      total,
    );
  }

  async findOne(id: string): Promise<SafeUser | null> {
    const user = await this.userModel.findById(id).exec();
    return user ? this.sanitizeUser(user) : null;
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: this.normalizeEmail(email) }).exec();
  }

  async update(
    id: string,
    updateUserDto: UpdateUserDto,
  ): Promise<SafeUser | null> {
    const updatePayload = { ...updateUserDto } as Record<string, unknown>;

    if (typeof updateUserDto.email === 'string' && updateUserDto.email) {
      updatePayload.email = this.normalizeEmail(updateUserDto.email);
    }

    if (typeof updateUserDto.password === 'string' && updateUserDto.password) {
      updatePayload.passwordHash = await bcrypt.hash(
        updateUserDto.password,
        10,
      );
    }

    delete updatePayload.password;

    const updatedUser = await this.userModel
      .findByIdAndUpdate(id, updatePayload, { new: true })
      .exec();

    return updatedUser ? this.sanitizeUser(updatedUser) : null;
  }

  async updateStatus(id: string, isActive: boolean): Promise<SafeUser | null> {
    const user = await this.userModel
      .findByIdAndUpdate(id, { isActive }, { new: true })
      .exec();
    return user ? this.sanitizeUser(user) : null;
  }

  async updateRole(id: string, role: UserRole): Promise<SafeUser | null> {
    const user = await this.userModel
      .findByIdAndUpdate(id, { role }, { new: true })
      .exec();
    return user ? this.sanitizeUser(user) : null;
  }

  async remove(id: string): Promise<SafeUser | null> {
    const user = await this.userModel.findByIdAndDelete(id).exec();
    return user ? this.sanitizeUser(user) : null;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private getUserId(user: UserDocument): string {
    return user._id.toHexString();
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
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
