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

	var Debugger = require("Debugger");
	var Console  = require("Console");

	var extensionPath = "extensions/user/Debugger";


	/** Helper Functions *****************************************************/
	function _getEditorPosition(rowElement) {
		var doc = DocumentManager.getCurrentDocument();
		return { doc: doc, line: 0 };
	}

	function _openDocument(url) {
		var doc = DocumentManager.getCurrentDocument();
		if (doc.url === url) return doc;
		return null;
	}

	function _$gutterEntryForLine(line) {
		return $(".CodeMirror-gutter-text pre").eq(line - 1);
	}

	/** Event Handlers *******************************************************/
	function onLineNumberClick(event) {
		var $this = $(this);
		var line = $this.index() + 1;
		var doc = DocumentManager.getCurrentDocument();
		var enabled = Debugger.toggleBreakpoint(doc, line);
	}

	function onSetBreakpoint(event, url, line) {
		var doc = DocumentManager.getCurrentDocument();
		if (doc && doc.url === url) {
			_$gutterEntryForLine(line).addClass("breakpoint");
		}
	}

	function onRemoveBreakpoint(event, url, line) {
		var doc = DocumentManager.getCurrentDocument();
		if (doc && doc.url === url) {
			_$gutterEntryForLine(line).removeClass("breakpoint");
		}
	}

	function onPaused(event, res) {
		var frame = res.callFrames[0];
		var location = frame.location;
		var url = ScriptAgent.scriptWithId(location.scriptId).url;
		var doc = _openDocument(url);
		doc.editor.setCursorPos(location.lineNumber, location.columnNumber);
	}

	function onResumed(event) {

	}

	function onCurrentDocumentChange() {
		var doc = DocumentManager.getCurrentDocument();
		if (! doc) {
			Console.toggle(false);
		} else {
			Console.toggle(true);
			$(".CodeMirror-gutter-text").off("click.debugger", "pre", onLineNumberClick);
			$(".CodeMirror-gutter-text").on("click.debugger", "pre", onLineNumberClick);
		}
	}

	/** Init Functions *******************************************************/
	// load the CSS style
	function loadStyle() {
        var request = new XMLHttpRequest();
        request.open("GET", extensionPath + "/Debugger.less", true);
        request.onload = function onLoad(event) {
            var parser = new less.Parser();
            parser.parse(request.responseText, function onParse(err, tree) {
                console.assert(!err, err);
                $("<style>" + tree.toCSS() + "</style>")
                    .appendTo(window.document.head);
            });
        };
        request.send(null);
	}

	// init
	function init() {

		// load styles
		loadStyle();

		// init modules
		Debugger.init();
		Console.init();

		// register for brackets events
		$(DocumentManager).on("currentDocumentChange", onCurrentDocumentChange);
		$(onCurrentDocumentChange);

		// register for debugger events
<<<<<<< HEAD
		$(Debugger)
			.on("setBreakpoint", onSetBreakpoint)
			.on("paused", onPaused)
			.on("resumed", onResumed);
=======
		$(Debugger).on("setBreakpoint", onSetBreakpoint);
		$(Debugger).on("removeBreakpoint", onRemoveBreakpoint);
>>>>>>> d47adf41ea99fa4a43a8ad61e6eb158929ab3acc
	}

	init();
});
