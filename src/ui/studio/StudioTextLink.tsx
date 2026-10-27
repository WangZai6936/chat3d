import type {ReactNode,ButtonHTMLAttributes} from 'react';

export function StudioTextLink({
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {children: ReactNode}) {
  return (
    <button type="button" className={['studio-text-link home-text-link', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </button>
  );
}
