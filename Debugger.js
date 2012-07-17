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
	var _lastEvent;
	var _breakOnTracepoints = false;
	var _breakEvents = ["DOMContentLoaded", "click"];


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

	function setTracepoint(location) {
		var breakpoint = new Breakpoint.Breakpoint(location, undefined, true);
		breakpoint.set();
		return breakpoint;
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

	// break on tracepoints
	function breakOnTracepoints() {
		return _breakOnTracepoints;
	}

	// enable or disable break on tracepoints
	function setBreakOnTracepoints(flag) {
		_breakOnTracepoints = flag;
	}

	/** Event Handlers *******************************************************/

	function _onBreakpointPause(callFrames) {
		// read the location from the top callframe
		var loc = callFrames[0].location;

		// find the breakpoints at that location
		var breakpoints = Breakpoint.findResolved(loc);

		// determine whether to actually halt by asking all breakpoints
		var halt = _breakOnTracepoints;
		var trace, b;
		for (var i in breakpoints) {
			b = breakpoints[i];
			b.triggerPaused(callFrames);
			if (_lastEvent && (trace = b.traceForEvent(_lastEvent))) {
				trace.setEvent(_lastEvent);
				$exports.triggerHandler("eventTrace", [trace]);
				_lastEvent = null;
			}
			if (b.haltOnPause) halt = true;
		}

		// gather some info about this pause and send the "paused" event
		_paused = { location: loc, callFrames: callFrames, breakpoints: breakpoints, halt: halt };
		$exports.triggerHandler("paused", _paused);
		
		// halt (if so determined)
		if (!halt) {
			Inspector.Debugger.resume();
		}
	}

	function _onEventPause(res) {
		_lastEvent = res;
		Inspector.Debugger.resume();
	}

	// WebInspector Event: Debugger.paused
	function _onPaused(res) {
		// res = {callFrames, reason, data}

		switch (res.reason) {
		case "other":
			return _onBreakpointPause(res.callFrames);
		case "EventListener":
			return _onEventPause(res);
		}
	}

	// WebInspector Event: Debugger.resumed
	function _onResumed(res) {
		// res = {}

		// send the "resumed" event with the info from the pause
		if (_paused) {
			$exports.triggerHandler("resumed", _paused);
			_paused = undefined;
		}
	}

	// Breakpoint Event: breakpoint resolved
	function _onResolveBreakpoint(event, res) {
		res.location.url = ScriptAgent.scriptWithId(res.location.scriptId).url;
		$exports.triggerHandler('setBreakpoint', res.location);
	}

	// Breakpoint Event: breakpoint removed
	function _onRemoveBreakpoint(event, res) {
		var locations = res.breakpoint.resolvedLocations;
		for (var i in locations) {
			locations[i].url = ScriptAgent.scriptWithId(locations[i].scriptId).url;
			$exports.triggerHandler('removeBreakpoint', locations[i]);
		}
	}

	// Inspector Event: we are connected to a live session
	function _onConnect() {
		Inspector.Debugger.enable();
		for (var i = 0; i < _breakEvents.length; i++) {
			Inspector.DOMDebugger.setEventListenerBreakpoint(_breakEvents[i]);
		}
		// load the script agent if necessary
		if (!LiveDevelopment.agents.script) {
			ScriptAgent.load();
		}
	}

	// Inspector Event: we are disconnected
	function _onDisconnect() {
		if (!LiveDevelopment.agents.script) {
			ScriptAgent.unload();
		}
	}

	// Inspector Event: Debugger.globalObjectCleared
	function _onGlobalObjectCleared() {
		_lastEvent = null;
	}

	/** Init Functions *******************************************************/
	
	// init
	function init() {
		Inspector.on("connect", _onConnect);
		Inspector.on("disconnect", _onDisconnect);
		Inspector.on("Debugger.paused", _onPaused);
		Inspector.on("Debugger.resumed", _onResumed);
		Inspector.on("Debugger.globalObjectCleared", _onGlobalObjectCleared);
	}

	function unload() {
		Inspector.off("connect", _onConnect);
		Inspector.off("disconnect", _onDisconnect);
		Inspector.off("Debugger.paused", _onPaused);
		Inspector.off("Debugger.resumed", _onResumed);
		Inspector.off("Debugger.globalObjectCleared", _onGlobalObjectCleared);
		for (var i = 0; i < _breakEvents.length; i++) {
			Inspector.DOMDebugger.removeEventListenerBreakpoint(_breakEvents[i]);
		}
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
	exports.setTracepoint = setTracepoint;
	exports.evaluate = evaluate;
	exports.breakOnTracepoints = breakOnTracepoints;
	exports.setBreakOnTracepoints = setBreakOnTracepoints;
});
