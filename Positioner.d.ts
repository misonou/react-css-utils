import type { PositionAnchor, PositionAlign, PositionOptions } from "./index";

export class Positioner {
    /**
     * @see {@link position}
     * @requires {@link ResizeObserver}
     */
    constructor(element: Element, to: PositionAnchor, dir: PositionAlign, options?: PositionOptions);

    /**
     * Triggers re-positioning manually.
     */
    refresh(): void;
    /**
     * Enables automatic re-positioning when viewport size or
     * the bounding size of {@link PositionOptions.within} has changed.
     */
    observe(): void;
    /**
     * Disables automatic re-positioning.
     */
    disconnect(): void;
    /**
     * Updates position.
     * @param options A dictionary specifying positioning options.
     */
    setOptions(options: PositionOptions): void;
    /**
     * Updates position.
     * @param dir A space-delimited string specifying how element is aligned in x and y direction.
     * @param options A dictionary specifying positioning options.
     */
    setOptions(dir: PositionAlign, options?: PositionOptions): void;
}
