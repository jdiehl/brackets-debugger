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

	var $exports = $(exports);

	var _breakpoints = {};
	var _callFrames;

	/** Event Handlers *******************************************************/

	// WebInspector Event: Debugger.paused
	function _onPaused(res) {
		// res = {callFrames, reason, data}
		_callFrames = res.callFrames;
		$exports.trigger("paused", res);
	}

	// WebInspector Event: Debugger.resumed
	function _onResumed(res) {
		// res = {}
		_callFrames = null;
		$exports.trigger("resumed");
	}

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
	function toggleBreakpoint(doc, line) {
		var id = _findBreakpoint(doc, line);
		if (id) {
			_removeBreakpoint(doc, line, id);
		} else {
			_setBreakpointInDocument(doc, line);
		}
	}

	// evaluate an expression in the active call frame
	function evaluate(expression, callback) {
		if (_callFrames) {
			Inspector.Debugger.evaluateOnCallFrame(_callFrames[0].callFrameId, expression, callback);
		} else {
			Inspector.Runtime.evaluate(expression, callback);
		}
	}


	/** Private Functions *******************************************************/
	function _setBreakpoint(debuggerLocation) {
		Inspector.Debugger.setBreakpoint(debuggerLocation, function (result) {
			_onSetBreakpoint(result.breakpointId, result.actualLocation);
		});
	}
	
	function _setBreakpointInDocument(doc, line) {
		_setBreakpoint(_debuggerLocationForDocument(doc, line));
	}

	function _removeBreakpoint(doc, line, id) {
		id = id || _findBreakpoint(doc, line);
		Inspector.Debugger.removeBreakpoint(id, function () {
			_onRemoveBreakpoint(doc, line);
		});
	}


	/** Helper Functions *******************************************************/
	function _findBreakpoint(doc, line) {
		return _breakpoints[doc.url] && _breakpoints[doc.url][line];
	}
	
	function _debuggerLocationForDocument(doc, line)
	{
		return {
			scriptId: _scriptIdForDocument(doc),
			lineNumber: line,
			columnNumber: 0
		};
	}

	function _scriptIdForDocument(doc)
	{
		var script = ScriptAgent.scriptForURL(doc.url);
		return script.scriptId;
	}

	/** Event Handlers *******************************************************/
	function _onSetBreakpoint(id, location) {
		var url		= ScriptAgent.scriptWithId(location.scriptId).url;
		var line	= location.lineNumber;

		if (! _breakpoints[url]) { _breakpoints[url] = {}; }
		_breakpoints[url][line] = id;
		
		$exports.triggerHandler('setBreakpoint', [url, line]);
	}

	function _onScriptParsed(result) {
		// res = {scriptId, url, startLine, startColumn, endLine, endColumn, isContentScript, sourceMapURL}
		if (! _breakpoints[result.url]) { return; }
		
		$.each(_breakpoints[result.url], function (line, id) {
			var debuggerLocation = {
				scriptId: result.scriptId,
				// Object keys are strings, but an int is required
				lineNumber: parseInt(line, 10),
				columnNumber: 0
			};
			_setBreakpoint(debuggerLocation);
		});
	}

	function _onRemoveBreakpoint(doc, line) {
		var url = doc.url;
		
		delete _breakpoints[url][line];
		if (_breakpoints[url].length === 0) {
			delete _breakpoints[url];
		}
		
		$exports.triggerHandler('removeBreakpoint', [url, line]);
	}

	function _onConnect() {
		Inspector.Debugger.enable();
		// load the script agent if necessary
		if (!LiveDevelopment.agents.script) {
			ScriptAgent.load();
		}
		Inspector.on("Debugger.scriptParsed", _onScriptParsed);
	}

	function _onDisconnect() {
		if (!LiveDevelopment.agents.script) {
			ScriptAgent.unload();
		}
		Inspector.off("Debugger.scriptParsed", _onScriptParsed);
	}

	/** Init Functions *******************************************************/
	
	// init
	function init() {
		Inspector.on("connect", _onConnect);
		Inspector.on("disconnect", _onDisconnect);
		Inspector.on("Debugger.paused", _onPaused);
		Inspector.on("Debugger.resumed", _onResumed);
	}

	function unload() {
		Inspector.off("connect", _onConnect);
		Inspector.off("disconnect", _onDisconnect);
		Inspector.off("Debugger.paused", _onPaused);
		Inspector.off("Debugger.resumed", _onResumed);
		$exports.off("setBreakpoint removeBreakpoint paused resumed");
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
