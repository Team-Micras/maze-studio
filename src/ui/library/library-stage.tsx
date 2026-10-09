import { useEffect, useRef } from 'react';

import { filterCatalog, type LibraryFilter } from '@/library';
import {
  LIBRARY_INSETS,
  libraryColumns,
  libraryGrid,
  libraryLimits,
  type WorldRect,
} from '@/render';
import { useCanvasCamera } from '@/ui/board/use-canvas-camera';
import { useViewportWidth } from '@/ui/hooks/use-viewport-width';
import { ZoomIsland } from '@/ui/islands/zoom-island';
import { zoomPercent } from '@/ui/islands/zoom-percent';
import { routeHash } from '@/ui/routes';

import { EmptyLibrary } from './empty-library';
import { emptyTitle } from './empty-title';
import { LibraryCanvas } from './library-canvas';
import type { Library } from './use-library';

/** The props of {@link LibraryStage}. */
export interface LibraryStageProps {
  readonly library: Library;
  readonly filter: LibraryFilter;
  readonly phone: boolean;
}

/**
 * The part of the library that moves with its camera: the canvas of artboards, the zoom island and
 * what shows when nothing matches, announced through a live region that is always there. The camera lives here, so moving it repaints nothing else; a
 * new filter fits the grid again, animated.
 */
export function LibraryStage({ library, filter, phone }: LibraryStageProps) {
  const viewportWidth = useViewportWidth();
  const layout = phone ? 'phone' : 'notebook';
  const insets = LIBRARY_INSETS[layout];
  const shown = filterCatalog(library.entries, filter, library.index);
  const grid = libraryGrid(shown, libraryColumns(viewportWidth, layout));
  const content: WorldRect = { x: 0, y: 0, width: grid.width, height: grid.height };
  const camera = useCanvasCamera({
    content,
    limits: (viewport) => libraryLimits(grid, viewport, insets),
  });
  const { refit } = camera;
  const filterKey = routeHash({ kind: 'library', filter });
  const mineIsEmpty = filter.source === 'mine' && library.mineCount === 0;

  const fittedFor = useRef(filterKey);

  useEffect(() => {
    if (fittedFor.current !== filterKey) {
      fittedFor.current = filterKey;
      refit({ animate: true });
    }
  }, [filterKey, refit]);

  return (
    <>
      <LibraryCanvas
        className="fixed inset-0"
        controller={camera}
        entries={shown}
        grid={grid}
        insets={insets}
        library={library}
      />
      {shown.length === 0 ? <EmptyLibrary mineIsEmpty={mineIsEmpty} /> : null}
      <p aria-live="polite" className="sr-only">
        {shown.length === 0 ? emptyTitle(mineIsEmpty) : ''}
      </p>
      {phone ? null : (
        <ZoomIsland
          className="right-4 bottom-[18px]"
          percent={zoomPercent(camera)}
          refit={camera.refit}
          zoomBy={camera.zoomBy}
        />
      )}
    </>
  );
}
