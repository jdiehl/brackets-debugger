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
	var EditorManager = brackets.getModule("editor/EditorManager");
	var ScriptAgent	= brackets.getModule("LiveDevelopment/Agents/ScriptAgent");

	var Console  = require("Console");
	var Debugger = require("Debugger");
	var $Debugger = $(Debugger);

	var $style;


	/** Helper Functions *****************************************************/
	function _editorForURL(url) {
		var doc = DocumentManager.getCurrentDocument();
		if (doc && doc.url) {
			return EditorManager.getCurrentFullEditor();
		}
		return null;
	}

	/** Event Handlers *******************************************************/
	function onLineNumberClick(event) {
		var $elem = $(event.currentTarget);
		var line = $elem.index();
		var doc = DocumentManager.getCurrentDocument();
		var enabled = Debugger.toggleBreakpoint(doc, line);
	}

	function onSetBreakpoint(event, url, line) {
		var editor = _editorForURL(url);
		if (!editor) return;
		editor._codeMirror.setMarker(line, null, "breakpoint");
	}

	function onRemoveBreakpoint(event, url, line) {
		var editor = _editorForURL(url);
		if (!editor) return;
		editor._codeMirror.clearMarker(line, null, "breakpoint");
	}

	var _pausedLine;
	function onPaused(event, res) {
		var frame = res.callFrames[0];
		var location = frame.location;
		var url = ScriptAgent.scriptWithId(location.scriptId).url;
		var editor = _editorForURL(url);
		if (!editor) return;

		_pausedLine = location.lineNumber;
		editor.setCursorPos(_pausedLine, location.columnNumber);
		editor._codeMirror.setLineClass(_pausedLine, "paused");
	}

	function onResumed(event) {
		if (_pausedLine) {
			var editor = EditorManager.getCurrentFullEditor();
			editor._codeMirror.setLineClass(_pausedLine);
		}
	}

	/** Init Functions *******************************************************/
	// load the CSS style
	function loadStyle() {
		var file = "Debugger.less";
		
		$.get(require.toUrl(file), function (lessCode) {
			var bracketsIndex = window.location.pathname;
			var bracketsRoot  = bracketsIndex.substr(0, bracketsIndex.lastIndexOf('/') + 1);
			var extensionRoot = bracketsRoot + require.toUrl('./');
			
			var parser = new less.Parser({ filename: file, paths: [extensionRoot] });
			parser.parse(lessCode, function onParse(err, tree) {
				console.assert(!err, err);
				$("<style>").text(tree.toCSS()).appendTo(window.document.head);
			});
		});
	}

	// init
	function init() {

		// load styles
		loadStyle();

		// init modules
		Debugger.init();
		Console.init();

		// register for debugger events
		$Debugger.on("setBreakpoint", onSetBreakpoint);
		$Debugger.on("removeBreakpoint", onRemoveBreakpoint);
		$Debugger.on("paused", onPaused);
		$Debugger.on("resumed", onResumed);

		// register for code mirror click events
		$("body").on("click", ".CodeMirror-gutter-text pre", onLineNumberClick);
	}

	function unload() {
		Console.unload();
		Debugger.unload();
		$style.remove();
		$(DocumentManager).off("currentDocumentChange", onCurrentDocumentChange);
		$("body").off("click", ".CodeMirror-gutter-text pre", onLineNumberClick);
	}

	exports.init = init;
	exports.unload = unload;

	init();
});
