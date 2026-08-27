import Icon from '../common/Icon.tsx'
import { Button } from '../ui/Button.tsx'
import { CodeChip } from '../ui/CodeChip.tsx'
import { toolTarget } from '../../lib/format.ts'
import type { PendingApproval } from '../../lib/types.ts'

/**
 * Pending approvals ride the SSE stream; they stack above the composer
 * until answered, styled as warn-edged sharp cards.
 */
export function ApprovalBar({
  approvals,
  onAnswer,
}: {
  readonly approvals: readonly PendingApproval[]
  readonly onAnswer: (approvalId: string, allow: boolean) => void
}) {
  if (approvals.length === 0) return null
  return (
    <div className="approvals">
      <div className="approvals-head">
        {approvals.length === 1 ? 'agent xin phép chạy một tool' : `${approvals.length} tool đang chờ duyệt`}
      </div>
      {approvals.map(({ approvalId, call }) => {
        const target = toolTarget(call.args)
        return (
          <div key={approvalId} className="approval">
            <Icon name="alertTriangle" size={14} className="approval-warn" />
            <CodeChip>{target === '' ? call.name : `${call.name} · ${target}`}</CodeChip>
            <span className="approval-text">Agent muốn chạy tool này — cho phép?</span>
            <span className="approval-actions">
              <Button variant="success" size="sm" onClick={() => onAnswer(approvalId, true)}>
                Allow
              </Button>
              <Button variant="outline-danger" size="sm" onClick={() => onAnswer(approvalId, false)}>
                Deny
              </Button>
            </span>
          </div>
        )
      })}
    </div>
  )
}
