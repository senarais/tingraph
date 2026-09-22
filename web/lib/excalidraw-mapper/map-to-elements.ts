import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { PositionedAST } from "@/lib/types";
import { MONOCHROME, type Ink } from "@/lib/ink";
import { FORMAL, type SheetStyle } from "@/lib/sheet";
import {
  ACADEMIC_MONOCHROME_THEME,
  buildSkeletons,
} from "@/lib/excalidraw-mapper/build-skeletons";

export function mapToExcalidrawElements(
  positioned: PositionedAST,
  ink: Ink = MONOCHROME,
  style: SheetStyle = FORMAL,
): ExcalidrawElement[] {
  return convertToExcalidrawElements(buildSkeletons(positioned, ink, style), {
    regenerateIds: false,
  });
}

export { ACADEMIC_MONOCHROME_THEME };
