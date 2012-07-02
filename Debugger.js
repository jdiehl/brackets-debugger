/*
 * Copyright (c) 2012 Adobe Systems Incorporated. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */

/*jslint vars: true, plusplus: true, devel: true, browser: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global define, brackets, $ */

define(function (require, exports, module) {
	'use strict';

	var Inspector	= brackets.getModule("LiveDevelopment/Inspector/Inspector"),
		ScriptAgent	= brackets.getModule("LiveDevelopment/Agents/ScriptAgent"),
		LiveDevelopment = brackets.getModule("LiveDevelopment/LiveDevelopment");

	var Breakpoint = require("Breakpoint");
	
	var $exports = $(exports);
	var _paused;


	/** Actions **************************************************************/

    // pause the debugger
	function pause() {
		Inspector.Debugger.pause();
	}

	// resume the debugger
	function resume() {
		Inspector.Debugger.resume();
	}

	// step over the current line
	function stepOver() {
		Inspector.Debugger.stepOver();
	}

	// step into the function at the current line
	function stepInto() {
		Inspector.Debugger.stepInto();
	}

	// step out
	function stepOut() {
		Inspector.Debugger.stepOut();
	}

	// toggle a breakpoint
	function toggleBreakpoint(location) {
		var breakpoint = Breakpoint.find(location);
		if (!breakpoint) {
			breakpoint = new Breakpoint.Breakpoint(location);
			$(breakpoint)
				.on("resolve", _onResolveBreakpoint)
				.on("remove", _onRemoveBreakpoint);
		}
		breakpoint.toggle();
	}

	// evaluate an expression in the active call frame
	function evaluate(expression, callback) {
		if (_paused) {
			Inspector.Debugger.evaluateOnCallFrame(_paused.callFrames[0].callFrameId, expression, callback);
		} else {
			Inspector.Runtime.evaluate(expression, callback);
		}
	}

	/** Event Handlers *******************************************************/

	// WebInspector Event: Debugger.paused
	function _onPaused(res) {
		// res = {callFrames, reason, data}
		_paused = res;
		_paused.location = _paused.callFrames[0].location;
		_paused.breakpoints = Breakpoint.findResolved(_paused.location);
		$exports.triggerHandler("paused", _paused);
	}

	// WebInspector Event: Debugger.resumed
	function _onResumed(res) {
		// res = {}
		$exports.triggerHandler("resumed", _paused);
		_paused = undefined;
	}

	function _onResolveBreakpoint(event, res) {
		$exports.triggerHandler('setBreakpoint', res.location);
	}

	function _onRemoveBreakpoint(event, res) {
		var locations = res.breakpoint.resolvedLocations;
		for (var i in locations) {
			$exports.triggerHandler('removeBreakpoint', locations[i]);
		}
	}

	/** Init Functions *******************************************************/
	
	// init
	function init() {
		Inspector.on("Debugger.paused", _onPaused);
		Inspector.on("Debugger.resumed", _onResumed);
	}

	function unload() {
		Inspector.off("Debugger.paused", _onPaused);
		Inspector.off("Debugger.resumed", _onResumed);
		$exports.off();
	}

	// public methods
	exports.init = init;
	exports.unload = unload;
	exports.pause = pause;
	exports.resume = resume;
	exports.stepOver = stepOver;
	exports.stepInto = stepInto;
	exports.stepOut = stepOut;
	exports.toggleBreakpoint = toggleBreakpoint;
	exports.evaluate = evaluate;
});
