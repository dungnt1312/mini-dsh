export function Divider({ inset = false }: { readonly inset?: boolean }) {
  return <hr className={`ui-divider ${inset ? 'ui-divider-inset' : ''}`} />
}
