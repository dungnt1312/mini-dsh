import * as Tooltip from '@radix-ui/react-tooltip'
import type { ReactNode } from 'react'

export function TooltipProvider({ children }: { readonly children: ReactNode }) {
  return <Tooltip.Provider delayDuration={500}>{children}</Tooltip.Provider>
}
