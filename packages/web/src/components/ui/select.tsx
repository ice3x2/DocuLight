import { forwardRef, type SelectHTMLAttributes } from 'react';

import { cn } from '../../lib/utils.js';

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(({ className, ...props }, ref) => (
  <select ref={ref} data-slot="select" className={cn('dl-select', className)} {...props} />
));
Select.displayName = 'Select';
