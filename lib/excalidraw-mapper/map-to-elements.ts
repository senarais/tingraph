import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { PositionedAST } from "@/lib/types";
import {
  ACADEMIC_MONOCHROME_THEME,
  buildSkeletons,
} from "@/lib/excalidraw-mapper/build-skeletons";

export function mapToExcalidrawElements(
  positioned: PositionedAST,
  accentColor: string = ACADEMIC_MONOCHROME_THEME.strokeColor,
): ExcalidrawElement[] {
  return convertToExcalidrawElements(buildSkeletons(positioned, accentColor), {
    regenerateIds: false,
  });
}

export { ACADEMIC_MONOCHROME_THEME };
