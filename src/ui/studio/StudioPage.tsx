import type {ComponentProps, ReactNode} from 'react';

export function StudioPage({
  children,
  className = '',
  ...rest
}: ComponentProps<'main'> & {children: ReactNode}) {
  return (
    <main className={['studio-page', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </main>
  );
}
