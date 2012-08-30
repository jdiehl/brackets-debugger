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
	var Trace = require("Trace");
	var Parser = require("Parser");
	var events = require("events");
	
	var $exports = $(exports);
	var _paused;
	var _breakOnTracepoints = false;

	var _interruptions = 0;

	/** Actions **************************************************************/

    // pause the debugger
	function pause() {
		exports.paused = true;
		Inspector.Debugger.pause();
	}

	// resume the debugger
	function resume() {
		exports.paused = false;
		Inspector.Debugger.resume();
	}

	// pause execution until the promise is complete
	function interrupt(callback) {
		function release() {
			if (--_interruptions === 0) {
				resume();
			}
		}
		_interruptions++;
		if (_interruptions === 1) {
			pause();
		}
		var r = callback();
		if (typeof r.then === "function") {
			r.then(release);
		} else {
			release();
		}
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

	function setTracepoint(location, type) {
		var breakpoint = new Breakpoint.Breakpoint(location, undefined, type);
		$(breakpoint)
				.on("resolve", _onResolveBreakpoint);
		breakpoint.set();
		return breakpoint;
	}

	// toggle a breakpoint
	function toggleBreakpoint(location) {
		var breakpoints = Breakpoint.findResolved(location);
		var b;
		for (var i in breakpoints) {
			b = breakpoints[i];
			if (b.haltOnPause) {
				b.toggle();
				return;
			}
		}
		b = new Breakpoint.Breakpoint(location);
		breakpoints.push(b);
		$(b)
			.on("resolve", _onResolveBreakpoint)
			.on("remove", _onRemoveBreakpoint);
		b.set();
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

	function _onBreakpointPause(res) {
		// find the breakpoints at that location
		var breakpoints = res.breakpoints = Breakpoint.findResolved(res.location);

		// do not autoresume if there are no breakpoints
		if (breakpoints.length === 0) {
			return false;
		}

		// do not autoresume if there is a true breakpoint
		var shouldResume = true;
		var i, b;
		for (i in breakpoints) {
			b = breakpoints[i];
			b.triggerPaused(res.callFrames);
			if (b.haltOnPause) {
				shouldResume = false;
			} else {
				$exports.triggerHandler("trace", b);
			}
		}

		// do not autoresume if break on tracepoints is turned on
		return _breakOnTracepoints ? false : shouldResume;
	}

	function _onEventPause(res) {
		// E.g. listener:click, instrumentation:timerFired
		var eventName = res.data.eventName;
		var pos = eventName.indexOf(":");
		if (pos !== -1) { eventName = eventName.slice(pos + 1); }
		
		var trace = new Trace.Trace("event", res.callFrames, eventName);
		$exports.triggerHandler("eventTrace", trace);

		// autoresume
		return true;
	}

	// determine the pause handler
	function _pauseHandler(res) {
		switch (res.reason) {
		case "other":
			return _onBreakpointPause(res);
		case "EventListener":
			return _onEventPause(res);
		}
		return false;
	}

	// WebInspector Event: Debugger.paused
	function _onPaused(event, res) {
		// res = {callFrames, reason, data}

		// ignore a pause caused by interruption
		if (_interruptions > 0) {
			return;
		}

		// ignore DOM breakpoints (they are handled by the DOMAgent)
		if (res.reason === "DOM") {
			return;
		}

		// gather some info about this pause
		res.location = res.callFrames[0].location;

		// handle the pause
		var _autoResume = _pauseHandler(res);

		// autoresume
		if (_autoResume && !exports.paused) {
			_paused = undefined;
			Inspector.Debugger.resume();
		} else {
			// trigger the "paused" event
			_paused = res;
			exports.paused = true;
			$exports.triggerHandler("paused", _paused);
		}
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
	function _onResolveBreakpoint(event, res) {
		// res = {breakpoint, location}
		$exports.triggerHandler('setBreakpoint', res);
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
	function _onConnect(event) {
		Inspector.Debugger.enable();
		
		for (var i = 0; i < events.length; i++) {
			Inspector.DOMDebugger.setEventListenerBreakpoint(events[i]);
		}
		Inspector.DOMDebugger.setInstrumentationBreakpoint("timerFired");
	}

	// Inspector Event: we are disconnected
	function _onDisconnect(event) {
		if (!LiveDevelopment.agents.script) {
			ScriptAgent.unload();
		}
	}

	// Inspector Event: Debugger.globalObjectCleared
	function _onGlobalObjectCleared(event) {
		// Normally, Chrome is not paused after a reload, so the next pause will be for breakpoints/events
		exports.paused = false;
		$exports.triggerHandler("reload");
	}

	function _onRequestWillBeSent(event, res) {
		// res = {requestId, frameId, loaderId, documentURL, request, timestamp, initiator, redirectResponse}
		var url = res.request.url;
		// Remove querystring (?foo=bar...)
		url = url.replace(/\?.*/, "");
		// Get the extension
		var extension = url.replace(/^.*\./, "");
		if (extension !== "js") { return; }
		$(exports).triggerHandler("scriptRequested", url);
	}

	/** Init Functions *******************************************************/
	
	// init
	function init() {
		$(Inspector)
			.on("connect.Debugger", _onConnect)
			.on("disconnect.Debugger", _onDisconnect);
		$(Inspector.Debugger)
			.on("paused.Debugger", _onPaused)
			.on("resumed.Debugger", _onResumed)
			.on("globalObjectCleared.Debugger", _onGlobalObjectCleared);
		$(Inspector.Network)
			.on("requestWillBeSent.Debugger", _onRequestWillBeSent);
	}

	function unload() {
		$(Inspector).off(".Debugger");
		$(Inspector.Debugger).off(".Debugger");
		$(Inspector.Network).off(".Debugger");
		for (var i = 0; i < events.length; i++) {
			Inspector.DOMDebugger.removeEventListenerBreakpoint(events[i]);
		}
		Inspector.DOMDebugger.removeInstrumentationBreakpoint("timerFired");
		$exports.off();
		_onDisconnect();
	}

	// public methods
	exports.init = init;
	exports.unload = unload;
	exports.interrupt = interrupt;
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
