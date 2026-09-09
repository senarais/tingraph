import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { PositionedAST } from "@/lib/types";
import { MONOCHROME, type Ink } from "@/lib/ink";
import {
  ACADEMIC_MONOCHROME_THEME,
  buildSkeletons,
} from "@/lib/excalidraw-mapper/build-skeletons";

export function mapToExcalidrawElements(
  positioned: PositionedAST,
  ink: Ink = MONOCHROME,
): ExcalidrawElement[] {
  return convertToExcalidrawElements(buildSkeletons(positioned, ink), {
    regenerateIds: false,
  });
}

export { ACADEMIC_MONOCHROME_THEME };
