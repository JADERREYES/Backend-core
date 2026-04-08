import { Types } from 'mongoose';

export type ObjectId = Types.ObjectId;

// Helper para convertir string a ObjectId
export const toObjectId = (id: string): Types.ObjectId => {
  return new Types.ObjectId(id);
};

// Helper para verificar si es ObjectId válido
export const isValidObjectId = (id: string): boolean => {
  return Types.ObjectId.isValid(id);
};
