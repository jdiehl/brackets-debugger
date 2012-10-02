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
		ScriptAgent	= brackets.getModule("LiveDevelopment/Agents/ScriptAgent");

	var Breakpoint = require("Breakpoint");
	
	var $exports = $(exports);
	var _paused;

	/** Actions **************************************************************/

	// pause the debugger
	function pause() {
		// if there is no pause before the next reload, press pause again
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
		return breakpoint;
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
	function _onPaused(event, res) {
		// res = {callFrames, reason, data}

		// ignore DOM breakpoints - they are handled by the ScriptAgent
		if (res.reason === "DOM") return;

		// gather some info about this pause
		_paused = { location: res.callFrames[0].location, callFrames: res.callFrames };

		// trigger the "paused" event
		$exports.triggerHandler("paused", _paused);
	}

	// WebInspector Event: Debugger.resumed
	function _onResumed(event, res) {
		// res = {}

		// send the "resumed" event with the info from the pause
		if (_paused) {
			$exports.triggerHandler("resumed", _paused);
			_paused = undefined;
		}
	}

	// Breakpoint Event: breakpoint resolved
	function _onResolveBreakpoint(event, breakpoint, location) {
		location.url = ScriptAgent.scriptWithId(location.scriptId).url;
		$exports.triggerHandler('setBreakpoint', location);
	}

	// Breakpoint Event: breakpoint removed
	function _onRemoveBreakpoint(event, breakpoint) {
		var locations = breakpoint.resolvedLocations;
		for (var i in locations) {
			locations[i].url = ScriptAgent.scriptWithId(locations[i].scriptId).url;
			$exports.triggerHandler('removeBreakpoint', locations[i]);
		}
	}

	// Inspector Event: we are connected to a live session
	function _onConnect(event) {
		Inspector.Debugger.enable();
	}

	// Inspector Event: we are disconnected
	function _onDisconnect(event) {
	}

	/** Init Functions *******************************************************/
	
	// init
	function init() {
		$(Inspector).on("connect.debugger", _onConnect);
		$(Inspector).on("disconnect.debugger", _onDisconnect);
		$(Inspector.Debugger).on("paused.debugger", _onPaused);
		$(Inspector.Debugger).on("resumed.debugger", _onResumed);
	}

	function unload() {
		$(Inspector).off(".debugger");
		$(Inspector.Debugger).off(".debugger");
		$exports.off();
		_onDisconnect();
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
