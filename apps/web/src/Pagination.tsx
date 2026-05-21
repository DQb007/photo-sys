import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  total?: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function Pagination({ page, totalPages, total, onPageChange, className = '' }: PaginationProps) {
  const safeTotalPages = Math.max(1, totalPages);
  const canGoPrev = page > 1;
  const canGoNext = page < safeTotalPages;

  if (typeof total === 'number' && total <= 0) return null;

  return (
    <div className={`paginationBar appPagination ${className}`.trim()}>
      <button
        className="ghostButton"
        type="button"
        disabled={!canGoPrev}
        onClick={() => onPageChange(Math.max(1, page - 1))}
      >
        <ChevronLeft size={16} />
        上一页
      </button>
      <span>
        第 {page} / {safeTotalPages} 页
        {typeof total === 'number' ? ` · 共 ${total} 条` : ''}
      </span>
      <button
        className="ghostButton"
        type="button"
        disabled={!canGoNext}
        onClick={() => onPageChange(Math.min(safeTotalPages, page + 1))}
      >
        下一页
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
