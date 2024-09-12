import { createPrivateStore, definePrototype, extend, isPlainObject } from "zeta-dom/util";
import { position, startPositioning } from "./index.js";

const _ = /*#__PURE__*/ createPrivateStore();

export function Positioner(element, to, dir, options) {
    _(this, {
        args: [element, to, dir, extend({}, options)]
    });
}

definePrototype(Positioner, {
    refresh: function () {
        position.apply(0, _(this).args);
    },
    observe: function () {
        var state = _(this);
        state.dispose = startPositioning.apply(0, state.args);
    },
    disconnect: function () {
        var state = _(this);
        if (state.dispose) {
            state.dispose();
            state.dispose = null;
        }
    },
    setOptions: function (dir, options) {
        var state = _(this);
        var args = state.args;
        if (isPlainObject(dir)) {
            options = dir;
        } else {
            args[2] = dir;
        }
        extend(args[3], options);
        if (state.dispose) {
            state.dispose();
            state.dispose = startPositioning.apply(0, args);
        }
    }
});
