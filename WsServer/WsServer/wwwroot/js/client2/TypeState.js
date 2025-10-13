var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
/**
 * Transition grouping to faciliate fluent api
 */
var Transitions = /** @class */ (function () {
    function Transitions(fsm) {
        this.fsm = fsm;
    }
    /**
     * Specify the end state(s) of a transition function
     */
    Transitions.prototype.to = function () {
        var states = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            states[_i] = arguments[_i];
        }
        this.toStates = states;
        this.fsm.addTransitions(this);
    };
    /**
     * Specify that any state in the state enum is value
     * Takes the state enum as an argument
     */
    Transitions.prototype.toAny = function (states) {
        var toStates = [];
        for (var s in states) {
            if (states.hasOwnProperty(s)) {
                toStates.push(states[s]);
            }
        }
        this.toStates = toStates;
        this.fsm.addTransitions(this);
    };
    return Transitions;
}());
export { Transitions };
/**
 * Internal representation of a transition function
 */
var TransitionFunction = /** @class */ (function () {
    function TransitionFunction(fsm, from, to) {
        this.fsm = fsm;
        this.from = from;
        this.to = to;
    }
    return TransitionFunction;
}());
export { TransitionFunction };
/**
 * A simple finite state machine implemented in TypeScript, the templated argument is meant to be used
 * with an enumeration.
 */
var FiniteStateMachine = /** @class */ (function () {
    function FiniteStateMachine(startState, allowImplicitSelfTransition) {
        if (allowImplicitSelfTransition === void 0) { allowImplicitSelfTransition = false; }
        this._transitionFunctions = [];
        this._onCallbacks = {};
        this._exitCallbacks = {};
        this._enterCallbacks = {};
        this._invalidTransitionCallback = null;
        this.currentState = startState;
        this._startState = startState;
        this._allowImplicitSelfTransition = allowImplicitSelfTransition;
    }
    FiniteStateMachine.prototype.addTransitions = function (fcn) {
        var _this = this;
        fcn.fromStates.forEach(function (from) {
            fcn.toStates.forEach(function (to) {
                // Only add the transition if the state machine is not currently able to transition.
                if (!_this._canGo(from, to)) {
                    _this._transitionFunctions.push(new TransitionFunction(_this, from, to));
                }
            });
        });
    };
    /**
     * Listen for the transition to this state and fire the associated callback
     */
    FiniteStateMachine.prototype.on = function (state, callback) {
        var key = state.toString();
        if (!this._onCallbacks[key]) {
            this._onCallbacks[key] = [];
        }
        this._onCallbacks[key].push(callback);
        return this;
    };
    /**
     * Listen for the transition to this state and fire the associated callback, returning
     * false in the callback will block the transition to this state.
     */
    FiniteStateMachine.prototype.onEnter = function (state, callback) {
        var key = state.toString();
        if (!this._enterCallbacks[key]) {
            this._enterCallbacks[key] = [];
        }
        this._enterCallbacks[key].push(callback);
        return this;
    };
    /**
     * Listen for the transition to this state and fire the associated callback, returning
     * false in the callback will block the transition from this state.
     */
    FiniteStateMachine.prototype.onExit = function (state, callback) {
        var key = state.toString();
        if (!this._exitCallbacks[key]) {
            this._exitCallbacks[key] = [];
        }
        this._exitCallbacks[key].push(callback);
        return this;
    };
    /**
     * List for an invalid transition and handle the error, returning a falsy value will throw an
     * exception, a truthy one will swallow the exception
     */
    FiniteStateMachine.prototype.onInvalidTransition = function (callback) {
        if (!this._invalidTransitionCallback) {
            this._invalidTransitionCallback = callback;
        }
        return this;
    };
    /**
     * Declares the start state(s) of a transition function, must be followed with a '.to(...endStates)'
     */
    FiniteStateMachine.prototype.from = function () {
        var states = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            states[_i] = arguments[_i];
        }
        var _transition = new Transitions(this);
        _transition.fromStates = states;
        return _transition;
    };
    FiniteStateMachine.prototype.fromAny = function (states) {
        var fromStates = [];
        for (var s in states) {
            if (states.hasOwnProperty(s)) {
                fromStates.push(states[s]);
            }
        }
        var _transition = new Transitions(this);
        _transition.fromStates = fromStates;
        return _transition;
    };
    FiniteStateMachine.prototype._validTransition = function (from, to) {
        return this._transitionFunctions.some(function (tf) {
            return (tf.from === from && tf.to === to);
        });
    };
    /**
     * Check whether a transition between any two states is valid.
     *    If allowImplicitSelfTransition is true, always allow transitions from a state back to itself.
     *     Otherwise, check if it's a valid transition.
     */
    FiniteStateMachine.prototype._canGo = function (fromState, toState) {
        return (this._allowImplicitSelfTransition && fromState === toState) || this._validTransition(fromState, toState);
    };
    /**
     * Check whether a transition to a new state is valid
     */
    FiniteStateMachine.prototype.canGo = function (state) {
        return this._canGo(this.currentState, state);
    };
    /**
     * Transition to another valid state
     */
    FiniteStateMachine.prototype.go = function (state, event) {
        if (!this.canGo(state)) {
            if (!this._invalidTransitionCallback || !this._invalidTransitionCallback(this.currentState, state)) {
                throw new Error('Error no transition function exists from state ' + this.currentState.toString() + ' to ' + state.toString());
            }
        }
        else {
            return this._transitionTo(state, event);
        }
    };
    /**
     * This method is availble for overridding for the sake of extensibility.
     * It is called in the event of a successful transition.
     */
    FiniteStateMachine.prototype.onTransition = function (from, to) {
        // pass, does nothing until overidden
    };
    /**
    * Reset the finite state machine back to the start state, DO NOT USE THIS AS A SHORTCUT for a transition.
    * This is for starting the fsm from the beginning.
    */
    FiniteStateMachine.prototype.reset = function (options) {
        var _this = this;
        options = __assign(__assign({}, DefaultResetOptions), (options || {}));
        this.currentState = this._startState;
        if (options.runCallbacks) {
            this._onCallbacks[this.currentState.toString()].forEach(function (fcn) {
                fcn.call(_this, null, null);
            });
        }
    };
    /**
     * Whether or not the current state equals the given state
     */
    FiniteStateMachine.prototype.is = function (state) {
        return this.currentState === state;
    };
    FiniteStateMachine.prototype._transitionTo = function (state, event) {
        return __awaiter(this, void 0, void 0, function () {
            var canExit, _i, _a, exitCallback, returnValue, canEnter, _b, _c, enterCallback, returnValue, old;
            var _this = this;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        if (!this._exitCallbacks[this.currentState.toString()]) {
                            this._exitCallbacks[this.currentState.toString()] = [];
                        }
                        if (!this._enterCallbacks[state.toString()]) {
                            this._enterCallbacks[state.toString()] = [];
                        }
                        if (!this._onCallbacks[state.toString()]) {
                            this._onCallbacks[state.toString()] = [];
                        }
                        canExit = true;
                        _i = 0, _a = this._exitCallbacks[this.currentState.toString()];
                        _d.label = 1;
                    case 1:
                        if (!(_i < _a.length)) return [3 /*break*/, 5];
                        exitCallback = _a[_i];
                        returnValue = exitCallback.call(this, state);
                        // No return value
                        if (returnValue === undefined) {
                            // Default to true
                            returnValue = true;
                        }
                        if (!(returnValue !== false && returnValue !== true)) return [3 /*break*/, 3];
                        return [4 /*yield*/, returnValue];
                    case 2:
                        returnValue = _d.sent();
                        _d.label = 3;
                    case 3:
                        // Still no return value
                        if (returnValue === undefined) {
                            // Default to true
                            returnValue = true;
                        }
                        canExit = canExit && returnValue;
                        _d.label = 4;
                    case 4:
                        _i++;
                        return [3 /*break*/, 1];
                    case 5:
                        canEnter = true;
                        _b = 0, _c = this._enterCallbacks[state.toString()];
                        _d.label = 6;
                    case 6:
                        if (!(_b < _c.length)) return [3 /*break*/, 10];
                        enterCallback = _c[_b];
                        returnValue = enterCallback.call(this, this.currentState, event);
                        // No return value
                        if (returnValue === undefined) {
                            // Default to true
                            returnValue = true;
                        }
                        if (!(returnValue !== false && returnValue !== true)) return [3 /*break*/, 8];
                        return [4 /*yield*/, returnValue];
                    case 7:
                        returnValue = _d.sent();
                        _d.label = 8;
                    case 8:
                        // Still no return value
                        if (returnValue === undefined) {
                            // Default to true
                            returnValue = true;
                        }
                        canEnter = canEnter && returnValue;
                        _d.label = 9;
                    case 9:
                        _b++;
                        return [3 /*break*/, 6];
                    case 10:
                        ;
                        if (canExit && canEnter) {
                            old = this.currentState;
                            this.currentState = state;
                            this._onCallbacks[this.currentState.toString()].forEach(function (fcn) {
                                fcn.call(_this, old, event);
                            });
                            this.onTransition(old, state);
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    return FiniteStateMachine;
}());
export { FiniteStateMachine };
;
/**
 * Default `ResetOptions` values used in the `reset()` mehtod.
 */
export var DefaultResetOptions = {
    runCallbacks: false
};
//# sourceMappingURL=TypeState.js.map