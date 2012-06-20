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

	var $exports = $(exports);

	var _breakpoints = {};

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
		console.log("Step Over");
	}

	// step into the function at the current line
	function stepInto() {
		console.log("Step Into");
	}

	// step out
	function stepOut() {
		console.log("Step Out");
	}

	// toggle a breakpoint
	function toggleBreakpoint(doc, line) {
		var id = _findBreakpoint(doc, line);
		if (id) {
			_removeBreakpoint(doc, line, id);
		} else {
			_setBreakpoint(doc, line);
		}
	}


	/** Private Functions *******************************************************/
	function _setBreakpoint(doc, line) {
		console.log("Setting breakpoint in doc " + doc.url + ":" + line);
		var debuggerLocation = _debuggerLocationForDocument(doc, line);
		
		Inspector.Debugger.setBreakpoint(debuggerLocation, function (result) {
			_onSetBreakpoint(result.breakpointId, result.actualLocation);
		});
	}

	function _removeBreakpoint(doc, line, id) {
		id = id || _findBreakpoint(doc, line);
		console.log("Removing breakpoint " + id);
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
		
		if (! _breakpoints[url]) { _breakpoints[url] = []; }
		_breakpoints[url][line] = id;
		
		$exports.triggerHandler('setBreakpoint', [url, line]);
	}

	function _onRemoveBreakpoint(doc, line) {
		var url = doc.url;
		
		delete _breakpoints[url][line];
		if (_breakpoints[url].length === 0) {
			delete _breakpoints[url];
		}
		
		$exports.triggerHandler('removeBreakpoint', [url, line]);
	}


	/** Init Functions *******************************************************/
	
	// init
	function init() {
	}

	// public methods
	exports.init = init;
	exports.pause = pause;
	exports.resume = resume;
	exports.stepOver = stepOver;
	exports.stepInto = stepInto;
	exports.stepOut = stepOut;
	exports.toggleBreakpoint = toggleBreakpoint;
});
