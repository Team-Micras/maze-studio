import { X } from '@/ui/icons';
import { IslandButton } from '@/ui/islands/island';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/ui/primitives/dialog';

/** One line of a report: a maze and, maybe, what happened to it. */
export interface ReportRow {
  /** Tells the rows of a section apart, even with the same name. */
  readonly id: string;
  readonly name: string;
  readonly detail?: string;
}

/** A part of a report: what its rows are, and the rows. */
export interface ReportSection {
  readonly title: string;
  readonly rows: readonly ReportRow[];
}

/** What a report shows. */
export interface Report {
  readonly title: string;
  readonly sections: readonly ReportSection[];
}

/** The props of {@link ReportDialog}. */
export interface ReportDialogProps {
  readonly report: Report | undefined;
  readonly onClose: () => void;
}

/**
 * A report in a dialog (DESIGN.md 6 and 12): what Import added, renamed and skipped, or the mazes
 * Export all left out, each with its reason. Empty sections are left out.
 */
export function ReportDialog({ report, onClose }: ReportDialogProps) {
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open={report !== undefined}
    >
      <DialogContent aria-describedby={undefined} className="max-h-[min(560px,calc(100dvh-48px))]">
        <div className="flex items-center">
          <DialogTitle className="flex-1">{report?.title}</DialogTitle>
          <DialogClose asChild>
            <IslandButton aria-label="Close">
              <X aria-hidden size={16} />
            </IslandButton>
          </DialogClose>
        </div>
        <div className="flex min-h-0 flex-col gap-4 overflow-auto overscroll-contain">
          {report?.sections
            .filter((section) => section.rows.length > 0)
            .map((section) => (
              <section className="flex flex-col gap-1.5" key={section.title}>
                <h3 className="text-[13px] font-semibold">
                  {section.title}
                  <span className="ml-1.5 font-mono text-xs text-muted-foreground tabular-nums">
                    {section.rows.length}
                  </span>
                </h3>
                <ul className="flex flex-col gap-1 text-[13px]">
                  {section.rows.map((row) => (
                    <li className="flex flex-col" key={row.id}>
                      <span className="break-words" translate="no">
                        {row.name}
                      </span>
                      {row.detail === undefined ? null : (
                        <small className="text-xs text-muted-foreground">{row.detail}</small>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
