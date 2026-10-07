"use client";

import { useEffect, useState } from "react";
import { query, type Page } from "@/lib/admin/api";
import { useAdminData } from "./AdminSession";

/**
 * A paged admin list with "Show more": pages are appended rather than
 * replaced, and any change of filters starts again from the top.
 *
 * Offset and items are stored with the filter `key` they belong to, so the
 * render right after a filter change already asks for offset 0 and shows no
 * rows from the old filter (resetting them in an effect would run one render
 * too late and request page N of the new filter first).
 */
export function useAdminList<T>(
  basePath: string,
  params: Record<string, string | undefined>,
  pageSize = 20,
) {
  const key = `${basePath}${query(params)}`;
  const [paging, setPaging] = useState({ key, offset: 0 });
  const [loaded, setLoaded] = useState<{ key: string; items: T[] }>({ key, items: [] });

  const offset = paging.key === key ? paging.offset : 0;
  const items = loaded.key === key ? loaded.items : [];

  const result = useAdminData<Page<T>>(
    `${basePath}${query({ ...params, limit: pageSize, offset })}`,
  );

  useEffect(() => {
    if (!result.data) return;
    const page = result.data;
    setLoaded((previous) => ({
      key,
      items:
        page.pagination.offset === 0 || previous.key !== key
          ? page.data
          : [...previous.items, ...page.data],
    }));
    // `key` is read, not watched: a page always belongs to the filters it was
    // requested with, and those change together with `result.data`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.data]);

  return {
    items,
    total: result.data?.pagination.total ?? 0,
    loading: result.loading,
    error: result.error,
    reload: result.reload,
    /** True only before the first page has arrived. */
    initialLoading: result.loading && items.length === 0,
    more: () => setPaging({ key, offset: items.length }),
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
