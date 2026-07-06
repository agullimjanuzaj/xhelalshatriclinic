import * as React from 'react';
import { cn } from '@/lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  autoResize?: boolean;
  maxAutoHeight?: number;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, autoResize, maxAutoHeight = 360, onChange, ...props }, ref) => {
    const localRef = React.useRef<HTMLTextAreaElement>(null);

    const mergedRef = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        (localRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
      },
      [ref],
    );

    const resize = (el: HTMLTextAreaElement) => {
      el.style.height = 'auto';
      const next = Math.min(el.scrollHeight, maxAutoHeight);
      el.style.height = `${next}px`;
      el.style.overflowY = el.scrollHeight > maxAutoHeight ? 'auto' : 'hidden';
    };

    React.useEffect(() => {
      if (!autoResize || !localRef.current) return;
      resize(localRef.current);
    });

    return (
      <textarea
        className={cn(
          'flex min-h-[80px] w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          autoResize && 'resize-none',
          className,
        )}
        ref={mergedRef}
        onChange={(e) => {
          if (autoResize) resize(e.target);
          onChange?.(e);
        }}
        {...props}
      />
    );
  },
);
Textarea.displayName = 'Textarea';

export { Textarea };
