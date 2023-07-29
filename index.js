import { useState } from "react";
import $ from "jquery";
import dom from "zeta-dom/dom";
import { containsOrEquals, getContentRect, getRect, mergeRect, removeNode, scrollIntoView, setClass, toPlainRect } from "zeta-dom/domUtil";
import { always, combineFn, each, either, extend, is, isPlainObject, keys, makeArray, matchWord, setImmediate, setImmediateOnce, setTimeout } from "zeta-dom/util";
import { useDispose } from "zeta-dom-react";
import { createAutoCleanupMap, observe } from "zeta-dom/observe";

const FLIP_POS = {
    top: 'bottom',
    left: 'right',
    right: 'left',
    bottom: 'top'
};
const DIR_SIGN = {
    top: -1,
    left: -1,
    right: 1,
    bottom: 1,
    center: 0,
};

function setStyle(style, dir, pos, parentRect, p, pSize) {
    dir = dir || p;
    pos = pos - parentRect[p];
    style[dir] = (dir === p ? pos : parentRect[pSize] - pos) + 'px';
    style[FLIP_POS[dir]] = 'auto';
}

export function cssFromPoint(x, y, origin, parent) {
    if (isPlainObject(x)) {
        parent = origin;
        origin = y;
        y = x.top || x.clientY || x.y;
        x = x.left || x.clientX || x.x;
    }
    var refRect = getRect(parent || dom.root);
    var style = {};
    setStyle(style, matchWord(origin, 'left right'), x, refRect, 'left', 'width');
    setStyle(style, matchWord(origin, 'top bottom'), y, refRect, 'top', 'height');
    return style;
}

export function position(element, to, dir, within, offset) {
    var modeX = 0, modeY = 0, scrollToFit;
    if (!containsOrEquals(dom.root, element)) {
        document.body.appendChild(element);
    }
    if (isPlainObject(within)) {
        modeX = within.axis === 'y-only' ? -1 : 0;
        modeY = within.axis === 'x-only' ? -1 : 0;
        scrollToFit = within.scrollToFit && is(to, Node);
        offset = within.offset;
        within = within.within;
    }
    offset = offset || 0;

    var isAbsolute = $(element).css('position') === 'absolute';
    $(element).css({
        position: isAbsolute ? 'absolute' : 'fixed',
        transform: '',
        maxWidth: '',
        maxHeight: ''
    });
    var oDirX = matchWord(dir, 'left right center') || 'left';
    var oDirY = matchWord(dir, 'top bottom center') || 'bottom';
    var inset = matchWord(dir, 'inset-x inset-y inset') || (FLIP_POS[oDirY] ? 'inset-x' : 'inset-y');
    var insetX = inset === 'inset' || (FLIP_POS[oDirY] && inset === 'inset-x');
    var insetY = inset === 'inset' || (FLIP_POS[oDirX] && inset === 'inset-y');
    var winInset = inset === 'inset' || within ? 0 : 10;
    var elmRect = getRect(element, 'margin-box');
    var elmRectNoMargin = getRect(element);
    var elmRectWinMargin = winInset ? mergeRect(elmRectNoMargin.expand(10), elmRect) : elmRect;
    var margin = {};
    var winMargin = {};
    keys(FLIP_POS).forEach(function (v) {
        margin[v] = Math.max(0, (elmRect[v] - elmRectNoMargin[v]) * DIR_SIGN[v]);
        winMargin[v] = Math.max(margin[v], winInset);
    });

    var dirX, dirY;
    var calc = function (modeX, modeY, allowScroll) {
        var idealRect = elmRect;
        var refRect = isPlainObject(to) || !to ? toPlainRect((to.left || to.clientX || to.x) | 0, (to.top || to.clientY || to.y) | 0) : getRect(to);
        if (offset && inset !== 'inset') {
            refRect = inset === 'inset-x' ? refRect.expand(0, offset) : refRect.expand(offset, 0);
        }
        var winRect = inset === 'inset' ? refRect.expand(-offset) : within ? getRect(within) : getContentRect(dom.root);
        var parentRect = isAbsolute ? getRect(element.offsetParent, 'padding-box') : undefined;
        if (allowScroll) {
            var calculateIdealPosition = function (dir, inset, mode, p, pSize) {
                var q = FLIP_POS[p];
                var size = elmRectWinMargin[pSize];
                if (mode === -1) {
                    idealRect[p] = elmRect[p];
                } else if (!FLIP_POS[dir]) {
                    idealRect[p] = (refRect[p] + refRect[q] - size) / 2;
                } else {
                    dir = mode === 1 ? FLIP_POS[dir] : dir;
                    idealRect[p] = refRect[dir] - (either(p === dir, inset) ? size : 0);
                }
                idealRect[q] = idealRect[p] + size;
            };
            idealRect = toPlainRect(0, 0, 0, 0);
            calculateIdealPosition(oDirX, insetX, modeX, 'left', 'width');
            calculateIdealPosition(oDirY, insetY, modeY, 'top', 'height');
            
            var delta = scrollIntoView(to, idealRect);
            if (delta) {
                refRect = refRect.translate(-delta.x, -delta.y);
                idealRect = idealRect.translate(-delta.x, -delta.y);
                parentRect = parentRect && parentRect.translate(-delta.x, -delta.y);
            }
        }
        parentRect = parentRect || getRect(dom.root);

        var style = {
            transform: ''
        };
        var setActualPosition = function (dir, inset, mode, axis, p, pSize, pMax, sTransform) {
            var q = FLIP_POS[p];
            if (mode === -1) {
                style[pMax] = Math.min(winRect[q], idealRect[q]) - Math.max(winRect[p], idealRect[p]);
                if (style[pMax] < idealRect[p] && scrollToFit && !allowScroll) {
                    // not enough room to show the whole element in current position
                    // try scroll and maximize available rooms
                    return;
                }
                return 'preserve-' + axis;
            }
            var size = elmRect[pSize];
            var point;
            style[pMax] = winRect[pSize] - winMargin[p] - winMargin[q] - (offset || 0);
            if (!FLIP_POS[dir]) {
                var center = (refRect[p] + refRect[q]) / 2;
                if (center - winRect[p] < size / 2 + winMargin[p]) {
                    dir = p;
                } else if (winRect[q] - center < size / 2 + winMargin[q]) {
                    dir = q;
                } else {
                    dir = '';
                    style.transform += ' ' + sTransform;
                }
                point = dir ? winRect[dir] - (winMargin[dir] - margin[dir]) * DIR_SIGN[dir] : center - margin[p];
                setStyle(style, dir, point, parentRect, p, pSize);
                return dir || 'center' + axis;
            }
            // determine cases of 'normal', 'flip' and 'fit' by available rooms
            var rDir = inset ? FLIP_POS[dir] : dir;
            var rSign = DIR_SIGN[rDir];
            if (refRect[dir] * rSign + size + winMargin[dir] <= winRect[rDir] * rSign) {
                point = refRect[dir] - margin[FLIP_POS[rDir]] * rSign;
            } else if (refRect[FLIP_POS[dir]] * rSign - size - winMargin[FLIP_POS[dir]] > winRect[FLIP_POS[rDir]] * rSign) {
                if (allowScroll && !mode) {
                    // try scroll in another direction before 'flip' or 'fit'
                    return;
                }
                dir = FLIP_POS[dir];
                point = refRect[dir] + margin[rDir] * rSign;
            } else {
                if (scrollToFit && !mode) {
                    // try scroll before 'fit'
                    return;
                }
                point = winRect[dir];
                style[pMax] = inset ? style[pMax] : Math.abs(refRect[dir] - point) - winMargin[dir];
                setStyle(style, dir, point, parentRect, p, pSize);
                return dir;
            }
            if (!inset) {
                dir = FLIP_POS[dir];
            }
            style[pMax] = Math.abs(winRect[FLIP_POS[dir]] - point);
            setStyle(style, dir, point, parentRect, p, pSize);
            return dir;
        };
        dirX = setActualPosition(oDirX, insetX, modeX, 'x', 'left', 'width', 'maxWidth', 'translateX(-50%)');
        dirY = setActualPosition(oDirY, insetY, modeY, 'y', 'top', 'height', 'maxHeight', 'translateY(-50%)');
        return dirX && dirY && style;
    };
    var style = calc(modeX, modeY) || calc(modeX, modeY, true) || calc(dirX ? modeX : 1, dirY ? modeY : 1, true);
    $(element).css(style).attr('position-anchor', dirX + ' ' + dirY);
}

export function useAnimatedIndicator(options) {
    const onDispose = useDispose();
    return useState(function () {
        let indicator = $('<div class="anim-indicator"></div>')[0];
        let container;
        let prev;

        function setActive(next) {
            extend(indicator.style, {
                position: 'absolute',
                left: '0',
                width: '100%'
            });
            next.appendChild(indicator);
            setClass(next, 'active', true);
        }

        function setActiveIndex(index) {
            if (container) {
                let next = container.querySelectorAll(options.selector)[index];
                if (prev !== next) {
                    if (prev) {
                        setClass(prev, 'active', false);
                    }
                    if (!next) {
                        removeNode(indicator);
                    } else if (prev && container.contains(prev)) {
                        animate(container, prev, next);
                    } else {
                        setActive(next);
                    }
                } else if (next && !dom.root.contains(indicator)) {
                    setActive(next);
                }
                prev = next;
            }
        }

        function animate(container, prev, next) {
            onDispose();
            extend(indicator.style, {
                left: prev.offsetLeft + 'px',
                width: prev.offsetWidth + 'px',
                transition: 'none'
            });
            container.appendChild(indicator);
            setClass(container, 'animating', true);
            setImmediate(function () {
                extend(indicator.style, {
                    left: next.offsetLeft + 'px',
                    width: next.offsetWidth + 'px',
                    transition: 'left 0.2s, width 0.2s'
                });
                onDispose.push(setTimeout(function () {
                    setActive(next);
                    setClass(container, 'animating', false);
                }, 200));
            });
        }

        return {
            setActiveIndex,
            ref: function (element) {
                container = element;
            }
        };
    })[0];
}

export function initSortable(element, options) {
    dom.on(element, 'drag', options.handleSelector, function (e) {
        const item = e.target.closest(options.itemSelector);
        if (!item || !element.contains(item)) {
            return;
        }
        const children = makeArray(item.parentElement.children);
        const curIndex = children.indexOf(item);
        const scrollable = e.target.closest('[scrollable-target]');
        const r0 = getRect(scrollable);

        let newIndex = curIndex;
        let promise = dom.beginDrag(function (x, y, dx, dy) {
            item.style.transform = 'translateY(' + (dy - (getRect(scrollable).top - r0.top)) + 'px)';
            let r1 = getRect(item);
            newIndex = children.findIndex(v => getRect(v).centerY > r1.centerY);
            if (newIndex < 0) {
                newIndex = children.length - 1;
            } else if (newIndex > curIndex) {
                newIndex--;
            }
            children.forEach((v, i) => {
                if (i !== curIndex) {
                    v.style.transform = 'translateY(' + (r1.height * (i > curIndex && i <= newIndex ? -1 : i < curIndex && i >= newIndex ? 1 : 0)) + 'px)';
                }
            });
            if (dom.event) {
                dom.event.stopPropagation();
                dom.event.preventDefault();
            }
        });
        setClass(item, 'dragging', true);
        always(promise, function (result) {
            if (result && newIndex !== curIndex) {
                item.parentElement.insertBefore(item, children[newIndex + +(newIndex > curIndex)]);
                options.onOrderChanged(curIndex, newIndex);
            }
            setClass(item, 'dragging', false);
            children.forEach(function (v) {
                v.style.transform = '';
            });
        });
        e.handled();
    });
}

export function initStickable(container) {
    let elements = createAutoCleanupMap();
    let offsets = { top: 0, left: 0, right: 0, bottom: 0 };
    let scrolling = false;
    let disposed = false;

    function getOffset(r0) {
        const left = $(container).scrollable('scrollLeft');
        const top = $(container).scrollable('scrollTop');
        const r1 = getRect(container);
        r0 = r0 || getRect(container.querySelector('[scrollable-target]'));
        return {
            top: top,
            left: left,
            right: r0.width - r1.width - left,
            bottom: r0.height - r1.height - top,
        };
    }

    function updatePositions(deltaX, deltaY) {
        const updateWithin = deltaX === undefined;
        const r0 = getRect(container);
        if (deltaX === undefined) {
            offsets = getOffset();
            deltaX = 0;
            deltaY = 0;
        }
        each(elements, function (element, state) {
            let sign = state.dir === 'right' || state.dir === 'bottom' ? -1 : 1;
            let isDirY = state.dir === 'top' || state.dir === 'bottom';
            let offset = offsets[state.dir] * sign;
            let delta = isDirY ? deltaY : deltaX;
            if (state.within) {
                if (updateWithin) {
                    let r = state.within();
                    offset = (r[state.dir] - r0[state.dir]) * sign;
                    state.offset = offset;
                    state.maxOffset = isDirY ? r.height : r.width;
                } else {
                    offset = state.offset;
                }
                let pos = (offset + delta) * sign;
                if (pos < 0 || pos > state.maxOffset) {
                    element.style.transform = '';
                    return;
                }
            }
            element.style.transform = 'translate' + (isDirY ? 'Y' : 'X') + '(' + ((offset + delta) | 0) + 'px)';
        });
    }

    observe(container, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true
    }, function () {
        if (!scrolling && !disposed) {
            updatePositions();
        }
    });

    return {
        add: function (element, dir, within) {
            if (!disposed) {
                elements.set(element, { within, dir, offset: 0, maxOffset: 0 });
                setImmediateOnce(updatePositions);
            }
        },
        dispose: combineFn(
            function () {
                disposed = true;
                elements.clear();
            },
            dom.on('resize', function () {
                updatePositions();
            }),
            dom.on(container, {
                scrollStart: function (e) {
                    if (e.target === container) {
                        scrolling = true;
                    }
                },
                scrollMove: function (e) {
                    if (scrolling) {
                        updatePositions((e.offsetX | 0) - e.startX, (e.offsetY | 0) - e.startY);
                    }
                },
                scrollStop: function () {
                    scrolling = false;
                    updatePositions();
                }
            })
        )
    };
}
