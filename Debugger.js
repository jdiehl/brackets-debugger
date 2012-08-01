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
	var _interruptionResult;
	var _pausedByInterruption = false;

	var _stayPaused = false;
	var _pauseAfterReload = false;

	/** Actions **************************************************************/

	// pause execution until the deferred is complete
	function interrupt(deferred) {
		_interruptions++;
		if (_interruptions === 1) {
			_pausedByInterruption = true;
			Inspector.Debugger.pause();
		}
		deferred.then(_onInterruptionEnd);
	}

    // pause the debugger
	function pause() {
		_stayPaused = true;
		// if there is no pause before the next reload, press pause again
		_pauseAfterReload = true;
		Inspector.Debugger.pause();
	}

	// resume the debugger
	function resume() {
		_stayPaused = false;
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

	function setTracepoint(location, type) {
		var breakpoint = new Breakpoint.Breakpoint(location, undefined, type);
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

	// continue execution if all interruptions have ended
	function _onInterruptionEnd() {
		_interruptions--;
		// return if there are ongoing interruptions or if we did not pause during interruption
		if (_interruptions !== 0 || ! _interruptionResult) { return; }
		
		// now process the result of a pause during interruption
		var result = _interruptionResult;
		_interruptionResult = null;
		_onPaused(result);
	}

	function _onBreakpointPause(res, info) {
		// find the breakpoints at that location
		var breakpoints = info.breakpoints = Breakpoint.findResolved(info.location);

		// determine whether to actually halt by asking all breakpoints
		var halt = false;
		var trace, b;
		for (var i in breakpoints) {
			b = breakpoints[i];
			b.triggerPaused(info.callFrames);
			if (_breakOnTracepoints || b.haltOnPause) halt = true;
		}

		return halt;
	}

	function _onEventPause(res, info) {
		// E.g. listener:click, instrumentation:timerFired
		var eventName = res.data.eventName;
		var pos = eventName.indexOf(":");
		if (pos !== -1) { eventName = eventName.slice(pos + 1); }
		
		var trace = new Trace.Trace("event", res.callFrames, eventName);
		$exports.triggerHandler("eventTrace", trace);

		return false;
	}

	// WebInspector Event: Debugger.paused
	function _onPaused(res) {
		// res = {callFrames, reason, data}

		// if this is the first pause since interruption
		if (_pausedByInterruption) {
			_pausedByInterruption = false;
			// if there are still unfinished interruptions
			if (_interruptions) {
				// defer handling of this pause until all interruptions are over
				// by then the tracepoints should be set so the handlers below can find them
				// the last interruption will call _onPaused again with res = _interruptionResult
				_interruptionResult = res;
				return;
			}
			// the interruptions are already over, so handle this like any other pause
		}

		// pressing the pause button has succeeded, so we don't need to do it again after a reload
		_pauseAfterReload = false;
		
		// gather some info about this pause
		_paused = { location: res.callFrames[0].location, callFrames: res.callFrames };

		// determine whether to halt
		var handler;
		if (res.reason === "other")              { handler = _onBreakpointPause; }
		else if (res.reason === "EventListener") { handler = _onEventPause; }
		_paused.halt = (handler ? handler(res, _paused) : false) || _stayPaused;
		// Stepping triggers resume, then pause, and we need to step again then
		if (! _stayPaused) { _stayPaused = _paused.halt; }

		// trigger the "paused" event
		$exports.triggerHandler("paused", _paused);
		
		// resume if necessary
		if (! _paused.halt) { Inspector.Debugger.resume(); }
	}

	// WebInspector Event: Debugger.resumed
	function _onResumed(res) {
		// res = {}

		// send the "resumed" event with the info from the pause
		if (_paused) {
			$exports.triggerHandler("resumed", [_paused, _stayPaused]);
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
		
		for (var i = 0; i < events.length; i++) {
			Inspector.DOMDebugger.setEventListenerBreakpoint(events[i]);
		}
		Inspector.DOMDebugger.setInstrumentationBreakpoint("timerFired");
		
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
		// Normally, Chrome is not paused after a reload, so the next pause will be for breakpoints/events
		_stayPaused = false;
		// After pressing the pause button the page was reloaded before a pause occured: pause now
		if (_pauseAfterReload) { pause(); }
		$exports.triggerHandler("reload");
	}

	function _onRequestWillBeSent(res) {
		// res = {requestId, frameId, loaderId, documentURL, request, timestamp, initiator, redirectResponse}
		var url = res.request.url;
		// Remove querystring (?foo=bar...)
		url = url.replace(/\?.*/, "");
		// Get the extension
		var extension = url.replace(/^.*\./, "");
		if (extension !== "js") { return; }
		$(exports).triggerHandler("scriptRequested", url);
	}

	function _onSetScriptSource(res) {
		// res = {callFrames, result, script, scriptSource, diff}
		if (res.callFrames && res.callFrames.length) {
			// todo: update the callframes of the current breakpoint
		}
	}

	/** Init Functions *******************************************************/
	
	// init
	function init() {
		Inspector.on("connect", _onConnect);
		Inspector.on("disconnect", _onDisconnect);
		Inspector.on("Debugger.paused", _onPaused);
		Inspector.on("Debugger.resumed", _onResumed);
		Inspector.on("Debugger.globalObjectCleared", _onGlobalObjectCleared);
		Inspector.on("Network.requestWillBeSent", _onRequestWillBeSent);
		Inspector.on("ScriptAgent.setScriptSource", _onSetScriptSource);
	}

	function unload() {
		Inspector.off("connect", _onConnect);
		Inspector.off("disconnect", _onDisconnect);
		Inspector.off("Debugger.paused", _onPaused);
		Inspector.off("Debugger.resumed", _onResumed);
		Inspector.off("Debugger.globalObjectCleared", _onGlobalObjectCleared);
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
