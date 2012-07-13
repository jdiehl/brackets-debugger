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
/*global define, brackets, $, less */

define(function (require, exports, module) {
	'use strict';

	var DocumentManager = brackets.getModule("document/DocumentManager");
	var EditorManager   = brackets.getModule("editor/EditorManager");
	var ScriptAgent     = brackets.getModule("LiveDevelopment/Agents/ScriptAgent");

	var Console    = require("Console");
	var Debugger   = require("Debugger");
	var Breakpoint = require("Breakpoint");
	var Parser     = require("Parser");

	var $style;
	var traceLineTimeouts = {};
	var tracepointsForUrl = {};
	var functionsForUrl   = {};
	var variablesForUrl   = {};

	/** Helper Functions *****************************************************/

	function _editorForURL(url) {
		var doc = DocumentManager.getCurrentDocument();
		if (doc && doc.url === url) {
			return EditorManager.getCurrentFullEditor();
		} else {
			console.log("No editor for url", url);
		}
		return undefined;
	}

	function _editorForLocation(location) {
		var url = location.url;
		if (!url) url = ScriptAgent.scriptWithId(location.scriptId).url;
		return _editorForURL(url);
	}
	
	/** Find this extension's directory relative to the brackets root */
	function _extensionDirForBrowser() {
		var bracketsIndex = window.location.pathname;
		var bracketsDir   = bracketsIndex.substr(0, bracketsIndex.lastIndexOf('/') + 1);
		var extensionDir  = bracketsDir + require.toUrl('./');

		return extensionDir;
	}

	/** Loads a less file as CSS into the document */
	function _loadLessFile(file, dir) {
		// Load the Less code
		$.get(dir + file, function (code) {
			// Parse it
			var parser = new less.Parser({ filename: file, paths: [dir] });
			parser.parse(code, function onParse(err, tree) {
				console.assert(!err, err);
				// Convert it to CSS and append that to the document head
				$("<style>").text(tree.toCSS()).appendTo(window.document.head);
			});
		});
	}

    /** Sets a line class and removes it after a delay */
	function setTemporaryLineClass(editor, line, klass, delay) {
		// Make sure no other line class or previous trace class is in the way
		// Might also happen when the same tracepoint is hit twice quickly
		editor._codeMirror.setLineClass(line);
		// Set the trace class. This triggers an animation in CSS since the <pre> tag is regenerated
		editor._codeMirror.setLineClass(line, "trace");
		// Stop any previous attempts of removing the line class
		window.clearTimeout(traceLineTimeouts[line]);
		// Remove the line class after one second
		// This is necessary because the animation is triggered when the <pre> tag is rewritten
		// This happens over and over again on cursor activity, or when the document is changed, etc.
		traceLineTimeouts[line] = window.setTimeout(function () {
			delete traceLineTimeouts[line];
			editor._codeMirror.setLineClass(line);
		}, delay);
	}

	function addFunctionTracepoints(url, node) {
		var tracepoints = [];

		// Name of the function
		var name  = node.id ? node.id.name : "<anonymous>";
		
		// Now add two tracepoints, one at the beginning, one at the end of the function
		for (var key in node.loc) {
			var loc = node.loc[key];
			var location = {
				url: url,
				// Esprima lines are 1-based
				lineNumber: loc.line - 1,
				// The end tracepoint needs be before }, not after, else it's hit right with the first one
				columnNumber: key === 'end' ? loc.column - 1 : loc.column
			};
			var tracepoint = Debugger.setTracepoint(location);
			tracepoints.push(tracepoint);
			$(tracepoint).on('set', function (event, res) {
				console.log("Tracepoint set for " + name + "() in", url.replace(/^.*\//, ''), "line", res.breakpoint.location.lineNumber);
			});
		}
		
		// Remember the tracepoints
		node.tracepoints = tracepoints;
		if (! tracepointsForUrl[url]) {
			tracepointsForUrl[url] = [];
		}
		tracepointsForUrl[url] = tracepointsForUrl[url].concat(tracepoints);
	}

	function removeFunctionTracepoints(url) {
		// Remove the old tracepoints
		if (tracepointsForUrl[url]) {
			$.each(tracepointsForUrl[url], function (index, tracepoint) {
				tracepoint.remove();
			});
			delete tracepointsForUrl[url];
		}
	}

	function parseDocument(doc) {
		if (! doc || doc.extension !== 'js') { return; }

		removeFunctionTracepoints(doc.url);

		// Loc: store locations as node.loc.(start|end).(line|column)
		var tree      = Parser.parse(doc.getText(), { loc: true });
		var functions = functionsForUrl[doc.url] = [];
		var variables = variablesForUrl[doc.url] = {};
		
		Parser
			.walker()
			.on('FunctionDeclaration FunctionExpression', function (node) {
				functions.push(node);
				addFunctionTracepoints(doc.url, node);
			})
			.on('Identifier VariableDeclarator', function (node) {
				if (node.type === 'VariableDeclarator') {
					node = node.id;
				}

				var line = node.loc.start.line;
				var column = node.loc.start.column;

				if (! variables[line]) {
					variables[line] = {};
				}
				variables[line][column] = node.name;
			})
			.walk(tree);
	}

	function resolveVariable(tracepoint, variable) {
		var noGlobal = function (scope) { return scope.type !== "global"; };

		var result = $.Deferred();

		var trace = tracepoint.trace[tracepoint.trace.length - 1];
		if (! trace || trace.callFrames.length === 0) { return result.reject(); }
		var callFrameIndex = 0;
		trace.resolveCallFrame(callFrameIndex, noGlobal).done(function () {
			var callFrame = trace.callFrames[callFrameIndex];
			var found = false;
			for (var i = 0; i < callFrame.scopeChain.length; i++) {
				var vars = callFrame.scopeChain[i].resolved;
				if (vars && vars[variable]) {
					return result.resolve(vars[variable]);
				}
			}
			result.reject();
		});

		return result.promise();
	}

	function describeValue(value) {
		if (value.type === "undefined") { return "undefined"; }
		if (value.type === "number")    { return value.value; }
		if (value.type === "string")    { return JSON.stringify(value.value); }
		if (value.type === "function")  { return value.description; }
		if (value.value === null)       { return "null"; }
		if (value.description)          { return value.description; }
		
		return JSON.stringify(value);
	}

	function showValue(value, line, fromCol, toCol, cmLinesNode, cm) {
		var left   = cm.charCoords({ line: line, ch: fromCol }, "local");
		var right  = cm.charCoords({ line: line, ch: toCol   }, "local");
		var middle = left.x + Math.round((right.x - left.x) / 2);
		var $popup = $("<div>").attr("id", "jdiehl-debugger-variable-value").text(value).appendTo($("> div:last", cmLinesNode));
		$popup.css({ left: Math.round(middle - $popup.outerWidth() / 2), top: left.y });

		return $popup;
	}

	function findWrappingFunction(functions, cursor, token) {
		var fn;
		
		for (var i = 0; i < functions.length; i++) {
			var candidate    = functions[i];
			var start        = candidate.loc.start, end = candidate.loc.end;
			var startsBefore = start.line - 1 < cursor.line || (start.line - 1 === cursor.line && start.column < token.start);
			var endsAfter    = end.line - 1 > cursor.line || (end.line - 1 === cursor.line && end.column > token.end);

			// Assumption: any later function that surrounds the variable
			// is inside any previous surrounding function => just replace fn
			if (startsBefore && endsAfter) { fn = candidate; }
		}

		return fn;
	}

	/** Event Handlers *******************************************************/
	
	function onLinesMouseMove(event) {
		onPixelHover({ x: event.clientX, y: event.clientY }, event.target);
	}
	
	function onLinesMouseOut() {
		onPixelHover(null);
	}

	var hover = { cursor: null, token: null };

	function onPixelHover(pixel, node) {
		var cm     = EditorManager.getCurrentFullEditor()._codeMirror;

		var cursor = pixel ? cm.coordsChar({ x: pixel.x + 4, y: pixel.y }) : null;

		// Same cursor position hovered as before: abort
		if (hover.cursor &&
			cursor &&
			cursor.ch   === hover.cursor.ch &&
			cursor.line === hover.cursor.line
		) { return; }
		
		hover.cursor = cursor;
		onCursorHover(cursor, node, cm);
	}

	function onCursorHover(cursor, cmLinesNode, cm) {
		var token = cursor ? cm.getTokenAt(cursor) : null;

		// Same token hovered as before: abort
		if (hover.token &&
			token &&
			token.string    === hover.token.string &&
			token.className === hover.token.className &&
			token.start     === hover.token.start &&
			token.end       === hover.token.end
		) { return; }

		hover.token = token;
		onTokenHover(token, cursor, cmLinesNode, cm);
	}

	var $popup;
	
	function onTokenHover(token, cursor, cmLinesNode, cm) {
		// Close the popup
		if ($popup) { $popup.remove(); }

		// No token hovered? We're done
		if (! token) { return; }

		// Get the functions and variables of the current document or abort
		var url       = DocumentManager.getCurrentDocument().url;
		var variables = variablesForUrl[url];
		var functions = functionsForUrl[url];
		if (! variables || ! functions) { return; }

		// Find the variable for this token, else abort
		// CodeMirror lines are 0-based, Esprima lines are 1-based
		var line     = cursor.line + 1;
		var column   = token.start;
		var variable = variables[line] ? variables[line][column] : null;
		if (! variable) { return; }

		// Find the function surrounding the variable, else abort
		var fn = findWrappingFunction(functions, cursor, token);
		if (! fn) { return; }

		var resolveBefore = resolveVariable(fn.tracepoints[0], variable);
		var resolveAfter  = resolveVariable(fn.tracepoints[1], variable);
		$.when(resolveBefore, resolveAfter).done(function (before, after) {
			before = describeValue(before);
			after  = describeValue(after);
			console.log("Done", before, after);
			if (before !== after) {
				before += " ↦ " + after;
			}
			$popup = showValue(before, cursor.line, token.start, token.end, cmLinesNode, cm);
		});
	}

	function onLineNumberClick(event) {
		var $elem = $(event.currentTarget);
		var doc = DocumentManager.getCurrentDocument();
		var location = { url: doc.url, lineNumber: $elem.index() };
		Debugger.toggleBreakpoint(location);
	}

	function onSetBreakpoint(event, location) {
		var editor = _editorForLocation(location);
		if (! editor) return;
		editor._codeMirror.setMarker(location.lineNumber, null, "breakpoint");
	}

	function onRemoveBreakpoint(event, location) {
		var editor = _editorForLocation(location);
		if (! editor) return;
		editor._codeMirror.clearMarker(location.lineNumber, null, "breakpoint");
	}

	function onPaused(event, res) {
		var editor = _editorForLocation(res.location);
		if (! editor) { return; }

		if (res.halt) {
			editor.setCursorPos(res.location.lineNumber, res.location.columnNumber);
			editor._codeMirror.setLineClass(res.location.lineNumber, "paused");
		} else {
			setTemporaryLineClass(editor, res.location.lineNumber, "trace", 1000);
		}
	}

	function onResumed(event, res) {
		if (res.halt && res.location) {
			var editor = _editorForLocation(res.location);
			if (! editor) { return; }
			editor._codeMirror.setLineClass(res.location.lineNumber);
		}
	}

	function onCurrentDocumentChange() {
		parseDocument(DocumentManager.getCurrentDocument());
	}

	function onToggleBreakEvents() {
		var flag = !Debugger.breakOnTracepoints();
		Debugger.setBreakOnTracepoints(flag);
		$btnBreakEvents.toggleClass("enabled", flag);
	}

	/** Init Functions *******************************************************/
	
	// init
	var $btnBreakEvents;
	function init() {

		// load styles
		_loadLessFile("debugger.less", _extensionDirForBrowser());

		// init modules
		Debugger.init();
		Console.init();
		Breakpoint.init();
		Parser.init();

		// register for debugger events
		var $Debugger = $(Debugger);
		$Debugger.on("setBreakpoint", onSetBreakpoint);
		$Debugger.on("removeBreakpoint", onRemoveBreakpoint);
		$Debugger.on("paused", onPaused);
		$Debugger.on("resumed", onResumed);

		// register for code mirror click events
		$(".CodeMirror-gutter").on("click", "pre", onLineNumberClick);
		
		$(".CodeMirror-lines")
			.on("mousemove", onLinesMouseMove)
			.on("mouseout", onLinesMouseOut);

		$btnBreakEvents = $("<a>").text("❚❚").attr({ href: "#", id: "jdiehl-debugger-breakevents" });
		$btnBreakEvents.click(onToggleBreakEvents);
		$btnBreakEvents.insertBefore('#main-toolbar .buttons #toolbar-go-live');

		$(DocumentManager).on("currentDocumentChange", onCurrentDocumentChange);
		setTimeout(onCurrentDocumentChange, 0);
	}

	// unload
	function unload() {
		$(DocumentManager).off("currentDocumentChange", onCurrentDocumentChange);
		
		Console.unload();
		Debugger.unload();
		Breakpoint.unload();
		Parser.unload();
		$style.remove();
		$(".CodeMirror-gutter").off("click", "pre", onLineNumberClick);
		
		$(".CodeMirror-lines")
			.off("mousemove", onLinesMouseMove)
			.off("mouseout", onLinesMouseOut);
	}

	exports.init = init;
	exports.unload = unload;

	$(init);
});
