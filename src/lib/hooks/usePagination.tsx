// ========================================
// Pagination + Virtualization Hooks
// ========================================
// لتحسين الأداء مع البيانات الكبيرة

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';

// ========================================
// Pagination Hook
// ========================================
export function usePagination<T>(items: T[], initialPageSize = 20) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  
  const totalPages = Math.ceil(items.length / pageSize);
  
  // التأكد من أن الصفحة الحالية ضمن النطاق
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);
  
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    return items.slice(start, end);
  }, [items, currentPage, pageSize]);
  
  const goToPage = useCallback((page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  }, [totalPages]);
  
  const nextPage = useCallback(() => goToPage(currentPage + 1), [currentPage, goToPage]);
  const prevPage = useCallback(() => goToPage(currentPage - 1), [currentPage, goToPage]);
  
  const range = useMemo(() => {
    const start = (currentPage - 1) * pageSize + 1;
    const end = Math.min(currentPage * pageSize, items.length);
    return { start, end, total: items.length };
  }, [currentPage, pageSize, items.length]);
  
  return {
    currentPage,
    pageSize,
    totalPages,
    paginatedItems,
    goToPage,
    nextPage,
    prevPage,
    setPageSize,
    range,
    hasNext: currentPage < totalPages,
    hasPrev: currentPage > 1,
  };
}

// ========================================
// Virtualization Hook (للقوائم الطويلة)
// ========================================
export function useVirtualization<T>(items: T[], itemHeight: number, containerHeight: number) {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const visibleRange = useMemo(() => {
    const startIndex = Math.floor(scrollTop / itemHeight);
    const endIndex = Math.min(
      startIndex + Math.ceil(containerHeight / itemHeight) + 2,
      items.length
    );
    return { startIndex: Math.max(0, startIndex - 1), endIndex };
  }, [scrollTop, itemHeight, containerHeight, items.length]);
  
  const visibleItems = useMemo(() => {
    return items.slice(visibleRange.startIndex, visibleRange.endIndex).map((item, i) => ({
      item,
      index: visibleRange.startIndex + i,
    }));
  }, [items, visibleRange]);
  
  const totalHeight = items.length * itemHeight;
  const offsetY = visibleRange.startIndex * itemHeight;
  
  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);
  
  return {
    containerRef,
    visibleItems,
    totalHeight,
    offsetY,
    onScroll,
    containerHeight,
    itemHeight,
  };
}

// ========================================
// Search + Pagination Combined Hook
// ========================================
export function useSearchPaginate<T>(
  items: T[],
  searchFn: (item: T, query: string) => boolean,
  initialPageSize = 20
) {
  const [searchQuery, setSearchQuery] = useState('');
  const pagination = usePagination(items, initialPageSize);
  
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    return items.filter(item => searchFn(item, searchQuery));
  }, [items, searchQuery, searchFn]);
  
  // إعادة تعيين الصفحة عند تغيير البحث
  useEffect(() => {
    pagination.goToPage(1);
  }, [searchQuery]);
  
  // استخدام الـ pagination على العناصر المفلترة
  const paginatedFiltered = useMemo(() => {
    const start = (pagination.currentPage - 1) * pagination.pageSize;
    return filteredItems.slice(start, start + pagination.pageSize);
  }, [filteredItems, pagination.currentPage, pagination.pageSize]);
  
  return {
    searchQuery,
    setSearchQuery,
    filteredItems,
    paginatedItems: paginatedFiltered,
    currentPage: pagination.currentPage,
    totalPages: Math.ceil(filteredItems.length / pagination.pageSize),
    pageSize: pagination.pageSize,
    goToPage: pagination.goToPage,
    nextPage: pagination.nextPage,
    prevPage: pagination.prevPage,
    totalItems: filteredItems.length,
    hasNext: pagination.currentPage < Math.ceil(filteredItems.length / pagination.pageSize),
    hasPrev: pagination.currentPage > 1,
  };
}

// ========================================
// Pagination Controls Component
// ========================================
export function PaginationControls({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  hasNext,
  hasPrev,
  onPageChange,
  onPageSizeChange,
}: {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  hasNext: boolean;
  hasPrev: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}) {
  if (totalItems === 0) return null;
  
  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);
  
  // توليد أرقام الصفحات (حد أقصى 7)
  const pages: number[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push(-1); // ...
    const startPage = Math.max(2, currentPage - 1);
    const endPage = Math.min(totalPages - 1, currentPage + 1);
    for (let i = startPage; i <= endPage; i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push(-2); // ...
    pages.push(totalPages);
  }
  
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-slate-200">
      <div className="text-xs text-slate-500">
        عرض <span className="font-semibold text-slate-700">{start}</span> - <span className="font-semibold text-slate-700">{end}</span> من <span className="font-semibold text-slate-700">{totalItems}</span>
      </div>
      
      <div className="flex items-center gap-1">
        {onPageSizeChange && (
          <select 
            value={pageSize} 
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="text-xs px-2 py-1 border border-slate-200 rounded-lg ml-3 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        )}
        
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={!hasPrev}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
        >
          السابق
        </button>
        
        {pages.map((p, i) => 
          p < 0 ? (
            <span key={`ellipsis-${i}`} className="px-2 text-slate-400">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`min-w-[32px] px-2 py-1.5 text-xs font-medium rounded-lg transition-all ${
                p === currentPage
                  ? 'bg-brand-600 text-white'
                  : 'border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {p}
            </button>
          )
        )}
        
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={!hasNext}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
        >
          التالي
        </button>
      </div>
    </div>
  );
}
