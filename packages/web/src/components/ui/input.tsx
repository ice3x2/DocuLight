import { forwardRef, useRef, type InputHTMLAttributes } from 'react';

import { cn } from '../../lib/utils.js';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(({
  className,
  onCompositionEnd,
  onCompositionStart,
  onKeyDown,
  ...props
}, ref) => {
  const composing = useRef(false);
  return (
    <input
      ref={ref}
      data-slot="input"
      className={cn('dl-input', className)}
      onCompositionStart={(event) => {
        composing.current = true;
        onCompositionStart?.(event);
      }}
      onCompositionEnd={(event) => {
        composing.current = false;
        onCompositionEnd?.(event);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && (composing.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) {
          event.preventDefault();
        }
        onKeyDown?.(event);
      }}
      {...props}
    />
  );
});
Input.displayName = 'Input';
