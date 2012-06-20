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

	var DocumentManager = brackets.getModule("document/DocumentManager");
	var EditorManager = brackets.getModule("editor/EditorManager");

	var Debugger = require("Debugger");

	var extensionPath = "extensions/user/Debugger";


	/** Helper Functions *****************************************************/
	function _getEditorPosition(rowElement) {
		var doc = DocumentManager.getCurrentDocument();
		return { doc: doc, line: 0 };
	}

	/** Event Handlers *******************************************************/
	function onPause() {
		Debugger.pause();
	}

	function onResume() {
		Debugger.resume();
	}

	function onStepOver() {
		Debugger.stepOver();
	}

	function onStepIn() {
		Debugger.stepIn();
	}

	function onStepOut() {
		Debugger.stepOut();
	}

	function onLineNumberClick() {
		var doc, line;
		var enabled = Debugger.toggleBreakpoint(doc, line);
		$(this).toggleClass("breakpoint", enabled);
	}

	function onCurrentDocumentChange() {
		var doc = DocumentManager.getCurrentDocument();
		if (! doc) { 
			toggleConsole(false);
		} else {
			toggleConsole(true);
			$(".CodeMirror-gutter-text").on("click", "pre", onLineNumberClick);
		}
	}

	/** Init Functions *******************************************************/
	// setup the CSS style
	function setupStyle() {
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

	// setup the console
	var $console, $consoleToolbar, $consoleContainer, $consoleOut, $consolePrompt;
	var $btnPause, $btnStep, $btnContinue;
	function setupConsole() {
		// configure the console
		$console = $('<div id="console" class="bottom-panel">');

		// configure the toolbar
		$consoleToolbar = $('<div class="toolbar simple-toolbar-layout">');
		$btnPause = $('<button class="pause">').appendTo($consoleToolbar).on("click", onPause);
		$btnContinue = $('<button class="resume">').appendTo($consoleToolbar).on("click", onResume);
		$btnStep = $('<button class="stepover">').appendTo($consoleToolbar).on("click", onStepOver);
		$btnStep = $('<button class="stepin">').appendTo($consoleToolbar).on("click", onStepIn);
		$btnStep = $('<button class="stepout">').appendTo($consoleToolbar).on("click", onStepOut);
		$consoleToolbar.append('<div class="title">Console</div>');
		$consoleToolbar.append('<a href="#" class="close">&times;</a>');
		$console.append($consoleToolbar);
		
		// configure the container
		$consoleContainer = $('<div class="table-container">');
		$console.append($consoleContainer);
		$consoleOut = $('<div class="output">');
		$consoleContainer.append($consoleOut);
		$consolePrompt = $('<input class="prompt">');
		$consoleContainer.append($consolePrompt);

		// attach the console to the main view's content
		$(".main-view .content").append($console);
	}

	// toggle the display of the console
	function toggleConsole(show) {
		$console.toggle(show);
		EditorManager.resizeEditor();
	}

	// init
	function init() {
		setupStyle();
		setupConsole();

		// register brackets events
		$(DocumentManager).on("currentDocumentChange", onCurrentDocumentChange);
		$(onCurrentDocumentChange);
	}

	init();
});
