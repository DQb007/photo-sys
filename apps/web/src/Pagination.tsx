import { type FormEvent, useEffect, useState } from 'react';
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
  const safePage = Math.min(Math.max(1, page), safeTotalPages);
  const canGoPrev = safePage > 1;
  const canGoNext = safePage < safeTotalPages;
  const [jumpValue, setJumpValue] = useState(String(safePage));
  const [jumpError, setJumpError] = useState('');

  useEffect(() => {
    setJumpValue(String(safePage));
    setJumpError('');
  }, [safePage]);

  if (typeof total === 'number' && total <= 0) return null;

  function changePage(nextPage: number) {
    const clampedPage = Math.min(Math.max(1, nextPage), safeTotalPages);
    if (clampedPage === safePage) return;
    onPageChange(clampedPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function submitJump(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedValue = jumpValue.trim();

    if (!/^\d+$/.test(normalizedValue)) {
      setJumpError('请输入整数页码');
      return;
    }

    const nextPage = Number(normalizedValue);

    if (nextPage < 1 || nextPage > safeTotalPages) {
      setJumpError(`页码范围 1-${safeTotalPages}`);
      return;
    }

    setJumpError('');
    changePage(nextPage);
  }

  return (
    <div className={`paginationBar appPagination ${className}`.trim()}>
      <button
        className="ghostButton"
        type="button"
        disabled={!canGoPrev}
        onClick={() => changePage(Math.max(1, page - 1))}
      >
        <ChevronLeft size={16} />
        上一页
      </button>
      <span>
        第 {safePage} / {safeTotalPages} 页
        {typeof total === 'number' ? ` · 共 ${total} 条` : ''}
      </span>
      {safeTotalPages > 1 && (
        <form className="paginationJump" onSubmit={submitJump}>
          <span className="paginationJumpLabel">跳至</span>
          <input
            aria-label="跳转页码"
            inputMode="numeric"
            min={1}
            max={safeTotalPages}
            type="number"
            value={jumpValue}
            onChange={(event) => setJumpValue(event.target.value)}
          />
          <span className="paginationJumpLabel">页</span>
          <button className="ghostButton paginationJumpButton" type="submit">
            跳转
          </button>
          {jumpError && <span className="paginationJumpError" role="status">{jumpError}</span>}
        </form>
      )}
      <button
        className="ghostButton"
        type="button"
        disabled={!canGoNext}
        onClick={() => changePage(Math.min(safeTotalPages, page + 1))}
      >
        下一页
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
