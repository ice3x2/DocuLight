import { forwardRef, type InputHTMLAttributes } from 'react';

import { cn } from '../../lib/utils.js';

export type RadioProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

// @req IR-SHELL-006
export const Radio = forwardRef<HTMLInputElement, RadioProps>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    type="radio"
    data-slot="radio"
    className={cn('dl-radio', className)}
    {...props}
  />
));
Radio.displayName = 'Radio';
