"use client";

import { useEffect, useState } from "react";
import { query, type Page } from "@/lib/admin/api";
import { useAdminData } from "./AdminSession";

/**
 * A paged admin list with "Show more": pages are appended rather than
 * replaced, and any change of filters starts again from the top.
 */
export function useAdminList<T>(
  basePath: string,
  params: Record<string, string | undefined>,
  pageSize = 20,
) {
  const key = `${basePath}${query(params)}`;
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<T[]>([]);

  // New filters: back to the first page.
  useEffect(() => {
    setOffset(0);
    setItems([]);
  }, [key]);

  const result = useAdminData<Page<T>>(
    `${basePath}${query({ ...params, limit: pageSize, offset })}`,
  );

  useEffect(() => {
    if (!result.data) return;
    const page = result.data;
    setItems((previous) =>
      page.pagination.offset === 0 ? page.data : [...previous, ...page.data],
    );
  }, [result.data]);

  return {
    items,
    total: result.data?.pagination.total ?? 0,
    loading: result.loading,
    error: result.error,
    reload: result.reload,
    /** True only before the first page has arrived. */
    initialLoading: result.loading && items.length === 0,
    more: () => setOffset(items.length),
  };
}

/** The value, settled for `delay` ms -- keeps search from querying per keystroke. */
export function useDebounced<T>(value: T, delay = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return settled;
}
