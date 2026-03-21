export function paginationToOffset(page: number, limit: number) {
  return { offset: (page - 1) * limit, limit };
}

export function buildPagination(page: number, limit: number, total: number) {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}
