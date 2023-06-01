import { useState } from "react";
import $ from "jquery";
import dom from "zeta-dom/dom";
import { containsOrEquals, getRect, rectIntersects, removeNode, setClass, toPlainRect } from "zeta-dom/domUtil";
import { always, combineFn, each, extend, is, isPlainObject, keys, makeArray, matchWord, randomId, setImmediate, setImmediateOnce, setTimeout } from "zeta-dom/util";
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
const safeAreaInset = {};

function getVisibleWinRect() {
    if (!('left' in safeAreaInset)) {
        var property = '--' + randomId();
        var $stylesheet = $('<style>:root{' + property + ':env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);}</style>').appendTo('head');
        var cur = getComputedStyle(dom.root).getPropertyValue(property).split(' ');
        extend(safeAreaInset, {
            top: -parseFloat(cur[0]) || 0,
            left: -parseFloat(cur[3]) || 0,
            right: -parseFloat(cur[1]) || 0,
            bottom: -parseFloat(cur[2]) || 0
        });
        $stylesheet.remove();
    }
    return rectIntersects(
        getRect(dom.root),
        getRect().expand(safeAreaInset.left, safeAreaInset.top, safeAreaInset.right, safeAreaInset.bottom));
}

export function cssFromPoint(x, y, origin, parent) {
    var refRect = getRect(is(parent || origin, Node) || dom.root);
    var dirX = matchWord(origin || y, 'left right');
    var dirY = matchWord(origin || y, 'top bottom');
    var style = {};
    y = (((x.top || x.clientY || x.y || y) | 0) - refRect.top);
    x = (((x.left || x.clientX || x.x || x) | 0) - refRect.left);
    style[dirX] = (dirX === 'left' ? x : refRect.width - x) + 'px';
    style[dirY] = (dirY === 'top' ? y : refRect.height - y) + 'px';
    style[FLIP_POS[dirX]] = 'auto';
    style[FLIP_POS[dirY]] = 'auto';
    return style;
}

export function position(element, to, dir, within, offset) {
    if (!containsOrEquals(dom.root, element)) {
        document.body.appendChild(element);
    }
    $(element).css({
        position: 'fixed',
        maxWidth: '',
        maxHeight: ''
    });
    offset = offset || 0;
    var oDirX = matchWord(dir, 'left right center') || 'left';
    var oDirY = matchWord(dir, 'top bottom center') || 'bottom';
    var inset = matchWord(dir, 'inset-x inset-y inset') || (FLIP_POS[oDirY] ? 'inset-x' : 'inset-y');
    var refRect = isPlainObject(to) || !to ? toPlainRect((to.left || to.clientX || to.x) | 0, (to.top || to.clientY || to.y) | 0) : getRect(to);
    if (offset && inset !== 'inset') {
        refRect = inset === 'inset-x' ? refRect.expand(0, offset) : refRect.expand(offset, 0);
    }
    var winRect = inset === 'inset' ? refRect.expand(-offset) : within ? getRect(within) : getVisibleWinRect();
    var elmRect = getRect(element, true);
    var margin = {};
    var point = {};
    var style = {
        transform: ''
    };
    var fn = function (dir, inset, p, pSize, pMax, sTransform) {
        style[pMax] = winRect[pSize] + margin[p] - margin[FLIP_POS[p]] - (offset || 0);
        if (!FLIP_POS[dir]) {
            var center = (refRect[FLIP_POS[p]] + refRect[p]) / 2;
            dir = center - winRect[p] < elmRect[pSize] / 2 ? p : winRect[FLIP_POS[p]] - center < elmRect[pSize] / 2 ? FLIP_POS[p] : '';
            if (!dir) {
                style.transform += ' ' + sTransform;
            }
            point[p] = dir ? winRect[dir] : center + margin[p];
            return dir;
        }
        // determine cases of 'normal', 'flip' and 'fit' by available rooms
        var rDir = inset ? FLIP_POS[dir] : dir;
        if (refRect[dir] * DIR_SIGN[rDir] + elmRect[pSize] <= winRect[rDir] * DIR_SIGN[rDir]) {
            point[p] = refRect[dir] + margin[FLIP_POS[rDir]];
        } else if (refRect[FLIP_POS[dir]] * DIR_SIGN[rDir] - elmRect[pSize] > winRect[FLIP_POS[rDir]] * DIR_SIGN[rDir]) {
            dir = FLIP_POS[dir];
            point[p] = refRect[dir] + margin[rDir];
        } else {
            point[p] = winRect[dir];
            style[pMax] = inset ? style[pMax] : Math.abs(refRect[dir] - point[p]) - (DIR_SIGN[dir] * margin[dir]);
            return dir;
        }
        if (!inset) {
            dir = FLIP_POS[dir];
        }
        style[pMax] = Math.abs(winRect[FLIP_POS[dir]] - point[p]);
        return dir;
    };

    var elmRectNoMargin = getRect(element);
    keys(FLIP_POS).forEach(function (v) {
        margin[v] = elmRect[v] - elmRectNoMargin[v];
    });
    var dirX = fn(oDirX, inset === 'inset' || (FLIP_POS[oDirY] && inset === 'inset-x'), 'left', 'width', 'maxWidth', 'translateX(-50%)');
    var dirY = fn(oDirY, inset === 'inset' || (FLIP_POS[oDirX] && inset === 'inset-y'), 'top', 'height', 'maxHeight', 'translateY(-50%)');
    $(element).css(extend(style, cssFromPoint(point, (dirX || 'left') + ' ' + (dirY || 'top')))).attr('position-anchor', (dirX || 'center-x') + ' ' + (dirY || 'center-y'));
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
