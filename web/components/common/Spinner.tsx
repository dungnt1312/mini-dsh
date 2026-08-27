export function Spinner({ className = '' }: { readonly className?: string }) {
  return (
    <span className={`spinner ${className}`} aria-hidden="true">
      <span />
    </span>
  )
}
