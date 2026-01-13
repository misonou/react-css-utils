import { useState } from "react";
import $ from "jquery";
import dom, { reportError } from "zeta-dom/dom";
import { bind, containsOrEquals, getContentRect, getRect, isVisible, matchSelector, removeNode, scrollIntoView, setClass, toPlainRect } from "zeta-dom/domUtil";
import { always, combineFn, each, either, executeOnce, extend, is, isPlainObject, makeArray, makeAsync, matchWord, matchWordMulti, setImmediate, setTimeout } from "zeta-dom/util";
import { useDispose } from "zeta-dom-react";

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
const PC = {
    0.5: '50%',
    1: '100%'
};

var positionCallbacks;

function intersectRect(a, b) {
    return toPlainRect(Math.max(a.left, b.left), Math.max(a.top, b.top), Math.min(a.right, b.right), Math.min(a.bottom, b.bottom));
}

function setStyle(style, dir, pos, parentRect, p, pSize, percentage) {
    dir = dir || p;
    pos = (parentRect[dir] - pos) * DIR_SIGN[dir];
    if (percentage) {
        var remainder = pos - (parentRect[pSize] * percentage);
        style[dir] = remainder ? 'calc(' + PC[percentage] + ' + ' + remainder + 'px)' : PC[percentage];
    } else {
        style[dir] = pos + 'px';
    }
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
    if (!containsOrEquals(dom.root, element)) {
        document.body.appendChild(element);
    }
    positionCallback(element, to, dir, within, offset)();
}

function positionCallback(element, to, dir, within, offset) {
    var options = {};
    if (isPlainObject(within)) {
        options = within;
        offset = within.offset;
        within = within.within;
    }
    offset = offset || 0;

    var modeX = options.axis === 'y-only' ? -1 : 0;
    var modeY = options.axis === 'x-only' ? -1 : 0;
    var scrollToFit = options.scrollToFit && is(to, Node);
    var strategy = options.strategy;
    var allowFit = !strategy || matchWord(strategy, 'fit');
    var allowFlip = !strategy || matchWord(strategy, 'flip');
    var minSize = {
        width: options.basisWidth || 0,
        height: options.basisHeight || 0
    };
    var oDirX = matchWord(dir, 'left right');
    var oDirY = matchWord(dir, 'top bottom');
    var oInset = matchWord(dir, 'inset-x inset-y inset') || (modeY < 0 ? 'inset' : FLIP_POS[oDirY] ? 'inset-x' : 'inset-y');
    if (!oDirX || !oDirY) {
        var iter = matchWordMulti(dir, 'auto center');
        var iterValue = iter() || 'auto';
        oDirX = oDirX || iterValue;
        oDirY = oDirY || iter() || iterValue;
        modeX = oDirX === 'auto' ? -1 : modeX;
        modeY = oDirY === 'auto' ? -1 : modeY;
    }
    var insetX = modeX >= 0 && (oInset === 'inset' || (FLIP_POS[oDirY] && oInset === 'inset-x'));
    var insetY = modeY >= 0 && (oInset === 'inset' || (FLIP_POS[oDirX] && oInset === 'inset-y'));
    return positionImpl.bind(undefined, element, to, within, oDirX, oDirY, insetX, insetY, modeX, modeY, offset || 0, scrollToFit, allowFlip, allowFit, minSize);
}

function positionImpl(element, to, within, oDirX, oDirY, insetX, insetY, modeX, modeY, offset, scrollToFit, allowFlip, allowFit, minSize) {
    if (!isVisible(element) || (is(to, Node) && !isVisible(to))) {
        return;
    }
    var isAbsolute = $(element).css('position') === 'absolute';
    var allowPercentage = isAbsolute && to === element.offsetParent;
    $(element).css({
        position: isAbsolute ? 'absolute' : 'fixed',
        transform: '',
        maxWidth: '',
        maxHeight: ''
    });
    var inset = insetX && insetY;
    var winInset = inset || within ? 0 : 10;
    var curStyle = getComputedStyle(element);
    var elmRectWithMargin = getRect(element, 'margin-box');
    var elmRectPainted = getRect(element);
    var elmRect = intersectRect(elmRectWithMargin, elmRectPainted);
    var elmSize = {
        width: Math.max(elmRect.width, minSize.width),
        height: Math.max(elmRect.height, minSize.height)
    };
    var margin = {};
    var winMargin = {};
    each(FLIP_POS, function (v) {
        margin[v] = (elmRectWithMargin[v] - elmRect[v]) * DIR_SIGN[v];
        winMargin[v] = Math.max(margin[v], winInset);
    });

    var dirX, dirY;
    var calc = function (modeX, modeY, allowScroll) {
        var idealRect = elmRect;
        var refRect = isPlainObject(to) || !to ? toPlainRect((to.left || to.clientX || to.x) | 0, (to.top || to.clientY || to.y) | 0) : getRect(to);
        if (offset) {
            refRect = inset ? refRect.expand(-offset) : insetX ? refRect.expand(0, offset) : refRect.expand(offset, 0);
        }
        var parentRect = isAbsolute ? getRect(element.offsetParent, 'padding-box') : undefined;
        if (allowScroll) {
            var calculateIdealPosition = function (dir, inset, mode, p, pSize) {
                var q = FLIP_POS[p];
                var size = elmSize[pSize];
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

            var delta = scrollIntoView(to, idealRect.expand(winMargin), within);
            if (delta) {
                refRect = refRect.translate(-delta.x, -delta.y);
                idealRect = idealRect.translate(-delta.x, -delta.y);
                parentRect = parentRect && parentRect.translate(-delta.x, -delta.y);
            }
        }
        parentRect = parentRect || getRect(dom.root);

        var winRect = inset ? refRect.expand(margin, -1) : within ? getRect(within).expand(margin, -1) : intersectRect(getContentRect(dom.root).expand(margin, -1), getRect().expand(-winInset));
        var style = {
            transform: ''
        };
        var setActualPosition = function (dir, inset, mode, axis, p, pSize, pMax, sTransform) {
            var q = FLIP_POS[p];
            if (mode === -1) {
                if (scrollToFit && !allowScroll && idealRect[pSize] > Math.min(winRect[q], idealRect[q]) - Math.max(winRect[p], idealRect[p])) {
                    // not enough room to show the whole element in current position
                    // try scroll and maximize available rooms
                    return;
                }
                style[pMax] = idealRect[p] + idealRect[q] > refRect[p] + refRect[q] ? winRect[q] - idealRect[p] : idealRect[q] - winRect[p];
                return 'preserve-' + axis;
            }
            var size = elmSize[pSize];
            var point;
            style[pMax] = winRect[pSize] - offset;
            if (!FLIP_POS[dir]) {
                var center = (refRect[p] + refRect[q]) / 2;
                if (allowFit && center - winRect[p] < size / 2) {
                    dir = p;
                } else if (allowFit && winRect[q] - center < size / 2) {
                    dir = q;
                } else {
                    point = center - margin[p];
                    style.transform += ' ' + sTransform;
                    setStyle(style, '', point, parentRect, p, pSize, allowPercentage && 0.5);
                    return 'center-' + axis;
                }
            } else {
                // determine cases of 'normal', 'flip' and 'fit' by available rooms
                var rDir = inset ? FLIP_POS[dir] : dir;
                var rSign = DIR_SIGN[rDir];
                var sNormal = winRect[rDir] * rSign - Math.floor(refRect[dir] * rSign + size);
                if (sNormal >= 0) {
                    point = refRect[dir] - margin[FLIP_POS[rDir]] * rSign;
                } else if (allowFlip) {
                    if (allowScroll && !mode) {
                        // try scroll in another direction before 'flip' or 'fit'
                        return;
                    }
                    var sFlip = Math.ceil(refRect[FLIP_POS[dir]] * rSign - size) - winRect[FLIP_POS[rDir]] * rSign;
                    if (!allowFit && sFlip < 0 && sFlip < sNormal) {
                        // keep 'normal' position when both 'normal' and 'flip' have not enough available rooms
                        // but 'normal' has more room than 'flip' position
                        point = refRect[dir] - margin[FLIP_POS[rDir]] * rSign;
                    } else if (sFlip >= 0 || !allowFit) {
                        dir = FLIP_POS[dir];
                        point = refRect[dir] + margin[rDir] * rSign;
                    }
                }
            }
            if (point === undefined) {
                if (scrollToFit && !mode) {
                    // try scroll before 'fit'
                    return;
                }
                point = winRect[dir] + margin[dir] * DIR_SIGN[dir];
                setStyle(style, dir, point, parentRect, p, pSize);
                return dir;
            }
            var percentage = allowPercentage && (dir !== rDir ? 0 : 1);
            if (!inset) {
                dir = FLIP_POS[dir];
            }
            style[pMax] = Math.abs(winRect[FLIP_POS[dir]] - point + (elmRectWithMargin[dir] - elmRectPainted[dir]));
            setStyle(style, dir, point, parentRect, p, pSize, percentage);
            return dir;
        };
        dirX = setActualPosition(oDirX, insetX, modeX, 'x', 'left', 'width', 'maxWidth', 'translateX(-50%)');
        dirY = setActualPosition(oDirY, insetY, modeY, 'y', 'top', 'height', 'maxHeight', 'translateY(-50%)');
        return dirX && dirY && style;
    };
    var style = calc(modeX, modeY) || calc(modeX, modeY, true) || calc(dirX ? modeX : 1, dirY ? modeY : 1, true);
    if (style.maxWidth > parseInt(curStyle.maxWidth)) {
        delete style.maxWidth;
    }
    if (style.maxHeight > parseInt(curStyle.maxHeight)) {
        delete style.maxHeight;
    }
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
    return dom.on(element, 'drag', options.handleSelector, function (e) {
        const item = e.target.closest(options.itemSelector);
        if (!item || !element.contains(item)) {
            return;
        }
        const container = item.parentElement;
        const children = makeArray(container.children).filter(function (v) {
            return matchSelector(v, options.itemSelector);
        });
        const lastBefore = children.slice(-1)[0].nextElementSibling;
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
                container.insertBefore(item, children[newIndex + +(newIndex > curIndex)] || lastBefore);
                makeAsync(options.onOrderChanged)(curIndex, newIndex).catch(function (e) {
                    container.insertBefore(item, children[curIndex + 1] || lastBefore);
                    reportError(e, container);
                });
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
    let disposed = false;
    return {
        add: function (element, dir, within) {
            if (!disposed) {
                $(container).scrollable('setStickyPosition', element, dir, within, true);
            }
        },
        dispose: function () {
            disposed = true;
        }
    };
}

export function startPositioning(element, to, dir, options) {
    if (!positionCallbacks) {
        positionCallbacks = new Map();
        bind(window.visualViewport || window, 'resize', function () {
            setTimeout(function () {
                combineFn(positionCallbacks)();
            }, 50);
        });
    }
    if (positionCallbacks.has(element)) {
        throw new Error('Dismount previous positioning before mounting a new one');
    }
    var observer;
    var callback = positionCallback(element, to, dir, options);
    var dispose = executeOnce(function () {
        positionCallbacks.delete(element);
        if (observer) {
            observer.disconnect();
        }
    });
    if (options.within) {
        observer = new ResizeObserver(callback);
        observer.observe(options.within);
    }
    positionCallbacks.set(element, callback);
    callback();
    return dispose;
}

export * from "./Positioner.js";
