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

	function setFunctionTracepoints(url, node) {
		// Remember the tracepoints
		var tracepoints = tracepointsForUrl[url] = [];

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

		// Loc:   store locations (line, column)
		// Range: store index-based ranges
		var options = { loc: true, range: true };
		var code    = doc.getText();
		var tree    = Parser.parse(code, options);

		var functions = functionsForUrl[doc.url] = [];
		Parser.findFunctions(tree, function (node) {
			functions.push(node);
			setFunctionTracepoints(doc.url, node);
		});
	}

	/** Event Handlers *******************************************************/
	
	function onLinesMouseMove(event) {
		onPixelEnter({ x: event.clientX, y: event.clientY }, event.target);
	}
	
	function onLinesMouseOut() {
		onPixelEnter(null);
	}

	var hover = { cursor: null, token: null };

	function onPixelEnter(pixel, node) {
		var cm     = EditorManager.getCurrentFullEditor()._codeMirror;

		var cursor = pixel ? cm.coordsChar(pixel) : null;

		// Same cursor position hovered as before: abort
		if (hover.cursor &&
			cursor &&
			cursor.ch   === hover.cursor.ch &&
			cursor.line === hover.cursor.line
		) { return; }
		
		hover.cursor = cursor;
		onCursorEnter(cursor, node, cm);
	}

	function onCursorEnter(cursor, node, cm) {
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
		onTokenEnter(token, cursor, node, cm);
	}

	var $popup;
	
	function onTokenEnter(token, cursor, node, cm) {
		if ($popup) {
			$popup.remove();
		}
		
		if (token && token.className === 'variable') {
			var url = DocumentManager.getCurrentDocument().url;
			var fns = functionsForUrl[url];
			if (! fns) { return; }

			console.log("Token", token.start, token.end, "Cursor", cursor.line);

			var closest = null;
			for (var i = 0; i < fns.length; i++) {
				var fn = fns[i];
				console.log("Candidate", fn.loc.start.line + " - " + fn.loc.end.line, fn.id ? fn.id.name : "anonymous");
				var start = fn.loc.start, end = fn.loc.end;

				var startsBefore = start.line - 1 < cursor.line || (start.line - 1 === cursor.line && start.column < token.start);
				var endsAfter = end.line - 1 > cursor.line || (end.line - 1 === cursor.line && end.column > token.end);

				console.log(startsBefore, endsAfter, start.line - 1 === cursor.line, start.line, cursor.line, start.column, token.start);

				// Assumption is that any later function that surrounds the variable
				// is inside any previous surrounding function => just replace closest
				if (startsBefore && endsAfter) {
					closest = fn;
				}
			}
			
			if (! closest) { return; }
			
			var pixel = cm.charCoords({ line: cursor.line, ch: token.start }, 'local');
			console.log("Line", cursor.line, "Column", cursor.ch, "X", pixel.x, "Y", pixel.y, "String", token.string);
			console.log(closest.loc.start.line + " - " + closest.loc.end.line, closest.id ? closest.id.name : "anonymous");
			$popup = $('<div>')
				.text(token.string)
				.css({ left: pixel.x, top: pixel.y, background: 'red', position: 'absolute' });
			$(node).find('> div > div:last').append($popup);
		}
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
