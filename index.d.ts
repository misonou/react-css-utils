export type PositionAlign = Zeta.BoxAlign
    | `${Zeta.BoxSide} auto`
    | `${Zeta.BoxSide} inset`
    | `${Zeta.BoxSide} center inset`
    | `${Zeta.BoxCorner} ${'inset' | 'inset-x' | 'inset-y'}`;

export type PositionAnchor = Zeta.PointLike | Zeta.RectLike | Element;

export function cssFromPoint(point: Zeta.PointLike, origin?: Zeta.Direction2D, parent?: Element): Pick<CSSStyleDeclaration, 'top' | 'left' | 'right' | 'bottom'>;

export function cssFromPoint(x: number, y: number, origin?: Zeta.Direction2D, parent?: Element): Pick<CSSStyleDeclaration, 'top' | 'left' | 'right' | 'bottom'>;

/**
 * Places element in alignment to another element.
 * @param element Element to be placed. It must be styled with `position: absolute` or `position: fixed`.
 * @param to A DOM element, a `Rect`-like object or a point with x and y coordinates, as the reference to where the element should be placed.
 * @param dir A space-delimited string specifying how element is aligned in x and y direction.
 * @param within When specified, element will be positioned inside the bounds of the specified element.
 * @param offset Specifies how far the element is positioned away from the reference position in pixels.
 */
export function position(element: Element, to: PositionAnchor, dir: PositionAlign, within?: Element, offset?: number): void;

/**
 * Places element in alignment to another element.
 * @param element Element to be placed. It must be styled with `position: absolute` or `position: fixed`.
 * @param to A DOM element, a `Rect`-like object or a point with x and y coordinates, as the reference to where the element should be placed.
 * @param dir A space-delimited string specifying how element is aligned in x and y direction.
 * @param options A dictionary specifying extra options.
 */
export function position(element: Element, to: PositionAnchor, dir: PositionAlign, options?: PositionOptions): void;

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

export interface PositionOptions {
    /**
     * When specified, element will be positioned inside the bounds of the specified element.
     */
    within?: Element;
    /**
     * Specifies how far the element is positioned away from the reference position in pixels.
     */
    offset?: number;
    /**
     * Whether to scroll the viewport in order to place element in desired position before trying to
     * fit to viewport's boundaries.
     */
    scrollToFit?: boolean;
    /**
     * Specifies minimum basis width when positioning element.
     */
    basisWidth?: number;
    /**
     * Specifies minimum basis height when positioning element.
     */
    basisHeight?: number;
    /**
     * Specifies the positioning strategies when there is not enough space to place element in the primary alignment.
     * - `flip` means to position in the opposite side of the anchor element;
     * - `fit` means to justify to the viewport or the boundary of the `within` element.
     *
     * Default is `flip fit`.
     */
    strategy?: 'flip fit' | 'flip' | 'fit';
    /**
     * Aligns element only on a particular axis.
     * @deprecated Use `auto` keyword or without keyword in such direction in `dir` parameter, i.e. `left` or `center auto` for `x-only`.
     */
    axis?: 'x-only' | 'y-only' | 'both';
}

export interface AnimatedIndicatorOptions {
    /**
     * A CSS selector that selects the elements to which an active state indicator element will be attached to.
     */
    selector: string;
}

export interface AnimatedIndicator {
    /**
     * A ref callback apply to a React element which contains a collection of elements, usually tabs,
     * to which an active state indicator element will be attached to.
     */
    readonly ref: React.RefCallback<HTMLElement>;
    /**
     * Sets and animates the active state indicator element to
     * attach to the n-th matched element, usually indicating the current tab.
     * @param index A zero-based index.
     */
    setActiveIndex(index: number): void;
}

/**
 * Attaches a animateable active state indicator element.
 */
export function useAnimatedIndicator(options: AnimatedIndicatorOptions): AnimatedIndicator;

export interface InitSortableOptions {
    /**
     * A CSS selector that selects which elements are orderable.
     */
    itemSelector: string;
    /**
     * A CSS selector that selects the element which, on dragging, will initate the reordering.
     */
    handleSelector: string;
    /**
     * A callback which receives the index of an element before and after reordering.
     */
    onOrderChanged: (oldIndex: number, newIndex: number) => any;
}

/**
 * Creates a handler to enable ordering of child elements by mouse or touch events.
 */
export function initSortable(element: HTMLElement, options: InitSortableOptions): void;

export interface Stickable {
    /**
     * Fixes an element to the edge of a scrollable viewport when being scrolled out-of-sight.
     * @param element A DOM element.
     * @param dir Specifies which direction will the element be sticked to before when scrolled out-of-sight.
     * @param within A callback which returns the area on the screen where the element should stay contained.
     * @deprecated Add sticky element directly using `ScrollableMixin.setStickyPosition`
     *
     * ```javascript
     * scrollableMixin.setStickyPosition(element, dir, true);
     * scrollableMixin.setStickyPosition(element, dir, within, true);
     *
     * // or directly accessing scrollable API:
     * $(container).scrollable('setStickyPosition', element, dir,  true);
     * $(container).scrollable('setStickyPosition', element, dir, within, true);
     * ```
     */
    add(element: HTMLElement, dir: Zeta.Direction, within?: () => Zeta.Rect): void;
    /**
     * Unregisters events and releases resources.
     */
    dispose(): void;
}

/**
 * Creates a handler to fix element in position when being scrolled out-of-sight.
 * @param container A scrollable container.
 * @see {@link Stickable}
 * @deprecated Add sticky element directly using `ScrollableMixin.setStickyPosition`
 */
export function initStickable(container: HTMLElement): Stickable;
