import { useState } from "react";
import $ from "jquery";
import dom from "zeta-dom/dom";
import { containsOrEquals, getContentRect, getRect, removeNode, scrollIntoView, setClass, toPlainRect } from "zeta-dom/domUtil";
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
    var ignoreX, ignoreY, scrollToFit;
    if (!containsOrEquals(dom.root, element)) {
        document.body.appendChild(element);
    }
    if (isPlainObject(within)) {
        ignoreX = within.axis === 'y-only';
        ignoreY = within.axis === 'x-only';
        scrollToFit = within.scrollToFit;
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

    var refRect = isPlainObject(to) || !to ? toPlainRect((to.left || to.clientX || to.x) | 0, (to.top || to.clientY || to.y) | 0) : getRect(to);
    if (offset && inset !== 'inset') {
        refRect = inset === 'inset-x' ? refRect.expand(0, offset) : refRect.expand(offset, 0);
    }
    var winRect = inset === 'inset' ? refRect.expand(-offset) : within ? getRect(within) : getContentRect(dom.root);
    var parentRect = isAbsolute ? getRect(element.offsetParent) : undefined;
    var elmRect = getRect(element, true);
    var elmRectNoMargin = getRect(element);
    var margin = {};
    keys(FLIP_POS).forEach(function (v) {
        margin[v] = elmRect[v] - elmRectNoMargin[v];
    });

    var idealRect = {};
    var calculateIdealPosition = function (dir, inset, current, p, pSize) {
        if (current) {
            idealRect[p] = elmRect[p];
        } else if (!FLIP_POS[dir]) {
            idealRect[p] = (refRect[FLIP_POS[p]] + refRect[p] - elmRect[pSize]) / 2;
        } else {
            idealRect[p] = refRect[dir] - (either(p === dir, inset) ? elmRect[pSize] : 0);
        }
        idealRect[FLIP_POS[p]] = idealRect[p] + elmRect[pSize];
    };
    if (scrollToFit && is(to, Node)) {
        calculateIdealPosition(oDirX, insetX, ignoreX, 'left', 'width');
        calculateIdealPosition(oDirY, insetY, ignoreY, 'top', 'height');
        var delta = scrollIntoView(to, toPlainRect(idealRect));
        if (delta) {
            refRect = refRect.translate(-delta.x, -delta.y);
            parentRect = parentRect && parentRect.translate(-delta.x, -delta.y);
        }
    }
    parentRect = parentRect || getRect(dom.root);

    var style = {
        transform: ''
    };
    var setActualPosition = function (dir, inset, p, pSize, pMax, sTransform) {
        var point;
        style[pMax] = winRect[pSize] + margin[p] - margin[FLIP_POS[p]] - (offset || 0);
        if (!FLIP_POS[dir]) {
            var center = (refRect[FLIP_POS[p]] + refRect[p]) / 2;
            dir = center - winRect[p] < elmRect[pSize] / 2 ? p : winRect[FLIP_POS[p]] - center < elmRect[pSize] / 2 ? FLIP_POS[p] : '';
            if (!dir) {
                style.transform += ' ' + sTransform;
            }
            point = dir ? winRect[dir] : center + margin[p];
            setStyle(style, dir, point, parentRect, p, pSize);
            return dir;
        }
        // determine cases of 'normal', 'flip' and 'fit' by available rooms
        var rDir = inset ? FLIP_POS[dir] : dir;
        if (refRect[dir] * DIR_SIGN[rDir] + elmRect[pSize] <= winRect[rDir] * DIR_SIGN[rDir]) {
            point = refRect[dir] + margin[FLIP_POS[rDir]];
        } else if (refRect[FLIP_POS[dir]] * DIR_SIGN[rDir] - elmRect[pSize] > winRect[FLIP_POS[rDir]] * DIR_SIGN[rDir]) {
            dir = FLIP_POS[dir];
            point = refRect[dir] + margin[rDir];
        } else {
            point = winRect[dir];
            style[pMax] = inset ? style[pMax] : Math.abs(refRect[dir] - point) - (DIR_SIGN[dir] * margin[dir]);
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
    var dirX = ignoreX ? 'preserve-x' : setActualPosition(oDirX, insetX, 'left', 'width', 'maxWidth', 'translateX(-50%)') || 'center-x';
    var dirY = ignoreY ? 'preserve-y' : setActualPosition(oDirY, insetY, 'top', 'height', 'maxHeight', 'translateY(-50%)') || 'center-y';
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
