export type PaginationQuery = {
  page?: string | number;
  limit?: string | number;
  search?: string;
};

export type PaginatedResult<T> = {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
};

export const normalizePagination = (
  query: PaginationQuery,
  defaults = { page: 1, limit: 20, maxLimit: 100 },
) => {
  const page = Math.max(Number(query.page) || defaults.page, 1);
  const limit = Math.min(
    Math.max(Number(query.limit) || defaults.limit, 1),
    defaults.maxLimit,
  );
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

export const buildPaginatedResult = <T>(
  data: T[],
  page: number,
  limit: number,
  total: number,
): PaginatedResult<T> => {
  const totalPages = Math.max(Math.ceil(total / limit), 1);

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
};
